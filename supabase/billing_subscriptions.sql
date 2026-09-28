create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  customer_key text not null unique,
  billing_key text not null,
  plan text not null check (plan in ('starter', 'pro')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  payment_fail_count integer not null default 0 check (payment_fail_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end >= current_period_start)
);

alter table public.billing_subscriptions enable row level security;

drop policy if exists "Users can view own billing subscription" on public.billing_subscriptions;
create policy "Users can view own billing subscription"
on public.billing_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists billing_subscriptions_due_idx
on public.billing_subscriptions (status, current_period_end);
