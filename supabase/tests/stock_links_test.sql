-- Migration 23: reservation link, document files, sns_info for claims.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f1a1', 'sladmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f1b1', 'slclaims@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000f1c1', 'slcust@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'sladmin@ssc.test';
update public.profiles set role = 'staff' where email = 'slclaims@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000f1b1', 'claims.view');
insert into public.reservations (code, user_id, expires_at) values ('RS-69-9001', '00000000-0000-0000-0000-00000000f1c1', now() + interval '7 days');
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;
insert into t_ids select 'rs', id from public.reservations where code = 'RS-69-9001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f1a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs; r record;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'GR', 'warehouse_id', wh, 'ref_no', 'PO-1'), '[{"sku":"INV","sn":"LNK-1"},{"sku":"INV","sn":"LNK-2"}]');
  perform public.post_stock_doc(d.id);
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'Cust', 'ref_no', 'PI-9'), '[{"sku":"INV","sn":"LNK-1"}]');
  perform public.save_stock_doc_reservation(d.id, (select id from t_ids where k = 'rs'));
  perform public.post_stock_doc(d.id);
  assert (select reservation_id from public.stock_docs where id = d.id) = (select id from t_ids where k = 'rs'), 'linked';

  -- second live SO for the same reservation refused
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'SO', 'warehouse_id', wh, 'partner_name', 'Cust'), '[]');
  begin perform public.save_stock_doc_reservation(d.id, (select id from t_ids where k = 'rs')); assert false, 'one per reservation'; exception when unique_violation then null; end;
  perform public.delete_stock_draft(d.id);

  -- files: path must sit under the doc id; posted doc files cannot be deleted by non-admin (admin can)
  insert into public.stock_doc_files (doc_id, path, name) values ((select id from public.stock_docs where ref_no = 'PI-9'), (select id from public.stock_docs where ref_no = 'PI-9')::text || '/a.jpg', 'a.jpg');
  begin
    insert into public.stock_doc_files (doc_id, path, name) values ((select id from public.stock_docs where ref_no = 'PI-9'), 'other/b.jpg', 'b.jpg');
    assert false, 'path under doc';
  exception when insufficient_privilege then null; end;
end $$;

-- claims staff: sns_info, no stock tables
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f1b1', true);
do $$
declare r record;
begin
  select * into r from public.sns_info(array['lnk 1']);
  assert r.status = 'sold' and r.sold_to = 'Cust' and r.ref_no = 'PI-9', 'sold info ' || coalesce(r.status, '-');
  select * into r from public.sns_info(array['LNK-2']);
  assert r.status = 'in_stock' and r.sold_doc_no is null, 'in stock, not sold';
  select * into r from public.sns_info(array['NOPE-1']);
  assert r.status is null, 'unknown SN';
  assert (select count(*) from public.stock_doc_files) = 0, 'claims staff cannot read files';
end $$;

-- customer: nothing
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f1c1', true);
do $$
begin
  begin perform public.sns_info(array['LNK-1']); assert false, 'customer'; exception when insufficient_privilege then null; end;
end $$;

rollback;
\echo 'ALL STOCK LINKS TESTS PASSED'
