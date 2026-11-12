-- Migration 28: RMA from the manufacturer on each claimed unit (step 4) + Replenishment Request report header.
--   claim_units.rma_no    RMA number (free text: several numbers may be comma-separated)
--   claim_units.rma_date  date the RMA number was issued
--   claim_units.rma_note  remark on the Replenishment Request (e.g. คืนคลัง / LRP / รอเบิกใหม่)
--   claim_settings.rma_header  header block of the Replenishment Request report
-- Staff with the 'claims' permission key these in through save_claim_units (same rule as the other step columns).

alter table public.claim_units
  add column if not exists rma_no text,
  add column if not exists rma_date date,
  add column if not exists rma_note text;
create index if not exists claim_units_rma_date_idx on public.claim_units (rma_date) where rma_date is not null;

alter table public.claim_settings
  add column if not exists rma_header jsonb not null default jsonb_build_object(
    'customer_name', 'Siam Solar Cell Co.,Ltd.',
    'country', 'Thailand',
    'ship_address', '1999/24 District Sriwara , Soi Ladprao 94 (Panjamit) , Plubpla, Wang Thong Lang, Bangkok , Thailand 10310',
    'bill_company', 'Siam Solar Cell Co.,Ltd.',
    'bill_address', '1999/24 District Sriwara , Soi Ladprao 94 (Panjamit) , Plubpla, Wang Thong Lang, Bangkok , Thailand 10310'
  );

-- p_units: [{id?, claim_id, pcode, iss_doc, iss_date, ..., rma_no, rma_date, rma_note}] · rows with id are updated (all fields), rows without are added
create or replace function public.save_claim_units(p_units jsonb, p_delete bigint[] default '{}')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_u jsonb;
  r public.claim_units;
  v_n int := 0;
begin
  if not public.has_perm('claims') then raise exception 'ไม่มีสิทธิ์แก้ผัง 5 ขั้น' using errcode = '42501'; end if;
  if cardinality(coalesce(p_delete, '{}')) > 0 then
    delete from public.claim_units u where u.id = any (p_delete);
  end if;
  for v_u in select * from jsonb_array_elements(coalesce(p_units, '[]'::jsonb)) loop
    r := jsonb_populate_record(null::public.claim_units, v_u);
    if (v_u ->> 'id') is not null then
      update public.claim_units u set
        pcode = nullif(trim(r.pcode), ''), iss_doc = nullif(trim(r.iss_doc), ''), iss_date = r.iss_date, iss_sn = nullif(trim(r.iss_sn), ''),
        ret_pcode = nullif(trim(r.ret_pcode), ''), ret_doc = nullif(trim(r.ret_doc), ''), ret_date = r.ret_date,
        ret_sn = nullif(trim(r.ret_sn), ''), ret_note = nullif(trim(r.ret_note), ''),
        rcv_pcode = nullif(trim(r.rcv_pcode), ''), rcv_doc = nullif(trim(r.rcv_doc), ''), rcv_date = r.rcv_date, rcv_sn = nullif(trim(r.rcv_sn), ''),
        rma_no = nullif(trim(r.rma_no), ''), rma_date = r.rma_date, rma_note = nullif(trim(r.rma_note), ''),
        ok_pcode = nullif(trim(r.ok_pcode), ''), ok_doc = nullif(trim(r.ok_doc), ''), ok_date = r.ok_date, ok_sn = nullif(trim(r.ok_sn), ''),
        updated_by = auth.uid()
      where u.id = r.id;
    else
      if r.claim_id is null then raise exception 'claim_id ว่าง'; end if;
      insert into public.claim_units (claim_id, seq, pcode, iss_doc, iss_date, iss_sn, ret_pcode, ret_doc, ret_date, ret_sn, ret_note,
                                      rcv_pcode, rcv_doc, rcv_date, rcv_sn, rma_no, rma_date, rma_note, ok_pcode, ok_doc, ok_date, ok_sn, updated_by)
      values (r.claim_id, coalesce((select max(u.seq) from public.claim_units u where u.claim_id = r.claim_id), 0) + 1,
              nullif(trim(r.pcode), ''), nullif(trim(r.iss_doc), ''), r.iss_date, nullif(trim(r.iss_sn), ''),
              nullif(trim(r.ret_pcode), ''), nullif(trim(r.ret_doc), ''), r.ret_date, nullif(trim(r.ret_sn), ''), nullif(trim(r.ret_note), ''),
              nullif(trim(r.rcv_pcode), ''), nullif(trim(r.rcv_doc), ''), r.rcv_date, nullif(trim(r.rcv_sn), ''),
              nullif(trim(r.rma_no), ''), r.rma_date, nullif(trim(r.rma_note), ''),
              nullif(trim(r.ok_pcode), ''), nullif(trim(r.ok_doc), ''), r.ok_date, nullif(trim(r.ok_sn), ''), auth.uid());
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.save_claim_units(jsonb, bigint[]) from public, anon;
grant execute on function public.save_claim_units(jsonb, bigint[]) to authenticated, service_role;
