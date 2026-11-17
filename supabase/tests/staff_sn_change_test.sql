-- Migration 43: staff ask to correct an SN (incl. imported claims with SNs only on the board), another handler confirms.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f4a1', 'ssadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f4b1', 'ssstaff1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f4b2', 'ssstaff2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f4b3', 'ssstaff3@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'ssadmin@ssc.test';
update public.profiles set role = 'staff' where email like 'ssstaff%@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f4b1', 'claims'), ('00000000-0000-0000-0000-00000000f4b2', 'claims');
-- imported claim: no customer, no reported SNs, SN only in board column Q
insert into public.claims (id, claim_no, source, contact_name, contact_phone, product_type, status) values
  ('43000000-0000-0000-0000-0000000000a1', '26-9431', 'import', '-', '-', 'inverter', 'in_progress');
insert into public.claim_units (id, claim_id, seq, pcode, ret_sn) overriding system value values
  (943101, '43000000-0000-0000-0000-0000000000a1', 1, 'SE5K', 'OLD-SN1'),
  (943102, '43000000-0000-0000-0000-0000000000a1', 2, 'SE5K', 'KEEP-SN2');
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;
set local role authenticated;

-- staff without claims perm cannot ask
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f4b3', true);
do $$ begin
  begin perform public.staff_request_sn_change('43000000-0000-0000-0000-0000000000a1', 'OLD-SN1', 'NEW-SN1', 'typo'); assert false, 'no perm';
  exception when insufficient_privilege then null; end;
end $$;

-- staff 1 asks
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f4b1', true);
do $$
declare c uuid := '43000000-0000-0000-0000-0000000000a1';
begin
  begin perform public.staff_request_sn_change(c, 'NOPE', 'X1', 'typo'); assert false, 'old SN must be on claim'; exception when raise_exception then null; end;
  begin perform public.staff_request_sn_change(c, 'OLD-SN1', 'keep-sn2', 'typo'); assert false, 'new SN already on claim'; exception when raise_exception then null; end;
  insert into t_ids values ('r1', (public.staff_request_sn_change(c, 'old-sn1', 'new-sn1', 'typo')).id);
  assert (select by_staff from public.claim_sn_changes where id = (select id from t_ids where k = 'r1')), 'marked by staff';
  begin perform public.staff_request_sn_change(c, 'OLD-SN1', 'NEW-SN9', 'typo'); assert false, 'one pending per SN'; exception when raise_exception then null; end;
  begin perform public.decide_sn_change((select id from t_ids where k = 'r1'), true); assert false, 'cannot confirm own request';
  exception when insufficient_privilege then null; end;
  insert into t_ids values ('r2', (public.staff_request_sn_change(c, 'KEEP-SN2', 'OTHER-SN2', 'other', 'สแกนผิดตัว')).id);
  perform public.staff_cancel_sn_change((select id from t_ids where k = 'r2'));
  assert not exists (select 1 from public.claim_sn_changes where id = (select id from t_ids where k = 'r2')), 'cancelled';
end $$;

-- staff 2 confirms
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f4b2', true);
do $$
declare c uuid := '43000000-0000-0000-0000-0000000000a1';
begin
  begin perform public.staff_cancel_sn_change((select id from t_ids where k = 'r1')); assert false, 'cannot cancel others'; exception when raise_exception then null; end;
  perform public.decide_sn_change((select id from t_ids where k = 'r1'), true);
  assert (select ret_sn from public.claim_units where id = 943101) = 'NEW-SN1', 'column Q updated';
  assert (select ret_sn from public.claim_units where id = 943102) = 'KEEP-SN2', 'other unit untouched';
  assert (select reported_sns from public.claims where id = c) = '{}', 'reported list stays empty, not null';
  assert (select status from public.claim_sn_changes where id = (select id from t_ids where k = 'r1')) = 'approved', 'approved';
end $$;

-- admin may confirm their own request; unit reported SN follows too
reset role;
update public.claim_units set reported_sn = 'REP-SN3' where id = 943102;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f4a1', true);
do $$
declare r uuid;
begin
  r := (public.staff_request_sn_change('43000000-0000-0000-0000-0000000000a1', 'REP-SN3', 'REP-SN4', 'wrong_unit')).id;
  begin perform public.decide_sn_change(r, false); assert false, 'reject needs reason'; exception when raise_exception then null; end;
  perform public.decide_sn_change(r, true);
  assert (select reported_sn from public.claim_units where id = 943102) = 'REP-SN4', 'unit reported SN updated';
end $$;
rollback;
\echo 'ALL STAFF SN CHANGE TESTS PASSED'
