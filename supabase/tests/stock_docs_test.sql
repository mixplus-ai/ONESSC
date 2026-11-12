-- Migration 22: stock documents with one row per SN, post/cancel, SN history, stock from documents.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f0a1', 'sdadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f0b1', 'sdclerk@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f0b2', 'sdboss@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f0c1', 'sdcust@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'sdadmin@ssc.test';
update public.profiles set role = 'staff' where email in ('sdclerk@ssc.test', 'sdboss@ssc.test');
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f0b1', 'stock.docs'),
  ('00000000-0000-0000-0000-00000000f0b2', 'stock.post');
insert into public.stock_levels (sku, stock_group, description, on_hand, available) values ('INV-10K', 'SLE-IVT', 'Inverter 10K', 99, 99);
insert into public.warehouses (code, name) values ('WH2', 'คลัง 2');
insert into public.deliveries (delivery_date, customer_name) values ('2026-11-12', 'D Co');
create temp table t_ids (k text primary key, id uuid);
insert into t_ids select 'dl', id from public.deliveries where customer_name = 'D Co';
grant all on t_ids to authenticated;

set local role authenticated;

-- customer: nothing
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f0c1', true);
do $$
begin
  begin perform public.save_stock_doc(null, '{"doc_type":"GR"}', '[]'); assert false, 'customer cannot create'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.serials) = 0, 'customer reads nothing';
  begin perform public.sn_history('X'); assert false, 'customer no history'; exception when insufficient_privilege then null; end;
end $$;

-- clerk: makes a GR draft, cannot post, cannot make OB
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f0b1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs;
begin
  begin perform public.save_stock_doc(null, jsonb_build_object('doc_type', 'OB', 'warehouse_id', wh), '[]'); assert false, 'OB admin only'; exception when insufficient_privilege then null; end;
  begin
    perform public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh),
      '[{"sku":"INV-10K","sn":"A-1"},{"sku":"INV-10K","sn":"a1"}]');
    assert false, 'duplicate SN in doc';
  exception when raise_exception then null; end;
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'partner_name', 'SolarEdge'),
         '[{"sku":"inv-10k","sn":"sn-0001","description":"Inverter 10K"},{"sku":"INV-10K","sn":"SN-0002"},{"sku":"INV-10K","sn":"SN-0003"}]');
  assert d.doc_no like 'GR-__-0001', 'doc no ' || d.doc_no;
  assert (select count(*) from public.stock_doc_items where doc_id = d.id) = 3, '3 items';
  assert (select sku from public.stock_doc_items where doc_id = d.id and sort = 0) = 'INV-10K', 'sku upper';
  insert into t_ids values ('gr', d.id);
  begin perform public.post_stock_doc(d.id); assert false, 'clerk cannot post'; exception when insufficient_privilege then null; end;
end $$;

-- approver posts
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f0b2', true);
do $$
declare gr uuid := (select id from t_ids where k = 'gr'); wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; h jsonb;
begin
  begin perform public.post_stock_doc(gr); assert false, 'GR needs PO'; exception when raise_exception then null; end;
  perform public.save_stock_doc(gr, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'partner_name', 'SolarEdge', 'ref_no', 'PO-77'),
         '[{"sku":"INV-10K","sn":"SN-0001"},{"sku":"INV-10K","sn":"SN-0002"},{"sku":"INV-10K","sn":"SN-0003"}]');
  d := public.post_stock_doc(gr);
  assert d.status = 'posted', 'posted';
  assert (select count(*) from public.serials where status = 'in_stock') = 3, '3 in stock';
  begin perform public.save_stock_doc(gr, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh), '[]'); assert false, 'posted is locked'; exception when raise_exception then null; end;

  -- receive the same SN again: refused
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GN', 'warehouse_id', wh, 'ref_no', 'DN-1'), '[{"sku":"INV-10K","sn":"SN 0001"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'SN already in stock'; exception when raise_exception then null; end;
  perform public.cancel_stock_doc(d.id, 'ผิด');

  -- sell 1 to a company, lend 1
  insert into public.companies (name, tax_id) values ('Buyer Co', '1111111111111');
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'Buyer Co', 'partner_tax_id', '1-1111-11111-11-1',
         'ref_no', 'PI-1', 'customer_po', 'CPO-9', 'site_name', 'Factory X'), '[{"sku":"INV-10K","sn":"SN-0001"}]');
  assert d.company_id = (select id from public.companies where tax_id = '1111111111111'), 'company linked by tax id';
  perform public.post_stock_doc(d.id);
  insert into t_ids values ('so', d.id);
  assert (select status from public.serials where sn_key = public.sn_key('SN-0001')) = 'sold', 'sold';

  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'BR', 'warehouse_id', wh, 'partner_name', 'Borrower'), '[{"sku":"INV-10K","sn":"SN-0002"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'BR needs due date'; exception when raise_exception then null; end;
  perform public.save_stock_doc(d.id, jsonb_build_object('doc_type', 'BR', 'warehouse_id', wh, 'partner_name', 'Borrower', 'due_date', '2026-12-01'), '[{"sku":"INV-10K","sn":"SN-0002"}]');
  perform public.post_stock_doc(d.id);
  insert into t_ids values ('br', d.id);
  assert (select status from public.serials where sn_key = public.sn_key('SN-0002')) = 'borrowed', 'borrowed';

  -- cannot sell sold / wrong SKU / unknown
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'X'), '[{"sku":"INV-10K","sn":"SN-0001"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'already sold'; exception when raise_exception then null; end;
  perform public.save_stock_doc(d.id, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'X'), '[{"sku":"OTHER","sn":"SN-0003"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'wrong sku'; exception when raise_exception then null; end;
  perform public.delete_stock_draft(d.id);

  -- return from loan: only SNs on that loan
  assert (select count(*) from public.stock_doc_open_sns((select id from t_ids where k = 'br'))) = 1, 'open on loan';
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'RT', 'warehouse_id', wh, 'partner_name', 'Borrower', 'return_of', (select id from t_ids where k = 'br')),
         '[{"sku":"INV-10K","sn":"SN-0001"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'not on that loan'; exception when raise_exception then null; end;
  perform public.save_stock_doc(d.id, jsonb_build_object('doc_type', 'RT', 'warehouse_id', wh, 'partner_name', 'Borrower', 'return_of', (select id from t_ids where k = 'br')),
         '[{"sku":"INV-10K","sn":"SN-0002","condition":"defective"}]');
  perform public.post_stock_doc(d.id);
  assert (select status || '/' || condition from public.serials where sn_key = public.sn_key('SN-0002')) = 'in_stock/defective', 'back defective';

  -- defective cannot be sold, can be written off with a reason
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'X'), '[{"sku":"INV-10K","sn":"SN-0002"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'defective not sellable'; exception when raise_exception then null; end;
  perform public.delete_stock_draft(d.id);

  -- reserve, transfer, then sell the reserved unit
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'RV', 'warehouse_id', wh, 'partner_name', 'Buyer Co'), '[{"sku":"INV-10K","sn":"SN-0003"}]');
  perform public.post_stock_doc(d.id);
  assert (select status from public.serials where sn_key = public.sn_key('SN-0003')) = 'reserved', 'reserved';
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'TR', 'warehouse_id', wh, 'to_warehouse_id', (select id from public.warehouses where code = 'WH2')),
         '[{"sku":"INV-10K","sn":"SN-0003"}]');
  perform public.post_stock_doc(d.id);
  insert into t_ids values ('tr', d.id);
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'Buyer Co'), '[{"sku":"INV-10K","sn":"SN-0003"}]');
  begin perform public.post_stock_doc(d.id); assert false, 'not in that warehouse'; exception when raise_exception then null; end;
  perform public.delete_stock_draft(d.id);

  -- cancelling the SO puts SN-0001 back; cancelling GR is blocked while later docs used its SNs
  begin perform public.cancel_stock_doc((select id from t_ids where k = 'gr'), 'x'); assert false, 'later docs exist'; exception when raise_exception then null; end;
  begin perform public.cancel_stock_doc((select id from t_ids where k = 'so'), ''); assert false, 'reason needed'; exception when raise_exception then null; end;
  perform public.cancel_stock_doc((select id from t_ids where k = 'so'), 'ออกผิด');
  assert (select status || '/' || coalesce(holder_name, '-') from public.serials where sn_key = public.sn_key('SN-0001')) = 'in_stock/-', 'restored';

  -- a delivery is cut by one live document only
  perform public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'D Co', 'delivery_id', (select id from t_ids where k = 'dl')), '[]');
  begin
    perform public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'D Co', 'delivery_id', (select id from t_ids where k = 'dl')), '[]');
    assert false, 'second doc for same delivery';
  exception when unique_violation then null; end;

  -- history: GR, cancelled SO, plus a claim naming it
  h := public.sn_history('sn0001');
  assert h -> 'serial' ->> 'status' = 'in_stock', 'history serial';
  assert jsonb_array_length(h -> 'docs') = 2, 'history docs ' || (h -> 'docs')::text;
  assert (select count(*) from public.sn_search('0001')) = 1, 'partial search';
end $$;

-- claims show in history
reset role;
insert into public.claims (claim_no, source, reported_sns, status) values ('69-9999', 'staff', array['SN-0001'], 'submitted');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f0b2', true);
do $$
begin
  assert jsonb_array_length(public.sn_history('SN-0001') -> 'claims') = 1, 'claim in history';
  begin perform public.set_stock_source('docs'); assert false, 'admin only'; exception when insufficient_privilege then null; end;
end $$;

-- admin: switch stock to documents -> stock_levels from SNs, sheet sync refused
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f0a1', true);
do $$
begin
  perform public.set_stock_source('docs', '2027-01-01');
  -- SN-0001 in stock good, SN-0002 defective, SN-0003 reserved (WH2) -> on hand 2 good, reserved 1, available 1
  assert (select on_hand || '/' || reserved || '/' || available from public.stock_levels where sku = 'INV-10K') = '2.00/1.00/1.00',
    'levels ' || (select on_hand || '/' || reserved || '/' || available from public.stock_levels where sku = 'INV-10K');
  begin
    perform public.apply_stock_sync('upload', 'x.xlsx', null, '[{"sku":"INV-10K","on_hand":5}]');
    assert false, 'sheet sync blocked';
  exception when raise_exception then null; end;
  perform public.log_stock_sync_error('cron', null, 'still logs errors');
  perform public.set_stock_source('sheet');
end $$;

rollback;
\echo 'ALL STOCK DOCS TESTS PASSED'
