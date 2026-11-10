-- Optional (SQL Editor, run once): every night at 01:00 Bangkok, bookings of sessions that have ended
-- without a check-in become "ไม่มาอบรม" and count as one strike (cerssc AUTO_NOSHOW rule).
-- Staff can also press "บันทึกไม่มาอบรม" in อบรมและกิจกรรม → รอบอบรม. Safe to run again.
create extension if not exists pg_cron;
select cron.unschedule('training-no-show') where exists (select 1 from cron.job where jobname = 'training-no-show');
select cron.schedule('training-no-show', '0 18 * * *', $$ select public.mark_no_shows() $$);  -- 18:00 UTC = 01:00 BKK
