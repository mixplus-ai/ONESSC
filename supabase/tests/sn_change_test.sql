-- Migration 20: customer requests an SN correction, staff approve/reject, approved SN syncs everywhere.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000e0a1', 'snadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000e0b1', 'snstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000e0c1', 'sncu1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000e0c2', 'sncu2@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'snadmin@ssc.test';
update public.profiles set role = 'staff' where email = 'snstaff@ssc.test';
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0c1', true);
do $$
declare v record;
begin
  select * into v from public.submit_claim(jsonb_build_object('product_type', 'optimizer', 'contact_name', 'A', 'contact_phone', '081',
      'details', jsonb_build_object('items', jsonb_build_array(
         jsonb_build_object('model', 'P500', 'qty', 2, 'bad_sn', 'SN-AAA1, SN-AAA2'),
         jsonb_build_object('model', 'P850', 'qty', 1, 'bad_sn', 'SNC3')))));
  insert into t_ids values ('c', v.id);
  -- bad requests
  begin perform public.request_sn_change(v.id, 'NOPE', 'X1', 'typo'); assert false, 'old SN must be on claim'; exception when raise_exception then null; end;
  begin perform public.request_sn_change(v.id, 'SN-AAA1', 'SNC3', 'typo'); assert false, 'new SN already on claim'; exception when raise_exception then null; end;
  begin perform public.request_sn_change(v.id, 'SN-AAA1', 'X1', 'other'); assert false, 'other needs a note'; exception when raise_exception then null; end;
  begin perform public.request_sn_change(v.id, 'SN-AAA1', 'X"1', 'typo'); assert false, 'bad chars'; exception when raise_exception then null; end;
  insert into t_ids values ('r1', (public.request_sn_change(v.id, 'sn-aaa1', 'SN-ZZZ9', 'typo')).id);
  begin perform public.request_sn_change(v.id, 'SN-AAA1', 'SN-ZZZ8', 'typo'); assert false, 'one pending per SN'; exception when unique_violation or raise_exception then null; end;
  insert into t_ids values ('r2', (public.request_sn_change(v.id, 'SNC3', 'SNC4', 'wrong_unit')).id);
  assert (select count(*) from public.my_sn_changes()) = 2, 'customer sees own requests';
  assert (select count(*) from public.claim_sn_changes) = 0, 'no direct read for customers';
  begin perform public.decide_sn_change((select id from t_ids where k = 'r1'), true); assert false, 'customer cannot approve'; exception when insufficient_privilege then null; end;
end $$;

-- another customer cannot request on it or see it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0c2', true);
do $$
begin
  begin perform public.request_sn_change((select id from t_ids where k = 'c'), 'SN-AAA2', 'Q1', 'typo'); assert false, 'not own claim'; exception when raise_exception then null; end;
  assert (select count(*) from public.my_sn_changes()) = 0, 'others see nothing';
end $$;

-- staff not assigned, without claims perm: can see, cannot decide
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0b1', true);
do $$
begin
  assert (select count(*) from public.claim_sn_changes) = 2, 'staff read';
  begin perform public.decide_sn_change((select id from t_ids where k = 'r1'), true); assert false, 'unassigned staff cannot decide'; exception when insufficient_privilege then null; end;
end $$;

-- admin: put SN-AAA1 in board column Q, approve r1, reject r2
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a1', true);
do $$
declare c uuid := (select id from t_ids where k = 'c'); x record;
begin
  update public.claim_units set ret_sn = 'SN-AAA1' where claim_id = c and seq = 1;
  begin perform public.decide_sn_change((select id from t_ids where k = 'r2'), false); assert false, 'reject needs a reason'; exception when raise_exception then null; end;
  perform public.decide_sn_change((select id from t_ids where k = 'r1'), true);
  perform public.decide_sn_change((select id from t_ids where k = 'r2'), false, 'SN เดิมถูกแล้ว');
  select * into x from public.claims where id = c;
  assert x.reported_sns = array['SN-ZZZ9', 'SN-AAA2', 'SNC3'] or 'SN-ZZZ9' = any (x.reported_sns) and not 'SN-AAA1' = any (x.reported_sns), 'reported_sns updated';
  assert array_length(x.reported_sns, 1) = 3, 'same count';
  assert x.details::text like '%SN-ZZZ9, SN-AAA2%', 'details bad_sn updated: ' || x.details::text;
  assert x.details::text not like '%SN-AAA1%', 'old SN gone from details';
  assert 'SNC3' = any (x.reported_sns), 'rejected one unchanged';
  assert (select ret_sn from public.claim_units where claim_id = c and seq = 1) = 'SN-ZZZ9', 'board column Q synced';
  assert (select status from public.claim_sn_changes where id = (select id from t_ids where k = 'r1')) = 'approved', 'approved';
  begin perform public.decide_sn_change((select id from t_ids where k = 'r1'), true); assert false, 'decide once'; exception when raise_exception then null; end;
end $$;

-- customer: sees results; step 3 now checks the new SN
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0c1', true);
do $$
begin
  assert (select staff_note from public.my_sn_changes() where status = 'rejected') = 'SN เดิมถูกแล้ว', 'customer sees reason';
  begin perform public.cancel_sn_change((select id from t_ids where k = 'r1')); assert false, 'cannot cancel decided'; exception when raise_exception then null; end;
  insert into t_ids values ('r3', (public.request_sn_change((select id from t_ids where k = 'c'), 'SN-AAA2', 'SN-AAA7', 'wrong_product')).id);
  perform public.cancel_sn_change((select id from t_ids where k = 'r3'));
  assert (select count(*) from public.my_sn_changes()) = 2, 'cancelled request removed';
end $$;
rollback;
\echo 'ALL SN CHANGE TESTS PASSED'
