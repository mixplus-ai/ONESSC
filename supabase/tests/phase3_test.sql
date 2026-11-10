-- Phase 3 tests: booking rules, strikes/ban, check-in, points (FIFO buckets), coupons, company points, legacy claim.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000e', 'staff2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'user1@ssc.test', '{"full_name":"ลูกค้า หนึ่ง"}'),
  ('00000000-0000-0000-0000-00000000000d', 'user2@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'admin@ssc.test';
update public.profiles set role = 'staff' where email in ('staff@ssc.test', 'staff2@ssc.test');
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000000b', 'courses');
insert into public.companies (id, tax_id, name) values ('10000000-0000-0000-0000-000000000001', '0105555000001', 'บริษัท เอ');
update public.profiles set company_id = '10000000-0000-0000-0000-000000000001', company_status = 'approved', tax_id = '0105555000001'
 where email = 'user1@ssc.test';

create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

set local role authenticated;

-- ---- staff with 'courses' creates a course and sessions
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.courses (id, code, title, hours, price) values
  ('20000000-0000-0000-0000-000000000001', 'OM', 'SolarEdge O&M', 6, 3900);
insert into public.course_sessions (id, course_id, starts_on, capacity, checkin_code, lat, lng) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', public.bkk_today() + 20, 2, '111111', 13.7, 100.6),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', public.bkk_today() + 21, 30, '222222', null, null),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', public.bkk_today() + 1, 30, '333333', null, null),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', public.bkk_today() + 22, 30, '444444', null, null),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', public.bkk_today() + 23, 30, '555555', null, null);

-- staff without the permission cannot edit courses
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
update public.courses set title = 'x' where code = 'OM';
do $$ begin
  assert (select title from public.courses where code = 'OM') = 'SolarEdge O&M', 'staff2 cannot edit courses';
end $$;

-- ---- user1 books as a company: 3,900 + VAT 7% − WHT 3%
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare r public.training_registrations;
begin
  r := public.book_session('30000000-0000-0000-0000-000000000001', 'Sale A', 'Facebook',
       '{"type":"company","name":"บริษัท เอ","tax_id":"0105555000001","address":"กรุงเทพ"}'::jsonb);
  assert r.subtotal = 3900 and r.vat_amount = 273 and r.wht_amount = 117 and r.total = 4056, 'company pricing';
  assert r.pay_status = 'unpaid', 'unpaid';
  assert r.code like 'TR-__-0001', 'doc number';
  insert into t values ('reg1', r.id);
end $$;

-- the check-in code is hidden from customers
do $$ begin
  begin
    perform checkin_code from public.course_sessions limit 1;
    assert false, 'user must not read checkin_code';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$ begin
  begin
    perform public.book_session('30000000-0000-0000-0000-000000000001', null, null, '{"type":"person","name":"ก"}'::jsonb);
    assert false, 'double booking must fail';
  exception when raise_exception then null;
  end;
  -- person without tax invoice: no VAT, no WHT
  assert (public.book_session('30000000-0000-0000-0000-000000000002', null, null, '{"type":"person_no_vat","name":"ก"}'::jsonb)).total = 3900, 'person_no_vat total';
  perform public.book_session('30000000-0000-0000-0000-000000000003', null, null, '{"type":"person","name":"ก"}'::jsonb);
  perform public.book_session('30000000-0000-0000-0000-000000000004', null, null, '{"type":"person","name":"ก"}'::jsonb);
end $$;

-- capacity: session 1 holds 2 → user2 takes the last seat, admin is refused
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
select public.book_session('30000000-0000-0000-0000-000000000001', null, null, '{"type":"person","name":"ข"}'::jsonb);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  begin
    perform public.book_session('30000000-0000-0000-0000-000000000001', null, null, '{"type":"person","name":"ค"}'::jsonb);
    assert false, 'full session must fail';
  exception when raise_exception then null;
  end;
end $$;

-- ---- strikes: cancel inside the 3-day window is refused; outside → strike
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare v_id uuid; v jsonb;
begin
  select r.id into v_id from public.training_registrations r where r.session_id = '30000000-0000-0000-0000-000000000003' and r.user_id = auth.uid();
  begin
    perform public.cancel_registration(v_id, 'ติดธุระ');
    assert false, 'cancel inside window must fail';
  exception when raise_exception then null;
  end;
  select r.id into v_id from public.training_registrations r where r.session_id = '30000000-0000-0000-0000-000000000004' and r.user_id = auth.uid();
  v := public.cancel_registration(v_id, 'ติดธุระ');
  assert (v ->> 'strikes')::int = 1 and not (v ->> 'banned')::boolean, 'first strike';
  -- reschedule session 2 → 5 : second strike, booking moves
  select r.id into v_id from public.training_registrations r where r.session_id = '30000000-0000-0000-0000-000000000002' and r.user_id = auth.uid();
  v := public.reschedule_registration(v_id, '30000000-0000-0000-0000-000000000005', 'เปลี่ยนวัน');
  assert (v ->> 'strikes')::int = 2, 'second strike';
  assert (select status from public.training_registrations where id = v_id) = 'rescheduled', 'old row rescheduled';
  assert (select total from public.training_registrations where id = (v ->> 'id')::uuid) = 3900, 'payment carried over';
  assert (public.my_training_status() ->> 'active_bookings')::int = 3, 'three active bookings';
end $$;

-- ---- staff: attendance by hand, no-show strike → third strike bans and cancels upcoming bookings
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$ begin
  begin
    perform public.set_attendance((select v::uuid from t where k = 'reg1'), 'attended');
    assert false, 'staff without courses perm cannot mark attendance';
  exception when insufficient_privilege then null;
  end;
end $$;

-- session 1 happens now: move it to today (staff) so check-in opens
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.course_sessions
   set starts_on = (now() at time zone 'Asia/Bangkok' - interval '1 hour')::date,
       start_time = (now() at time zone 'Asia/Bangkok' - interval '1 hour')::time,
       ends_on = (now() at time zone 'Asia/Bangkok' + interval '2 hours')::date,
       end_time = (now() at time zone 'Asia/Bangkok' + interval '2 hours')::time
 where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert public.session_checkin_code('30000000-0000-0000-0000-000000000001') = '111111', 'staff reads check-in code';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare v jsonb;
begin
  begin
    perform public.check_in('30000000-0000-0000-0000-000000000001', '000000', 13.7, 100.6);
    assert false, 'wrong code';
  exception when raise_exception then null;
  end;
  begin
    perform public.check_in('30000000-0000-0000-0000-000000000001', '111111', 13.8, 100.6);
    assert false, 'too far';
  exception when raise_exception then null;
  end;
  v := public.check_in('30000000-0000-0000-0000-000000000001', '111111', 13.7003, 100.6, 'qr');
  assert (v ->> 'points')::numeric = 6, '6 hours × 1 point';
  assert public.point_balance('personal', auth.uid()) = 6, 'balance 6';
  assert (select expires_on from public.point_ledger where user_id = auth.uid() and kind = 'earn')
         = make_date(extract(year from public.bkk_today())::int, 12, 31), 'personal points expire 31 Dec';
end $$;

-- evaluation → certificate, verifiable by anyone
do $$
declare r public.training_registrations;
begin
  r := public.submit_evaluation((select v::uuid from t where k = 'reg1'), '{"q1":5,"comment":"ดีมาก"}'::jsonb);
  assert r.cert_no = 'SSC-OM-' || to_char(public.bkk_today(), 'YYYY') || '-0001', 'cert number ' || r.cert_no;
  insert into t values ('cert', r.cert_no);
end $$;
reset role;
set local role anon;
do $$ begin
  assert (select full_name from public.verify_certificate((select v from t where k = 'cert'))) = 'ลูกค้า หนึ่ง', 'anon verifies certificate';
  assert (select valid from public.verify_certificate((select v from t where k = 'cert'))), 'certificate valid';
end $$;
reset role;
set local role authenticated;

-- ---- rewards: admin adds items; user redeems → coupon; staff marks used; cancel restores points
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.rewards (id, wallet, kind, name, points, stock) values
  ('40000000-0000-0000-0000-000000000001', 'personal', 'item', 'แก้วเก็บความเย็น', 4, 1),
  ('40000000-0000-0000-0000-000000000002', 'personal', 'prize', 'ร่ม', null, null),
  ('40000000-0000-0000-0000-000000000003', 'company', 'item', 'บัตรกำนัล 1,000 บาท', 100, null);
update public.rewards set weight = 1 where id = '40000000-0000-0000-0000-000000000002';
update public.points_config set lucky_cost = 2 where id = 1;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare c public.redemptions;
begin
  c := public.redeem_reward('40000000-0000-0000-0000-000000000001');
  assert c.code like 'CP-__-0001' and c.status = 'issued', 'coupon issued';
  assert public.point_balance('personal', auth.uid()) = 2, 'balance after redeem';
  assert (select stock from public.rewards where id = '40000000-0000-0000-0000-000000000001') = 0, 'stock decremented';
  begin
    perform public.redeem_reward('40000000-0000-0000-0000-000000000001');
    assert false, 'out of stock';
  exception when raise_exception then null;
  end;
  c := public.lucky_draw();
  assert c.method = 'lucky' and c.reward_name = 'ร่ม', 'lucky draw';
  assert public.point_balance('personal', auth.uid()) = 0, 'balance after draw';
  begin
    perform public.lucky_draw();
    assert false, 'not enough points';
  exception when raise_exception then null;
  end;
  insert into t values ('coupon', (select code from public.redemptions where method = 'direct' and user_id = auth.uid()));
end $$;
-- a customer cannot write the ledger directly
do $$ begin
  begin
    insert into public.point_ledger (wallet, user_id, points, kind) values ('personal', auth.uid(), 100, 'adjust');
    assert false, 'direct ledger insert must fail';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$
declare c public.redemptions;
begin
  c := public.use_coupon((select v from t where k = 'coupon'));
  assert c.status = 'used', 'coupon used by staff';
  c := public.cancel_redemption(c.id, 'ลูกค้าเปลี่ยนใจ');
  assert c.status = 'cancelled', 'coupon cancelled';
  assert public.point_balance('personal', '00000000-0000-0000-0000-00000000000c') = 4, 'points restored';
  assert (select stock from public.rewards where id = '40000000-0000-0000-0000-000000000001') = 1, 'stock restored';
  -- staff cannot adjust personal points (admin only)
  begin
    perform public.adjust_points('personal', '00000000-0000-0000-0000-00000000000c', 5, 'x');
    assert false, 'staff cannot adjust personal';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- company points: staff records purchases (tiers + bonus), deducts, voids
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.points_config
   set company_baht_per_point = 1000,
       company_tiers = '[{"min":0,"multiplier":1},{"min":100000,"multiplier":1.5},{"min":500000,"multiplier":2}]'
 where id = 1;
insert into public.company_point_bonuses (id, label, multiplier) values ('50000000-0000-0000-0000-000000000001', 'โปรโมชั่น ×2', 2);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$
declare l public.point_ledger; red public.redemptions; v_old bigint;
begin
  assert (public.calc_company_points(50000) ->> 'points')::numeric = 50, 'flat 1,000 ฿ = 1';
  assert (public.calc_company_points(250000) ->> 'points')::numeric = 375, 'tier ×1.5';
  assert (public.calc_company_points(600000, '50000000-0000-0000-0000-000000000001') ->> 'points')::numeric = 2400, 'tier ×2 · bonus ×2';
  l := public.add_company_purchase('10000000-0000-0000-0000-000000000001', 'INV-001', public.bkk_today(), 250000, 'อินเวอร์เตอร์');
  assert l.points = 375, 'purchase points';
  assert l.expires_on = make_date(extract(year from public.bkk_today())::int + 1, 12, 31), 'company points expire end of next year';
  begin
    perform public.add_company_purchase('10000000-0000-0000-0000-000000000001', 'inv-001', public.bkk_today(), 1000);
    assert false, 'duplicate invoice';
  exception when raise_exception then null;
  end;
  -- edit = void + new row
  v_old := l.id;
  l := public.edit_company_purchase(v_old, 'ยอดผิด', 'INV-001', public.bkk_today(), 300000);
  assert l.points = 450 and l.replaces_id = v_old, 'edited purchase';
  assert (select voided_at is not null from public.point_ledger where id = v_old), 'old row voided';
  assert public.point_balance('company', '10000000-0000-0000-0000-000000000001') = 450, 'company balance';
  red := public.company_redeem('10000000-0000-0000-0000-000000000001', 400, '40000000-0000-0000-0000-000000000003', null, 'IV-777');
  assert red.status = 'used' and red.code like 'RD-__-0001', 'company redemption';
  assert public.point_balance('company', '10000000-0000-0000-0000-000000000001') = 50, 'balance after deduction';
  begin
    perform public.void_point_entry(l.id, 'ทดสอบ');
    assert false, 'cannot void spent purchase';
  exception when raise_exception then null;
  end;
  begin
    perform public.company_redeem('10000000-0000-0000-0000-000000000001', 51, null, 'ส่วนลด');
    assert false, 'not enough company points';
  exception when raise_exception then null;
  end;
  perform public.cancel_redemption(red.id, 'ออกบิลผิด');
  perform public.void_point_entry(l.id, 'ยกเลิกบิล');
  assert public.point_balance('company', '10000000-0000-0000-0000-000000000001') = 0, 'void purchase';
  -- FIFO: an expiring bucket is used first
  perform public.add_company_purchase('10000000-0000-0000-0000-000000000001', 'OLD-1', make_date(extract(year from public.bkk_today())::int - 1, 6, 1), 10000);
  perform public.add_company_purchase('10000000-0000-0000-0000-000000000001', 'NEW-1', public.bkk_today(), 10000);
  red := public.company_redeem('10000000-0000-0000-0000-000000000001', 12, null, 'ส่วนลด');
  assert (select array_agg(points order by expires_on) from public.point_ledger where redemption_id = red.id) = '{-10,-2}'::numeric[], 'FIFO buckets';
end $$;
update public.point_ledger set points = 9999 where wallet = 'company';
do $$ begin
  assert not exists (select 1 from public.point_ledger where points = 9999), 'ledger rows are not editable through the API';
end $$;
reset role;
do $$ begin
  begin
    update public.point_ledger set points = 9999 where wallet = 'company';
    assert false, 'ledger rows are immutable even for the owner role';
  exception when raise_exception then null;
  end;
end $$;
set local role authenticated;

-- customers: user1 sees their company's ledger, user2 does not; user1 cannot record purchases
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert (select count(*) from public.point_ledger where wallet = 'company') > 0, 'user1 sees company ledger';
  assert (public.my_training_status() ->> 'company_points')::numeric = 8, 'company balance in status';
  begin
    perform public.add_company_purchase('10000000-0000-0000-0000-000000000001', 'X', public.bkk_today(), 1000);
    assert false, 'user cannot add purchase';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.point_balance('personal', '00000000-0000-0000-0000-00000000000d');
    assert false, 'cannot read another user balance';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  assert (select count(*) from public.point_ledger where wallet = 'company') = 0, 'user2 cannot see company ledger';
  assert (select count(*) from public.training_registrations) = 1, 'user2 sees only own registration';
end $$;

-- ---- no-shows: user2's session ended without check-in
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.course_sessions
   set starts_on = public.bkk_today() - 2, ends_on = null
 where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert public.mark_no_shows() = 1, 'one no-show';
  assert (select status from public.training_registrations where user_id = '00000000-0000-0000-0000-00000000000d') = 'no_show', 'user2 no-show';
  assert (select count(*) from public.training_strikes where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'no_show') = 1, 'no-show strike';
end $$;

-- third strike for user1 (limit 2) → banned, upcoming bookings cancelled, cannot book
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare v_id uuid; v jsonb;
begin
  select r.id into v_id from public.training_registrations r
   where r.session_id = '30000000-0000-0000-0000-000000000005' and r.user_id = auth.uid() and r.status = 'registered';
  v := public.cancel_registration(v_id, 'ไม่ว่าง');
  assert (v ->> 'strikes')::int = 3 and (v ->> 'banned')::boolean, 'third strike bans';
  assert (select status from public.training_registrations
           where session_id = '30000000-0000-0000-0000-000000000003' and user_id = auth.uid()) = 'cancelled', 'upcoming booking auto-cancelled';
  assert (public.my_training_status() ->> 'banned')::boolean, 'status shows ban';
  begin
    perform public.book_session('30000000-0000-0000-0000-000000000002', null, null, '{"type":"person","name":"ก"}'::jsonb);
    assert false, 'banned user cannot book';
  exception when raise_exception then null;
  end;
end $$;
-- staff waives a strike → can book again
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.training_strikes set waived_at = now()
 where id = (select id from public.training_strikes where user_id = '00000000-0000-0000-0000-00000000000c' order by created_at limit 1);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert not (public.my_training_status() ->> 'banned')::boolean, 'waived strike lifts ban';
end $$;

-- ---- cerssc account claimed on sign-up by email
reset role;
insert into public.legacy_cerssc_users (legacy_id, email, full_name, phone, company, tax_id)
values ('U-OLD-1', 'old@ssc.test', 'ผู้ใช้เดิม', '0811111111', 'บริษัท เก่า', '0105555000009');
insert into public.training_registrations (code, legacy_user_id, session_id, status, legacy_id)
values ('R-OLD-1', 'U-OLD-1', '30000000-0000-0000-0000-000000000002', 'attended', 'R-OLD-1');
insert into public.point_ledger (wallet, legacy_user_id, points, kind, expires_on, legacy_id)
values ('personal', 'U-OLD-1', 12, 'earn', make_date(extract(year from public.bkk_today())::int, 12, 31), 'P-OLD-1');
select set_config('request.jwt.claim.sub', '', true);  -- sign-up runs without a signed-in user
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'Old@SSC.test');
do $$ begin
  assert (select legacy_cerssc_id from public.profiles where id = '00000000-0000-0000-0000-00000000000f') = 'U-OLD-1', 'legacy id linked';
  assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000f') = 'ผู้ใช้เดิม', 'name copied';
  assert (select company_status from public.profiles where id = '00000000-0000-0000-0000-00000000000f') = 'pending', 'tax id waits for approval';
  assert (select user_id from public.training_registrations where legacy_id = 'R-OLD-1') = '00000000-0000-0000-0000-00000000000f', 'registration moved';
  assert public.point_balance('personal', '00000000-0000-0000-0000-00000000000f') = 12, 'points moved';
end $$;

-- ---- registrations guard: staff edit payment fields directly, but not status / identity
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.training_registrations set status = 'cancelled', pay_status = 'paid', staff_note = 'ok'
 where legacy_id = 'R-OLD-1';
do $$ begin
  assert (select status from public.training_registrations where legacy_id = 'R-OLD-1') = 'attended', 'guard keeps status';
  assert (select pay_status from public.training_registrations where legacy_id = 'R-OLD-1') = 'paid', 'staff can set payment';
  assert (select paid_at from public.training_registrations where legacy_id = 'R-OLD-1') is not null, 'paid_at stamped';
end $$;
reset role;

rollback;
\echo ALL PHASE 3 TESTS PASSED
