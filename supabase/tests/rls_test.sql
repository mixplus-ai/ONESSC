-- RLS / role tests for the phase-1 migration. Run after supabase_stub.sql + migrations.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin@ssc.test', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@ssc.test', '{"full_name":"Staff"}'),
  ('00000000-0000-0000-0000-00000000000c', 'user1@ssc.test', '{"full_name":"U1","pdpa_consent":"true"}'),
  ('00000000-0000-0000-0000-00000000000d', 'user2@ssc.test', '{"full_name":"U2"}');
-- bootstrap first admin as service (no auth.uid())
update public.profiles set role = 'admin' where email = 'admin@ssc.test';

do $$ begin
  assert (select count(*) from public.profiles) = 4, 'profiles created by trigger';
  assert (select pdpa_consent_at is not null from public.profiles where email='user1@ssc.test'), 'consent stored';
  assert (select email from public.profiles where id='00000000-0000-0000-0000-00000000000a') = 'admin@ssc.test', 'email lowercased';
end $$;

-- ---- admin promotes staff with permissions
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select role from public.admin_set_user_access('00000000-0000-0000-0000-00000000000b', 'staff', 'sales', true, array['contact_messages']);
do $$ begin
  assert (select count(*) from public.staff_permissions) = 1, 'one perm granted';
end $$;

-- ---- user1 tries to escalate and requests company link
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
update public.profiles set role = 'admin', company_status = 'approved', tax_id = '0105555000001', company_name = 'บริษัท ทดสอบ จำกัด', phone = '0812345678'
 where id = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select role from public.profiles where id = auth.uid()) = 'user', 'cannot self-promote';
  assert (select company_status from public.profiles where id = auth.uid()) = 'pending', 'company link pending';
  assert (select phone from public.profiles where id = auth.uid()) = '0812345678', 'own contact editable';
  assert (select count(*) from public.profiles) = 1, 'user sees only own profile';
  assert (select count(*) from public.companies) = 0, 'user sees no companies yet';
  assert not public.is_staff_or_admin(), 'user is not staff';
end $$;
-- user cannot edit another profile (silently 0 rows)
update public.profiles set full_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000d';
-- user cannot call admin rpc
do $$ begin
  begin
    perform public.admin_set_user_access('00000000-0000-0000-0000-00000000000c', 'admin', null, true, null);
    assert false, 'user must not call admin rpc';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_company_link('00000000-0000-0000-0000-00000000000c', true);
    assert false, 'user must not approve';
  exception when insufficient_privilege then null;
  end;
end $$;
-- user cannot write site content
do $$ begin
  begin
    insert into public.team_members (full_name) values ('x');
    assert false, 'user must not insert team';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- staff approves the company link
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select company_status from public.review_company_link('00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert (select count(*) from public.profiles) = 4, 'staff sees all profiles';
  assert (select count(*) from public.companies where tax_id = '0105555000001') = 1, 'company created';
  assert public.has_perm('contact_messages'), 'staff has granted perm';
  assert not public.has_perm('site_content'), 'staff lacks ungranted perm';
end $$;
-- staff without site_content cannot add portfolio
do $$ begin
  begin
    insert into public.portfolio_projects (title) values ('x');
    assert false, 'staff without perm must not insert';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- user1 now sees their company; user2 does not
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert (select count(*) from public.companies) = 1, 'user sees own company after approval';
end $$;
-- changing tax id resets approval
update public.profiles set tax_id = '0105555000002' where id = auth.uid();
do $$ begin
  assert (select company_status from public.profiles where id = auth.uid()) = 'pending', 'reset to pending';
  assert (select company_id from public.profiles where id = auth.uid()) is null, 'company unlinked';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  assert (select count(*) from public.companies) = 0, 'user2 sees no company';
  assert (select full_name from public.profiles where id = auth.uid()) = 'U2', 'user2 not hacked';
end $$;

-- ---- anon: reads published content, can send contact form, cannot read messages
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
insert into public.contact_messages (name, message) values ('ลูกค้า', 'สนใจสินค้า');
do $$ begin
  assert (select count(*) from public.site_settings) = 3, 'anon reads settings';
  assert (select count(*) from public.contact_messages) = 0, 'anon cannot read messages';
end $$;

-- ---- admin sees audit log; admin cannot demote self
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  assert (select count(*) from public.audit_logs) > 0, 'audit rows written';
  assert (select count(*) from public.contact_messages) = 1, 'admin reads messages';
  begin
    perform public.admin_set_user_access('00000000-0000-0000-0000-00000000000a', 'user', null, true, null);
    assert false, 'admin must not demote self';
  exception when raise_exception then null;
  end;
end $$;
-- admin creates portfolio
insert into public.portfolio_projects (title, is_published) values ('บ้าน 5 kW', true);

-- staff can read contact messages (perm) and user cannot read audit
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert (select count(*) from public.audit_logs) = 0, 'user cannot read audit';
  assert (select count(*) from public.portfolio_projects) = 1, 'user reads published portfolio';
end $$;

rollback;
\echo 'ALL RLS TESTS PASSED'
