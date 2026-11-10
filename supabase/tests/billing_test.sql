-- Profile avatar + billing tests: users edit their own billing, requests snapshot it.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b1001', 'bill1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000b1002', 'bill2@ssc.test', '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1001', true);
update public.profiles set avatar_url = 'https://x/avatars/a.png',
  billing = '{"type":"company","name":"Test Co","tax_id":"1234567890123","branch":"สำนักงานใหญ่","address":"BKK"}'
 where id = auth.uid();
do $$ begin
  assert (select billing ->> 'name' from public.profiles where id = auth.uid()) = 'Test Co', 'own billing saved';
  assert (select avatar_url from public.profiles where id = auth.uid()) is not null, 'avatar saved';
  begin
    update public.profiles set billing = '"x"' where id = auth.uid();
    assert false, 'billing must be an object';
  exception when check_violation then null;
  end;
end $$;
-- another user cannot change it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1002', true);
update public.profiles set billing = '{"name":"hack"}' where id = '00000000-0000-0000-0000-0000000b1001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b1001', true);
do $$ begin assert (select billing ->> 'name' from public.profiles where id = auth.uid()) = 'Test Co', 'others cannot edit'; end $$;

-- quote request and reservation copy the billing snapshot
reset role;
insert into public.quote_requests (code, user_id) values ('QT-BILL-1', '00000000-0000-0000-0000-0000000b1001');
insert into public.reservations (code, user_id, expires_at) values ('RS-BILL-1', '00000000-0000-0000-0000-0000000b1001', now() + interval '1 day');
do $$ begin
  assert (select billing ->> 'tax_id' from public.quote_requests where code = 'QT-BILL-1') = '1234567890123', 'quote snapshot';
  assert (select billing ->> 'name' from public.reservations where code = 'RS-BILL-1') = 'Test Co', 'reservation snapshot';
end $$;
rollback;
\echo ALL BILLING TESTS PASSED
