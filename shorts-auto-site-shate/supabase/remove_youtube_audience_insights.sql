-- Run after deploying the removal of YouTube audience analysis.
-- Permanently removes only the retired analysis cache, not YouTube connections.
drop table if exists public.youtube_audience_insights;
