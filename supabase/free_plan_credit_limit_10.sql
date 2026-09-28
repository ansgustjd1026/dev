-- Run once to apply the new Free allowance to existing accounts.
alter table public.user_plans
alter column monthly_credit_limit set default 10;

update public.user_plans
set monthly_credit_limit = 10,
    updated_at = now()
where plan = 'free'
  and monthly_credit_limit <> 10;
