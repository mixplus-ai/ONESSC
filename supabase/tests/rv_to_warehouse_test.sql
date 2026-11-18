-- Migration 45: RV (ใบจอง) moves SNs into the reservation warehouse; SO then cuts them from there.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f4a1', 'rvboss@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'rvboss@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f4a1', 'stock.docs'), ('00000000-0000-0000-0000-00000000f4a1', 'stock.post');
insert into public.stock_levels (sku, stock_group, description, on_hand, available) values ('RV-1', 'X', 'Item', 0, 0) on conflict do nothing;
insert into public.warehouses (code, name, role) values ('RSV', 'คลังจอง', 'main');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f4a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4');
        rsv uuid := (select id from public.warehouses where code = 'RSV');
        d public.stock_docs; rv public.stock_docs;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GN', 'warehouse_id', wh, 'ref_no', 'DN-1'),
         '[{"sku":"RV-1","sn":"RV-0001"},{"sku":"RV-1","sn":"RV-0002"}]');
  perform public.post_stock_doc(d.id);

  -- reserve into คลังจอง
  rv := public.save_stock_doc(null, jsonb_build_object('doc_type', 'RV', 'warehouse_id', wh, 'to_warehouse_id', rsv, 'partner_name', 'ลูกค้า ก'),
         '[{"sku":"RV-1","sn":"RV-0001"}]');
  rv := public.post_stock_doc(rv.id);
  assert (select status from public.serials where sn_key = public.sn_key('RV-0001')) = 'reserved', 'reserved';
  assert (select warehouse_id from public.serials where sn_key = public.sn_key('RV-0001')) = rsv, 'moved to reservation warehouse';

  -- SO from the main warehouse can't take it any more
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'ลูกค้า ก'),
         '[{"sku":"RV-1","sn":"RV-0001"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'wrong warehouse';
  exception when raise_exception then null; end;

  -- SO from คลังจอง (delivery note made from the RV) sells it
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', rsv, 'partner_name', 'ลูกค้า ก', 'return_of', rv.id),
         '[{"sku":"RV-1","sn":"RV-0001"}]');
  d := public.post_stock_doc(d.id);
  assert (select status from public.serials where sn_key = public.sn_key('RV-0001')) = 'sold', 'sold from reservation';

  -- RV without a destination stays in its warehouse
  rv := public.save_stock_doc(null, jsonb_build_object('doc_type', 'RV', 'warehouse_id', wh, 'partner_name', 'ลูกค้า ข'),
         '[{"sku":"RV-1","sn":"RV-0002"}]');
  rv := public.post_stock_doc(rv.id);
  assert (select warehouse_id from public.serials where sn_key = public.sn_key('RV-0002')) = wh, 'stays';

  -- cancelling the RV puts it back
  perform public.cancel_stock_doc(rv.id, 'test');
  assert (select status from public.serials where sn_key = public.sn_key('RV-0002')) = 'in_stock', 'unreserved';
end $$;
\echo ALL RV TO WAREHOUSE TESTS PASSED
rollback;
