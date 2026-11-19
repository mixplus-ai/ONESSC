-- Migration 33: vehicle / driver on stock documents, photo kinds, BR = claim issue without a return date.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f3a1', 'dvboss@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'dvboss@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f3a1', 'stock.docs'), ('00000000-0000-0000-0000-00000000f3a1', 'stock.post');
insert into public.stock_levels (sku, stock_group, description, on_hand, available) values ('DV-1', 'X', 'Item', 9, 9) on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f3a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; f uuid;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GN', 'warehouse_id', wh, 'ref_no', 'DN-9',
         'vehicle_plate', ' 1กข 1234 ', 'driver_name', 'สมชาย', 'driver_phone', '0812345678'),
         '[{"sku":"DV-1","sn":"DV-0001"},{"sku":"DV-1","sn":"DV-0002"}]');
  assert d.vehicle_plate = '1กข 1234' and d.driver_name = 'สมชาย' and d.driver_phone = '0812345678', 'vehicle saved';
  perform public.post_stock_doc(d.id);

  insert into public.stock_doc_files (doc_id, path, name, kind) values (d.id, d.id || '/x.jpg', 'x.jpg', 'plate') returning id into f;
  begin
    insert into public.stock_doc_files (doc_id, path, name, kind) values (d.id, d.id || '/y.jpg', 'y.jpg', 'bogus');
    assert false, 'bad kind';
  exception when check_violation then null; end;
  update public.stock_doc_files set kind = 'goods' where id = f;
  assert (select kind from public.stock_doc_files where id = f) = 'plate', 'posted doc photo kind stays';

  -- BR (ใบเคลมสินค้า) posts without a return date
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'BR', 'warehouse_id', wh, 'partner_name', 'Claim Co', 'ref_no', 'เคลม 69-0001'),
         '[{"sku":"DV-1","sn":"DV-0001"}]');
  d := public.post_stock_doc(d.id);
  assert d.status = 'posted', 'BR posted without due date';
  assert (select status from public.serials where sn_key = public.sn_key('DV-0001')) = 'borrowed', 'claim issue is out';
end $$;
\echo ALL STOCK DELIVERY TESTS PASSED
rollback;
