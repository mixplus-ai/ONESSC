-- Delivery schedule tests: staff/admin only, company link by tax ID, admin-only delete.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000de0a1', 'dadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000de0b1', 'dstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000de0c1', 'duser@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'dadmin@ssc.test';
update public.profiles set role = 'staff' where email = 'dstaff@ssc.test';
insert into public.companies (id, tax_id, name) values ('40000000-0000-0000-0000-0000000000d1', '1234567890123', 'PJ');

set local role authenticated;

-- staff creates a delivery with items; tax ID links the company
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de0b1', true);
insert into public.deliveries (id, doc_no, delivery_date, customer_name, customer_tax_id)
values ('50000000-0000-0000-0000-0000000000d1', 'PI-TEST-1', '2026-10-27', 'PJ', '1234567890123');
insert into public.delivery_items (delivery_id, model, unit_watt, qty, total_watt)
values ('50000000-0000-0000-0000-0000000000d1', 'LP182', 650, 36, 23400);
do $$ begin
  assert (select company_id from public.deliveries where doc_no = 'PI-TEST-1') = '40000000-0000-0000-0000-0000000000d1', 'linked by tax id';
  assert (select created_by from public.deliveries where doc_no = 'PI-TEST-1') = '00000000-0000-0000-0000-0000000de0b1', 'created_by default';
end $$;
update public.deliveries set status = 'delivered' where doc_no = 'PI-TEST-1';
-- staff cannot delete
delete from public.deliveries where doc_no = 'PI-TEST-1';
do $$ begin assert (select count(*) from public.deliveries) = 1, 'staff delete blocked'; end $$;
-- duplicate document number rejected
do $$ begin
  begin
    insert into public.deliveries (doc_no, delivery_date, customer_name) values ('PI-TEST-1', '2026-10-28', 'X');
    assert false, 'duplicate doc_no';
  exception when unique_violation then null;
  end;
end $$;

-- a normal user sees nothing and cannot insert
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de0c1', true);
do $$ begin
  assert (select count(*) from public.deliveries) = 0, 'user cannot read deliveries';
  assert (select count(*) from public.delivery_items) = 0, 'user cannot read items';
  begin
    insert into public.deliveries (delivery_date, customer_name) values ('2026-10-28', 'X');
    assert false, 'user insert should fail';
  exception when insufficient_privilege then null;
  end;
end $$;

-- admin deletes; items cascade
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000de0a1', true);
delete from public.deliveries where doc_no = 'PI-TEST-1';
do $$ begin
  assert (select count(*) from public.deliveries) = 0, 'admin delete';
  assert (select count(*) from public.delivery_items) = 0, 'items cascade';
end $$;

rollback;
\echo ALL DELIVERY TESTS PASSED
