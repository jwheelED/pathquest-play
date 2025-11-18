-- Schedule auto-release job to run every minute
-- Note: If this fails, pg_cron extension needs to be enabled in Supabase Dashboard
SELECT cron.schedule(
  'auto-release-answers',
  '* * * * *',
  $$SELECT auto_release_expired_answers()$$
);