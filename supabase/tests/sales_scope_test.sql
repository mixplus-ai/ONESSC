-- Migration 44: a salesperson linked to a sales team member sees / edits only their own customers.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ab01', 'scsale1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000ab02', 'scsale2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000ab03', 'schead@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000ab04', 'scwh@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000ab05', 'sccusta@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000ab06', 'sccustb@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000ab07', 'scnew@ssc.test', '{}');
update public.profiles set role = 'staff' where email in ('scsale1@ssc.test', 'scsale2@ssc.test', 'schead@ssc.test', 'scwh@ssc.test');
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000ab01', 'companies'),
  ('00000000-0000-0000-0000-00000000ab02', 'companies'),
  ('00000000-0000-0000-0000-00000000ab03', 'companies'),
  ('00000000-0000-0000-0000-00000000ab03', 'customers.all'),
  ('00000000-0000-0000-0000-00000000ab04', 'companies');
insert into public.team_members (id, full_name, department, email, user_id) values
  ('72000000-0000-0000-0000-0000000000a1', 'Scope One', 'sales', 'scsale1@ssc.test', '00000000-0000-0000-0000-00000000ab01'),
  ('72000000-0000-0000-0000-0000000000a2', 'Scope Two', 'sales', 'scsale2@ssc.test', '00000000-0000-0000-0000-00000000ab02'),
  ('72000000-0000-0000-0000-0000000000a3', 'Scope Head', 'sales', 'schead@ssc.test', '00000000-0000-0000-0000-00000000ab03');
insert into public.companies (id, tax_id, name, sales_member_id) values
  ('42000000-0000-0000-0000-0000000000a1', '6666666666660', 'Scope A Co', '72000000-0000-0000-0000-0000000000a1'),
  ('42000000-0000-0000-0000-0000000000b1', '7777777777770', 'Scope B Co', '72000000-0000-0000-0000-0000000000a2');
update public.profiles set company_id = '42000000-0000-0000-0000-0000000000a1', company_status = 'approved' where email = 'sccusta@ssc.test';
update public.profiles set company_id = '42000000-0000-0000-0000-0000000000b1', company_status = 'approved' where email = 'sccustb@ssc.test';
update public.profiles set tax_id = '7777777777770', company_status = 'pending' where email = 'scnew@ssc.test';

set local role authenticated;

-- sales one: only company A and its customer
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ab01', true);
do $$ begin
  assert public.my_sales_scope() = '72000000-0000-0000-0000-0000000000a1', 'scoped';
  assert (select count(*) from public.companies where id in ('42000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-0000000000b1')) = 1, 'sees own company only';
  assert (select count(*) from public.profiles where email in ('sccusta@ssc.test', 'sccustb@ssc.test', 'scnew@ssc.test')) = 1, 'sees own customer only';
  assert (select count(*) from public.profiles where email = 'scsale2@ssc.test') = 1, 'still sees staff';
  assert public.can_see_company('42000000-0000-0000-0000-0000000000a1'), 'can A';
  assert not public.can_see_company('42000000-0000-0000-0000-0000000000b1'), 'cannot B';
  begin
    perform public.set_company_rank('42000000-0000-0000-0000-0000000000b1', 'gold');
    assert false, 'rank on other company';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_company_link('00000000-0000-0000-0000-00000000ab07', true);
    assert false, 'approve into other company';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.companies set phone = '0999' where id = '42000000-0000-0000-0000-0000000000b1';
update public.companies set phone = '0111' where id = '42000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.companies set sales_member_id = '72000000-0000-0000-0000-0000000000a2' where id = '42000000-0000-0000-0000-0000000000a1';
    assert false, 'cannot hand company to another sales';
  exception when insufficient_privilege then null;
  end;
end $$;

-- sales two can approve a new user of their own company; does not see A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ab02', true);
select company_status from public.review_company_link('00000000-0000-0000-0000-00000000ab07', true);
do $$ begin
  assert (select phone from public.companies where id = '42000000-0000-0000-0000-0000000000b1') is null, 'sales one could not edit B';
  assert (select count(*) from public.companies where id = '42000000-0000-0000-0000-0000000000a1') = 0, 'two does not see A';
  assert (select count(*) from public.profiles where company_id = '42000000-0000-0000-0000-0000000000b1') = 2, 'two sees both B customers';
end $$;

-- head (customers.all) and unlinked staff see everything
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ab03', true);
do $$ begin
  assert public.my_sales_scope() is null, 'head not scoped';
  assert (select phone from public.companies where id = '42000000-0000-0000-0000-0000000000a1') = '0111', 'sales one edited A';
  assert (select count(*) from public.companies where id in ('42000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-0000000000b1')) = 2, 'head sees all';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ab04', true);
do $$ begin
  assert public.my_sales_scope() is null, 'unlinked not scoped';
  assert (select count(*) from public.profiles where email in ('sccusta@ssc.test', 'sccustb@ssc.test')) = 2, 'unlinked sees all';
end $$;

-- customer still sees own company only
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ab05', true);
do $$ begin
  assert (select count(*) from public.companies where id in ('42000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-0000000000b1')) = 1, 'customer own company';
  assert public.my_sales_scope() is null, 'customer not scoped';
end $$;

rollback;
\echo 'ALL SALES SCOPE TESTS PASSED'
