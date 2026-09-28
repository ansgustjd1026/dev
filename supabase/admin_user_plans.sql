create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro')),
  status text not null default 'active' check (status in ('active', 'canceled', 'suspended')),
  monthly_credit_limit integer not null default 10 check (monthly_credit_limit >= 0),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_plans enable row level security;

drop policy if exists "Users can view own plan" on public.user_plans;
create policy "Users can view own plan"
on public.user_plans
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists user_plans_plan_idx
on public.user_plans (plan, status);

drop function if exists public.record_credit_usage_atomic(text, uuid, jsonb);
drop function if exists public.record_credit_usage_atomic(text, uuid, jsonb, integer);

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
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select coalesce(monthly_credit_limit, 10)
  into v_monthly_limit
  from public.user_plans
  where user_id = v_user_id
    and status = 'active';

  v_monthly_limit := coalesce(v_monthly_limit, 10);

  v_required_credits := case p_action
    when 'script_generate' then 1
    when 'tts_generate' then 1
    when 'transcribe_audio' then 1
    when 'render_video' then 2
    when 'render_image_video' then 50
    else null
  end;

  if v_required_credits is null then
    raise exception '지원하지 않는 Credit 액션입니다: %', p_action;
  end if;

  if p_credits_override is not null then
    if p_credits_override < v_required_credits
      and not (p_action = 'render_image_video' and p_credits_override = 47) then
      raise exception 'Credit override cannot be lower than the action cost';
    end if;
    v_required_credits := p_credits_override;
  end if;

  v_period_start := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_period_end := v_period_start + interval '1 month';

  perform pg_advisory_xact_lock(
    hashtext(v_user_id::text),
    hashtext(v_period_start::text)
  );

  select coalesce(sum(credits_charged), 0)
  into v_used_credits
  from public.credit_usage_events
  where user_id = v_user_id
    and status = 'success'
    and created_at >= v_period_start
    and created_at < v_period_end;

  v_remaining_credits := greatest(0, v_monthly_limit - v_used_credits);

  if v_remaining_credits < v_required_credits then
    return jsonb_build_object(
      'ok', false,
      'requiredCredits', v_required_credits,
      'remainingCredits', v_remaining_credits,
      'usedCredits', v_used_credits,
      'monthlyLimit', v_monthly_limit
    );
  end if;

  insert into public.credit_usage_events (
    user_id,
    project_id,
    action,
    credits_charged,
    status,
    metadata
  )
  values (
    v_user_id,
    p_project_id,
    p_action,
    v_required_credits,
    'success',
    coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'ok', true,
    'requiredCredits', v_required_credits,
    'remainingCredits', v_remaining_credits - v_required_credits,
    'usedCredits', v_used_credits + v_required_credits,
    'monthlyLimit', v_monthly_limit
  );
end;
$$;

grant execute on function public.record_credit_usage_atomic(text, uuid, jsonb, integer)
to authenticated;

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
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select coalesce(monthly_credit_limit, 10)
  into v_monthly_limit
  from public.user_plans
  where user_id = v_user_id
    and status = 'active';

  v_monthly_limit := coalesce(v_monthly_limit, 10);

  v_period_start := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_period_end := v_period_start + interval '1 month';

  with actions(action) as (
    values
      ('script_generate'),
      ('tts_generate'),
      ('transcribe_audio'),
      ('render_video'),
      ('render_image_video')
  ),
  usage_by_action as (
    select
      action,
      count(*)::integer as action_count,
      coalesce(sum(credits_charged), 0)::integer as action_credit
    from public.credit_usage_events
    where user_id = v_user_id
      and status = 'success'
      and created_at >= v_period_start
      and created_at < v_period_end
    group by action
  )
  select
    coalesce(sum(coalesce(usage_by_action.action_credit, 0)), 0)::integer,
    jsonb_object_agg(actions.action, coalesce(usage_by_action.action_count, 0)),
    jsonb_object_agg(actions.action, coalesce(usage_by_action.action_credit, 0))
  into v_used_credits, v_action_counts, v_action_credits
  from actions
  left join usage_by_action on usage_by_action.action = actions.action;

  return jsonb_build_object(
    'monthlyLimit', v_monthly_limit,
    'usedCredits', v_used_credits,
    'remainingCredits', greatest(0, v_monthly_limit - v_used_credits),
    'periodStart', v_period_start,
    'periodEnd', v_period_end,
    'actionCounts', coalesce(v_action_counts, '{}'::jsonb),
    'actionCredits', coalesce(v_action_credits, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_credit_usage_summary()
to authenticated;
