create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists user_profiles_email_idx
on public.user_profiles (email);

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(trim(new.raw_user_meta_data->>'username'));

  if v_username is null or v_username = '' then
    raise exception '아이디가 필요합니다.';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception '아이디는 영문 소문자, 숫자, 밑줄 3~20자만 사용할 수 있습니다.';
  end if;

  insert into public.user_profiles (
    user_id,
    username,
    email
  )
  values (
    new.id,
    v_username,
    lower(new.email)
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.user_profiles
    where username = lower(trim(p_username))
  );
$$;

grant execute on function public.is_username_available(text)
to anon, authenticated;

create or replace function public.get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.user_profiles
  where username = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.get_email_for_username(text)
to anon, authenticated;
