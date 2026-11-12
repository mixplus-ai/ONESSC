-- Phase 2 tests: catalog visibility, company prices, promotions, stock sync, RFQ, reservations.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000e', 'staff2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'user1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'user2@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'admin@ssc.test';
update public.profiles set role = 'staff' where email in ('staff@ssc.test', 'staff2@ssc.test');
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000000b', 'products'), ('00000000-0000-0000-0000-00000000000e', 'pricing'), ('00000000-0000-0000-0000-00000000000e', 'requests');
insert into public.companies (id, tax_id, name) values
  ('10000000-0000-0000-0000-000000000001', '0105555000001', 'บริษัท เอ'),
  ('10000000-0000-0000-0000-000000000002', '0105555000002', 'บริษัท บี');
update public.profiles set company_id = '10000000-0000-0000-0000-000000000001', company_status = 'approved', tax_id = '0105555000001'
 where email = 'user1@ssc.test';
update public.profiles set company_id = '10000000-0000-0000-0000-000000000002', company_status = 'pending', tax_id = '0105555000002'
 where email = 'user2@ssc.test';

-- ---- admin syncs stock (as an uploaded file)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select rows_total from public.apply_stock_sync('upload', 'stock.xlsx', 'วันที่ 30/10/2026',
  '[{"sku":"SE10K","group":"SLE-IVT","description":"Inverter 10K","on_hand":10,"reserved":2,"available":8,"incoming":0},
    {"sku":"SE5K","group":"SLE-IVT","description":"Inverter 5K","on_hand":3,"reserved":0,"available":3,"incoming":0},
    {"sku":"FAN-90K","group":"SLE-SPP","description":"Fan","on_hand":0,"reserved":0,"available":0,"incoming":4},
    {"sku":"BLUE-10KT","group":"KSTAR","description":"KSTAR 10K","on_hand":0,"reserved":0,"available":0,"incoming":0},
    {"sku":"NEWBRAND-1","group":"ACME","description":"Acme thing","on_hand":1,"reserved":0,"available":1,"incoming":0}]'::jsonb,
  '[{"sku":"SE10K","customer":"การไฟฟ้า","qty":2,"doc_date":"2024-09-11"}]'::jsonb);
do $$ begin
  assert (select count(*) from public.stock_levels) = 5, 'stock rows stored';
  assert (select backorders from public.stock_syncs order by id desc limit 1) = 1, 'backorders stored';
end $$;

-- ---- staff (with products perm) imports draft products and groups two SKUs under one product
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select public.import_products_from_stock();
do $$ begin
  assert (select count(*) from public.product_variants) = 5, 'one variant per sheet row';
  assert (select count(*) from public.products where not is_published) = 5, 'drafts unpublished';
  assert (select b.name from public.products p join public.brands b on b.id = p.brand_id join public.product_variants v on v.product_id = p.id where v.sku = 'SE10K') = 'SolarEdge', 'brand mapped by stock group';
  assert exists (select 1 from public.brands where name = 'ACME'), 'unknown group creates brand';
end $$;
update public.products set name = 'SolarEdge Home Hub', is_published = true
 where id = (select product_id from public.product_variants where sku = 'SE10K');
select public.move_variant((select id from public.product_variants where sku = 'SE5K'),
                           (select product_id from public.product_variants where sku = 'SE10K'));
update public.product_variants set base_price = 50000 where sku = 'SE10K';
update public.product_variants set base_price = 30000 where sku = 'SE5K';
do $$ begin
  assert (select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.name = 'SolarEdge Home Hub') = 2, 'two SKUs share one product';
  assert (select count(*) from public.products) = 4, 'empty product removed after move';
end $$;

-- staff without the pricing perm cannot set company prices (migration 25)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  begin
    insert into public.company_prices (company_id, variant_id, price)
    select '10000000-0000-0000-0000-000000000001', id, 1 from public.product_variants where sku = 'SE10K';
    assert false, 'products-only staff must not set company prices';
  exception when insufficient_privilege then null;
  end;
end $$;
-- staff without products perm cannot edit catalog but with pricing perm can set company prices
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
update public.product_variants set base_price = 1 where sku = 'SE10K';
do $$ begin
  assert (select base_price from public.product_variants where sku = 'SE10K') = 50000, 'staff2 cannot change base price';
end $$;
insert into public.company_prices (company_id, variant_id, price)
select '10000000-0000-0000-0000-000000000001', id, 45000 from public.product_variants where sku = 'SE10K';
insert into public.company_prices (company_id, variant_id, price)
select '10000000-0000-0000-0000-000000000002', id, 44000 from public.product_variants where sku = 'SE10K';
do $$ begin
  assert (select updated_by from public.company_prices limit 1) = '00000000-0000-0000-0000-00000000000e', 'price stamped';
  begin
    perform public.apply_stock_sync('upload', 'x', null, '[{"sku":"A"}]'::jsonb);
    assert false, 'staff must not sync stock';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.stock_board()) = 5, 'staff sees stock board';
end $$;

-- ---- anon: sees published catalog + base price, stock status only, no company prices
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  assert (select count(*) from public.products) = 1, 'anon sees published products only';
  assert (select count(*) from public.product_variants) = 2, 'anon sees variants of published product';
  assert (select status from public.stock_status(array['SE10K'])) = 'in_stock', 'status in stock';
  assert (select available from public.stock_status(array['SE10K'])) is null, 'anon gets no number';
  assert (select status from public.stock_status(array['SE5K'])) = 'low', 'status low';
  assert (select status from public.stock_status(array['FAN-90K'])) = 'incoming', 'status incoming';
  assert (select status from public.stock_status(array['NOPE'])) = 'unknown', 'status unknown';
  assert (select count(*) from public.company_prices) = 0, 'anon reads no company prices';
  assert (select count(*) from public.stock_levels) = 0, 'anon reads no raw stock';
  assert (select count(*) from public.stock_backorders) = 0, 'anon reads no backorders';
end $$;

-- ---- user1 (approved company A): sees own company price, number of stock, promo wins
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert (select count(*) from public.company_prices) = 1, 'user1 sees only company A price';
  assert (select price from public.company_prices) = 45000, 'company A price';
  assert (select available from public.stock_status(array['SE10K'])) = 8, 'user gets number';
  assert public.effective_price((select id from public.product_variants where sku = 'SE10K')) = 45000, 'company price applies';
  assert (select count(*) from public.stock_levels) = 0, 'user cannot read raw stock';
  assert (select count(*) from public.stock_backorders) = 0, 'user cannot read backorders';
  begin
    perform public.stock_board();
    assert false, 'user must not read stock board';
  exception when insufficient_privilege then null;
  end;
end $$;

-- user2 (company link pending) gets nothing from company B prices
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  assert (select count(*) from public.company_prices) = 0, 'pending link sees no company price';
  assert public.effective_price((select id from public.product_variants where sku = 'SE10K')) = 50000, 'base price for pending';
end $$;

-- staff adds a running promotion → promo price for everyone
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.promotions (id, title, is_published, starts_at, ends_at)
values ('20000000-0000-0000-0000-000000000001', 'ลดกลางปี', true, now() - interval '1 day', now() + interval '1 day');
insert into public.promotion_items (promotion_id, variant_id, promo_price)
select '20000000-0000-0000-0000-000000000001', id, 47000 from public.product_variants where sku = 'SE10K';
insert into public.promotions (title, is_published, starts_at) values ('อนาคต', true, now() + interval '5 days');
insert into public.packages (id, name, slug, price, is_published) values ('30000000-0000-0000-0000-000000000001', 'ชุด 10 kW', 'set-10kw', 99000, true);
insert into public.package_items (package_id, variant_id, qty) select '30000000-0000-0000-0000-000000000001', id, 1 from public.product_variants where sku = 'SE10K';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  assert public.effective_price((select id from public.product_variants where sku = 'SE10K')) = 47000, 'promo wins over company price';
  assert (select count(*) from public.promotions) = 1, 'future promotion hidden';
end $$;

-- ---- RFQ
select code from public.create_quote_request(
  jsonb_build_array(
    jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'SE10K'), 'qty', 2),
    jsonb_build_object('package_id', '30000000-0000-0000-0000-000000000001', 'qty', 1)),
  'โครงการโรงงาน 100 kW');
do $$ begin
  assert (select code from public.quote_requests) ~ '^QT-[0-9]{2}-0001$', 'quote code format';
  assert (select count(*) from public.quote_request_items) = 2, 'quote items';
  assert (select unit_price from public.quote_request_items where variant_id is not null) = 47000, 'price snapshot';
  assert (select company_id from public.quote_requests) = '10000000-0000-0000-0000-000000000001', 'company linked';
end $$;
-- user cannot change status of own quote directly
update public.quote_requests set status = 'won';
do $$ begin
  assert (select status from public.quote_requests) = 'new', 'user cannot set quote status';
end $$;

-- ---- reservations: cannot exceed available, holds reduce availability
do $$ begin
  begin
    perform public.create_reservation(jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'SE10K'), 'qty', 9)));
    assert false, 'over-reservation must fail';
  exception when raise_exception then null;
  end;
end $$;
select code from public.create_reservation(jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'SE10K'), 'qty', 5)), 'รับเอง');
do $$ begin
  assert (select available from public.stock_status(array['SE10K'])) = 3, 'hold reduces availability';
  assert (select status from public.stock_status(array['SE10K'])) = 'low', 'now low';
end $$;

-- user2 cannot see user1's requests, and cannot take more than what is left
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  assert (select count(*) from public.reservations) = 0, 'user2 sees no reservation of user1';
  assert (select count(*) from public.quote_requests) = 0, 'user2 sees no quote of user1';
  assert (select count(*) from public.reservation_items) = 0, 'user2 sees no reservation items';
  begin
    perform public.create_reservation(jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants where sku = 'SE10K'), 'qty', 4)));
    assert false, 'must not exceed remaining';
  exception when raise_exception then null;
  end;
end $$;

-- staff confirms, then closes after recording in the sheet → hold released
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
update public.reservations set status = 'confirmed', user_id = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  assert (select user_id from public.reservations) = '00000000-0000-0000-0000-00000000000c', 'staff cannot reassign owner';
  assert (select handled_by from public.reservations) = '00000000-0000-0000-0000-00000000000e', 'handled_by stamped';
  assert (select app_held from public.stock_board() where sku = 'SE10K') = 5, 'board shows app hold';
end $$;
update public.reservations set status = 'closed';
do $$ begin
  assert (select app_held from public.stock_board() where sku = 'SE10K') = 0, 'closed releases hold';
end $$;

-- user cancels own quote
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select public.cancel_my_request('quote', (select id from public.quote_requests limit 1));
do $$ begin
  assert (select status from public.quote_requests) = 'cancelled', 'user cancelled quote';
  assert (select handled_by from public.quote_requests) is null, 'customer cancel does not set handled_by';
end $$;

reset role;
do $$ begin
  assert exists (select 1 from public.audit_logs where table_name = 'company_prices'), 'price change audited';
end $$;
rollback;
\echo 'ALL PHASE 2 TESTS PASSED'
