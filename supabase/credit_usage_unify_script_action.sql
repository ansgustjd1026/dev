update public.credit_usage_events
set action = 'script_generate'
where action in ('script_generate_basic', 'script_generate_premium');

alter table public.credit_usage_events
drop constraint if exists credit_usage_events_action_check;

alter table public.credit_usage_events
add constraint credit_usage_events_action_check
check (
  action in (
    'script_generate',
    'tts_generate',
    'transcribe_audio',
    'render_video'
  )
);
