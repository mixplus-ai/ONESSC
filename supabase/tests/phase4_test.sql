-- Phase 4 claims tests: numbering, submit, visibility, staff status flow, SN return check, import, perms.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000d0a1', 'cadmin@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000d0b1', 'cstaff@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000d0b2', 'cstaff2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000d0c1', 'cu1@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000d0c2', 'cu2@ssc.test', '{}'),
  ('00000000-0000-0000-0000-00000000d0c3', 'cu3@ssc.test', '{}');
update public.profiles set role = 'admin' where email = 'cadmin@ssc.test';
update public.profiles set role = 'staff' where email in ('cstaff@ssc.test', 'cstaff2@ssc.test');
insert into public.staff_permissions (user_id, perm) values
  ('00000000-0000-0000-0000-00000000d0b1', 'claims.handle'), ('00000000-0000-0000-0000-00000000d0b2', 'claims.handle');
insert into public.companies (id, tax_id, name) values ('40000000-0000-0000-0000-000000000001', '1111111111111', 'Solar Co');
update public.profiles set company_id = '40000000-0000-0000-0000-000000000001', company_status = 'approved', tax_id = '1111111111111'
 where email in ('cu1@ssc.test', 'cu2@ssc.test');

set local role authenticated;

-- customer 1 submits an inverter claim and an optimizer claim
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0c1', true);
do $$
declare
  v record;
  v2 record;
  se uuid := (select id from public.brands where slug = 'solaredge');
begin
  begin
    perform public.submit_claim(jsonb_build_object('product_type', 'inverter', 'contact_name', 'A', 'contact_phone', '081',
      'brand_id', se, 'model', 'SE10K-TH0TEBNN4', 'details', jsonb_build_object('bad_sn', '7E12345')));
    assert false, 'SolarEdge rule requires case_no';
  exception when raise_exception then null;
  end;
  select * into v from public.submit_claim(jsonb_build_object('product_type', 'inverter', 'contact_name', 'A', 'contact_phone', '081',
      'brand_id', se, 'model', 'SE10K-TH0TEBNN4', 'details', jsonb_build_object('bad_sn', '7e12345', 'case_no', 'C-1')));
  assert v.claim_no ~ '^[0-9]{2}-[0-9]{4}$', 'claim no format YY-NNNN';
  assert v.claim_no like lpad(((extract(year from now() at time zone 'Asia/Bangkok')::int) % 100)::text, 2, '0') || '-%', 'YY is CE year';
  select * into v2 from public.submit_claim(jsonb_build_object('product_type', 'optimizer', 'contact_name', 'A', 'contact_phone', '081',
      'details', jsonb_build_object('items', jsonb_build_array(
         jsonb_build_object('model', 'P500', 'qty', 2, 'bad_sn', 'SN1, SN2'),
         jsonb_build_object('model', 'P850', 'qty', 1, 'bad_sn', 'SN3')))));
  assert (split_part(v2.claim_no, '-', 2))::int = (split_part(v.claim_no, '-', 2))::int + 1, 'numbers run on';
  assert (select count(*) from public.claim_brands() where name = 'SolarPPM') = 1, 'unpublished panel brand offered for claims';
  -- customer cannot read tables directly, only via my_claims
  assert (select count(*) from public.claims) = 0, 'no direct read';
  assert (select count(*) from public.claim_units) = 0, 'no direct unit read';
  assert jsonb_array_length(public.my_claims()) = 2, 'my_claims shows both';
  assert (public.my_claims() -> 0) ? 'voucher_no' = false, 'internal fields hidden';
  assert (public.my_claims() -> 0) ? 'internal_note' = false, 'internal note hidden';
  begin
    perform public.import_claims('[{"claim_no":"99-0001"}]'::jsonb);
    assert false, 'customer cannot import';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_claim_status(v.id, 'closed');
    assert false, 'customer cannot set status';
  exception when insufficient_privilege then null;
  end;
end $$;

-- only the customer who submitted sees them: not a same-company colleague, not another customer
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0c2', true);
do $$ begin assert jsonb_array_length(public.my_claims()) = 0, 'company colleague does not see claims'; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0c3', true);
do $$ begin assert jsonb_array_length(public.my_claims()) = 0, 'other customer sees nothing'; end $$;

-- staff: sees all, units were created per item, can take and move status but not edit the board
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0b1', true);
do $$
declare
  c public.claims;
  opt public.claims;
begin
  select * into c from public.claims where product_type = 'inverter';
  select * into opt from public.claims where product_type = 'optimizer';
  assert c.company_id = '40000000-0000-0000-0000-000000000001' and c.company_name = 'Solar Co', 'company linked';
  assert c.reported_sns = '{7E12345}' and c.case_id = 'C-1', 'reported SN + case id';
  assert opt.qty = 3 and (select count(*) from public.claim_units where claim_id = opt.id) = 3, 'one unit per optimizer';
  assert (select array_agg(pcode order by seq) from public.claim_units where claim_id = opt.id) = '{P500,P500,P850}', 'unit pcodes';
  assert opt.reported_sns @> '{SN1,SN2,SN3}', 'optimizer SNs';
  begin
    perform public.save_claim_units(jsonb_build_array(jsonb_build_object('claim_id', c.id, 'pcode', 'X')));
    assert false, 'staff without perm cannot edit board';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_claim_status(c.id, 'in_progress');
    assert false, 'not assigned yet';
  exception when insufficient_privilege then null;
  end;
  perform public.take_claim(c.id);
  perform public.set_claim_status(c.id, 'in_progress', 'กำลังตรวจสอบ');
  begin
    perform public.set_claim_status(c.id, 'done');
    assert false, 'done needs claim doc';
  exception when raise_exception then null;
  end;
  perform public.add_claim_file(c.id, 'claim_doc', c.id || '/claim_doc/doc.pdf', 'doc.pdf', 100, 'application/pdf');
  perform public.set_claim_status(c.id, 'done', 'นำใบเคลมไปรับสินค้าได้');
  assert (select status from public.claims where id = c.id) = 'done', 'done';
  assert (select count(*) from public.claim_events where claim_id = c.id) = 3, 'events: submitted, in_progress, done';
end $$;

-- second staff cannot take a claim someone else holds
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0b2', true);
do $$ begin
  begin
    perform public.take_claim((select id from public.claims where product_type = 'inverter'));
    assert false, 'already taken';
  exception when raise_exception then null;
  end;
end $$;

-- customer returns: wrong SN refused, right SN fills step 3
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0c1', true);
do $$
declare
  cid uuid := ((public.my_claims() -> 1) ->> 'id')::uuid;
  x jsonb;
begin
  select e into x from jsonb_array_elements(public.my_claims()) e where e ->> 'product_type' = 'inverter';
  cid := (x ->> 'id')::uuid;
  assert x ->> 'claim_doc_path' is not null and jsonb_array_length(x -> 'files') = 1, 'customer sees the claim doc';
  assert x ->> 'handler' is not null, 'handler shown';
  begin
    perform public.return_claim(cid, array['7E99999']);
    assert false, 'wrong SN';
  exception when raise_exception then null;
  end;
  begin
    perform public.return_claim(cid, array[]::text[]);
    assert false, 'missing SN';
  exception when raise_exception then null;
  end;
  perform public.return_claim(cid, array[' 7e1-2345 ']);
end $$;

-- closing (ปิดงาน) only by Admin or the assigned staff: staff2 even with perm 'claims' is refused
reset role;
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000d0b2', 'claims');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0b2', true);
do $$ begin
  begin
    perform public.set_claim_status((select id from public.claims where product_type = 'inverter'), 'closed');
    assert false, 'non-assigned staff cannot close';
  exception when insufficient_privilege then null;
  end;
end $$;
-- the assigned staff closes; admin reopens (back to returned) and closes again below
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0b1', true);
do $$
declare cid uuid := (select id from public.claims where product_type = 'inverter');
begin
  perform public.set_claim_status(cid, 'closed');
  assert (select closed_by from public.claims where id = cid) = '00000000-0000-0000-0000-00000000d0b1', 'closed_by = handler';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0b2', true);
do $$ begin
  begin
    perform public.set_claim_status((select id from public.claims where product_type = 'inverter'), 'returned');
    assert false, 'non-assigned staff cannot reopen';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0a1', true);
do $$
declare cid uuid := (select id from public.claims where product_type = 'inverter');
begin
  perform public.set_claim_status(cid, 'returned');
  assert (select closed_by from public.claims where id = cid) is null, 'reopen clears closed_by';
end $$;

-- admin: step 3 filled, closes, imports, numbering after import
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0a1', true);
do $$
declare
  c public.claims;
  res jsonb;
  n text;
begin
  select * into c from public.claims where product_type = 'inverter';
  assert c.status = 'returned', 'returned';
  assert (select ret_sn from public.claim_units where claim_id = c.id and seq = 1) = '7E1-2345', 'step 3 SN filled';
  assert (select ret_date from public.claim_units where claim_id = c.id and seq = 1) = public.bkk_today(), 'step 3 date';
  perform public.set_claim_status(c.id, 'closed');
  assert (select closed_at from public.claims where id = c.id) is not null, 'closed_at set';
  assert (select closed_by from public.claims where id = c.id) = '00000000-0000-0000-0000-00000000d0a1', 'admin closed_by';

  res := public.import_claims(jsonb_build_array(
    jsonb_build_object('claim_no', '25-0123', 'company_name', 'solar co', 'qty', 2, 'model', 'SE5000H', 'status', 'closed',
                       'voucher_date', '2025-03-01',
                       'units', jsonb_build_array(jsonb_build_object('pcode', 'SE5000H', 'iss_sn', 'A1', 'iss_date', '2025-03-02'),
                                                  jsonb_build_object('pcode', 'SE5000H', 'iss_sn', 'A2'))),
    jsonb_build_object('claim_no', '25-0123'),
    jsonb_build_object('claim_no', '', 'qty', 3, 'model', 'P500')), 'import');
  assert jsonb_array_length(res -> 'created') = 2 and res -> 'skipped' = '["25-0123"]', 'import created/skipped';
  assert (select company_id from public.claims where claim_no = '25-0123') = '40000000-0000-0000-0000-000000000001', 'company matched by name';
  assert (select count(*) from public.claim_units where claim_id = (select id from public.claims where claim_no = '25-0123')) = 2, 'imported units';
  assert (select iss_date from public.claim_units u join public.claims c2 on c2.id = u.claim_id where c2.claim_no = '25-0123' and seq = 1) = '2025-03-02', 'unit date';
  -- the counter for 25 moved to 123

  -- bulk unit edit
  perform public.save_claim_units(jsonb_build_array(
    (select to_jsonb(u) || '{"rcv_sn":"R1","rcv_date":"2025-04-01"}'::jsonb from public.claim_units u join public.claims c2 on c2.id = u.claim_id where c2.claim_no = '25-0123' and seq = 1),
    jsonb_build_object('claim_id', (select id from public.claims where claim_no = '25-0123'), 'pcode', 'SE5000H')));
  assert (select count(*) from public.claim_units u join public.claims c2 on c2.id = u.claim_id where c2.claim_no = '25-0123') = 3, 'unit added';
  assert (select rcv_sn from public.claim_units u join public.claims c2 on c2.id = u.claim_id where c2.claim_no = '25-0123' and seq = 1) = 'R1', 'unit updated';
  assert (select max(seq) from public.claim_units u join public.claims c2 on c2.id = u.claim_id where c2.claim_no = '25-0123') = 3, 'seq continues';

  -- assign to a customer refused
  begin
    perform public.assign_claim(c.id, '00000000-0000-0000-0000-00000000d0c1');
    assert false, 'assign to customer';
  exception when raise_exception then null;
  end;
end $$;

-- staff with perm 'claims' can edit the board
reset role;
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-00000000d0b2', 'claims') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d0b2', true);
do $$ begin
  perform public.import_claims('[{"qty":1,"model":"P370"}]'::jsonb);
  update public.claims set internal_note = 'x' where claim_no = '25-0123';
  assert (select internal_note from public.claims where claim_no = '25-0123') = 'x', 'perm staff edits';
end $$;

-- e-mails: nothing while disabled; customer + staff mails when enabled
reset role;
do $$ begin
  assert (select last_no from public.doc_counters where prefix = 'CLAIM' and yy = 25) = 123, 'counter bumped by import';
  assert (select count(*) from public.claim_emails_due()) = 0, 'no mail when disabled';
end $$;
update public.claim_settings set email_enabled = true, staff_notify_emails = 'svc@ssc.test, boss@ssc.test' where id = 1;
do $$
declare n_staff int; n_cust int;
begin
  select count(*) filter (where audience = 'staff'), count(*) filter (where audience = 'customer') into n_staff, n_cust from public.claim_emails_due(500);
  assert n_staff = 4, 'staff mails: 2 customer claims × 2 addresses, got ' || n_staff;
  assert n_cust = 6, 'customer mails: 2 submitted + in_progress + done + closed twice (staff, then admin after reopen; returned not mailed), got ' || n_cust;
  perform public.record_claim_email(e.event_id, e.to_email, e.audience) from public.claim_emails_due(500) e;
  assert (select count(*) from public.claim_emails_due(500)) = 0, 'sent mails not repeated';
end $$;

rollback;
\echo ALL PHASE 4 TESTS PASSED
