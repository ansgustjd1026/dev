-- Run once for existing projects that already created public.user_plans.
alter table public.user_plans
  drop constraint if exists user_plans_status_check;

alter table public.user_plans
  add constraint user_plans_status_check
  check (status in ('active', 'canceled', 'suspended'));
