-- One App SSC · Staff can ask to correct an SN at claim step 3 (owner 2026-11-17).
-- Until now only the customer could ask (My Claims), and only on claims they sent online with reported SNs.
-- Imported claims have no customer account and no reported SNs, so the request never appeared.
-- Now staff handling a claim can ask too, on any SN the claim holds: reported SNs, a unit's reported SN,
-- or board column Q "SN คืน". The person handling the claim confirms it; staff cannot confirm their own
-- request (Admin can).

alter table public.claim_sn_changes add column if not exists by_staff boolean not null default false;

-- the claim's stored spelling of an SN (reported list, unit reported SN, or step-3 returned SN), null if absent
create or replace function public.claim_sn_known(p_claim uuid, p_sn text)
returns text
language sql stable set search_path = ''
as $$
  select x.s from (
    select s, 1 as o from public.claims c, unnest(c.reported_sns) s where c.id = p_claim
    union all select u.reported_sn, 2 from public.claim_units u where u.claim_id = p_claim and u.reported_sn is not null
    union all select u.ret_sn, 3 from public.claim_units u where u.claim_id = p_claim and u.ret_sn is not null
  ) x
  where public.sn_key(x.s) = public.sn_key(p_sn)
  order by x.o
  limit 1
$$;
revoke execute on function public.claim_sn_known(uuid, text) from public, anon, authenticated;

-- staff: ask to correct an SN on a claim they handle
create or replace function public.staff_request_sn_change(p_claim uuid, p_old text, p_new text, p_reason text, p_note text default null)
returns public.claim_sn_changes
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
  v_r public.claim_sn_changes;
begin
  select * into v_c from public.claims c where c.id = p_claim;
  if v_c.id is null then raise exception 'ไม่พบเคลมนี้'; end if;
  if not public.can_handle_claim(p_claim) then
    raise exception 'ขอแก้ SN ได้เฉพาะผู้รับผิดชอบเคลมนี้ หรือผู้มีสิทธิ์งานเคลม' using errcode = '42501';
  end if;
  if v_c.status not in ('submitted', 'in_progress', 'done') then
    raise exception 'เคลมนี้ส่งของคืนหรือปิดงานแล้ว แก้ SN ไม่ได้';
  end if;
  if public.sn_key(p_new) is null then raise exception 'กรุณากรอก SN ที่ถูกต้อง'; end if;
  if trim(p_new) !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$' then raise exception 'SN ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ - _ . /'; end if;
  if p_reason not in ('typo', 'wrong_unit', 'wrong_product', 'other') then raise exception 'กรุณาเลือกสาเหตุ'; end if;
  if p_reason = 'other' and coalesce(trim(p_note), '') = '' then raise exception 'กรุณาระบุสาเหตุ'; end if;
  if public.claim_sn_known(p_claim, p_old) is null then raise exception 'ไม่พบ SN % ในเคลมนี้', p_old; end if;
  if public.sn_key(p_new) = public.sn_key(p_old) then raise exception 'SN ใหม่เหมือนกับ SN เดิม'; end if;
  if public.claim_sn_known(p_claim, p_new) is not null then raise exception 'SN % มีอยู่ในเคลมนี้แล้ว', p_new; end if;
  if exists (select 1 from public.claim_sn_changes r where r.claim_id = p_claim and r.status = 'pending' and public.sn_key(r.old_sn) = public.sn_key(p_old)) then
    raise exception 'SN นี้มีคำขอแก้ไขที่รอยืนยันอยู่แล้ว';
  end if;
  insert into public.claim_sn_changes (claim_id, user_id, old_sn, new_sn, reason, note, by_staff)
  values (p_claim, auth.uid(), upper(trim(p_old)), upper(trim(p_new)), p_reason, nullif(trim(p_note), ''), true)
  returning * into v_r;
  return v_r;
end $$;

-- staff: withdraw their own pending request
create or replace function public.staff_cancel_sn_change(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.claim_sn_changes r
   where r.id = p_id and r.status = 'pending' and r.by_staff
     and (r.user_id = auth.uid() or public.is_admin());
  if not found then raise exception 'ไม่พบคำขอที่ยกเลิกได้'; end if;
end $$;

-- confirm / reject. Same as migration 20, plus: SNs held only on units (imported claims) can be changed,
-- the unit's reported SN is updated too, and a staff request needs a second person (or Admin).
create or replace function public.decide_sn_change(p_id uuid, p_approve boolean, p_note text default null)
returns public.claim_sn_changes
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.claim_sn_changes;
  v_c public.claims;
  v_old text;
  v_pat text;
begin
  select * into v_r from public.claim_sn_changes r where r.id = p_id for update;
  if v_r.id is null then raise exception 'ไม่พบคำขอ'; end if;
  if not public.can_handle_claim(v_r.claim_id) then
    raise exception 'อนุมัติได้เฉพาะผู้รับผิดชอบเคลมนี้ หรือผู้มีสิทธิ์งานเคลม' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then raise exception 'คำขอนี้ตัดสินไปแล้ว'; end if;
  if v_r.by_staff and v_r.user_id = auth.uid() and not public.is_admin() then
    raise exception 'คำขอนี้คุณเป็นคนส่ง ต้องให้ผู้รับผิดชอบคนอื่นหรือแอดมินยืนยัน' using errcode = '42501';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception '%', case when v_r.by_staff then 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' else 'กรุณาระบุเหตุผลที่ไม่อนุมัติถึงลูกค้า' end;
  end if;

  if p_approve then
    select * into v_c from public.claims c where c.id = v_r.claim_id for update;
    if v_c.status not in ('submitted', 'in_progress', 'done') then
      raise exception 'เคลมนี้ส่งของคืนหรือปิดงานแล้ว';
    end if;
    v_old := public.claim_sn_known(v_c.id, v_r.old_sn);
    if v_old is null then raise exception 'SN % ไม่อยู่ในเคลมนี้แล้ว', v_r.old_sn; end if;
    -- the SN as a whole word inside free text (bad_sn may hold several, separated by , or new lines)
    v_pat := '(^|[^A-Za-z0-9])' || regexp_replace(v_old, '([^A-Za-z0-9])', '\\\1', 'g') || '($|[^A-Za-z0-9])';

    update public.claims c
       set reported_sns = coalesce((select array_agg(case when public.sn_key(s) = public.sn_key(v_old) then v_r.new_sn else s end order by o)
                                      from unnest(c.reported_sns) with ordinality as t(s, o)), '{}'),
           details = coalesce((
             select regexp_replace(c.details::text, v_pat, '\1' || v_r.new_sn || '\2', 'gi')::jsonb
           ), c.details)
     where c.id = v_c.id;

    update public.claim_units u
       set ret_sn = case when public.sn_key(u.ret_sn) = public.sn_key(v_old) then v_r.new_sn else u.ret_sn end,
           reported_sn = case when public.sn_key(u.reported_sn) = public.sn_key(v_old) then v_r.new_sn else u.reported_sn end,
           updated_by = auth.uid()
     where u.claim_id = v_c.id
       and (public.sn_key(u.ret_sn) = public.sn_key(v_old) or public.sn_key(u.reported_sn) = public.sn_key(v_old));
  end if;

  update public.claim_sn_changes r
     set status = case when p_approve then 'approved' else 'rejected' end,
         staff_note = nullif(trim(p_note), ''), decided_by = auth.uid(), decided_at = now()
   where r.id = p_id
  returning * into v_r;
  return v_r;
end $$;

revoke execute on function public.staff_request_sn_change(uuid, text, text, text, text) from public, anon;
revoke execute on function public.staff_cancel_sn_change(uuid) from public, anon;
grant execute on function public.staff_request_sn_change(uuid, text, text, text, text) to authenticated;
grant execute on function public.staff_cancel_sn_change(uuid) to authenticated;
