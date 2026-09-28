create table if not exists public.credit_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  action text not null check (
    action in (
      'script_generate',
      'tts_generate',
      'transcribe_audio',
      'render_video'
    )
  ),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  status text not null default 'success' check (status in ('success', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.credit_usage_events enable row level security;

drop policy if exists "Users can view own credit usage" on public.credit_usage_events;
create policy "Users can view own credit usage"
on public.credit_usage_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own credit usage" on public.credit_usage_events;
create policy "Users can insert own credit usage"
on public.credit_usage_events
for insert
to authenticated
with check (auth.uid() = user_id);

create index if not exists credit_usage_events_user_created_idx
on public.credit_usage_events (user_id, created_at desc);

create index if not exists credit_usage_events_user_action_idx
on public.credit_usage_events (user_id, action, created_at desc);
