-- Run once in the Supabase SQL Editor after deploying the stock-sync edge function.
-- Pulls the stock Google Sheet every hour from 07:00 to 19:00 (Bangkok = UTC+7).
--
-- Before running:
--   1. Edge Functions → stock-sync → Secrets: add CRON_SECRET = <a long random string>
--   2. Replace <CRON_SECRET> below with the same string, and <ANON_KEY> with the project's
--      anon / publishable key (Settings → API). The gateway needs a JWT; the secret proves it is cron.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('stock-sync') where exists (select 1 from cron.job where jobname = 'stock-sync');

select cron.schedule(
  'stock-sync',
  '0 0-12 * * *',   -- UTC 00–12 = 07:00–19:00 Bangkok
  $$
  select net.http_post(
    url     := 'https://vpgmxhhiumaqwgnoosfk.supabase.co/functions/v1/stock-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
