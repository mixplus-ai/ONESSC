-- Migration 30: bulk product table edit with its own permissions.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f30a1', 'gridinfo@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f30a2', 'gridprice@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f30a3', 'gridnone@ssc.test', '{}');
update public.profiles set role = 'staff' where email like 'grid%@ssc.test';
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-0000000f30a1', 'products.bulk'), ('00000000-0000-0000-0000-0000000f30a2', 'products.bulk_price');
insert into public.products (id, name, slug) values ('30000000-0000-0000-0000-000000000001', 'Panel G', 'panel-g');
insert into public.product_variants (id, product_id, sku, name, base_price) values
  ('30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'G-1', 'G-1', 100),
  ('30000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001', 'G-2', 'G-2', null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f30a1', true);
do $$
declare r jsonb;
begin
  r := public.bulk_update_products('[{"id":"30000000-0000-0000-0000-000000000001","name":" Panel G2 ","is_published":true,"summary":""}]',
                                   '[{"id":"30000000-0000-0000-0000-0000000000a1","detail":"mono","unit":"แผง"},{"id":"30000000-0000-0000-0000-0000000000a2","is_active":false}]');
  assert (r ->> 'products')::int = 1 and (r ->> 'variants')::int = 2, 'counts ' || r::text;
  begin perform public.bulk_update_products('[]', '[{"id":"30000000-0000-0000-0000-0000000000a1","base_price":"5"}]'); assert false, 'info cannot price';
  exception when insufficient_privilege then null; end;
  begin perform public.bulk_update_products('[{"id":"30000000-0000-0000-0000-000000000001","name":""}]', '[]'); assert false, 'empty name';
  exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f30a2', true);
do $$
begin
  perform public.bulk_update_products('[]', '[{"id":"30000000-0000-0000-0000-0000000000a2","base_price":"250.5","special_price":"200","special_ends_at":"2026-12-31"},{"id":"30000000-0000-0000-0000-0000000000a1","base_price":""}]');
  begin perform public.bulk_update_products('[]', '[{"id":"30000000-0000-0000-0000-0000000000a1","name":"x"}]'); assert false, 'price cannot rename';
  exception when insufficient_privilege then null; end;
  begin perform public.bulk_update_products('[{"id":"30000000-0000-0000-0000-000000000001","is_published":false}]', '[]'); assert false, 'price cannot publish';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f30a3', true);
do $$ begin
  begin perform public.bulk_update_products('[]', '[]'); assert false, 'no perm'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select name || '|' || is_published::text || '|' || coalesce(summary, '-') from public.products where id = '30000000-0000-0000-0000-000000000001') = 'Panel G2|true|-', 'product saved';
  assert (select detail || unit from public.product_variants where sku = 'G-1') = 'monoแผง', 'variant info';
  assert (select base_price from public.product_variants where sku = 'G-1') is null, 'price cleared';
  assert (select base_price = 250.5 and special_price = 200 and not is_active from public.product_variants where sku = 'G-2'), 'price saved';
end $$;
\echo ALL PRODUCTS GRID TESTS PASSED
rollback;
