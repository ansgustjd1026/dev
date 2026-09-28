-- Persistent administrator-to-user notifications.
-- Run this file once in the Supabase SQL Editor.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  message text not null check (char_length(message) between 1 and 1000),
  action_href text,
  action_label text,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_active_idx
  on public.user_notifications (user_id, created_at desc)
  where dismissed_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "Users can view their notifications" on public.user_notifications;
create policy "Users can view their notifications"
  on public.user_notifications for select to authenticated
  using (user_id = auth.uid());

create or replace function public.mark_user_notifications_read(p_notification_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  update public.user_notifications
     set read_at = coalesce(read_at, now())
   where user_id = auth.uid()
     and dismissed_at is null
     and id = any(p_notification_ids);
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function public.dismiss_user_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications
     set dismissed_at = now()
   where id = p_notification_id
     and user_id = auth.uid()
     and dismissed_at is null;
  return found;
end;
$$;

revoke all on function public.mark_user_notifications_read(uuid[]) from public;
revoke all on function public.dismiss_user_notification(uuid) from public;
grant execute on function public.mark_user_notifications_read(uuid[]) to authenticated;
grant execute on function public.dismiss_user_notification(uuid) to authenticated;
