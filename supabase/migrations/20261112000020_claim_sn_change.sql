-- One App SSC · customer asks to correct a reported SN (owner 2026-11-12).
-- At step 3 the returned SN must equal the reported one. If the customer typed it wrong, entered the
-- wrong unit or reported the wrong product, they send a correction request with a reason; staff who
-- handle the claim approve or reject it. On approval the new SN replaces the old one everywhere the
-- claim keeps it (reported_sns, details bad_sn, board column Q "SN คืน"), so step 3 then checks the
-- new SN. Every request stays as history.

create table public.claim_sn_changes (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references public.claims (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  old_sn      text not null,
  new_sn      text not null,
  reason      text not null check (reason in ('typo', 'wrong_unit', 'wrong_product', 'other')),
  note        text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  staff_note  text,
  decided_by  uuid references auth.users (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index claim_sn_changes_claim_idx on public.claim_sn_changes (claim_id, created_at);
create unique index claim_sn_changes_one_pending on public.claim_sn_changes (claim_id, public.sn_key(old_sn)) where status = 'pending';

alter table public.claim_sn_changes enable row level security;
-- staff read; customers use the RPCs below; all writes go through the RPCs
create policy claim_sn_changes_select on public.claim_sn_changes for select to authenticated using ((select public.is_staff_or_admin()));

create trigger audit_claim_sn_changes after insert or update or delete on public.claim_sn_changes
  for each row execute function public.audit_row();

-- customer: request a correction on one of their own claims
create or replace function public.request_sn_change(p_claim uuid, p_old text, p_new text, p_reason text, p_note text default null)
returns public.claim_sn_changes
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
  v_r public.claim_sn_changes;
begin
  select * into v_c from public.claims c where c.id = p_claim;
  if v_c.id is null or v_c.user_id is distinct from auth.uid() then raise exception 'ไม่พบเคลมนี้'; end if;
  if v_c.status not in ('submitted', 'in_progress', 'done') then
    raise exception 'เคลมนี้ส่งของคืนหรือปิดงานแล้ว แก้ SN ไม่ได้ กรุณาติดต่อเจ้าหน้าที่';
  end if;
  if public.sn_key(p_new) is null then raise exception 'กรุณากรอก SN ที่ถูกต้อง'; end if;
  if trim(p_new) !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$' then raise exception 'SN ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ - _ . /'; end if;
  if p_reason not in ('typo', 'wrong_unit', 'wrong_product', 'other') then raise exception 'กรุณาเลือกสาเหตุ'; end if;
  if p_reason = 'other' and coalesce(trim(p_note), '') = '' then raise exception 'กรุณาระบุสาเหตุ'; end if;
  if not exists (select 1 from unnest(v_c.reported_sns) s where public.sn_key(s) = public.sn_key(p_old)) then
    raise exception 'ไม่พบ SN % ในเคลมนี้', p_old;
  end if;
  if public.sn_key(p_new) = public.sn_key(p_old) then raise exception 'SN ใหม่เหมือนกับ SN เดิม'; end if;
  if exists (select 1 from unnest(v_c.reported_sns) s where public.sn_key(s) = public.sn_key(p_new)) then
    raise exception 'SN % มีอยู่ในเคลมนี้แล้ว', p_new;
  end if;
  if exists (select 1 from public.claim_sn_changes r where r.claim_id = p_claim and r.status = 'pending' and public.sn_key(r.old_sn) = public.sn_key(p_old)) then
    raise exception 'SN นี้มีคำขอแก้ไขที่รออนุมัติอยู่แล้ว';
  end if;
  insert into public.claim_sn_changes (claim_id, user_id, old_sn, new_sn, reason, note)
  values (p_claim, auth.uid(), upper(trim(p_old)), upper(trim(p_new)), p_reason, nullif(trim(p_note), ''))
  returning * into v_r;
  return v_r;
end $$;

-- customer: cancel their own pending request
create or replace function public.cancel_sn_change(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.claim_sn_changes r where r.id = p_id and r.user_id = auth.uid() and r.status = 'pending';
  if not found then raise exception 'ไม่พบคำขอที่ยกเลิกได้'; end if;
end $$;

-- customer: their own requests (all claims)
create or replace function public.my_sn_changes()
returns setof public.claim_sn_changes
language sql stable security definer set search_path = ''
as $$
  select r.* from public.claim_sn_changes r
    join public.claims c on c.id = r.claim_id
   where c.user_id = auth.uid()
   order by r.created_at
$$;

-- staff handling the claim: approve (apply everywhere) or reject (reason required)
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
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'กรุณาระบุเหตุผลที่ไม่อนุมัติถึงลูกค้า'; end if;

  if p_approve then
    select * into v_c from public.claims c where c.id = v_r.claim_id for update;
    if v_c.status not in ('submitted', 'in_progress', 'done') then
      raise exception 'เคลมนี้ส่งของคืนหรือปิดงานแล้ว';
    end if;
    v_old := (select s from unnest(v_c.reported_sns) s where public.sn_key(s) = public.sn_key(v_r.old_sn) limit 1);
    if v_old is null then raise exception 'SN % ไม่อยู่ในเคลมนี้แล้ว', v_r.old_sn; end if;
    -- the SN as a whole word inside free text (bad_sn may hold several, separated by , or new lines)
    v_pat := '(^|[^A-Za-z0-9])' || regexp_replace(v_old, '([^A-Za-z0-9])', '\\\1', 'g') || '($|[^A-Za-z0-9])';

    update public.claims c
       set reported_sns = (select array_agg(case when public.sn_key(s) = public.sn_key(v_old) then v_r.new_sn else s end order by o)
                             from unnest(c.reported_sns) with ordinality as t(s, o)),
           details = coalesce((
             select regexp_replace(c.details::text, v_pat, '\1' || v_r.new_sn || '\2', 'gi')::jsonb
           ), c.details)
     where c.id = v_c.id;

    update public.claim_units u
       set ret_sn = v_r.new_sn, updated_by = auth.uid()
     where u.claim_id = v_c.id and public.sn_key(u.ret_sn) = public.sn_key(v_old);
  end if;

  update public.claim_sn_changes r
     set status = case when p_approve then 'approved' else 'rejected' end,
         staff_note = nullif(trim(p_note), ''), decided_by = auth.uid(), decided_at = now()
   where r.id = p_id
  returning * into v_r;
  return v_r;
end $$;

revoke execute on function public.request_sn_change(uuid, text, text, text, text) from public, anon;
revoke execute on function public.cancel_sn_change(uuid) from public, anon;
revoke execute on function public.my_sn_changes() from public, anon;
revoke execute on function public.decide_sn_change(uuid, boolean, text) from public, anon;
grant execute on function public.request_sn_change(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_sn_change(uuid) to authenticated;
grant execute on function public.my_sn_changes() to authenticated;
grant execute on function public.decide_sn_change(uuid, boolean, text) to authenticated;
