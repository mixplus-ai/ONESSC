-- One App SSC · Staff can change a claim number (owner 2026-11-19).
-- Before, only staff with the full board permission (claims) could, through "แก้ไขใบเคลม".
-- Now the person handling the claim (assignee) or staff with claims.handle can too, through this RPC.
-- The change is kept in the audit log (audit_claims) and as a line in the claim's internal note.

create or replace function public.set_claim_no(p_claim uuid, p_no text, p_reason text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
  v_no text := upper(trim(coalesce(p_no, '')));
begin
  select * into v_c from public.claims c where c.id = p_claim for update;
  if v_c.id is null then raise exception 'ไม่พบเคลมนี้'; end if;
  if not (public.can_handle_claim(p_claim) or public.has_perm('claims.handle')) then
    raise exception 'แก้เลขเคลมได้เฉพาะผู้รับผิดชอบเคลม หรือผู้มีสิทธิ์งานเคลม' using errcode = '42501';
  end if;
  if v_no = '' then raise exception 'กรุณากรอกเลขเคลม'; end if;
  if v_no !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
    raise exception 'เลขเคลมใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ - _ . / (ไม่เกิน 40 ตัว) เช่น 26-0123';
  end if;
  if v_no = v_c.claim_no then return v_no; end if;
  if exists (select 1 from public.claims c where upper(c.claim_no) = v_no and c.id <> p_claim) then
    raise exception 'เลขเคลม % มีอยู่แล้ว', v_no;
  end if;
  update public.claims c
     set claim_no = v_no,
         internal_note = concat_ws(E'\n', nullif(c.internal_note, ''),
           'เปลี่ยนเลขเคลม ' || v_c.claim_no || ' → ' || v_no || ' ' || to_char(now() at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI')
           || coalesce(' · ' || nullif(trim(p_reason), ''), ''))
   where c.id = p_claim;
  return v_no;
end $$;

revoke execute on function public.set_claim_no(uuid, text, text) from public, anon;
grant execute on function public.set_claim_no(uuid, text, text) to authenticated;
