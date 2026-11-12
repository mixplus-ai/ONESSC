-- Migration 24: stock count by SN, two-level approval.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f2a1', 'scadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f2b1', 'scclerk@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f2b2', 'scchecker@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f2b3', 'scboss@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f2b4', 'sccounter@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'scadmin@ssc.test';
update public.profiles set role = 'staff' where email like 'sc%@ssc.test' and email <> 'scadmin@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000f2b1', 'stock.docs'),
  ('00000000-0000-0000-0000-00000000f2b2', 'stock.check'),
  ('00000000-0000-0000-0000-00000000f2b3', 'stock.post'),
  ('00000000-0000-0000-0000-00000000f2b4', 'stock.count');
insert into public.warehouses (code, name) values ('WHC', 'คลัง C');
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;

set local role authenticated;

-- admin: stock in two warehouses, then require a checker for WO
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); wc uuid := (select id from public.warehouses where code = 'WHC'); d public.stock_docs;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'ref_no', 'PO-C'),
    '[{"sku":"INV","sn":"CNT-1"},{"sku":"INV","sn":"CNT-2"},{"sku":"INV","sn":"CNT-3"},{"sku":"BAT","sn":"CNT-B1"}]');
  perform public.post_stock_doc(d.id);
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wc, 'ref_no', 'PO-D'), '[{"sku":"INV","sn":"CNT-9"}]');
  perform public.post_stock_doc(d.id);
  perform public.set_stock_check_types(array['WO', 'XX']);
  assert (select check_types from public.stock_config where id = 1) = array['WO'], 'bad types dropped';
end $$;

-- counter: count BGL4 / INV only
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2b4', true);
do $$
declare c public.stock_counts; r jsonb;
begin
  begin perform public.set_stock_check_types(array['SO']); assert false, 'admin only'; exception when insufficient_privilege then null; end;
  c := public.start_stock_count((select id from public.warehouses where code = 'BGL4'), array['inv'], 'shelf A');
  assert c.count_no like 'SC-%' and c.skus = array['INV'], 'started';
  insert into t_ids values ('c', c.id);
  r := public.stock_count_scan(c.id, array['cnt-1', 'CNT 2', 'CNT-9', 'NEW-77', 'CNT-B1']);
  assert r -> 0 ->> 'result' = 'ok', 'ok';
  assert r -> 2 ->> 'result' = 'other_wh' and r -> 2 ->> 'warehouse' = 'WHC', 'other wh ' || (r -> 2)::text;
  assert r -> 3 ->> 'result' = 'unknown', 'unknown';
  assert r -> 4 ->> 'result' = 'other_sku', 'other sku';
  r := public.stock_count_scan(c.id, array['CNT1']);
  assert (r -> 0 ->> 'dup')::boolean, 'second scan is a dup';
  perform public.stock_count_unscan(c.id, 'CNT-B1');
  r := public.stock_count_report(c.id);
  assert (r ->> 'expected')::int = 3 and (r ->> 'matched')::int = 2 and (r ->> 'scanned')::int = 4, 'report ' || r::text;
  assert r -> 'missing' -> 0 ->> 'sn' = 'CNT-3', 'missing';
  assert jsonb_array_length(r -> 'extra') = 2, 'extra';
  -- counter cannot close (makes documents)
  begin perform public.close_stock_count(c.id); assert false, 'counter cannot close'; exception when insufficient_privilege then null; end;
end $$;

-- clerk closes: WO draft for CNT-3, TR draft WHC -> BGL4 for CNT-9
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2b1', true);
do $$
declare r jsonb; wo uuid; tr uuid;
begin
  r := public.close_stock_count((select id from t_ids where k = 'c'));
  assert jsonb_array_length(r -> 'docs') = 2, 'two drafts ' || r::text;
  select (x ->> 'id')::uuid into wo from jsonb_array_elements(r -> 'docs') x where x ->> 'doc_type' = 'WO';
  select (x ->> 'id')::uuid into tr from jsonb_array_elements(r -> 'docs') x where x ->> 'doc_type' = 'TR';
  insert into t_ids values ('wo', wo), ('tr', tr);
  assert (select count(*) from public.stock_doc_items where doc_id = wo) = 1, 'wo items';
  assert (select to_warehouse_id from public.stock_docs where id = tr) = (select id from public.warehouses where code = 'BGL4'), 'tr to';
  assert (select status from public.stock_counts where id = (select id from t_ids where k = 'c')) = 'closed', 'closed';
  begin perform public.stock_count_scan((select id from t_ids where k = 'c'), array['X1']); assert false, 'closed count'; exception when others then null; end;
  begin perform public.check_stock_doc(wo); assert false, 'clerk is not a checker'; exception when insufficient_privilege then null; end;
end $$;

-- boss cannot post WO before a check; TR (not in check_types) posts directly
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2b3', true);
do $$
begin
  begin perform public.post_stock_doc((select id from t_ids where k = 'wo')); assert false, 'needs check'; exception when raise_exception then null; end;
  perform public.post_stock_doc((select id from t_ids where k = 'tr'));
  assert (select warehouse_id from public.serials where sn_key = 'CNT9') = (select id from public.warehouses where code = 'BGL4'), 'moved';
end $$;

-- checker signs off
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2b2', true);
do $$
declare d public.stock_docs;
begin
  d := public.check_stock_doc((select id from t_ids where k = 'wo'));
  assert d.checked_at is not null and d.checked_hash is not null, 'checked';
  begin perform public.post_stock_doc(d.id); assert false, 'checker cannot post'; exception when insufficient_privilege then null; end;
end $$;

-- clerk edits after the check -> check is cleared; same content re-saved keeps it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2b1', true);
do $$
declare d public.stock_docs := (select x from public.stock_docs x where id = (select id from t_ids where k = 'wo'));
begin
  perform public.save_stock_doc(d.id, to_jsonb(d), (select jsonb_agg(to_jsonb(i)) from public.stock_doc_items i where i.doc_id = d.id));
  assert (select checked_at from public.stock_docs where id = d.id) is not null, 'unchanged save keeps check';
  perform public.save_stock_doc(d.id, to_jsonb(d) || '{"reason":"หาย"}', (select jsonb_agg(to_jsonb(i)) from public.stock_doc_items i where i.doc_id = d.id));
  assert (select checked_at from public.stock_docs where id = d.id) is null, 'edit clears check';
end $$;

-- a checker who also posts: must be two people
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2a1', true);
do $$
declare id uuid := (select id from t_ids where k = 'wo');
begin
  perform public.check_stock_doc(id);
  begin perform public.post_stock_doc(id); assert false, 'same person'; exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f2b3', true);
do $$
begin
  perform public.post_stock_doc((select id from t_ids where k = 'wo'));
  assert (select status from public.serials where sn_key = 'CNT3') = 'written_off', 'written off';
  -- closed count keeps its snapshot
  assert (public.stock_count_report((select id from t_ids where k = 'c')) -> 'missing' -> 0 ->> 'sn') = 'CNT-3', 'snapshot';
end $$;

rollback;
\echo 'ALL STOCK COUNT TESTS PASSED'
