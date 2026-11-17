-- Migration 41: rank pricing (Gold / Gold+), stock status for customers, reservation price, sales-only requests.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000aa01', 'rkpricing@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000aa02', 'rksale1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000aa03', 'rksale2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000aa04', 'rkcusta@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000aa05', 'rkcustb@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000aa06', 'rkmanager@ssc.test', '{}');
update public.profiles set role = 'staff' where email in ('rkpricing@ssc.test', 'rksale1@ssc.test', 'rksale2@ssc.test', 'rkmanager@ssc.test');
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000aa01', 'pricing'),
  ('00000000-0000-0000-0000-00000000aa02', 'requests'),
  ('00000000-0000-0000-0000-00000000aa03', 'requests'),
  ('00000000-0000-0000-0000-00000000aa06', 'requests'),
  ('00000000-0000-0000-0000-00000000aa06', 'requests.all');
insert into public.companies (id, tax_id, name) values
  ('41000000-0000-0000-0000-0000000000a1', '4444444444440', 'Rank A Co'),
  ('41000000-0000-0000-0000-0000000000b1', '5555555555550', 'Rank B Co');
update public.profiles set company_id = '41000000-0000-0000-0000-0000000000a1', company_status = 'approved' where email = 'rkcusta@ssc.test';
update public.profiles set company_id = '41000000-0000-0000-0000-0000000000b1', company_status = 'approved' where email = 'rkcustb@ssc.test';
insert into public.team_members (id, full_name, department, email, user_id) values
  ('71000000-0000-0000-0000-0000000000a1', 'Sale One', 'sales', 'rksale1@ssc.test', '00000000-0000-0000-0000-00000000aa02'),
  ('71000000-0000-0000-0000-0000000000a2', 'Sale Two', 'sales', 'rksale2@ssc.test', '00000000-0000-0000-0000-00000000aa03');
update public.companies set sales_member_id = '71000000-0000-0000-0000-0000000000a1' where id = '41000000-0000-0000-0000-0000000000a1';
update public.companies set sales_member_id = '71000000-0000-0000-0000-0000000000a2' where id = '41000000-0000-0000-0000-0000000000b1';
insert into public.products (id, name, slug, is_published) values ('21000000-0000-0000-0000-000000000001', 'Rank Inverter', 'rank-inv', true);
insert into public.product_variants (id, product_id, sku, name, base_price) values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'RK-1', 'RK-1', 1000),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', 'RK-2', 'RK-2', 2000);
insert into public.stock_levels (sku, available) values ('RK-1', 5), ('RK-2', 0);

do $$ begin
  assert (select count(*) from public.price_ranks where code in ('silver', 'gold', 'platinum', 'diamond')) = 4, '4 ranks seeded';
  assert not (select show_qty_to_users from public.stock_config where id = 1), 'customers do not see stock numbers';
end $$;

set local role authenticated;

-- pricing staff sets Gold: 900 for RK-1, 10% off for the rest; company A in Gold
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa01', true);
update public.price_ranks set discount_pct = 10 where code = 'gold';
insert into public.rank_prices (rank_code, variant_id, price) values ('gold', '31000000-0000-0000-0000-000000000001', 900);
select public.set_company_rank('41000000-0000-0000-0000-0000000000a1', 'gold');

-- customer A sees Gold prices, no plus yet
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa04', true);
do $$ begin
  assert (select code from public.my_price_rank()) = 'gold', 'A is gold';
  assert not (select plus from public.my_price_rank()), 'no plus yet';
  assert (select price from public.my_prices(array['31000000-0000-0000-0000-000000000001'::uuid])) = 900, 'rank price';
  assert (select price from public.my_prices(array['31000000-0000-0000-0000-000000000002'::uuid])) = 1800, 'rank % off';
  assert (select kind from public.my_prices(array['31000000-0000-0000-0000-000000000002'::uuid])) = 'rank', 'kind rank';
  assert public.effective_price('31000000-0000-0000-0000-000000000001') = 900, 'snapshot uses rank price';
  assert (select count(*) from public.rank_prices) = 0, 'customer cannot read the rank price table';
end $$;

-- customer B has no rank: normal price, nothing in my_prices
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa05', true);
do $$ begin
  assert (select count(*) from public.my_price_rank()) = 0, 'B has no rank';
  assert (select count(*) from public.my_prices(array['31000000-0000-0000-0000-000000000001'::uuid])) = 0, 'B has no special prices';
  assert public.effective_price('31000000-0000-0000-0000-000000000001') = 1000, 'B pays base';
  begin
    perform public.set_company_rank('41000000-0000-0000-0000-0000000000b1', 'diamond');
    assert false, 'customer cannot set rank';
  exception when insufficient_privilege then null;
  end;
end $$;

-- own company price → Gold+, and it wins over the rank price
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa01', true);
insert into public.company_prices (company_id, variant_id, price) values ('41000000-0000-0000-0000-0000000000a1', '31000000-0000-0000-0000-000000000001', 850);
-- editing the rank moves everyone in it
update public.rank_prices set price = 880 where rank_code = 'gold';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa04', true);
do $$ begin
  assert (select plus from public.my_price_rank()), 'A is Gold+';
  assert (select price from public.my_prices(array['31000000-0000-0000-0000-000000000001'::uuid])) = 850, 'company price wins';
  assert (select kind from public.my_prices(array['31000000-0000-0000-0000-000000000001'::uuid])) = 'company', 'kind company';
end $$;

-- stock fit: status only
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa04', true);
do $$ begin
  assert (select fit from public.stock_fit('[{"sku":"RK-1","qty":3}]')) = 'full', 'full';
  assert (select fit from public.stock_fit('[{"sku":"RK-1","qty":8}]')) = 'partial', 'partial';
  assert (select fit from public.stock_fit('[{"sku":"RK-2","qty":1}]')) = 'none', 'none';
  assert (select fit from public.stock_fit('[{"sku":"NOPE","qty":1}]')) = 'unknown', 'unknown';
  assert (select available from public.stock_status(array['RK-1'])) is null, 'customer gets no number';
end $$;

-- reservation keeps the price; requests go to the company's sales only
select code from public.create_reservation('[{"variant_id":"31000000-0000-0000-0000-000000000001","qty":2}]'::jsonb);
select code from public.create_quote_request('[{"variant_id":"31000000-0000-0000-0000-000000000002","qty":1}]'::jsonb);
do $$ begin
  assert (select unit_price from public.reservation_items ri join public.reservations r on r.id = ri.reservation_id
           where r.company_id = '41000000-0000-0000-0000-0000000000a1') = 850, 'reservation price snapshot';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa03', true);
do $$ begin
  assert (select count(*) from public.quote_requests where company_id = '41000000-0000-0000-0000-0000000000a1') = 0, 'other sales does not see A';
  assert (select count(*) from public.reservations where company_id = '41000000-0000-0000-0000-0000000000a1') = 0, 'other sales does not see A reservation';
end $$;
update public.reservations set status = 'confirmed' where company_id = '41000000-0000-0000-0000-0000000000a1';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa02', true);
do $$ begin
  assert (select status from public.reservations where company_id = '41000000-0000-0000-0000-0000000000a1') = 'pending', 'other sales could not approve';
  assert (select count(*) from public.quote_requests where company_id = '41000000-0000-0000-0000-0000000000a1') = 1, 'own sales sees quote';
  assert (select count(*) from public.quote_request_items qi join public.quote_requests q on q.id = qi.quote_id where q.company_id = '41000000-0000-0000-0000-0000000000a1') = 1, 'own sales sees quote items';
end $$;
update public.reservations set status = 'confirmed' where company_id = '41000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select status from public.reservations where company_id = '41000000-0000-0000-0000-0000000000a1') = 'confirmed', 'own sales approves';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa06', true);
do $$ begin
  assert (select count(*) from public.quote_requests where company_id = '41000000-0000-0000-0000-0000000000a1') = 1, 'requests.all sees every company';
end $$;

rollback;
\echo 'ALL RANK PRICING TESTS PASSED'
