create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_events enable row level security;

create index if not exists admin_audit_events_created_idx
on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_target_created_idx
on public.admin_audit_events (target_user_id, created_at desc);
