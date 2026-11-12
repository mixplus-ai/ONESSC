-- Migration 29: warranty months on products / codes, starts on the PI (SO) date.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f9a1', 'wadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f9c1', 'wcust@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'wadmin@ssc.test';
insert into public.products (id, name, slug, warranty_months) values ('29000000-0000-0000-0000-000000000001', 'Inverter W', 'inv-w', 144);
insert into public.product_variants (product_id, sku, name) values ('29000000-0000-0000-0000-000000000001', 'W-INV', 'W-INV');
insert into public.product_variants (product_id, sku, name, warranty_months) values ('29000000-0000-0000-0000-000000000001', 'W-OPT', '10 kW', 300);

do $$ begin
  assert public.sku_warranty_months('w-inv') = 144, 'product months';
  assert public.sku_warranty_months('W-OPT') = 300, 'variant override';
  assert public.sku_warranty_months('NOPE') is null, 'unknown code';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f9a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; r record;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'ref_no', 'PO-W'), '[{"sku":"W-INV","sn":"WAR-0001"},{"sku":"W-OPT","sn":"WAR-0002"},{"sku":"W-INV","sn":"WAR-0003"}]');
  perform public.post_stock_doc(d.id);
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'Buyer', 'ref_no', 'PI-W1', 'doc_date', '2026-01-15'), '[{"sku":"W-INV","sn":"WAR-0001"},{"sku":"W-OPT","sn":"WAR-0002"}]');
  perform public.post_stock_doc(d.id);
  select * into r from public.sns_info(array['war 0001']);
  assert r.sold_at = '2026-01-15' and r.warranty_months = 144 and r.warranty_end = '2038-01-15', 'inv warranty ' || coalesce(r.warranty_end::text, '-');
  select * into r from public.sns_info(array['WAR-0002']);
  assert r.warranty_end = '2051-01-15', 'opt override';
  select * into r from public.sns_info(array['WAR-0003']);
  assert r.sold_at is null and r.warranty_end is null and r.warranty_months = 144, 'not sold yet: no end date';
end $$;

-- customer: dates and model only, no buyer
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f9c1', true);
do $$
declare r record;
begin
  select * into r from public.warranty_check('war-0001');
  assert r.sold_at = '2026-01-15' and r.warranty_end = '2038-01-15' and r.product_name = 'Inverter W', 'customer check';
  assert (select count(*) from public.warranty_check('WAR-0003')) = 0, 'unsold SN not shown';
  assert (select count(*) from public.warranty_check('WAR')) = 0, 'too short';
  begin perform public.sns_info(array['WAR-0001']); assert false, 'customer cannot use staff view'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo ALL SN WARRANTY TESTS PASSED
rollback;
