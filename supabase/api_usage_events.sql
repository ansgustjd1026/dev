create table if not exists public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  provider text not null default 'openai',
  operation text not null,
  model text not null,
  status text not null default 'success' check (status in ('success', 'failed')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  input_characters integer not null default 0 check (input_characters >= 0),
  audio_seconds numeric(12, 3) not null default 0 check (audio_seconds >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  estimated_cost_usd numeric(14, 8) not null default 0 check (estimated_cost_usd >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.api_usage_events enable row level security;

drop policy if exists "Users can view own API usage" on public.api_usage_events;
create policy "Users can view own API usage"
on public.api_usage_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own API usage" on public.api_usage_events;
create policy "Users can insert own API usage"
on public.api_usage_events
for insert
to authenticated
with check (auth.uid() = user_id);

create index if not exists api_usage_events_user_created_idx
on public.api_usage_events (user_id, created_at desc);

create index if not exists api_usage_events_model_created_idx
on public.api_usage_events (model, created_at desc);

drop function if exists public.get_admin_api_usage_summary(timestamptz, timestamptz);

create or replace function public.get_admin_api_usage_summary(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_user_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select *
    from public.api_usage_events
    where created_at >= p_period_start
      and created_at < p_period_end
      and (p_user_id is null or user_id = p_user_id)
  ),
  model_totals as (
    select
      model,
      count(*)::integer as calls,
      coalesce(sum(estimated_cost_usd), 0)::numeric as cost_usd
    from filtered
    group by model
    order by cost_usd desc, model asc
  )
  select jsonb_build_object(
    'calls', (select count(*)::integer from filtered),
    'activeUsers', (select count(distinct user_id)::integer from filtered),
    'inputTokens', (select coalesce(sum(input_tokens), 0)::bigint from filtered),
    'cachedInputTokens', (select coalesce(sum(cached_input_tokens), 0)::bigint from filtered),
    'outputTokens', (select coalesce(sum(output_tokens), 0)::bigint from filtered),
    'inputCharacters', (select coalesce(sum(input_characters), 0)::bigint from filtered),
    'audioSeconds', (select coalesce(sum(audio_seconds), 0)::numeric from filtered),
    'imageCount', (select coalesce(sum(image_count), 0)::integer from filtered),
    'estimatedCostUsd', (select coalesce(sum(estimated_cost_usd), 0)::numeric from filtered),
    'models', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'model', model,
        'calls', calls,
        'estimatedCostUsd', cost_usd
      )) from model_totals),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_admin_api_usage_summary(timestamptz, timestamptz, uuid)
from public, anon, authenticated;
grant execute on function public.get_admin_api_usage_summary(timestamptz, timestamptz, uuid)
to service_role;
