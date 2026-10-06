-- =====================================================================
-- Recommended scheduler: Supabase Cron (pg_cron + pg_net), every minute.
-- Run once in the Supabase SQL Editor AFTER deploying the app.
-- Replace <APP_URL> and <CRON_SECRET> (same value as the app's CRON_SECRET
-- env var). Store the secret in Vault instead of plain SQL if possible.
--
-- Why not Vercel Cron? Vercel Hobby only allows daily cron jobs (vercel.json
-- keeps a daily safety-net run). Any HTTP scheduler that sends
-- "Authorization: Bearer <CRON_SECRET>" to /api/cron/social works the same.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Publish queue (due posts, retries, video processing) — every minute
select cron.schedule(
  'naoru-social-publish',
  '* * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/social?task=publish',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Insights sync (checkpoints 1h / 24h / 3d / 7d / 14d / 30d) + AI review — every 30 minutes
select cron.schedule(
  'naoru-social-insights',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/social?task=insights',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Token refresh (long-lived tokens expiring within 7 days) — every 6 hours
select cron.schedule(
  'naoru-social-tokens',
  '7 */6 * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/social?task=tokens',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- To stop: select cron.unschedule('naoru-social-publish'); …
