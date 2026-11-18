-- Migration 46: BR / WD may name a destination warehouse; every destination is checked.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f5a1', 'ddboss@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'ddboss@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f5a1', 'stock.docs'), ('00000000-0000-0000-0000-00000000f5a1', 'stock.post');
insert into public.stock_levels (sku, stock_group, description, on_hand, available) values ('DD-1', 'X', 'Item', 0, 0) on conflict do nothing;
insert into public.warehouses (code, name, role) values ('LEND', 'คลังยืม', 'other');
insert into public.warehouses (code, name, role, is_active) values ('OLD', 'คลังเก่า', 'other', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f5a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4');
        lend uuid := (select id from public.warehouses where code = 'LEND');
        old uuid := (select id from public.warehouses where code = 'OLD');
        d public.stock_docs; wd public.stock_docs;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GN', 'warehouse_id', wh, 'ref_no', 'DN-1'),
         '[{"sku":"DD-1","sn":"DD-0001"},{"sku":"DD-1","sn":"DD-0002"}]');
  perform public.post_stock_doc(d.id);

  -- WD into คลังยืม: status withdrawn, warehouse = คลังยืม
  wd := public.save_stock_doc(null, jsonb_build_object('doc_type', 'WD', 'warehouse_id', wh, 'to_warehouse_id', lend, 'partner_name', 'ช่าง ก'),
         '[{"sku":"DD-1","sn":"DD-0001"}]');
  wd := public.post_stock_doc(wd.id);
  assert (select status || '/' || warehouse_id from public.serials where sn_key = public.sn_key('DD-0001')) = 'withdrawn/' || lend, 'withdrawn into lending warehouse';
  -- not sellable from there
  assert (select available from public.stock_levels where sku = 'DD-1') = 1 or (select stock_source from public.stock_config where id = 1) <> 'docs', 'not available';

  -- returned into the main warehouse
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'RT', 'warehouse_id', wh, 'partner_name', 'ช่าง ก', 'return_of', wd.id),
         '[{"sku":"DD-1","sn":"DD-0001"}]');
  perform public.post_stock_doc(d.id);
  assert (select status || '/' || warehouse_id from public.serials where sn_key = public.sn_key('DD-0001')) = 'in_stock/' || wh, 'back in main';

  -- WD without destination leaves with the holder
  wd := public.save_stock_doc(null, jsonb_build_object('doc_type', 'WD', 'warehouse_id', wh, 'partner_name', 'ช่าง ข'),
         '[{"sku":"DD-1","sn":"DD-0002"}]');
  wd := public.post_stock_doc(wd.id);
  assert (select warehouse_id from public.serials where sn_key = public.sn_key('DD-0002')) is null, 'outside';
  perform public.cancel_stock_doc(wd.id, 'test');
  assert (select status || '/' || warehouse_id from public.serials where sn_key = public.sn_key('DD-0002')) = 'in_stock/' || wh, 'cancel restores';

  -- closed destination is refused
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'BR', 'warehouse_id', wh, 'to_warehouse_id', old, 'partner_name', 'Claim'),
         '[{"sku":"DD-1","sn":"DD-0002"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'inactive destination';
  exception when raise_exception then null; end;
end $$;
\echo ALL DOC DESTINATION TESTS PASSED
rollback;
