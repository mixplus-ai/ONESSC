-- Migration 26: claim shipping fee → receipt → customer slip → staff confirm / reject.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f26a1', 'shadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f26b1', 'shstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f26c1', 'shcu@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f26c2', 'shother@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'shadmin@ssc.test';
update public.profiles set role = 'staff' where email = 'shstaff@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000f26b1', 'claims.handle');
insert into public.claims (id, claim_no, source, user_id, contact_name, contact_phone, product_type, status, delivery_type, delivery_address) values
  ('26000000-0000-0000-0000-0000000000a1', '26-9101', 'customer', '00000000-0000-0000-0000-0000000f26c1', 'A', '081', 'inverter', 'done', 'shipping', 'BKK');

set local role authenticated;
-- customer cannot attach a slip before a fee exists
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26c1', true);
do $$ begin
  begin perform public.add_claim_file('26000000-0000-0000-0000-0000000000a1', 'ship_slip', '26000000-0000-0000-0000-0000000000a1/ship_slip/s.jpg', 's.jpg', 1, 'image/jpeg');
    assert false, 'no fee yet'; exception when insufficient_privilege then null; end;
  begin perform public.set_claim_shipping('26000000-0000-0000-0000-0000000000a1', 100, 'Kerry', 'K1'); assert false, 'customer cannot set fee';
  exception when insufficient_privilege then null; end;
end $$;

-- unassigned staff cannot, assigned staff can
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26b1', true);
do $$ begin
  begin perform public.set_claim_shipping('26000000-0000-0000-0000-0000000000a1', 100, 'Kerry', 'K1'); assert false, 'not assigned';
  exception when insufficient_privilege then null; end;
  perform public.take_claim('26000000-0000-0000-0000-0000000000a1');
  perform public.set_claim_shipping('26000000-0000-0000-0000-0000000000a1', 120, ' Kerry ', 'K123');
  perform public.add_claim_file('26000000-0000-0000-0000-0000000000a1', 'ship_receipt', '26000000-0000-0000-0000-0000000000a1/ship_receipt/r.pdf', 'r.pdf', 1, 'application/pdf');
  assert (select ship_status || '/' || ship_fee || '/' || ship_carrier from public.claims where claim_no = '26-9101') = 'unpaid/120.00/Kerry', 'fee set';
  assert (select ship_receipt_path from public.claims where claim_no = '26-9101') like '%/ship_receipt/r.pdf', 'receipt path';
  begin perform public.decide_ship_slip('26000000-0000-0000-0000-0000000000a1', true); assert false, 'no slip yet';
  exception when raise_exception then null; end;
end $$;

-- another customer cannot attach; owner attaches slip and sees the receipt
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26c2', true);
do $$ begin
  begin perform public.add_claim_file('26000000-0000-0000-0000-0000000000a1', 'ship_slip', '26000000-0000-0000-0000-0000000000a1/ship_slip/x.jpg', 'x.jpg', 1, 'image/jpeg');
    assert false, 'not owner'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26c1', true);
do $$
declare c jsonb;
begin
  c := public.my_claims() -> 0;
  assert c ->> 'ship_status' = 'unpaid' and (c ->> 'ship_fee')::numeric = 120, 'customer sees fee';
  assert public.claim_file_readable('26000000-0000-0000-0000-0000000000a1/ship_receipt/r.pdf'), 'customer reads receipt';
  perform public.add_claim_file('26000000-0000-0000-0000-0000000000a1', 'ship_slip', '26000000-0000-0000-0000-0000000000a1/ship_slip/s1.jpg', 's1.jpg', 1, 'image/jpeg');
  assert public.my_claims() -> 0 ->> 'ship_status' = 'slip', 'slip waiting';
  begin perform public.add_claim_file('26000000-0000-0000-0000-0000000000a1', 'ship_slip', '26000000-0000-0000-0000-0000000000a1/ship_slip/s2.jpg', 's2.jpg', 1, 'image/jpeg');
    assert false, 'no second slip while waiting'; exception when insufficient_privilege then null; end;
end $$;

-- staff reject (needs reason), customer re-attaches, staff confirm; changing the fee later keeps it paid
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26b1', true);
do $$ begin
  begin perform public.decide_ship_slip('26000000-0000-0000-0000-0000000000a1', false); assert false, 'reason needed';
  exception when raise_exception then null; end;
  perform public.decide_ship_slip('26000000-0000-0000-0000-0000000000a1', false, 'ยอดไม่ตรง');
  assert (select ship_status || '/' || ship_note from public.claims where claim_no = '26-9101') = 'rejected/ยอดไม่ตรง', 'rejected';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26c1', true);
do $$ begin
  perform public.add_claim_file('26000000-0000-0000-0000-0000000000a1', 'ship_slip', '26000000-0000-0000-0000-0000000000a1/ship_slip/s3.jpg', 's3.jpg', 1, 'image/jpeg');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f26b1', true);
do $$ begin
  perform public.decide_ship_slip('26000000-0000-0000-0000-0000000000a1', true);
  assert (select ship_status from public.claims where claim_no = '26-9101') = 'paid', 'paid';
  assert (select ship_paid_at is not null and ship_note is null from public.claims where claim_no = '26-9101'), 'paid stamped';
  perform public.set_claim_shipping('26000000-0000-0000-0000-0000000000a1', 999, 'Flash', 'F1');
  assert (select ship_status || '/' || ship_fee || '/' || ship_carrier from public.claims where claim_no = '26-9101') = 'paid/120.00/Flash', 'paid fee kept';
end $$;

rollback;
\echo ALL CLAIM SHIPPING TESTS PASSED
