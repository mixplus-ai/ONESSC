-- Migration 31: performance warranty next to the product warranty ("15/30 ปี").
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f31a', 'pwadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f31c', 'pwcust@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f31d', 'pwgrid@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'pwadmin@ssc.test';
update public.profiles set role = 'staff' where email = 'pwgrid@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000f31d', 'products.bulk');
insert into public.products (id, name, slug, warranty_months, perf_warranty_months) values ('31000000-0000-0000-0000-000000000001', 'Panel P', 'panel-p', 180, 360);
insert into public.product_variants (id, product_id, sku, name) values ('31000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-000000000001', 'P-1', 'P-1');
insert into public.product_variants (id, product_id, sku, name, perf_warranty_months) values ('31000000-0000-0000-0000-0000000000a2', '31000000-0000-0000-0000-000000000001', 'P-2', 'P-2', 300);
do $$ begin
  assert public.sku_perf_warranty_months('p-1') = 360 and public.sku_perf_warranty_months('P-2') = 300, 'perf months';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f31a', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; r record;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'ref_no', 'PO-P'), '[{"sku":"P-1","sn":"PERF-0001"}]');
  perform public.post_stock_doc(d.id);
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'B', 'doc_date', '2026-02-01'), '[{"sku":"P-1","sn":"PERF-0001"}]');
  perform public.post_stock_doc(d.id);
  select * into r from public.sns_info(array['PERF-0001']);
  assert r.warranty_end = '2041-02-01' and r.perf_months = 360 and r.perf_end = '2056-02-01', 'staff view ' || coalesce(r.perf_end::text, '-');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f31c', true);
do $$
declare r record;
begin
  select * into r from public.warranty_check('perf-0001');
  assert r.warranty_months = 180 and r.perf_months = 360 and r.perf_end = '2056-02-01', 'customer view';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f31d', true);
do $$ begin
  perform public.bulk_update_products('[{"id":"31000000-0000-0000-0000-000000000001","warranty_months":"120","perf_warranty_months":""}]',
                                      '[{"id":"31000000-0000-0000-0000-0000000000a2","perf_warranty_months":"240","warranty_months":"60"}]');
end $$;
reset role;
do $$ begin
  assert (select warranty_months = 120 and perf_warranty_months is null from public.products where id = '31000000-0000-0000-0000-000000000001'), 'grid product warranty';
  assert (select warranty_months = 60 and perf_warranty_months = 240 from public.product_variants where sku = 'P-2'), 'grid variant warranty';
end $$;
\echo ALL PERF WARRANTY TESTS PASSED
rollback;
