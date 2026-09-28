-- Run after admin_user_plans.sql and credit_usage_rpc.sql.
create table if not exists public.plan_credit_settings (
  plan text primary key check (plan in ('free', 'starter', 'pro')),
  monthly_credit_limit integer not null check (monthly_credit_limit between 0 and 100000),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.plan_credit_settings (plan, monthly_credit_limit)
values ('free', 10), ('starter', 300), ('pro', 1000)
on conflict (plan) do nothing;

alter table public.user_plans
  add column if not exists monthly_credit_limit_override boolean not null default false;

-- Existing rows that differ from the original plan defaults are treated as
-- explicit per-user overrides. All other users follow the plan-wide value.
update public.user_plans
set monthly_credit_limit_override = case plan
  when 'free' then monthly_credit_limit <> 10
  when 'starter' then monthly_credit_limit <> 300
  when 'pro' then monthly_credit_limit <> 1000
  else false
end
where monthly_credit_limit_override = false;

alter table public.plan_credit_settings enable row level security;
drop policy if exists "Authenticated users can read plan credit settings" on public.plan_credit_settings;
create policy "Authenticated users can read plan credit settings"
on public.plan_credit_settings for select to authenticated using (true);

create or replace function public.get_effective_monthly_credit_limit(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    case when up.monthly_credit_limit_override then up.monthly_credit_limit end,
    pcs.monthly_credit_limit,
    10
  )
  from (select p_user_id as user_id) input
  left join public.user_plans up on up.user_id = input.user_id and up.status = 'active'
  left join public.plan_credit_settings pcs on pcs.plan = coalesce(up.plan, 'free')
$$;

create or replace function public.record_credit_usage_atomic(
  p_action text,
  p_project_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_credits_override integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_monthly_limit integer := 10;
  v_required_credits integer;
  v_used_credits integer;
  v_remaining_credits integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if v_user_id is null then raise exception '로그인이 필요합니다.'; end if;
  select coalesce(public.get_effective_monthly_credit_limit(v_user_id), 10) into v_monthly_limit;
  v_required_credits := case p_action
    when 'script_generate' then 1 when 'tts_generate' then 1
    when 'transcribe_audio' then 1 when 'render_video' then 2
    when 'render_image_video' then 50 else null end;
  if v_required_credits is null then raise exception '지원하지 않는 Credit 액션입니다: %', p_action; end if;
  if p_credits_override is not null then
    if p_credits_override < v_required_credits and not (p_action = 'render_image_video' and p_credits_override = 47) then
      raise exception 'Credit override cannot be lower than the action cost';
    end if;
    v_required_credits := p_credits_override;
  end if;
  v_period_start := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_period_end := v_period_start + interval '1 month';
  perform pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext(v_period_start::text));
  select coalesce(sum(credits_charged), 0) into v_used_credits
  from public.credit_usage_events
  where user_id = v_user_id and status = 'success' and created_at >= v_period_start and created_at < v_period_end;
  v_remaining_credits := greatest(0, v_monthly_limit - v_used_credits);
  if v_remaining_credits < v_required_credits then
    return jsonb_build_object('ok', false, 'requiredCredits', v_required_credits, 'remainingCredits', v_remaining_credits, 'usedCredits', v_used_credits, 'monthlyLimit', v_monthly_limit);
  end if;
  insert into public.credit_usage_events (user_id, project_id, action, credits_charged, status, metadata)
  values (v_user_id, p_project_id, p_action, v_required_credits, 'success', coalesce(p_metadata, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'requiredCredits', v_required_credits, 'remainingCredits', v_remaining_credits - v_required_credits, 'usedCredits', v_used_credits + v_required_credits, 'monthlyLimit', v_monthly_limit);
end;
$$;

create or replace function public.get_credit_usage_summary()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_monthly_limit integer := 10;
  v_used_credits integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_action_counts jsonb;
  v_action_credits jsonb;
begin
  if v_user_id is null then raise exception '로그인이 필요합니다.'; end if;
  select coalesce(public.get_effective_monthly_credit_limit(v_user_id), 10) into v_monthly_limit;
  v_period_start := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_period_end := v_period_start + interval '1 month';
  with actions(action) as (values ('script_generate'), ('tts_generate'), ('transcribe_audio'), ('render_video'), ('render_image_video')),
  usage_by_action as (
    select action, count(*)::integer as action_count, coalesce(sum(credits_charged), 0)::integer as action_credit
    from public.credit_usage_events
    where user_id = v_user_id and status = 'success' and created_at >= v_period_start and created_at < v_period_end
    group by action
  )
  select coalesce(sum(coalesce(usage_by_action.action_credit, 0)), 0)::integer,
    jsonb_object_agg(actions.action, coalesce(usage_by_action.action_count, 0)),
    jsonb_object_agg(actions.action, coalesce(usage_by_action.action_credit, 0))
  into v_used_credits, v_action_counts, v_action_credits
  from actions left join usage_by_action on usage_by_action.action = actions.action;
  return jsonb_build_object('monthlyLimit', v_monthly_limit, 'usedCredits', v_used_credits, 'remainingCredits', greatest(0, v_monthly_limit - v_used_credits), 'periodStart', v_period_start, 'periodEnd', v_period_end, 'actionCounts', coalesce(v_action_counts, '{}'::jsonb), 'actionCredits', coalesce(v_action_credits, '{}'::jsonb));
end;
$$;

grant execute on function public.get_effective_monthly_credit_limit(uuid) to authenticated;
grant execute on function public.record_credit_usage_atomic(text, uuid, jsonb, integer) to authenticated;
grant execute on function public.get_credit_usage_summary() to authenticated;
