-- Migration 40: several pieces per claim (inverters + items linked to an inverter), SolarEdge rules,
-- automatic stock documents per claim step.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f40a1', 'cmadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f40b1', 'cmstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f40c1', 'cmcust@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'cmadmin@ssc.test';
update public.profiles set role = 'staff' where email = 'cmstaff@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000f40b1', 'claims.handle');
-- stock.view only so this test can read serials; claim_stock_action itself needs no stock permission
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000f40b1', 'stock.view');
insert into public.claim_models (product_type, brand_id, model) select 'inverter', id, 'SE10K' from public.brands where slug = 'solaredge' on conflict do nothing;
insert into public.claim_models (product_type, brand_id, model) select 'optimizer', id, 'P500' from public.brands where slug = 'solaredge' on conflict do nothing;
create temp table t40 (k text primary key, id uuid);
grant all on t40 to authenticated;

do $$ begin
  assert (select count(*) from public.warehouses where role in ('claim_hold', 'claim_check', 'defect')) = 3, 'system warehouses';
  assert (select role from public.warehouses where code = 'BGL4') = 'main', 'BGL4 main';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40c1', true);
do $$
declare se uuid := (select id from public.brands where slug = 'solaredge');
  base jsonb; det jsonb; u jsonb;
begin
  base := jsonb_build_object('product_type', 'inverter', 'contact_name', 'A', 'contact_phone', '081', 'site_id', 'S1', 'site_name', 'Project X', 'brand_id', se);
  det := jsonb_build_object('case_no', 'C1', 'issue', 'Isolation', 'description', 'trip',
    'inverters', jsonb_build_array(jsonb_build_object('sn', 'INV-1', 'model', 'SE10K'), jsonb_build_object('sn', 'INV-2', 'model', 'SE10K')));
  u := jsonb_build_array(
    jsonb_build_object('kind', 'inverter', 'model', 'se10k', 'sn', 'INV-1', 'pos', '1.0.0.0', 'symptom', 'no output'),
    jsonb_build_object('kind', 'inverter', 'model', 'SE10K', 'sn', 'INV-2', 'pos', '2.0.0.0'),
    jsonb_build_object('kind', 'optimizer', 'model', 'P500', 'sn', 'OPT-1', 'pos', '1.1.12.0', 'inv_sn', 'INV-1', 'volt', '1', 'ohm', '0'));

  -- SolarEdge: every piece needs its own S/N
  begin perform public.submit_claim(base || jsonb_build_object('details', det || jsonb_build_object('units',
      u || jsonb_build_array(jsonb_build_object('kind', 'optimizer', 'model', 'P500', 'sn', '', 'inv_sn', 'INV-1')))));
    assert false, 'SE sn per piece'; exception when raise_exception then null; end;
  -- SolarEdge: only SolarEdge items
  begin perform public.submit_claim(base || jsonb_build_object('details', det || jsonb_build_object('units',
      u || jsonb_build_array(jsonb_build_object('kind', 'panel', 'model', 'LONGI-550', 'sn', 'PN-1', 'inv_sn', 'INV-2')))));
    assert false, 'SE only'; exception when raise_exception then null; end;
  -- position format 0.0.0.0, up to 3 digits
  begin perform public.submit_claim(base || jsonb_build_object('details', det || jsonb_build_object('units',
      jsonb_build_array(jsonb_build_object('kind', 'inverter', 'model', 'SE10K', 'sn', 'INV-9', 'pos', '1.2.3')))));
    assert false, 'pos format'; exception when raise_exception then null; end;
  begin perform public.submit_claim(base || jsonb_build_object('details', det || jsonb_build_object('units',
      jsonb_build_array(jsonb_build_object('kind', 'inverter', 'model', 'SE10K', 'sn', 'INV-9', 'pos', '1.2.3.1000')))));
    assert false, 'pos 3 digits'; exception when raise_exception then null; end;
  -- same S/N twice
  begin perform public.submit_claim(base || jsonb_build_object('details', det || jsonb_build_object('units',
      u || jsonb_build_array(jsonb_build_object('kind', 'optimizer', 'model', 'P500', 'sn', 'opt 1', 'inv_sn', 'INV-1')))));
    assert false, 'dup sn'; exception when raise_exception then null; end;
  -- inverter claims still need the case for SolarEdge
  begin perform public.submit_claim(base || jsonb_build_object('details', (det - 'case_no') || jsonb_build_object('units', u)));
    assert false, 'case'; exception when raise_exception then null; end;

  insert into t40 values ('c', (select s.id from public.submit_claim(base || jsonb_build_object('details', det || jsonb_build_object('units', u))) s));
end $$;

reset role;
do $$
declare c public.claims := (select c from public.claims c where id = (select id from t40 where k = 'c'));
begin
  assert c.qty = 3 and c.reported_sns @> array['INV-1', 'INV-2', 'OPT-1'] and c.site_name = 'Project X', 'claim ' || c.qty;
  assert (select count(*) from public.claim_units where claim_id = c.id) = 3, 'one unit per piece';
  assert (select pcode || '|' || item_type || '|' || position || '|' || ref_inv_sn || '|' || reported_sn from public.claim_units where claim_id = c.id and seq = 1)
         = 'SE10K|inverter|1.0.0.0|INV-1|INV-1', 'inverter unit';
  assert (select item_type || '|' || position || '|' || ref_inv_sn from public.claim_units where claim_id = c.id and seq = 3)
         = 'optimizer|1.1.12.0|INV-1', 'optimizer linked to inverter';
end $$;

-- admin: stock in, then fill step 2 with replacement SNs
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; cid uuid := (select id from t40 where k = 'c');
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'ref_no', 'PO-40'),
         '[{"sku":"SE10K","sn":"R-1"},{"sku":"SE10K","sn":"R-2"},{"sku":"P500","sn":"R-3"}]');
  perform public.post_stock_doc(d.id);
  perform public.save_claim_units(jsonb_agg(jsonb_build_object('id', u.id, 'claim_id', cid, 'pcode', u.pcode,
            'iss_sn', case u.seq when 1 then 'R-1' when 2 then 'R-2' else 'NOT-IN-STOCK' end)), '{}')
    from public.claim_units u where u.claim_id = cid;
end $$;

-- customer cannot run stock steps
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40c1', true);
do $$ begin
  begin perform public.claim_stock_action((select id from t40 where k = 'c'), 'reserve'); assert false, 'customer';
  exception when insufficient_privilege then null; end;
  assert public.claim_stock_info((select id from t40 where k = 'c')) is null, 'customer info';
end $$;

-- staff handling the claim
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40b1', true);
do $$
declare cid uuid := (select id from t40 where k = 'c'); r jsonb; s record;
  hold uuid := (select id from public.warehouses where role = 'claim_hold');
  chk uuid := (select id from public.warehouses where role = 'claim_check');
  bad uuid := (select id from public.warehouses where role = 'defect');
  main uuid := (select id from public.warehouses where code = 'BGL4');
begin
  begin perform public.claim_stock_action(cid, 'reserve'); assert false, 'take first'; exception when insufficient_privilege then null; end;
  perform public.take_claim(cid);

  -- step 2: move to the claim reserve warehouse
  r := public.claim_stock_action(cid, 'reserve');
  assert jsonb_array_length(r -> 'docs') = 1 and r -> 'docs' -> 0 ->> 'doc_type' = 'TR' and (r -> 'docs' -> 0 ->> 'n')::int = 2, 'reserve doc ' || r::text;
  assert jsonb_array_length(r -> 'skipped') = 1 and r -> 'skipped' -> 0 ->> 'sn' = 'NOT-IN-STOCK', 'skipped unknown';
  select * into s from public.serials where sn_key = 'R1';
  assert s.status = 'reserved' and s.warehouse_id = hold and s.holder_name is not null, 'reserved in hold';
  r := public.claim_stock_action(cid, 'reserve');
  assert jsonb_array_length(r -> 'docs') = 0, 'reserve again does nothing';

  -- step 2: staff cut out
  r := public.claim_stock_action(cid, 'issue');
  assert r -> 'docs' -> 0 ->> 'doc_type' = 'BR' and (r -> 'docs' -> 0 ->> 'n')::int = 2, 'issue ' || r::text;
  assert (select status from public.serials where sn_key = 'R1') = 'borrowed' and (select warehouse_id from public.serials where sn_key = 'R1') is null, 'out';
  assert jsonb_array_length(public.claim_stock_action(cid, 'issue') -> 'docs') = 0, 'issue again nothing';
end $$;

-- admin keys step 3 (returned units) and step 4 (from manufacturer)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40a1', true);
do $$
declare cid uuid := (select id from t40 where k = 'c');
begin
  perform public.save_claim_units(jsonb_agg(jsonb_build_object('id', u.id, 'claim_id', cid, 'pcode', u.pcode, 'iss_sn', u.iss_sn,
            'ret_sn', u.reported_sn, 'ret_pcode', u.pcode, 'rcv_sn', case u.seq when 1 then 'NEW-1' end, 'rcv_pcode', u.pcode, 'rma_no', 'RMA-9')), '{}')
    from public.claim_units u where u.claim_id = cid;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40b1', true);
do $$
declare cid uuid := (select id from t40 where k = 'c'); r jsonb; s record;
  chk uuid := (select id from public.warehouses where role = 'claim_check');
  bad uuid := (select id from public.warehouses where role = 'defect');
  main uuid := (select id from public.warehouses where code = 'BGL4');
begin
  -- step 3: receive returned units (not in the system before) into the inspection warehouse
  r := public.claim_stock_action(cid, 'receive');
  assert r -> 'docs' -> 0 ->> 'doc_type' = 'RT' and (r -> 'docs' -> 0 ->> 'n')::int = 3, 'receive ' || r::text;
  select * into s from public.serials where sn_key = 'INV1';
  assert s.status = 'in_stock' and s.warehouse_id = chk and s.condition = 'defective' and s.sku = 'SE10K', 'waiting inspection';
  assert jsonb_array_length(public.claim_stock_action(cid, 'receive') -> 'docs') = 0, 'receive again nothing';

  -- inspection
  begin perform public.claim_stock_action(cid, 'inspect', '[]'); assert false, 'need items'; exception when raise_exception then null; end;
  r := public.claim_stock_action(cid, 'inspect', '[{"sn":"INV-1","result":"good"},{"sn":"INV-2","result":"bad","note":"burnt"},{"sn":"R-1","result":"good"}]');
  assert jsonb_array_length(r -> 'docs') = 2, 'two TR ' || r::text;
  assert jsonb_array_length(r -> 'skipped') = 1, 'R-1 not in inspection';
  assert (select warehouse_id = main and condition = 'good' from public.serials where sn_key = 'INV1'), 'good to main';
  assert (select warehouse_id = bad and condition = 'defective' from public.serials where sn_key = 'INV2'), 'bad to defect';
  assert (select ret_result from public.claim_units where claim_id = cid and seq = 2) = 'bad', 'result on unit';

  -- write off defect
  r := public.claim_stock_action(cid, 'writeoff');
  assert r -> 'docs' -> 0 ->> 'doc_type' = 'WO' and (r -> 'docs' -> 0 ->> 'n')::int = 1, 'writeoff ' || r::text;
  assert (select status from public.serials where sn_key = 'INV2') = 'written_off', 'written off';

  -- step 4: from the manufacturer into main stock
  r := public.claim_stock_action(cid, 'mfr_in');
  assert r -> 'docs' -> 0 ->> 'doc_type' = 'GN' and (r -> 'docs' -> 0 ->> 'n')::int = 1, 'mfr ' || r::text;
  assert (select ref_no from public.stock_docs where id = (r -> 'docs' -> 0 ->> 'id')::uuid) = 'RMA-9', 'ref RMA';
  assert (select status = 'in_stock' and warehouse_id = main from public.serials where sn_key = 'NEW1'), 'in main';

  r := public.claim_stock_info(cid);
  assert jsonb_array_length(r -> 'docs') = 7, 'docs ' || jsonb_array_length(r -> 'docs');
  assert jsonb_array_length(r -> 'docs' -> 0 -> 'items') = 2, 'items';
  assert (select count(*) from jsonb_array_elements(r -> 'serials') x where x ->> 'mine' = 'true') >= 5, 'serials';
end $$;

-- admin: cancel the write-off puts the SN back; stock counts only main warehouses
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f40a1', true);
do $$
declare wo uuid := (select id from public.stock_docs where claim_id = (select id from t40 where k = 'c') and doc_type = 'WO');
begin
  perform public.cancel_stock_doc(wo, 'test');
  assert (select status from public.serials where sn_key = 'INV2') = 'in_stock', 'back in defect';
  perform public.set_stock_source('docs');
  -- SE10K good in main: INV-1 (inspected good) + NEW-1 ; R-1/R-2 are out, INV-2 is in the defect warehouse
  assert (select on_hand from public.stock_levels where sku = 'SE10K') = 2, 'on hand ' || (select on_hand from public.stock_levels where sku = 'SE10K');
end $$;

rollback;
\echo ALL CLAIM MULTI STOCK TESTS PASSED
