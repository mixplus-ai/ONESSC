-- Claim shipping fee: when the customer asks us to ship, the company pays the courier first,
-- staff record the fee + courier receipt, the customer transfers and attaches the slip, staff confirm.
--   claims.ship_status: null (no fee) → unpaid → slip (slip attached, waiting check) → paid | rejected (slip not ok, attach again)

alter table public.claims
  add column if not exists ship_fee numeric(12,2) check (ship_fee is null or ship_fee >= 0),
  add column if not exists ship_carrier text check (char_length(ship_carrier) <= 100),
  add column if not exists ship_tracking text check (char_length(ship_tracking) <= 100),
  add column if not exists ship_status text check (ship_status in ('unpaid', 'slip', 'paid', 'rejected')),
  add column if not exists ship_receipt_path text,
  add column if not exists ship_slip_path text,
  add column if not exists ship_note text check (char_length(ship_note) <= 500),
  add column if not exists ship_set_at timestamptz,
  add column if not exists ship_slip_at timestamptz,
  add column if not exists ship_paid_at timestamptz,
  add column if not exists ship_checked_by uuid references public.profiles (id) on delete set null;
create index if not exists claims_ship_status_idx on public.claims (ship_status) where ship_status is not null;
create index if not exists claims_ship_checked_by_idx on public.claims (ship_checked_by);

-- where the customer transfers the shipping fee (shown on the claim page)
alter table public.claim_settings add column if not exists ship_bank_info text check (char_length(ship_bank_info) <= 500);

alter table public.claim_files drop constraint if exists claim_files_kind_check;
alter table public.claim_files add constraint claim_files_kind_check
  check (kind in ('customer', 'receive', 'issue', 'claim_doc', 'other', 'ship_receipt', 'ship_slip'));

-- staff may upload the courier receipt; the customer may upload a slip while the fee is unpaid / slip rejected
create or replace function public.claim_file_writable(p_path text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_claim uuid;
  v_kind text := split_part(p_path, '/', 2);
begin
  begin
    v_claim := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  if public.has_perm('claims') then return true; end if;
  if public.is_staff_or_admin() then
    return public.can_handle_claim(v_claim) and v_kind in ('claim_doc', 'receive', 'issue', 'other', 'ship_receipt');
  end if;
  return (v_kind = 'customer'
          and exists (select 1 from public.claims c
                       where c.id = v_claim and c.user_id = auth.uid() and c.status in ('submitted', 'in_progress')))
      or (v_kind = 'ship_slip'
          and exists (select 1 from public.claims c
                       where c.id = v_claim and c.user_id = auth.uid() and c.ship_status in ('unpaid', 'rejected')));
end $$;

create or replace function public.claim_file_readable(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_staff_or_admin()
      or exists (select 1 from public.claim_files f
                  where f.path = p_path and f.kind in ('customer', 'claim_doc', 'ship_receipt', 'ship_slip')
                    and public.can_see_claim(f.claim_id))
$$;

create or replace function public.add_claim_file(p_claim uuid, p_kind text, p_path text, p_name text, p_size bigint, p_type text)
returns public.claim_files
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.claim_files;
begin
  if split_part(p_path, '/', 1) <> p_claim::text or split_part(p_path, '/', 2) <> p_kind then
    raise exception 'path ไม่ถูกต้อง';
  end if;
  if not public.claim_file_writable(p_path) then
    raise exception 'ไม่มีสิทธิ์แนบไฟล์ในเคลมนี้' using errcode = '42501';
  end if;
  insert into public.claim_files (claim_id, kind, path, file_name, size_bytes, content_type, uploaded_by)
  values (p_claim, p_kind, p_path, left(p_name, 300), p_size, left(p_type, 120), auth.uid())
  returning * into v_row;
  if p_kind = 'claim_doc' then
    update public.claims set claim_doc_path = p_path where claims.id = p_claim;
  elsif p_kind = 'ship_receipt' then
    update public.claims set ship_receipt_path = p_path where claims.id = p_claim;
  elsif p_kind = 'ship_slip' then
    update public.claims set ship_slip_path = p_path, ship_status = 'slip', ship_slip_at = now() where claims.id = p_claim;
  end if;
  return v_row;
end $$;

-- staff record / change the fee (does not undo a confirmed payment)
create or replace function public.set_claim_shipping(p_claim uuid, p_fee numeric, p_carrier text, p_tracking text)
returns public.claims language plpgsql security definer set search_path = ''
as $$
declare v public.claims;
begin
  if not public.can_handle_claim(p_claim) then
    raise exception 'รับเรื่องก่อนจึงจะบันทึกค่าส่งได้' using errcode = '42501';
  end if;
  if p_fee is not null and p_fee < 0 then
    raise exception 'ค่าส่งต้องไม่ติดลบ';
  end if;
  update public.claims c
     set ship_fee = case when c.ship_status = 'paid' then c.ship_fee else nullif(p_fee, 0) end,
         ship_carrier = nullif(trim(coalesce(p_carrier, '')), ''),
         ship_tracking = nullif(trim(coalesce(p_tracking, '')), ''),
         ship_status = case when c.ship_status in ('slip', 'paid') then c.ship_status
                            when coalesce(p_fee, 0) > 0 then coalesce(nullif(c.ship_status, 'rejected'), 'unpaid')
                            else null end,
         ship_set_at = coalesce(c.ship_set_at, now())
   where c.id = p_claim
  returning * into v;
  if not found then
    raise exception 'ไม่พบเคลม';
  end if;
  return v;
end $$;

-- staff check the slip
create or replace function public.decide_ship_slip(p_claim uuid, p_ok boolean, p_note text default null)
returns public.claims language plpgsql security definer set search_path = ''
as $$
declare v public.claims;
begin
  if not public.can_handle_claim(p_claim) then
    raise exception 'รับเรื่องก่อนจึงจะตรวจสลิปได้' using errcode = '42501';
  end if;
  if not p_ok and coalesce(trim(p_note), '') = '' then
    raise exception 'กรุณาระบุเหตุผลที่สลิปไม่ถูกต้อง';
  end if;
  update public.claims c
     set ship_status = case when p_ok then 'paid' else 'rejected' end,
         ship_paid_at = case when p_ok then now() end,
         ship_checked_by = auth.uid(),
         ship_note = case when p_ok then null else left(trim(p_note), 500) end
   where c.id = p_claim and c.ship_status = 'slip'
  returning * into v;
  if not found then
    raise exception 'ไม่มีสลิปรอตรวจในเคลมนี้';
  end if;
  return v;
end $$;

revoke execute on function public.set_claim_shipping(uuid, numeric, text, text) from public, anon;
revoke execute on function public.decide_ship_slip(uuid, boolean, text) from public, anon;
grant execute on function public.set_claim_shipping(uuid, numeric, text, text) to authenticated;
grant execute on function public.decide_ship_slip(uuid, boolean, text) to authenticated;

-- customer view: shipping fee fields + receipt / slip files
create or replace function public.my_claims()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id, 'claim_no', c.claim_no, 'legacy_ref', c.legacy_ref, 'status', c.status,
      'product_type', c.product_type, 'model', c.model, 'brand', b.name, 'qty', c.qty,
      'company_name', c.company_name, 'contact_name', c.contact_name, 'contact_phone', c.contact_phone,
      'installer_name', c.installer_name, 'site_name', c.site_name, 'symptom', c.symptom,
      'details', c.details, 'reported_sns', c.reported_sns, 'returned_sns', c.returned_sns,
      'delivery_type', c.delivery_type, 'delivery_address', c.delivery_address,
      'case_id', c.case_id, 'customer_note', c.customer_note, 'claim_doc_path', c.claim_doc_path,
      'returned_at', c.returned_at, 'closed_at', c.closed_at, 'created_at', c.created_at, 'updated_at', c.updated_at,
      'ship_fee', c.ship_fee, 'ship_carrier', c.ship_carrier, 'ship_tracking', c.ship_tracking, 'ship_status', c.ship_status,
      'ship_receipt_path', c.ship_receipt_path, 'ship_slip_path', c.ship_slip_path, 'ship_note', c.ship_note,
      'ship_slip_at', c.ship_slip_at, 'ship_paid_at', c.ship_paid_at,
      'mine', c.user_id = auth.uid(),
      'handler', (select coalesce(p.full_name, 'เจ้าหน้าที่') from public.profiles p where p.id = c.assigned_to),
      'closed_by', (select coalesce(p.full_name, 'เจ้าหน้าที่') from public.profiles p where p.id = c.closed_by),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'path', f.path, 'file_name', f.file_name, 'created_at', f.created_at) order by f.created_at), '[]'::jsonb)
                  from public.claim_files f where f.claim_id = c.id and f.kind in ('customer', 'claim_doc', 'ship_receipt', 'ship_slip')),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                   from public.claim_events e where e.claim_id = c.id)
    ) as x
    from public.claims c
    left join public.brands b on b.id = c.brand_id
    where c.user_id = auth.uid()
  ) s
$$;
revoke execute on function public.my_claims() from public, anon;
grant execute on function public.my_claims() to authenticated;
