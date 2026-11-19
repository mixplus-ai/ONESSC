-- Migration 48: product lines saved on a draft without SNs.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000f7a1', 'dlboss@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'dlboss@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000f7a1', 'stock.docs');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f7a1', true);
do $$
declare wh uuid := (select id from public.warehouses where code = 'BGL4'); d public.stock_docs;
begin
  d := public.save_stock_doc(null, jsonb_build_object('doc_type', 'WD', 'warehouse_id', wh, 'partner_name', 'ช่าง'), '[]');
  perform public.save_stock_doc_lines(d.id, '[{"sku":" se10k ","description":"Inverter","qty":5},{"sku":"","qty":1},{"sku":"S440","qty":-3}]');
  select * into d from public.stock_docs where id = d.id;
  assert jsonb_array_length(d.lines) = 2, 'blank sku dropped';
  assert d.lines -> 0 ->> 'sku' = 'SE10K' and (d.lines -> 0 ->> 'qty')::int = 5, 'line saved';
  assert (d.lines -> 1 ->> 'qty')::int = 0, 'negative clamped';
end $$;
\echo ALL DOC LINES TESTS PASSED
rollback;
