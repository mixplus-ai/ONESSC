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
rollback;
\echo 'ALL PRICE TESTS PASSED'
