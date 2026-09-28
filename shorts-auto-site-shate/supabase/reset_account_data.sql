-- WARNING:
-- This deletes account-related runtime data for a fresh start.
-- Run only when you intentionally want to remove existing users and their data.
--
-- What this clears when the table exists:
-- - Auth users
-- - User profiles
-- - User plans
-- - Credit usage events
-- - Projects
--
-- It keeps the tables, buckets, policies, functions, and triggers themselves.
--
-- Storage files cannot be deleted directly from SQL in Supabase.
-- Use scripts/reset-storage-objects.mjs or the Supabase Storage dashboard
-- to clear files from app buckets.

do $$
begin
  if to_regclass('public.credit_usage_events') is not null then
    delete from public.credit_usage_events;
  end if;

  if to_regclass('public.user_plans') is not null then
    delete from public.user_plans;
  end if;

  if to_regclass('public.user_profiles') is not null then
    delete from public.user_profiles;
  end if;

  if to_regclass('public.projects') is not null then
    delete from public.projects;
  end if;

  delete from auth.users;
end $$;
