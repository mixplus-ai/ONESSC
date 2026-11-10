-- Run once (SQL Editor) after deploying the stock-sync edge function and migration
-- 20261110000004. Pulls the stock Google Sheet once a day at 07:00 Bangkok (UTC+7).
-- Safe to run again: it keeps the existing secret and replaces the schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- random secret in Vault; the edge function checks it through public.verify_cron_secret()
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'stock_sync_cron_secret',
                           'x-cron-secret for the stock-sync edge function')
 where not exists (select 1 from vault.secrets where name = 'stock_sync_cron_secret');

select cron.unschedule('stock-sync') where exists (select 1 from cron.job where jobname = 'stock-sync');

select cron.schedule(
  'stock-sync',
  '0 0 * * *',   -- UTC 00:00 = 07:00 Bangkok, once a day
  $$
  select net.http_post(
    url     := 'https://vpgmxhhiumaqwgnoosfk.supabase.co/functions/v1/stock-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- public anon key (the same one the website ships): the functions gateway wants a JWT
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZ214aGhpdW1hcXdnbm9vc2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3NzIzMDgsImV4cCI6MjEwOTM0ODMwOH0.IPI0vPFPkwfXDLMKk-LuFxI7HwZq4vjywNEX8-2gbqY',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'stock_sync_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
