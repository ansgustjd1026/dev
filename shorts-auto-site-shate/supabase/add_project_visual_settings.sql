alter table public.projects
add column if not exists visual_mode text null
  check (visual_mode in ('background', 'images')),
add column if not exists visual_style text null
  check (visual_style in (
    'cinematic',
    'animation_2d',
    'monochrome_2d',
    'animation_3d',
    'animal_characters',
    'webtoon'
  ));

comment on column public.projects.visual_mode is
'The source used to render the project: uploaded background video or generated images.';

comment on column public.projects.visual_style is
'The generated image style selected when the project was rendered.';
