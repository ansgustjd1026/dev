create table if not exists public.toss_login_accounts (
  toss_user_key text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.toss_login_accounts enable row level security;

create table if not exists public.toss_iap_orders (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  plan text not null check (plan in ('starter', 'pro')),
  status text not null default 'granted' check (status in ('granted', 'revoked')),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.toss_iap_orders enable row level security;

create table if not exists public.toss_youtube_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.toss_youtube_oauth_states enable row level security;

-- The mini app reads and writes only the signed-in user's projects.
alter table public.projects enable row level security;

drop policy if exists "Toss users can view own projects" on public.projects;
create policy "Toss users can view own projects"
  on public.projects for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Toss users can create own projects" on public.projects;
create policy "Toss users can create own projects"
  on public.projects for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Toss users can update own projects" on public.projects;
create policy "Toss users can update own projects"
  on public.projects for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts-audio', 'tts-audio', true, 20971520, array['audio/mpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Toss users manage own TTS audio" on storage.objects;
create policy "Toss users manage own TTS audio"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'tts-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'tts-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
