-- Company points per brand: brand rules, fallback to the central rule, one entry per invoice + brand.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000bf0a1', 'bpadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000bf0b1', 'bpstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000bf0c1', 'bpuser@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'bpadmin@ssc.test';
update public.profiles set role = 'staff' where email = 'bpstaff@ssc.test';
insert into public.companies (id, tax_id, name) values ('40000000-0000-0000-0000-0000000000b1', '1111111111119', 'BP Co');
insert into public.brands (id, name, slug) values
  ('60000000-0000-0000-0000-0000000000b1', 'BrandA', 'brand-a'),
  ('60000000-0000-0000-0000-0000000000b2', 'BrandB', 'brand-b'),
  ('60000000-0000-0000-0000-0000000000b3', 'BrandC', 'brand-c');
update public.points_config set company_baht_per_point = 1000, company_tiers = '[{"min":0,"multiplier":1}]' where id = 1;

set local role authenticated;

-- admin sets brand rules; staff cannot
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bf0a1', true);
insert into public.brand_point_rules (brand_id, baht_per_point, tiers, terms) values
  ('60000000-0000-0000-0000-0000000000b1', 500, '[{"min":0,"multiplier":1},{"min":100000,"multiplier":2}]', 'A'),
  ('60000000-0000-0000-0000-0000000000b2', 2000, '[{"min":0,"multiplier":1}]', 'B');
insert into public.company_point_bonuses (id, label, multiplier, brand_id) values ('50000000-0000-0000-0000-0000000000b1', 'A only', 3, '60000000-0000-0000-0000-0000000000b1');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bf0b1', true);
do $$
declare l public.point_ledger; v_old bigint;
begin
  begin
    insert into public.brand_point_rules (brand_id, baht_per_point) values ('60000000-0000-0000-0000-0000000000b3', 1);
    assert false, 'staff wrote a brand rule';
  exception when insufficient_privilege then null;
  end;
  assert (public.calc_company_points(50000, null, null, '60000000-0000-0000-0000-0000000000b1') ->> 'points')::numeric = 100, 'brand A 500/pt';
  assert (public.calc_company_points(100000, null, null, '60000000-0000-0000-0000-0000000000b1') ->> 'points')::numeric = 400, 'brand A tier x2';
  assert (public.calc_company_points(50000, null, null, '60000000-0000-0000-0000-0000000000b2') ->> 'points')::numeric = 25, 'brand B 2000/pt';
  assert public.calc_company_points(50000, null, null, '60000000-0000-0000-0000-0000000000b3') ->> 'rule' = 'default', 'brand C falls back';
  assert (public.calc_company_points(50000, null, null, '60000000-0000-0000-0000-0000000000b3') ->> 'points')::numeric = 50, 'central 1000/pt';
  assert (public.calc_company_points(50000, '50000000-0000-0000-0000-0000000000b1', null, '60000000-0000-0000-0000-0000000000b1') ->> 'points')::numeric = 300, 'brand bonus';
  begin
    perform public.calc_company_points(50000, '50000000-0000-0000-0000-0000000000b1', null, '60000000-0000-0000-0000-0000000000b2');
    assert false, 'bonus of brand A used on brand B';
  exception when raise_exception then null;
  end;

  -- one tax invoice, two brands
  l := public.add_company_purchase('40000000-0000-0000-0000-0000000000b1', 'TAX-1', public.bkk_today(), 50000, p_brand_id => '60000000-0000-0000-0000-0000000000b1');
  assert l.points = 100 and l.brand_id = '60000000-0000-0000-0000-0000000000b1', 'brand A purchase';
  perform public.add_company_purchase('40000000-0000-0000-0000-0000000000b1', 'TAX-1', public.bkk_today(), 50000, p_brand_id => '60000000-0000-0000-0000-0000000000b2');
  begin
    perform public.add_company_purchase('40000000-0000-0000-0000-0000000000b1', 'tax-1', public.bkk_today(), 1000, p_brand_id => '60000000-0000-0000-0000-0000000000b1');
    assert false, 'same invoice + brand twice';
  exception when raise_exception then null;
  end;
  assert public.point_balance('company', '40000000-0000-0000-0000-0000000000b1') = 125, 'pooled balance';

  -- edit can change the brand
  v_old := l.id;
  l := public.edit_company_purchase(v_old, 'แบรนด์ผิด', 'TAX-1', public.bkk_today(), 50000, p_brand_id => '60000000-0000-0000-0000-0000000000b3');
  assert l.points = 50 and l.brand_id = '60000000-0000-0000-0000-0000000000b3' and l.replaces_id = v_old, 'edited brand';
  assert public.point_balance('company', '40000000-0000-0000-0000-0000000000b1') = 75, 'balance after edit';
end $$;

-- customers can read the rules (terms shown on their points page)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bf0c1', true);
do $$ begin assert (select count(*) from public.brand_point_rules) = 2, 'user reads rules'; end $$;

rollback;
\echo ALL BRAND POINTS TESTS PASSED
