alter table public.projects
add column if not exists caption_emphasis jsonb null;

comment on column public.projects.caption_emphasis is
'User-editable caption emphasis points used for styled shorts subtitles.';
