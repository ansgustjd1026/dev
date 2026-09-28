-- Run after supabase/admin_user_plans.sql.
-- Every new account starts on Free, regardless of any client-side state.
create or replace function public.create_default_free_plan_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_plans (
    user_id,
    plan,
    status,
    monthly_credit_limit,
    monthly_credit_limit_override
  )
  values (new.id, 'free', 'active', 10, false)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_default_free_plan on auth.users;
create trigger on_auth_user_created_default_free_plan
after insert on auth.users
for each row execute procedure public.create_default_free_plan_for_user();

-- Make the same default explicit for accounts created before this trigger.
insert into public.user_plans (user_id, plan, status, monthly_credit_limit)
select id, 'free', 'active', 10
from auth.users
on conflict (user_id) do nothing;
