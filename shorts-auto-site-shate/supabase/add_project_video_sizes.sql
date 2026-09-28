alter table public.projects
add column if not exists final_video_size bigint;

comment on column public.projects.final_video_size is
'Final rendered video size in bytes, used for plan storage limits.';
