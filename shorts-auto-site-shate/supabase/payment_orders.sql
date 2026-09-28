create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('starter', 'pro')),
  amount integer not null check (amount > 0),
  currency text not null default 'KRW' check (currency = 'KRW'),
  status text not null default 'ready' check (status in ('ready', 'paid', 'failed', 'canceled')),
  payment_key text unique,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.payment_orders enable row level security;
drop policy if exists "Users can view own payment orders" on public.payment_orders;
create policy "Users can view own payment orders" on public.payment_orders
for select to authenticated using (auth.uid() = user_id);
create index if not exists payment_orders_user_created_idx
on public.payment_orders (user_id, created_at desc);

