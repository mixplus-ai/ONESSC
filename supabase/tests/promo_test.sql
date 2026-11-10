-- Promo code tests: free / baht / percent codes, session scope, max uses, expiry, RLS.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'pstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'pu1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'pu2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'pu3@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'pstaff@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000000a1', 'courses');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into public.courses (id, code, title, hours, price) values ('21000000-0000-0000-0000-000000000001', 'PR', 'Promo course', 6, 3900);
insert into public.course_sessions (id, course_id, starts_on, capacity) values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', public.bkk_today() + 20, 30),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', public.bkk_today() + 27, 30);
-- staff creates codes
insert into public.training_promo_codes (code, session_id, kind, value, max_uses, expires_on) values
  ('FREE1', '31000000-0000-0000-0000-000000000001', 'free', 0, 1, null),
  ('AMT500', null, 'amount', 500, null, null),
  ('PCT10', '31000000-0000-0000-0000-000000000002', 'percent', 10, null, null),
  ('OLD', null, 'free', 0, null, public.bkk_today() - 1);

-- customers cannot list or create codes
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$ begin
  assert (select count(*) from public.training_promo_codes) = 0, 'customer cannot list codes';
  begin
    insert into public.training_promo_codes (code, kind) values ('HACK', 'free');
    assert false, 'customer cannot create codes';
  exception when insufficient_privilege then null;
  end;
  assert (public.check_promo_code(' free1 ')) ->> 'kind' = 'free', 'check code (trim + case)';
  begin
    perform public.check_promo_code('NOPE');
    assert false, 'unknown code';
  exception when raise_exception then null;
  end;
end $$;

-- free code: no billing, nothing to pay
do $$
declare r public.training_registrations;
begin
  r := public.book_session('31000000-0000-0000-0000-000000000001', null, null, null, 'free1');
  assert r.subtotal = 3900 and r.discount = 3900 and r.total = 0, 'free total';
  assert r.pay_status = 'free' and r.billing is null and not r.wants_quote, 'free booking needs no payment';
  assert r.coupon_code = 'FREE1' and r.promo_code_id is not null, 'code recorded';
end $$;

-- the code had one use
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  begin
    perform public.book_session('31000000-0000-0000-0000-000000000001', null, null, null, 'FREE1');
    assert false, 'max uses';
  exception when raise_exception then null;
  end;
  -- wrong session / expired
  begin
    perform public.book_session('31000000-0000-0000-0000-000000000001', null, null, '{"type":"person","name":"x"}'::jsonb, 'PCT10');
    assert false, 'code for another session';
  exception when raise_exception then null;
  end;
  begin
    perform public.book_session('31000000-0000-0000-0000-000000000001', null, null, null, 'OLD');
    assert false, 'expired code';
  exception when raise_exception then null;
  end;
  -- a partial discount still needs billing details
  begin
    perform public.book_session('31000000-0000-0000-0000-000000000001', null, null, null, 'AMT500');
    assert false, 'billing required when something is left to pay';
  exception when raise_exception then null;
  end;
end $$;

-- baht code, company: 3,400 + VAT 238 − WHT 102 = 3,536 ; percent code: 3,900 − 390 = 3,510 + VAT
do $$ begin
  assert (public.book_session('31000000-0000-0000-0000-000000000001', null, null,
          '{"type":"company","name":"บ","tax_id":"0105555000002","address":"x"}'::jsonb, 'AMT500')).total = 3536, 'amount code';
  assert (public.book_session('31000000-0000-0000-0000-000000000002', null, null,
          '{"type":"person","name":"บ","address":"x"}'::jsonb, 'pct10')).total = 3755.70, 'percent code';
end $$;

-- cancelling frees the use
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.cancel_registration((select id from public.training_registrations where coupon_code = 'FREE1'), 'เปลี่ยนแผน');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
do $$ begin
  assert (public.book_session('31000000-0000-0000-0000-000000000001', null, null, null, 'FREE1')).total = 0, 'use freed by cancel';
end $$;

-- staff sees use counts, cannot move a booking off its code by editing the row
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  assert (select used from public.promo_code_uses() u join public.training_promo_codes c on c.id = u.promo_code_id where c.code = 'FREE1') = 1, 'use count';
end $$;
update public.training_registrations set promo_code_id = null
 where user_id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select promo_code_id from public.training_registrations where user_id = '00000000-0000-0000-0000-0000000000c3') is not null, 'guard keeps promo';
end $$;

rollback;
\echo ALL PROMO TESTS PASSED
