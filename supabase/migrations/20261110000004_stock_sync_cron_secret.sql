-- Lets the stock-sync edge function check the pg_cron caller against a secret kept in
-- Supabase Vault (name: stock_sync_cron_secret), so nobody has to copy a secret by hand.
-- The secret and the schedule are created by supabase/cron/stock_sync_schedule.sql.
create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_secret is null or length(p_secret) < 32 then
    return false;
  end if;
  return exists (
    select 1 from vault.decrypted_secrets
     where name = 'stock_sync_cron_secret' and decrypted_secret = p_secret
  );
end $$;

revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;
