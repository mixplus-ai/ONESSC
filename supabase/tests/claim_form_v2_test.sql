-- Migration 21: Site ID required + saved, inverter needs Case no, per-S/N units, stock model list per brand.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000f0c1', 'v2cu@ssc.test', '{}');
insert into public.brands (id, name, slug, stock_groups) values ('50000000-0000-0000-0000-000000000001', 'TestBrand', 'testbrand', '{TB-INV}');
insert into public.stock_levels (sku, store, stock_group, description, on_hand, available)
values ('TB-10K', 'BGL', 'TB-INV', 'TestBrand inverter 10kW', 3, 3), ('OTHER-1', 'BGL', 'XX', 'not this brand', 1, 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f0c1', true);
do $$
declare v record; c record;
begin
  assert (select count(*) from public.claim_stock_models('50000000-0000-0000-0000-000000000001')) = 1, 'stock models by brand';
  assert (select description from public.claim_stock_models('50000000-0000-0000-0000-000000000001')) = 'TestBrand inverter 10kW', 'name from stock';
  begin
    perform public.submit_claim(jsonb_build_object('product_type', 'panel', 'contact_name', 'A', 'contact_phone', '081', 'model', 'X',
      'details', jsonb_build_object('qty', 1)));
    assert false, 'site id required';
  exception when raise_exception then null; end;
  -- migration 27: only SolarEdge inverters need the Case no.; other brands are filled in later by staff
  perform public.submit_claim(jsonb_build_object('product_type', 'inverter', 'contact_name', 'A', 'contact_phone', '081', 'site_id', 'S9', 'model', 'TB-10K',
    'brand_id', '50000000-0000-0000-0000-000000000001', 'details', jsonb_build_object('bad_sn', 'INV1')));
  select * into v from public.submit_claim(jsonb_build_object('product_type', 'optimizer', 'contact_name', 'A', 'contact_phone', '081', 'site_id', ' SITE-77 ',
      'details', jsonb_build_object('po_no', 'PI-123',
        'items', jsonb_build_array(jsonb_build_object('model', 'P500', 'qty', 2)),
        'units', jsonb_build_array(jsonb_build_object('model', 'P500', 'sn', 'opt-a', 'symptom', 'no output', 'volt', '1.0', 'ohm', '0.5'),
                                   jsonb_build_object('model', 'P500', 'sn', 'OPT-B', 'symptom', 'burnt')))));
  select * into c from public.claims where id = v.id;
end $$;
reset role;
do $$
declare c record;
begin
  select * into c from public.claims where user_id = '00000000-0000-0000-0000-00000000f0c1' and product_type = 'optimizer';
  assert c.site_id = 'SITE-77', 'site id saved: ' || coalesce(c.site_id, 'null');
  assert c.reported_sns @> array['OPT-A', 'OPT-B'], 'unit SNs reported';
  assert c.details -> 'units' -> 0 ->> 'volt' = '1.0', 'measurements kept';
  assert c.details ->> 'po_no' = 'PI-123', 'po kept';
  assert c.qty = 2, 'qty';
end $$;
set local role anon;
do $$ begin
  begin perform public.claim_stock_models('50000000-0000-0000-0000-000000000001'); assert false, 'anon blocked'; exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo 'ALL CLAIM FORM V2 TESTS PASSED'
