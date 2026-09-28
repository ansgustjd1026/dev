alter table public.user_profiles
add column if not exists instagram_username text
check (
  instagram_username is null
  or instagram_username ~ '^[A-Za-z0-9._]{1,30}$'
);

create table if not exists public.instagram_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  instagram_user_id text not null,
  instagram_username text,
  facebook_page_id text not null,
  facebook_page_name text,
  facebook_page_access_token text not null,
  user_access_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;

drop policy if exists "Users cannot directly read instagram connection tokens" on public.instagram_connections;
drop policy if exists "Users cannot directly write instagram connection tokens" on public.instagram_connections;

create table if not exists public.instagram_publish_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  instagram_user_id text not null,
  creation_id text,
  published_media_id text,
  video_url text not null,
  caption text,
  status text not null default 'created',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_publish_events
add column if not exists attempt_count integer not null default 0,
add column if not exists next_attempt_at timestamptz;

alter table public.instagram_publish_events enable row level security;

drop policy if exists "Users can view own instagram publish events" on public.instagram_publish_events;
create policy "Users can view own instagram publish events"
on public.instagram_publish_events
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_instagram_username text;
begin
  v_username := lower(trim(new.raw_user_meta_data->>'username'));
  v_instagram_username := trim(coalesce(new.raw_user_meta_data->>'instagram_username', ''));
  v_instagram_username := regexp_replace(v_instagram_username, '^@+', '');

  if v_username is null or v_username = '' then
    raise exception 'Username is required.';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 lowercase letters, numbers, or underscores.';
  end if;

  if v_instagram_username <> '' and v_instagram_username !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'Invalid Instagram username.';
  end if;

  insert into public.user_profiles (
    user_id,
    username,
    instagram_username,
    email
  )
  values (
    new.id,
    v_username,
    nullif(v_instagram_username, ''),
    lower(new.email)
  );

  return new;
end;
$$;
