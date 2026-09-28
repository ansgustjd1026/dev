insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'source-videos',
  'source-videos',
  true,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.projects
add column if not exists source_video_name text null,
add column if not exists source_video_path text null,
add column if not exists source_video_url text null,
add column if not exists source_video_duration numeric null;

comment on column public.projects.source_video_name is
'Original uploaded video file name for future clip analysis workflows.';

comment on column public.projects.source_video_path is
'Storage path in the source-videos bucket.';

comment on column public.projects.source_video_url is
'Public URL for the original uploaded source video.';

comment on column public.projects.source_video_duration is
'Duration in seconds for the uploaded source video.';

drop policy if exists "Authenticated users manage own source videos"
on storage.objects;

create policy "Authenticated users manage own source videos"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'source-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'source-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
