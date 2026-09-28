update public.credit_usage_events
set
  action = 'render_video',
  metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{legacy_action}',
    '"ai_video_generate"'::jsonb,
    true
  )
where action = 'ai_video_generate';

alter table public.credit_usage_events
drop constraint if exists credit_usage_events_action_check;

alter table public.credit_usage_events
add constraint credit_usage_events_action_check
check (
  action in (
    'script_generate',
    'tts_generate',
    'transcribe_audio',
    'render_video',
    'render_image_video'
  )
);
