-- Migration 17: show_price / special_price columns and effective_price with a special price.
\set ON_ERROR_STOP on
begin;
insert into public.products (id, name, slug, is_published) values ('20000000-0000-0000-0000-000000000001', 'Inverter', 'inv', true);
insert into public.product_variants (id, product_id, sku, name, base_price) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'INV-1', 'INV-1', 1000),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'INV-2', 'INV-2', 2000);
do $$ begin
  assert (select bool_and(show_price) from public.product_variants), 'price shown by default';
  assert public.effective_price('30000000-0000-0000-0000-000000000001') = 1000, 'base price without special';
end $$;
update public.product_variants set special_price = 900 where sku = 'INV-1';
update public.product_variants set special_price = 1500, special_ends_at = now() - interval '1 day' where sku = 'INV-2';
do $$ begin
  assert public.effective_price('30000000-0000-0000-0000-000000000001') = 900, 'running special price used';
  assert public.effective_price('30000000-0000-0000-0000-000000000002') = 2000, 'expired special price ignored';
end $$;
insert into public.promotions (id, title, is_published) values ('40000000-0000-0000-0000-000000000001', 'Promo', true);
insert into public.promotion_items (promotion_id, variant_id, promo_price) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 950);
do $$ begin
  assert public.effective_price('30000000-0000-0000-0000-000000000001') = 900, 'lower of promo and special wins';
end $$;
do $$ begin
  begin
    update public.product_variants set special_price = -1 where sku = 'INV-1';
    assert false, 'negative special price rejected';
  exception when check_violation then null;
  end;
end $$;
-- Migration 18: package code
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1', 'pkguser@ssc.test', '{}');
insert into public.packages (id, name, slug, price, is_published, code) values ('50000000-0000-0000-0000-000000000001', 'ชุด 5 kW', 'set-5kw', 50000, true, 'PKG-5K');
do $$ begin
  begin
    insert into public.packages (name, slug, code) values ('ซ้ำ', 'dup', 'pkg-5k');
    assert false, 'package code unique ignoring case';
  exception when unique_violation then null;
  end;
  begin
    insert into public.packages (name, slug, code) values ('ผิด', 'bad', 'มี เว้นวรรค');
    assert false, 'package code format checked';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select code from public.create_quote_request(jsonb_build_array(jsonb_build_object('package_id', '50000000-0000-0000-0000-000000000001', 'qty', 1)));
do $$ begin
  assert (select label from public.quote_request_items where package_id is not null) = 'PKG-5K · แพ็กเกจ · ชุด 5 kW', 'quote line starts with package code';
  assert (select unit_price from public.quote_request_items where package_id is not null) = 50000, 'package single price';
end $$;
rollback;
\echo 'ALL PRICE TESTS PASSED'
