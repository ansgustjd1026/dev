create table if not exists public.youtube_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_id text,
  channel_title text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_connections enable row level security;

drop policy if exists "Users cannot directly read youtube connection tokens" on public.youtube_connections;
drop policy if exists "Users cannot directly write youtube connection tokens" on public.youtube_connections;

create table if not exists public.youtube_publish_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  video_url text not null,
  title text,
  description text,
  pinned_comment text,
  privacy_status text not null default 'private',
  youtube_video_id text,
  youtube_comment_id text,
  comment_error_message text,
  status text not null default 'queued',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_publish_events
  add column if not exists privacy_status text not null default 'private';

alter table public.youtube_publish_events
  add column if not exists pinned_comment text,
  add column if not exists youtube_comment_id text,
  add column if not exists comment_error_message text;

alter table public.youtube_publish_events enable row level security;

drop policy if exists "Users can view own youtube publish events" on public.youtube_publish_events;
create policy "Users can view own youtube publish events"
on public.youtube_publish_events
for select
to authenticated
using (auth.uid() = user_id);
