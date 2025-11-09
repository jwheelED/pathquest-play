-- Schedule auto-release check to run every 2 minutes
SELECT cron.schedule(
  'auto-release-answers-check',
  '*/2 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://otsmjgrhyteyvpufkwdh.supabase.co/functions/v1/auto-release-answers',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90c21qZ3JoeXRleXZwdWZrd2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MTAwMjksImV4cCI6MjA2NTI4NjAyOX0.lECUFBdhoe2gxBJSvHSMlq1BGearE97kSOL-Pz8FZbw"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);