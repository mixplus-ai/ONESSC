-- Training e-mail queue tests: confirmation, 5-day reminder, retries, switch.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'mail1@ssc.test', '{"full_name":"ผู้รับ หนึ่ง"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'mail2@ssc.test', '{}');
insert into public.courses (id, code, title, hours, price) values ('22000000-0000-0000-0000-000000000001', 'EM', 'Email course', 6, 0);
insert into public.course_sessions (id, course_id, starts_on, capacity) values
  ('32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', public.bkk_today() + 10, 30),
  ('32000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', public.bkk_today() + 4, 30);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select public.book_session('32000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select public.book_session('32000000-0000-0000-0000-000000000002');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- customers cannot read the queue
do $$ begin
  assert not has_function_privilege('authenticated', 'public.training_emails_due(int)', 'execute'), 'queue is service-only';
  -- off by default: nothing to send
  assert (select count(*) from public.training_emails_due()) = 0, 'e-mail off by default';
end $$;

update public.training_settings set email_enabled = true where id = 1;
do $$ begin
  assert (select count(*) from public.training_emails_due() where kind = 'confirm') = 2, 'two confirmations';
  -- mail2 booked 4 days before: no separate reminder (inside the window)
  assert (select count(*) from public.training_emails_due() where kind = 'reminder') = 0, 'no reminder for late booking';
  assert (select to_email from public.training_emails_due() where kind = 'confirm' and days_left = 10) = 'mail1@ssc.test', 'recipient';
end $$;

-- mail2 actually booked 3 weeks ago → reminder is due (session in 4 days, window 5)
update public.training_registrations set created_at = now() - interval '21 days'
 where user_id = '00000000-0000-0000-0000-0000000000e2';
do $$ begin
  assert (select count(*) from public.training_emails_due() where kind = 'reminder') = 1, 'reminder due';
  assert (select count(*) from public.training_emails_due() where kind = 'confirm') = 1, 'old booking gets no confirmation';
end $$;

-- sent → gone ; failed → retried up to 3 attempts
select public.record_training_email(registration_id, kind, to_email) from public.training_emails_due() where kind = 'reminder';
do $$
declare v uuid := (select id from public.training_registrations where user_id = '00000000-0000-0000-0000-0000000000e1');
begin
  assert (select count(*) from public.training_emails_due() where kind = 'reminder') = 0, 'sent reminder not repeated';
  perform public.record_training_email(v, 'confirm', 'mail1@ssc.test', 'smtp timeout');
  assert (select count(*) from public.training_emails_due() where kind = 'confirm') = 1, 'failed is retried';
  perform public.record_training_email(v, 'confirm', 'mail1@ssc.test', 'smtp timeout');
  perform public.record_training_email(v, 'confirm', 'mail1@ssc.test', 'smtp timeout');
  assert (select count(*) from public.training_emails_due() where kind = 'confirm') = 0, 'gives up after 3 attempts';
  assert (select attempts from public.training_email_log where registration_id = v) = 3, 'attempts counted';
end $$;

-- cancelled bookings get nothing
update public.training_settings set reminder_days_before = 10 where id = 1;
update public.training_registrations set status = 'cancelled', created_at = now() - interval '30 days'
 where user_id = '00000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from public.training_emails_due() where to_email = 'mail1@ssc.test') = 0, 'cancelled gets nothing';
end $$;

rollback;
\echo ALL EMAIL TESTS PASSED
