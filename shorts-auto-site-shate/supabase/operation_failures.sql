create table if not exists public.operation_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  stage text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.operation_failures enable row level security;

create index if not exists operation_failures_created_idx
on public.operation_failures (created_at desc);

create index if not exists operation_failures_user_created_idx
on public.operation_failures (user_id, created_at desc);

