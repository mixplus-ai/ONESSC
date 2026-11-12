-- Migration 27: SolarEdge inverter needs Case no + Issue + Description; staff set them on any claim.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f27c1', 'secu@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f27b1', 'sestaff@ssc.test', '{}');
update public.profiles set role = 'staff' where email = 'sestaff@ssc.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000f27b1', 'claims.handle');
create temp table t27 (k text primary key, id uuid);
grant all on t27 to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f27c1', true);
do $$
declare se uuid := (select id from public.brands where slug = 'solaredge');
  base jsonb;
begin
  base := jsonb_build_object('product_type', 'inverter', 'contact_name', 'A', 'contact_phone', '081', 'site_id', 'S1', 'model', 'SE10K', 'brand_id', se);
  begin perform public.submit_claim(base || jsonb_build_object('details', jsonb_build_object('bad_sn', 'I1', 'issue', 'x', 'description', 'y')));
    assert false, 'case required'; exception when raise_exception then null; end;
  begin perform public.submit_claim(base || jsonb_build_object('details', jsonb_build_object('bad_sn', 'I1', 'case_no', 'C1', 'description', 'y')));
    assert false, 'issue required'; exception when raise_exception then null; end;
  begin perform public.submit_claim(base || jsonb_build_object('details', jsonb_build_object('bad_sn', 'I1', 'case_no', 'C1', 'issue', 'x')));
    assert false, 'description required'; exception when raise_exception then null; end;
  insert into t27 values ('inv', (select s.id from public.submit_claim(base || jsonb_build_object('details', jsonb_build_object('bad_sn', 'I1', 'case_no', 'C1', 'issue', 'Isolation', 'description', 'trip'))) s));
  -- a SolarEdge optimizer does not ask for them
  insert into t27 values ('opt', (select s.id from public.submit_claim(jsonb_build_object('product_type', 'optimizer', 'contact_name', 'A', 'contact_phone', '081', 'site_id', 'S1', 'brand_id', se,
     'details', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('model', 'P500', 'qty', 1, 'bad_sn', 'O1'))))) s));
  begin perform public.set_claim_case((select id from t27 where k = 'opt'), 'C2', 'i', 'd'); assert false, 'customer cannot set';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f27b1', true);
do $$
declare d jsonb;
begin
  begin perform public.set_claim_case((select id from t27 where k = 'opt'), 'C2', 'i', 'd'); assert false, 'take first';
  exception when insufficient_privilege then null; end;
  perform public.take_claim((select id from t27 where k = 'opt'));
  perform public.set_claim_case((select id from t27 where k = 'opt'), ' C2 ', 'Low output', 'checked V');
  select details into d from public.claims where id = (select id from t27 where k = 'opt');
  assert d ->> 'case_no' = 'C2' and d ->> 'issue' = 'Low output' and d ->> 'description' = 'checked V', 'set';
  assert d -> 'items' -> 0 ->> 'model' = 'P500', 'other details kept';
  perform public.set_claim_case((select id from t27 where k = 'opt'), 'C2', '', null);
  select details into d from public.claims where id = (select id from t27 where k = 'opt');
  assert not (d ? 'issue') and not (d ? 'description'), 'blank clears';
end $$;

rollback;
\echo ALL SOLAREDGE CASE TESTS PASSED
