-- Migration 47: quote link on stock docs; WD can issue reserved SNs.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f6a1', 'dsboss@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'dsboss@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f6a1', 'stock.docs'), ('00000000-0000-0000-0000-00000000f6a1', 'stock.post');
insert into public.stock_levels (sku, stock_group, description, on_hand, available) values ('DS-1', 'X', 'Item', 0, 0) on conflict do nothing;
insert into public.quote_requests (id, code, user_id) values ('00000000-0000-0000-0000-0000000fa001', 'QT-TEST-1', '00000000-0000-0000-0000-00000000f6a1');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f6a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; rv public.stock_docs;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GN', 'warehouse_id', wh, 'ref_no', 'DN-1'), '[{"sku":"DS-1","sn":"DS-0001"}]');
  perform public.post_stock_doc(d.id);
  rv := public.save_stock_doc(null, jsonb_build_object('doc_type', 'RV', 'warehouse_id', wh, 'partner_name', 'ลูกค้า'), '[{"sku":"DS-1","sn":"DS-0001"}]');
  perform public.post_stock_doc(rv.id);

  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'WD', 'warehouse_id', wh, 'partner_name', 'ลูกค้า', 'return_of', rv.id), '[{"sku":"DS-1","sn":"DS-0001"}]');
  perform public.save_stock_doc_quote(d.id, '00000000-0000-0000-0000-0000000fa001');
  assert (select quote_id from public.stock_docs where id = d.id) = '00000000-0000-0000-0000-0000000fa001', 'quote linked';
  perform public.post_stock_doc(d.id);
  assert (select status from public.serials where sn_key = public.sn_key('DS-0001')) = 'withdrawn', 'reserved SN issued on WD';
end $$;
\echo ALL DOC SOURCES TESTS PASSED
rollback;
