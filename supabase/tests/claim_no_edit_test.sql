-- Migration 50: assignee / claims.handle staff change the claim number; others cannot.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f5b1', 'cnstaff1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f5b2', 'cnstaff2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f5b3', 'cnstaff3@ssc.test', '{}');
update public.profiles set role = 'staff' where email like 'cnstaff%@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f5b1', 'claims.view'), ('00000000-0000-0000-0000-00000000f5b2', 'claims.handle'),
  ('00000000-0000-0000-0000-00000000f5b3', 'claims.view');
insert into public.claims (id, claim_no, source, contact_name, contact_phone, product_type, status, assigned_to) values
  ('50000000-0000-0000-0000-0000000000a1', '26-9501', 'import', '-', '-', 'inverter', 'in_progress', '00000000-0000-0000-0000-00000000f5b1'),
  ('50000000-0000-0000-0000-0000000000a2', '26-9502', 'import', '-', '-', 'inverter', 'in_progress', null);
set local role authenticated;

-- view-only staff, not assigned: refused
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f5b3', true);
do $$ begin
  begin perform public.set_claim_no('50000000-0000-0000-0000-0000000000a1', '26-9599'); assert false, 'no right';
  exception when insufficient_privilege then null; end;
end $$;

-- assignee (view only perm) can change own claim
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f5b1', true);
do $$ begin
  begin perform public.set_claim_no('50000000-0000-0000-0000-0000000000a1', '26-9502'); assert false, 'duplicate'; exception when raise_exception then null; end;
  begin perform public.set_claim_no('50000000-0000-0000-0000-0000000000a1', '26 9503'); assert false, 'bad format'; exception when raise_exception then null; end;
  begin perform public.set_claim_no('50000000-0000-0000-0000-0000000000a1', ''); assert false, 'empty'; exception when raise_exception then null; end;
  assert public.set_claim_no('50000000-0000-0000-0000-0000000000a1', ' 26-9511 ', 'พิมพ์ผิด') = '26-9511', 'returns new no';
  begin perform public.set_claim_no('50000000-0000-0000-0000-0000000000a2', '26-9512'); assert false, 'not assigned to this one';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select claim_no from public.claims where id = '50000000-0000-0000-0000-0000000000a1') = '26-9511', 'changed';
  assert (select internal_note from public.claims where id = '50000000-0000-0000-0000-0000000000a1') like 'เปลี่ยนเลขเคลม 26-9501 → 26-9511 % · พิมพ์ผิด', 'noted';
end $$;
set local role authenticated;

-- claims.handle staff can change any claim
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f5b2', true);
do $$ begin
  perform public.set_claim_no('50000000-0000-0000-0000-0000000000a2', '26-9522');
end $$;
reset role;
do $$ begin assert (select claim_no from public.claims where id = '50000000-0000-0000-0000-0000000000a2') = '26-9522', 'handle perm'; end $$;
rollback;
\echo 'ALL CLAIM NO EDIT TESTS PASSED'
