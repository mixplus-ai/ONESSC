-- Migration 28: RMA no. / date / note on claim units, saved by staff with the 'claims' permission.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f28b1', 'rmastaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-0000000f28b2', 'rmaview@ssc.test', '{}');
update public.profiles set role = 'staff' where email in ('rmastaff@ssc.test', 'rmaview@ssc.test');
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-0000000f28b1', 'claims'), ('00000000-0000-0000-0000-0000000f28b2', 'claims.view');
insert into public.claims (id, claim_no, source, contact_name, contact_phone, product_type, status) values
  ('28000000-0000-0000-0000-0000000000a1', '26-9281', 'staff', 'A', '081', 'inverter', 'in_progress');
insert into public.claim_units (id, claim_id, seq, pcode) overriding system value values (928101, '28000000-0000-0000-0000-0000000000a1', 1, 'SESUK');

do $$ begin
  assert (select rma_header ->> 'customer_name' from public.claim_settings where id = 1) = 'Siam Solar Cell Co.,Ltd.', 'default header';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f28b2', true);
do $$ begin
  begin perform public.save_claim_units('[{"id": 928101, "claim_id": "28000000-0000-0000-0000-0000000000a1", "pcode": "SESUK", "rma_no": "R1"}]'::jsonb);
    assert false, 'view-only staff cannot save'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f28b1', true);
do $$ begin
  perform public.save_claim_units('[{"id": 928101, "claim_id": "28000000-0000-0000-0000-0000000000a1", "pcode": "SESUK", "rma_no": " R10000671448 ", "rma_date": "2026-10-22", "rma_note": "คืนคลัง"},
                                    {"claim_id": "28000000-0000-0000-0000-0000000000a1", "pcode": "SESUK", "rma_no": "R2", "rma_date": "2026-10-23"}]'::jsonb);
  assert (select rma_no || '/' || rma_date || '/' || rma_note from public.claim_units where id = 928101) = 'R10000671448/2026-10-22/คืนคลัง', 'update keeps RMA';
  assert (select rma_no from public.claim_units where claim_id = '28000000-0000-0000-0000-0000000000a1' and seq = 2) = 'R2', 'insert keeps RMA';
  -- blank clears
  perform public.save_claim_units('[{"id": 928101, "claim_id": "28000000-0000-0000-0000-0000000000a1", "pcode": "SESUK", "rma_no": "", "rma_date": null}]'::jsonb);
  assert (select rma_no is null and rma_date is null and rma_note is null from public.claim_units where id = 928101), 'blank clears';
end $$;
reset role;
\echo ALL CLAIM RMA TESTS PASSED
rollback;
