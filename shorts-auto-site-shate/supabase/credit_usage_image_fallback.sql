-- Run after credit_usage_events.sql and credit_usage_rpc.sql.
-- Allows image-scene renders to atomically charge the base render cost plus
-- the number of AI-generated fallback images.

drop function if exists public.record_credit_usage_atomic(text, uuid, jsonb);

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
    raise exception 'Authentication is required';
  end if;

  v_required_credits := case p_action
    when 'script_generate' then 1
    when 'tts_generate' then 1
    when 'transcribe_audio' then 1
    when 'render_video' then 2
    when 'render_image_video' then 50
    else null
  end;

  if v_required_credits is null then
    raise exception 'Unsupported credit action: %', p_action;
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

  perform pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext(v_period_start::text));

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
    user_id, project_id, action, credits_charged, status, metadata
  ) values (
    v_user_id, p_project_id, p_action, v_required_credits, 'success',
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
