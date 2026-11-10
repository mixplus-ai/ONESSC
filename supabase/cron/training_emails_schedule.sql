-- Run once (SQL Editor) after deploying the training-emails edge function and migration
-- 20261110000007. Every hour it sends booking confirmations and the N-days-before reminder.
-- Reuses the Vault secret that stock_sync_schedule.sql created. Safe to run again.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('training-emails') where exists (select 1 from cron.job where jobname = 'training-emails');

select cron.schedule(
  'training-emails',
  '5 * * * *',   -- every hour at :05
  $$
  select net.http_post(
    url     := 'https://vpgmxhhiumaqwgnoosfk.supabase.co/functions/v1/training-emails',
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
