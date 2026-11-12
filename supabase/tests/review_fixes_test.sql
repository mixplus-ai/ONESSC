-- Migration 25: anon cannot call claim RPCs, staff rights per permission, link imported claims, account close requests.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f25a1', 'rfadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f25b1', 'rfstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f25b2', 'rfclaims@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f25c1', 'rfcu@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'rfadmin@ssc.test';
update public.profiles set role = 'staff' where email in ('rfstaff@ssc.test', 'rfclaims@ssc.test');
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000f25b2', 'claims');
insert into public.companies (id, tax_id, name) values ('25000000-0000-0000-0000-0000000000c1', '2500000000001', 'บริษัท ซันไลท์ เอนเนอร์ยี่ จำกัด');
update public.profiles set company_name = 'Sunlight', company_id = '25000000-0000-0000-0000-0000000000c1', company_status = 'approved' where email = 'rfcu@ssc.test';
insert into public.claims (id, claim_no, source, company_name, contact_name, contact_phone, product_type, status) values
  ('25000000-0000-0000-0000-0000000000a1', '24-9001', 'import', 'ซันไลท์ เอนเนอร์ยี่ จำกัด', '-', '-', 'inverter', 'closed'),
  ('25000000-0000-0000-0000-0000000000a2', '24-9002', 'import', 'บจก.ซันไลท์เอนเนอร์ยี่', '-', '-', 'inverter', 'in_progress'),
  ('25000000-0000-0000-0000-0000000000a3', '24-9003', 'import', 'Other Solar Co., Ltd.', '-', '-', 'inverter', 'closed');

do $$ begin
  assert public.norm_company('บริษัท ซันไลท์ เอนเนอร์ยี่ จำกัด') = public.norm_company('บจก.ซันไลท์เอนเนอร์ยี่'), 'thai company words ignored';
  assert public.norm_company('Other Solar Co., Ltd.') = 'othersolar', 'english company words ignored';
  assert not has_function_privilege('anon', 'public.my_claims()', 'execute'), 'anon cannot list claims';
  assert not has_function_privilege('anon', 'public.submit_claim(jsonb)', 'execute'), 'anon cannot submit';
  assert has_function_privilege('authenticated', 'public.my_claims()', 'execute'), 'signed-in can';
  assert has_function_privilege('anon', 'public.is_admin()', 'execute'), 'policy helpers stay callable';
end $$;

set local role authenticated;
-- staff without claims perms: no claims, no requests
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f25b1', true);
do $$ begin
  assert (select count(*) from public.claims) = 0, 'no perm, no claims';
  begin perform * from public.legacy_claim_search('00000000-0000-0000-0000-0000000f25c1'); assert false, 'needs claims perm';
  exception when insufficient_privilege then null; end;
  begin insert into public.companies (tax_id, name) values ('2500000000002', 'X'); assert false, 'needs companies perm';
  exception when insufficient_privilege then null; end;
end $$;

-- claims staff: suggestions by company name, link, unlink
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f25b2', true);
do $$
declare n int;
begin
  assert (select count(*) from public.claims) = 3, 'claims perm reads claims';
  assert (select count(*) from public.legacy_claim_search('00000000-0000-0000-0000-0000000f25c1')) = 2, 'matches both spellings via company name';
  assert (select count(*) from public.legacy_claim_search('00000000-0000-0000-0000-0000000f25c1', 'other')) = 1, 'manual search';
  begin perform public.link_legacy_claims('00000000-0000-0000-0000-0000000f25b1', array['25000000-0000-0000-0000-0000000000a1'::uuid]); assert false, 'only customer accounts';
  exception when raise_exception then null; end;
  n := public.link_legacy_claims('00000000-0000-0000-0000-0000000f25c1', array['25000000-0000-0000-0000-0000000000a1'::uuid, '25000000-0000-0000-0000-0000000000a2'::uuid]);
  assert n = 2, 'linked 2';
  assert (select company_id from public.claims where id = '25000000-0000-0000-0000-0000000000a1') = '25000000-0000-0000-0000-0000000000c1', 'company set';
  n := public.link_legacy_claims('00000000-0000-0000-0000-0000000f25c1', array['25000000-0000-0000-0000-0000000000a2'::uuid], false);
  assert n = 1, 'unlinked 1';
end $$;

-- customer now sees the linked old claim, asks to close the account
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f25c1', true);
do $$ begin
  assert jsonb_array_length(public.my_claims()) = 1, 'customer sees linked old claim';
  insert into public.account_requests (user_id, reason) values ('00000000-0000-0000-0000-0000000f25c1', 'เลิกใช้');
  begin insert into public.account_requests (user_id) values ('00000000-0000-0000-0000-0000000f25c1'); assert false, 'one pending';
  exception when unique_violation then null; end;
  begin update public.account_requests set status = 'done'; exception when others then null; end;
  assert (select status from public.account_requests) = 'pending', 'customer cannot mark done';
  begin perform public.close_account_request((select id from public.account_requests), true); assert false, 'admin only';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f25a1', true);
do $$ begin
  perform public.close_account_request((select id from public.account_requests), true, 'ปิดแล้ว');
  assert (select status from public.account_requests) = 'done', 'done';
  assert not (select is_active from public.profiles where email = 'rfcu@ssc.test'), 'login disabled';
end $$;

rollback;
\echo ALL REVIEW FIX TESTS PASSED
