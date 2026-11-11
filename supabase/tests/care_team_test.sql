-- Care team: staff assign sales/support to a company; only that company's approved customers see them.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000ca0a1', 'ctstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000ca0b1', 'ctuser@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000ca0c1', 'ctother@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'ctstaff@ssc.test';
insert into public.companies (id, tax_id, name) values
  ('40000000-0000-0000-0000-0000000000c1', '2222222222220', 'CT Co'),
  ('40000000-0000-0000-0000-0000000000c2', '3333333333330', 'Other Co');
update public.profiles set company_id = '40000000-0000-0000-0000-0000000000c1', company_status = 'approved' where email = 'ctuser@ssc.test';
update public.profiles set company_id = '40000000-0000-0000-0000-0000000000c2', company_status = 'pending' where email = 'ctother@ssc.test';
insert into public.team_members (id, full_name, department, phone, is_published) values
  ('70000000-0000-0000-0000-0000000000c1', 'Sale One', 'sales', '0811111111', true),
  ('70000000-0000-0000-0000-0000000000c2', 'Support Hidden', 'service', '0822222222', false);

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ca0a1', true);
update public.companies set sales_member_id = '70000000-0000-0000-0000-0000000000c1', support_member_id = '70000000-0000-0000-0000-0000000000c2'
 where id in ('40000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c2');

-- approved customer sees both, including the unpublished support person
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ca0b1', true);
do $$ begin
  assert (select count(*) from public.my_care_team()) = 2, 'customer sees 2';
  assert (select full_name from public.my_care_team() where role = 'support') = 'Support Hidden', 'unpublished support visible via rpc';
  assert (select role from public.my_care_team() limit 1) = 'sales', 'sales first';
end $$;

-- pending customer sees nothing; customer cannot change the assignment
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ca0c1', true);
do $$ begin
  assert (select count(*) from public.my_care_team()) = 0, 'pending sees none';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ca0b1', true);
update public.companies set sales_member_id = null where id = '40000000-0000-0000-0000-0000000000c1';
reset role;
do $$ begin
  assert (select sales_member_id from public.companies where id = '40000000-0000-0000-0000-0000000000c1') is not null, 'customer cannot unassign';
end $$;

-- deleting the team member clears the link
delete from public.team_members where id = '70000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select sales_member_id from public.companies where id = '40000000-0000-0000-0000-0000000000c1') is null, 'set null on delete';
end $$;

rollback;
\echo ALL CARE TEAM TESTS PASSED
