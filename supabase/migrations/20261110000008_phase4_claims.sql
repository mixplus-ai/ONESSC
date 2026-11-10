-- One App SSC · Phase 4: service & warranty claims (งานบริการและเคลม)
--
-- Replaces ssccare.netlify.app (internal 5-step tracker, Apps Script + Sheet) and the public
-- Apps Script "Warranty Claim" form.
--
--   claims       one row per claim (เลขเคลม YY-NNNN, ค.ศ. 2 หลัก เหมือนระบบเดิม เช่น 26-0001)
--                = sheet columns B–J (header) + the customer form + the status the customer sees
--   claim_units  one row per product unit = sheet columns A and K–Z (steps 2–5)
--   claim_files  photos / attachments / the claim document the customer downloads (bucket claim-files)
--   claim_events status timeline (what the customer sees + what triggers e-mails)
--
-- Who does what
--   User   submits a claim (submit_claim), sees own + own company's claims (my_claims),
--          sends the old unit back by typing its SN (return_claim). Never reads the tables directly,
--          so internal fields (voucher no., MAC5 issue docs, internal note, steps 2–5) stay hidden.
--   Staff  sees everything, takes a claim (take_claim) and, on claims assigned to them,
--          changes the customer status and uploads the claim document (set_claim_status).
--   Admin / Staff with perm 'claims'  edit the 5-step board, assign, import, settings.
--
-- Customer steps → internal board
--   1 submitted  "กรอกแบบฟอร์มแล้ว"          → creates the claim + one unit per item (step 1)
--   2 in_progress → done (claim doc uploaded) → internal step 2 is the replacement issue
--   3 returned   customer types the old SN(s) → fills step 3 "SN คืน" automatically
--     closed     staff confirm they received everything back
--   rejected     not approved / cancelled (with a note to the customer)

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------
insert into public.permission_keys (key, label, description, sort) values
  ('claims', 'งานเคลม (แก้ผัง 5 ขั้น)', 'เปิดใบเคลม แก้ผัง 5 ขั้นภายใน มอบหมายผู้รับผิดชอบ นำเข้าข้อมูล และตั้งค่าเคลม', 50)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Settings, models and per-brand rules (Admin edits; replaces the hard-coded form lists)
-- ---------------------------------------------------------------------------
create table public.claim_settings (
  id                  int primary key default 1 check (id = 1),
  email_enabled       boolean not null default false,
  email_from          text check (email_from is null or email_from ~ '^[^@<>\s]+@[^@<>\s]+$'),
  email_from_name     text not null default 'SSC Service',
  staff_notify_emails text,     -- comma-separated: who gets "มีเคลมใหม่" e-mails
  pickup_label        text not null default 'รับเองที่คลังปทุมธานี',
  shipping_label      text not null default 'จัดส่ง (มีค่าใช้จ่าย)',
  form_note           text,     -- shown on top of the claim form
  email_note          text,     -- extra text at the bottom of every claim e-mail
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null
);
insert into public.claim_settings (id) values (1) on conflict (id) do nothing;

create table public.claim_models (
  id            uuid primary key default gen_random_uuid(),
  product_type  text not null check (product_type in ('inverter', 'optimizer', 'accessory', 'panel', 'battery', 'other')),
  brand_id      uuid references public.brands (id) on delete cascade,
  model         text not null check (length(trim(model)) > 0),
  note          text,
  sort          int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index claim_models_uniq on public.claim_models (product_type, coalesce(brand_id::text, ''), lower(model));

create table public.claim_brand_rules (
  brand_id        uuid primary key references public.brands (id) on delete cascade,
  enabled         boolean not null default true,
  warranty_text   text,          -- e.g. "Inverter 12 ปี · Optimizer 25 ปี"
  terms           text,          -- conditions shown on the form
  required_docs   text,          -- what to attach, shown on the form
  require_fields  text[] not null default '{}'
                  check (require_fields <@ array['installer_name', 'site_name', 'case_no', 'attachment', 'manager_sn', 'ref_inv_sn']::text[]),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------
create table public.claims (
  id               uuid primary key default gen_random_uuid(),
  claim_no         text not null unique check (length(trim(claim_no)) between 1 and 40),
  legacy_ref       text,          -- old public-form case ID (CLM-…) or any other reference
  source           text not null default 'staff' check (source in ('customer', 'staff', 'import')),
  user_id          uuid references public.profiles (id) on delete set null,   -- customer who submitted
  company_id       uuid references public.companies (id) on delete set null,
  company_name     text,          -- G ชื่อบริษัท (as typed / from the old sheet)
  brand_id         uuid references public.brands (id) on delete set null,
  product_type     text check (product_type in ('inverter', 'optimizer', 'accessory', 'panel', 'battery', 'other')),
  model            text,          -- summary for lists
  -- customer form
  contact_name     text,
  contact_phone    text,
  contact_email    text,
  installer_name   text,
  site_name        text,
  details          jsonb not null default '{}'::jsonb,  -- product-type specific answers (see submit_claim)
  symptom          text check (length(symptom) <= 5000),
  reported_sns     text[] not null default '{}',        -- bad SN(s) the customer reported; step 3 must match
  delivery_type    text not null default 'pickup' check (delivery_type in ('pickup', 'shipping')),
  delivery_address text check (length(delivery_address) <= 1000),
  -- step 1 header (sheet B–J)
  voucher_no       text,          -- B เลขใบสำคัญ
  voucher_date     date,          -- C วันที่ใบสำคัญ
  case_id          text,          -- D Case ID (SolarEdge)
  site_id          text,          -- E SiteID
  pickup_on        text,          -- H วันนัดรับ
  sales_code       text,          -- I รหัสเซลล์
  qty              int not null default 1 check (qty between 1 and 1000),   -- J จำนวน
  -- what the customer sees
  status           text not null default 'submitted'
                   check (status in ('submitted', 'in_progress', 'done', 'returned', 'closed', 'rejected')),
  assigned_to      uuid references public.profiles (id) on delete set null,
  assigned_at      timestamptz,
  claim_doc_path   text,          -- ใบเคลมสินค้า in claim-files, downloadable by the customer
  customer_note    text check (length(customer_note) <= 2000),
  returned_sns     text[],
  returned_at      timestamptz,
  closed_at        timestamptz,
  internal_note    text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null
);
create index claims_user_idx on public.claims (user_id);
create index claims_company_idx on public.claims (company_id);
create index claims_status_idx on public.claims (status);
create index claims_assigned_idx on public.claims (assigned_to);
create index claims_created_idx on public.claims (created_at desc);

create table public.claim_units (
  id          bigint generated always as identity primary key,
  claim_id    uuid not null references public.claims (id) on delete cascade,
  seq         int not null check (seq >= 1),
  pcode       text,   -- A  รหัสสินค้า
  iss_doc     text,   -- K  step 2 เลขที่เบิก MAC5   (SSC → ลูกค้า)
  iss_date    date,   -- L
  iss_sn      text,   -- M  SN เบิก
  ret_pcode   text,   -- N  step 3 (ลูกค้า → SSC คืนของเสีย)
  ret_doc     text,   -- O
  ret_date    date,   -- P
  ret_sn      text,   -- Q  SN คืน
  ret_note    text,   -- R
  rcv_pcode   text,   -- S  step 4 (SolarEdge/AWOT → SSC)
  rcv_doc     text,   -- T
  rcv_date    date,   -- U
  rcv_sn      text,   -- V  SN รับ
  ok_pcode    text,   -- W  step 5 optional (SSC → SolarEdge/AWOT)
  ok_doc      text,   -- X
  ok_date     date,   -- Y
  ok_sn       text,   -- Z  SN จ่าย
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  unique (claim_id, seq)
);
create index claim_units_claim_idx on public.claim_units (claim_id);
create index claim_units_iss_sn_idx on public.claim_units (upper(iss_sn));
create index claim_units_ret_sn_idx on public.claim_units (upper(ret_sn));

create table public.claim_files (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims (id) on delete cascade,
  -- customer = attached by the customer · receive = photo when receiving the claimed item (step 1)
  -- issue = photo of the replacement sent (step 2) · claim_doc = ใบเคลมสินค้า · other = internal
  kind          text not null check (kind in ('customer', 'receive', 'issue', 'claim_doc', 'other')),
  path          text not null unique,
  file_name     text,
  size_bytes    bigint,
  content_type  text,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index claim_files_claim_idx on public.claim_files (claim_id);

create table public.claim_events (
  id          bigint generated always as identity primary key,
  claim_id    uuid not null references public.claims (id) on delete cascade,
  status      text not null,
  note        text,       -- customer-facing note at that moment
  actor_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index claim_events_claim_idx on public.claim_events (claim_id, created_at);

create table public.claim_email_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    bigint not null references public.claim_events (id) on delete cascade,
  to_email    text not null,
  audience    text not null check (audience in ('customer', 'staff')),
  status      text not null check (status in ('sent', 'failed')),
  attempts    int not null default 1,
  error       text,
  sent_at     timestamptz,
  updated_at  timestamptz not null default now(),
  unique (event_id, to_email)
);

-- ---------------------------------------------------------------------------
-- Claim numbers: YY-NNNN with YY = ค.ศ. 2 หลัก (same as ssccare: "25-0123" → 2025)
-- The counter also moves forward when a claim with a higher number is imported or typed in.
-- ---------------------------------------------------------------------------
create or replace function public.next_claim_no()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_yy int := extract(year from (now() at time zone 'Asia/Bangkok'))::int % 100;
  v_no int;
  v_code text;
begin
  loop
    insert into public.doc_counters (prefix, yy, last_no) values ('CLAIM', v_yy, 1)
    on conflict (prefix, yy) do update set last_no = public.doc_counters.last_no + 1
    returning last_no into v_no;
    v_code := format('%s-%s', lpad(v_yy::text, 2, '0'), lpad(v_no::text, 4, '0'));
    exit when not exists (select 1 from public.claims c where c.claim_no = v_code);
  end loop;
  return v_code;
end $$;

create or replace function public.claims_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.claim_no is null or trim(new.claim_no) = '' then
      new.claim_no := public.next_claim_no();
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.claim_no := trim(new.claim_no);
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;
  if new.assigned_to is distinct from (case when tg_op = 'UPDATE' then old.assigned_to end) then
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  end if;
  return new;
end $$;

create trigger claims_before_write before insert or update on public.claims
  for each row execute function public.claims_before_write();

create or replace function public.claims_after_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_m text[];
begin
  -- keep the counter ahead of numbers typed in or imported
  v_m := regexp_match(new.claim_no, '^([0-9]{2})-([0-9]{1,6})$');
  if v_m is not null then
    insert into public.doc_counters (prefix, yy, last_no) values ('CLAIM', v_m[1]::int, v_m[2]::int)
    on conflict (prefix, yy) do update set last_no = greatest(public.doc_counters.last_no, excluded.last_no);
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.claim_events (claim_id, status, note, actor_id)
    values (new.id, new.status,
            case when tg_op = 'UPDATE' and new.customer_note is not distinct from old.customer_note then null else new.customer_note end,
            auth.uid());
  end if;
  return null;
end $$;

create trigger claims_after_write after insert or update on public.claims
  for each row execute function public.claims_after_write();

create trigger claim_units_touch before update on public.claim_units
  for each row execute function public.touch_updated_at();
create trigger claim_brand_rules_touch before update on public.claim_brand_rules
  for each row execute function public.touch_updated_at();
create trigger claim_settings_touch before update on public.claim_settings
  for each row execute function public.touch_updated_at();

create trigger audit_claims after insert or update or delete on public.claims
  for each row execute function public.audit_row();
create trigger audit_claim_units after insert or update or delete on public.claim_units
  for each row execute function public.audit_row();
create trigger audit_claim_settings after update on public.claim_settings
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- SN compare key: upper case, no spaces/dashes, O → 0 (common typo in the old sheet)
create or replace function public.sn_key(p text)
returns text language sql immutable set search_path = ''
as $$ select nullif(replace(regexp_replace(upper(coalesce(p, '')), '[\s\-_./]', '', 'g'), 'O', '0'), '') $$;

-- does the signed-in customer see this claim (own or same approved company)?
create or replace function public.can_see_claim(p_claim uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.claims c
     where c.id = p_claim
       and (c.user_id = auth.uid()
            or (c.company_id is not null and c.company_id = public.my_company_id())))
$$;

create or replace function public.can_handle_claim(p_claim uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.has_perm('claims')
      or (public.is_staff_or_admin()
          and exists (select 1 from public.claims c where c.id = p_claim and c.assigned_to = auth.uid()))
$$;

-- storage paths are <claim_id>/<kind>/<file>
create or replace function public.claim_file_readable(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_staff_or_admin()
      or exists (select 1 from public.claim_files f
                  where f.path = p_path and f.kind in ('customer', 'claim_doc')
                    and public.can_see_claim(f.claim_id))
$$;

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
    return public.can_handle_claim(v_claim) and v_kind in ('claim_doc', 'receive', 'issue', 'other');
  end if;
  return v_kind = 'customer'
     and exists (select 1 from public.claims c
                  where c.id = v_claim and c.user_id = auth.uid() and c.status in ('submitted', 'in_progress'));
end $$;

-- brands open for claims (also unpublished ones such as panel brands) with their rules, for the form
create or replace function public.claim_brands()
returns table (id uuid, name text, warranty_text text, terms text, required_docs text, require_fields text[])
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, r.warranty_text, r.terms, r.required_docs, coalesce(r.require_fields, '{}')
    from public.brands b
    left join public.claim_brand_rules r on r.brand_id = b.id
   where coalesce(r.enabled, true)
   order by b.sort, b.name
$$;

-- ---------------------------------------------------------------------------
-- Customer: submit a claim
-- p = { brand_id, product_type, model, contact_name, contact_phone, company_name, installer_name, site_name,
--       symptom, delivery_type, delivery_address, legacy_ref,
--       details: { bad_sn, manager_sn, case_no            -- inverter
--                  items: [{model, qty, bad_sn, ref_inv_sn}]  -- optimizer
--                  ref_inv_sn                              -- accessory
--                  qty, sn }                               -- panel / battery / other
-- reported SNs: every SN found in bad_sn / items[].bad_sn / sn (split on comma, space, new line)
-- ---------------------------------------------------------------------------
create or replace function public.submit_claim(p jsonb)
returns table (id uuid, claim_no text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.profiles;
  v_type text := nullif(trim(p ->> 'product_type'), '');
  v_brand uuid := nullif(p ->> 'brand_id', '')::uuid;
  v_rule public.claim_brand_rules;
  v_details jsonb := coalesce(p -> 'details', '{}'::jsonb);
  v_sns text[] := '{}';
  v_units jsonb := '[]'::jsonb;
  v_qty int := 0;
  v_model text := nullif(trim(p ->> 'model'), '');
  v_item jsonb;
  v_n int;
  v_company public.companies;
  v_claim public.claims;
  v_seq int := 0;
  v_u jsonb;
  v_req text;
begin
  select * into v_me from public.profiles where profiles.id = auth.uid() and is_active;
  if v_me.id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if v_type is null or v_type not in ('inverter', 'optimizer', 'accessory', 'panel', 'battery', 'other') then
    raise exception 'กรุณาเลือกประเภทสินค้า';
  end if;
  if coalesce(trim(p ->> 'contact_name'), '') = '' or coalesce(trim(p ->> 'contact_phone'), '') = '' then
    raise exception 'กรุณากรอกชื่อและเบอร์โทรผู้ติดต่อ';
  end if;
  if (p ->> 'delivery_type') = 'shipping' and coalesce(trim(p ->> 'delivery_address'), '') = '' then
    raise exception 'กรุณากรอกที่อยู่จัดส่ง';
  end if;
  if (select count(*) from public.claims c where c.user_id = v_me.id and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'แจ้งเคลมได้ไม่เกิน 30 รายการต่อวัน';
  end if;

  if v_brand is not null then
    select * into v_rule from public.claim_brand_rules r where r.brand_id = v_brand;
    if v_rule.brand_id is not null and not v_rule.enabled then raise exception 'แบรนด์นี้ยังไม่เปิดรับเคลมออนไลน์'; end if;
    foreach v_req in array coalesce(v_rule.require_fields, '{}') loop
      if v_req in ('installer_name', 'site_name') and coalesce(trim(p ->> v_req), '') = '' then
        raise exception 'กรุณากรอก %', case v_req when 'installer_name' then 'ผู้ติดตั้ง (EPC)' else 'ชื่อไซต์งาน' end;
      end if;
      if v_req = 'case_no' and v_type = 'inverter' and coalesce(trim(v_details ->> 'case_no'), '') = '' then
        raise exception 'กรุณากรอกหมายเลข Case จาก Engineer';
      end if;
      if v_req = 'manager_sn' and v_type = 'inverter' and coalesce(trim(v_details ->> 'manager_sn'), '') = '' then
        raise exception 'กรุณากรอก S/N Manager Inverter';
      end if;
    end loop;
  end if;

  if v_type = 'optimizer' then
    if jsonb_typeof(v_details -> 'items') <> 'array' or jsonb_array_length(v_details -> 'items') = 0 then
      raise exception 'กรุณาเพิ่มรุ่น Optimizer อย่างน้อย 1 รายการ';
    end if;
    for v_item in select * from jsonb_array_elements(v_details -> 'items') loop
      if coalesce(trim(v_item ->> 'model'), '') = '' then raise exception 'กรุณาเลือกรุ่น Optimizer'; end if;
      v_n := coalesce(nullif(v_item ->> 'qty', '')::int, 1);
      if v_n < 1 or v_n > 200 then raise exception 'จำนวนต่อรุ่นต้องอยู่ระหว่าง 1–200'; end if;
      v_qty := v_qty + v_n;
      v_units := v_units || (select coalesce(jsonb_agg(jsonb_build_object('pcode', trim(v_item ->> 'model'))), '[]'::jsonb)
                               from generate_series(1, v_n));
      v_sns := v_sns || coalesce((select array_agg(s) from regexp_split_to_table(coalesce(v_item ->> 'bad_sn', ''), '[\s,;]+') s where s <> ''), '{}');
    end loop;
    v_model := coalesce(v_model, (select string_agg(distinct trim(i ->> 'model'), ', ') from jsonb_array_elements(v_details -> 'items') i));
  else
    if v_model is null then raise exception 'กรุณาเลือกหรือกรอกรุ่นสินค้า'; end if;
    v_qty := case when v_type in ('inverter', 'accessory') then 1
                  else coalesce(nullif(v_details ->> 'qty', '')::int, 1) end;
    if v_qty < 1 or v_qty > 200 then raise exception 'จำนวนต้องอยู่ระหว่าง 1–200'; end if;
    v_units := (select jsonb_agg(jsonb_build_object('pcode', v_model)) from generate_series(1, v_qty));
    v_sns := coalesce((select array_agg(s) from regexp_split_to_table(
               coalesce(v_details ->> 'bad_sn', '') || ' ' || coalesce(v_details ->> 'sn', ''), '[\s,;]+') s where s <> ''), '{}');
    if v_type = 'inverter' and cardinality(v_sns) = 0 then raise exception 'กรุณากรอก S/N ตัวที่เสีย'; end if;
  end if;
  v_sns := (select coalesce(array_agg(distinct upper(s)), '{}') from unnest(v_sns) s);
  if cardinality(v_sns) > 500 then raise exception 'SN มากเกินไป กรุณาแนบไฟล์ Excel แทน'; end if;

  if v_me.company_status = 'approved' and v_me.company_id is not null then
    select * into v_company from public.companies c where c.id = v_me.company_id;
  end if;

  insert into public.claims (source, user_id, company_id, company_name, brand_id, product_type, model,
                             contact_name, contact_phone, contact_email, installer_name, site_name,
                             details, symptom, reported_sns, delivery_type, delivery_address, legacy_ref,
                             case_id, qty, status)
  values ('customer', v_me.id, v_company.id,
          coalesce(v_company.name, nullif(trim(p ->> 'company_name'), ''), v_me.company_name),
          v_brand, v_type, left(v_model, 300),
          trim(p ->> 'contact_name'), trim(p ->> 'contact_phone'), v_me.email,
          nullif(trim(p ->> 'installer_name'), ''), nullif(trim(p ->> 'site_name'), ''),
          v_details, nullif(trim(p ->> 'symptom'), ''), v_sns,
          case when p ->> 'delivery_type' = 'shipping' then 'shipping' else 'pickup' end,
          case when p ->> 'delivery_type' = 'shipping' then nullif(trim(p ->> 'delivery_address'), '') end,
          nullif(trim(p ->> 'legacy_ref'), ''),
          nullif(trim(v_details ->> 'case_no'), ''), v_qty, 'submitted')
  returning * into v_claim;

  for v_u in select * from jsonb_array_elements(v_units) loop
    v_seq := v_seq + 1;
    insert into public.claim_units (claim_id, seq, pcode) values (v_claim.id, v_seq, left(v_u ->> 'pcode', 120));
  end loop;

  return query select v_claim.id, v_claim.claim_no;
end $$;

-- attach a file row after uploading it to claim-files/<claim_id>/<kind>/...
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
  end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Customer: list my claims (own + company) without internal fields
-- ---------------------------------------------------------------------------
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
      'mine', c.user_id = auth.uid(),
      'handler', (select coalesce(p.full_name, 'เจ้าหน้าที่') from public.profiles p where p.id = c.assigned_to),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'path', f.path, 'file_name', f.file_name, 'created_at', f.created_at) order by f.created_at), '[]'::jsonb)
                  from public.claim_files f where f.claim_id = c.id and f.kind in ('customer', 'claim_doc')),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                   from public.claim_events e where e.claim_id = c.id)
    ) as x
    from public.claims c
    left join public.brands b on b.id = c.brand_id
    where c.user_id = auth.uid()
       or (c.company_id is not null and c.company_id = public.my_company_id())
  ) s
$$;

-- ---------------------------------------------------------------------------
-- Customer step 3: send the old unit(s) back; the SN(s) must match what was reported
-- ---------------------------------------------------------------------------
create or replace function public.return_claim(p_claim uuid, p_sns text[])
returns public.claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
  v_expected text[];
  v_given text[];
  v_bad text[];
  v_missing text[];
  v_unit record;
  v_i int := 0;
  v_orig text[];
begin
  select * into v_c from public.claims c where c.id = p_claim for update;
  if v_c.id is null or not public.can_see_claim(p_claim) then raise exception 'ไม่พบเคลมนี้'; end if;
  if v_c.status <> 'done' then raise exception 'ส่งของคืนได้เมื่อสถานะเป็น "ดำเนินการเสร็จ" เท่านั้น'; end if;

  v_expected := (select coalesce(array_agg(distinct public.sn_key(s)), '{}') from unnest(v_c.reported_sns) s where public.sn_key(s) is not null);
  if cardinality(v_expected) = 0 then
    raise exception 'เคลมนี้ไม่มี SN ที่แจ้งไว้ในระบบ กรุณาติดต่อเจ้าหน้าที่';
  end if;
  v_orig := (select coalesce(array_agg(trim(s)), '{}') from unnest(p_sns) s where public.sn_key(s) is not null);
  v_given := (select coalesce(array_agg(distinct public.sn_key(s)), '{}') from unnest(v_orig) s);
  v_bad := (select coalesce(array_agg(s), '{}') from unnest(v_given) s where not s = any (v_expected));
  v_missing := (select coalesce(array_agg(s), '{}') from unnest(v_expected) s where not s = any (v_given));
  if cardinality(v_bad) > 0 then
    raise exception 'SN ไม่ตรงกับที่แจ้งเคลมไว้: %', array_to_string(v_bad, ', ');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'ยังขาด SN อีก % รายการ กรุณากรอกให้ครบตามที่แจ้งเคลม', cardinality(v_missing);
  end if;

  -- fill internal step 3 (SN คืน) on units that have none yet, in order
  for v_unit in select u.id from public.claim_units u where u.claim_id = p_claim and coalesce(u.ret_sn, '') = '' order by u.seq loop
    v_i := v_i + 1;
    exit when v_i > cardinality(v_orig);
    update public.claim_units u
       set ret_sn = upper(v_orig[v_i]), ret_date = public.bkk_today(), ret_pcode = coalesce(u.ret_pcode, u.pcode),
           ret_note = coalesce(u.ret_note, 'ลูกค้ากรอกในระบบ'), updated_by = auth.uid()
     where u.id = v_unit.id;
  end loop;

  update public.claims c
     set status = 'returned', returned_sns = (select array_agg(upper(s)) from unnest(v_orig) s), returned_at = now()
   where c.id = p_claim
  returning * into v_c;
  return v_c;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: take / assign / change the customer-facing status
-- ---------------------------------------------------------------------------
create or replace function public.take_claim(p_claim uuid)
returns public.claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
begin
  if not public.is_staff_or_admin() then raise exception 'สำหรับเจ้าหน้าที่เท่านั้น' using errcode = '42501'; end if;
  select * into v_c from public.claims c where c.id = p_claim for update;
  if v_c.id is null then raise exception 'ไม่พบเคลมนี้'; end if;
  if v_c.assigned_to is not null and v_c.assigned_to <> auth.uid() and not public.has_perm('claims') then
    raise exception 'เคลมนี้มีผู้รับผิดชอบแล้ว';
  end if;
  update public.claims c set assigned_to = auth.uid() where c.id = p_claim returning * into v_c;
  return v_c;
end $$;

create or replace function public.assign_claim(p_claim uuid, p_user uuid)
returns public.claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
begin
  if not public.has_perm('claims') then raise exception 'ไม่มีสิทธิ์มอบหมายงานเคลม' using errcode = '42501'; end if;
  if p_user is not null and not exists (select 1 from public.profiles p where p.id = p_user and p.role in ('admin', 'staff') and p.is_active) then
    raise exception 'ผู้รับผิดชอบต้องเป็น Staff หรือ Admin';
  end if;
  update public.claims c set assigned_to = p_user where c.id = p_claim returning * into v_c;
  if v_c.id is null then raise exception 'ไม่พบเคลมนี้'; end if;
  return v_c;
end $$;

create or replace function public.set_claim_status(p_claim uuid, p_status text, p_note text default null, p_reported_sns text[] default null)
returns public.claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
begin
  if not public.can_handle_claim(p_claim) then
    raise exception 'เปลี่ยนสถานะได้เฉพาะผู้รับผิดชอบเคลมนี้ หรือผู้มีสิทธิ์งานเคลม' using errcode = '42501';
  end if;
  if p_status not in ('submitted', 'in_progress', 'done', 'returned', 'closed', 'rejected') then
    raise exception 'สถานะไม่ถูกต้อง';
  end if;
  select * into v_c from public.claims c where c.id = p_claim for update;
  if p_status = 'done' and v_c.claim_doc_path is null then
    raise exception 'กรุณาอัปโหลดใบเคลมสินค้าก่อนเปลี่ยนเป็น "ดำเนินการเสร็จ"';
  end if;
  if p_status = 'rejected' and coalesce(trim(p_note), trim(v_c.customer_note), '') = '' then
    raise exception 'กรุณาระบุเหตุผลถึงลูกค้า';
  end if;
  update public.claims c
     set status = p_status,
         customer_note = coalesce(nullif(trim(p_note), ''), c.customer_note),
         reported_sns = coalesce((select array_agg(distinct upper(trim(s))) from unnest(p_reported_sns) s where trim(s) <> ''), c.reported_sns),
         assigned_to = coalesce(c.assigned_to, auth.uid())
   where c.id = p_claim
  returning * into v_c;
  return v_c;
end $$;

-- ---------------------------------------------------------------------------
-- 5-step board: import / new claim (A–J or A–Z) and bulk unit edits (perm 'claims')
-- p_claims: [{claim_no, legacy_ref, company_name, voucher_no, voucher_date, case_id, site_id, pickup_on,
--             sales_code, qty, status, brand_id, product_type, model, internal_note,
--             units: [{pcode, iss_doc, iss_date, iss_sn, ret_pcode, ...}]}]
--   no units → creates qty units with pcode = model
--   claim_no empty → next number · existing claim_no → skipped and reported back
-- ---------------------------------------------------------------------------
create or replace function public.import_claims(p_claims jsonb, p_source text default 'staff')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c jsonb;
  v_u jsonb;
  v_id uuid;
  v_no text;
  v_seq int;
  v_qty int;
  v_created text[] := '{}';
  v_skipped text[] := '{}';
  v_company uuid;
begin
  if not public.has_perm('claims') then raise exception 'ไม่มีสิทธิ์เปิด/นำเข้าใบเคลม' using errcode = '42501'; end if;
  if jsonb_typeof(p_claims) <> 'array' then raise exception 'ข้อมูลไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_claims) > 5000 then raise exception 'นำเข้าได้ครั้งละไม่เกิน 5,000 เคลม'; end if;

  for v_c in select * from jsonb_array_elements(p_claims) loop
    v_no := nullif(trim(v_c ->> 'claim_no'), '');
    if v_no is not null and exists (select 1 from public.claims c where c.claim_no = v_no) then
      v_skipped := v_skipped || v_no;
      continue;
    end if;
    v_qty := greatest(1, least(1000, coalesce(nullif(v_c ->> 'qty', '')::int,
                                             nullif(jsonb_array_length(coalesce(v_c -> 'units', '[]'::jsonb)), 0), 1)));
    select c.id into v_company from public.companies c
     where nullif(trim(v_c ->> 'company_name'), '') is not null and lower(c.name) = lower(trim(v_c ->> 'company_name'))
     limit 1;
    insert into public.claims (claim_no, legacy_ref, source, company_id, company_name, brand_id, product_type, model,
                               voucher_no, voucher_date, case_id, site_id, pickup_on, sales_code, qty, status,
                               internal_note, contact_name, contact_phone, symptom, reported_sns)
    values (v_no, nullif(trim(v_c ->> 'legacy_ref'), ''),
            case when p_source = 'import' then 'import' else 'staff' end,
            v_company, nullif(trim(v_c ->> 'company_name'), ''),
            nullif(v_c ->> 'brand_id', '')::uuid, nullif(v_c ->> 'product_type', ''), nullif(trim(v_c ->> 'model'), ''),
            nullif(trim(v_c ->> 'voucher_no'), ''), nullif(v_c ->> 'voucher_date', '')::date,
            nullif(trim(v_c ->> 'case_id'), ''), nullif(trim(v_c ->> 'site_id'), ''),
            nullif(trim(v_c ->> 'pickup_on'), ''), nullif(trim(v_c ->> 'sales_code'), ''), v_qty,
            coalesce(nullif(v_c ->> 'status', ''), 'in_progress'),
            nullif(trim(v_c ->> 'internal_note'), ''), nullif(trim(v_c ->> 'contact_name'), ''),
            nullif(trim(v_c ->> 'contact_phone'), ''), nullif(trim(v_c ->> 'symptom'), ''),
            coalesce((select array_agg(upper(trim(s))) from jsonb_array_elements_text(coalesce(v_c -> 'reported_sns', '[]'::jsonb)) s where trim(s) <> ''), '{}'))
    returning id, claim_no into v_id, v_no;
    v_seq := 0;
    if jsonb_array_length(coalesce(v_c -> 'units', '[]'::jsonb)) > 0 then
      for v_u in select * from jsonb_array_elements(v_c -> 'units') loop
        v_seq := v_seq + 1;
        insert into public.claim_units (claim_id, seq, pcode, iss_doc, iss_date, iss_sn, ret_pcode, ret_doc, ret_date, ret_sn, ret_note,
                                        rcv_pcode, rcv_doc, rcv_date, rcv_sn, ok_pcode, ok_doc, ok_date, ok_sn)
        select v_id, v_seq, r.pcode, r.iss_doc, r.iss_date, r.iss_sn, r.ret_pcode, r.ret_doc, r.ret_date, r.ret_sn, r.ret_note,
               r.rcv_pcode, r.rcv_doc, r.rcv_date, r.rcv_sn, r.ok_pcode, r.ok_doc, r.ok_date, r.ok_sn
          from jsonb_populate_record(null::public.claim_units, v_u) r;
      end loop;
    else
      insert into public.claim_units (claim_id, seq, pcode)
      select v_id, g, nullif(trim(coalesce(v_c ->> 'pcode', v_c ->> 'model')), '') from generate_series(1, v_qty) g;
    end if;
    v_created := v_created || v_no;
  end loop;
  return jsonb_build_object('created', to_jsonb(v_created), 'skipped', to_jsonb(v_skipped));
end $$;

-- p_units: [{id?, claim_id, pcode, iss_doc, iss_date, ...}] · rows with id are updated (all fields), rows without are added
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
        ok_pcode = nullif(trim(r.ok_pcode), ''), ok_doc = nullif(trim(r.ok_doc), ''), ok_date = r.ok_date, ok_sn = nullif(trim(r.ok_sn), ''),
        updated_by = auth.uid()
      where u.id = r.id;
    else
      if r.claim_id is null then raise exception 'claim_id ว่าง'; end if;
      insert into public.claim_units (claim_id, seq, pcode, iss_doc, iss_date, iss_sn, ret_pcode, ret_doc, ret_date, ret_sn, ret_note,
                                      rcv_pcode, rcv_doc, rcv_date, rcv_sn, ok_pcode, ok_doc, ok_date, ok_sn, updated_by)
      values (r.claim_id, coalesce((select max(u.seq) from public.claim_units u where u.claim_id = r.claim_id), 0) + 1,
              nullif(trim(r.pcode), ''), nullif(trim(r.iss_doc), ''), r.iss_date, nullif(trim(r.iss_sn), ''),
              nullif(trim(r.ret_pcode), ''), nullif(trim(r.ret_doc), ''), r.ret_date, nullif(trim(r.ret_sn), ''), nullif(trim(r.ret_note), ''),
              nullif(trim(r.rcv_pcode), ''), nullif(trim(r.rcv_doc), ''), r.rcv_date, nullif(trim(r.rcv_sn), ''),
              nullif(trim(r.ok_pcode), ''), nullif(trim(r.ok_doc), ''), r.ok_date, nullif(trim(r.ok_sn), ''), auth.uid());
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- E-mails (claim-emails edge function, every 10 min from pg_cron)
--   customer: on submitted / in_progress / done / closed / rejected
--   staff:    "มีเคลมใหม่" to claim_settings.staff_notify_emails when a customer submits
-- Only events from the last 2 days, so turning e-mail on does not mail old history.
-- ---------------------------------------------------------------------------
create or replace function public.claim_emails_due(p_limit int default 100)
returns table (event_id bigint, audience text, to_email text, full_name text, claim_id uuid, claim_no text,
               status text, note text, product_type text, model text, company_name text, contact_name text,
               contact_phone text, delivery_type text, handler text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with cfg as (select * from public.claim_settings where id = 1),
  ev as (
    select e.*, c.claim_no, c.product_type, c.model, c.company_name, c.contact_name, c.contact_phone,
           c.delivery_type, c.user_id, c.source,
           (select p.full_name from public.profiles p where p.id = c.assigned_to) as handler
      from public.claim_events e
      join public.claims c on c.id = e.claim_id
     where e.created_at >= now() - interval '2 days'
  ),
  todo as (
    select ev.id as eid, 'customer'::text as aud, p.email as mail, p.full_name as pname, ev.*
      from ev join public.profiles p on p.id = ev.user_id, cfg
     where cfg.email_enabled and ev.status in ('submitted', 'in_progress', 'done', 'closed', 'rejected')
       and p.email is not null
    union all
    select ev.id, 'staff', trim(m), null, ev.*
      from ev, cfg, regexp_split_to_table(coalesce(cfg.staff_notify_emails, ''), '[,;\s]+') m
     where cfg.email_enabled and ev.status = 'submitted' and ev.source = 'customer' and trim(m) like '%@%'
  )
  select t.eid, t.aud, t.mail, t.pname, t.claim_id, t.claim_no, t.status, t.note, t.product_type, t.model,
         t.company_name, t.contact_name, t.contact_phone, t.delivery_type, t.handler, t.created_at
    from todo t
    left join public.claim_email_log l on l.event_id = t.eid and l.to_email = t.mail
   where l.id is null or (l.status = 'failed' and l.attempts < 3)
   order by t.created_at
   limit p_limit
$$;

create or replace function public.record_claim_email(p_event_id bigint, p_to text, p_audience text, p_error text default null)
returns void language sql security definer set search_path = ''
as $$
  insert into public.claim_email_log (event_id, to_email, audience, status, error, sent_at)
  values (p_event_id, p_to, p_audience, case when p_error is null then 'sent' else 'failed' end, p_error,
          case when p_error is null then now() end)
  on conflict (event_id, to_email) do update
     set status = excluded.status, error = excluded.error,
         sent_at = coalesce(excluded.sent_at, public.claim_email_log.sent_at),
         attempts = public.claim_email_log.attempts + 1, updated_at = now()
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.claim_settings enable row level security;
alter table public.claim_models enable row level security;
alter table public.claim_brand_rules enable row level security;
alter table public.claims enable row level security;
alter table public.claim_units enable row level security;
alter table public.claim_files enable row level security;
alter table public.claim_events enable row level security;
alter table public.claim_email_log enable row level security;

create policy claim_settings_select on public.claim_settings for select to authenticated using (true);
create policy claim_settings_update on public.claim_settings for update to authenticated
  using (public.has_perm('claims')) with check (public.has_perm('claims'));

create policy claim_models_select on public.claim_models for select to authenticated
  using (is_active or public.is_staff_or_admin());
create policy claim_models_write on public.claim_models for all to authenticated
  using (public.has_perm('claims')) with check (public.has_perm('claims'));

create policy claim_brand_rules_select on public.claim_brand_rules for select to authenticated using (true);
create policy claim_brand_rules_write on public.claim_brand_rules for all to authenticated
  using (public.has_perm('claims')) with check (public.has_perm('claims'));

-- customers never read these tables directly (they use my_claims), so internal fields stay hidden
create policy claims_select on public.claims for select to authenticated using (public.is_staff_or_admin());
create policy claims_insert on public.claims for insert to authenticated with check (public.has_perm('claims'));
create policy claims_update on public.claims for update to authenticated
  using (public.has_perm('claims')) with check (public.has_perm('claims'));
create policy claims_delete on public.claims for delete to authenticated using (public.has_perm('claims'));

create policy claim_units_select on public.claim_units for select to authenticated using (public.is_staff_or_admin());
create policy claim_units_write on public.claim_units for all to authenticated
  using (public.has_perm('claims')) with check (public.has_perm('claims'));

create policy claim_files_select on public.claim_files for select to authenticated using (public.is_staff_or_admin());
create policy claim_files_delete on public.claim_files for delete to authenticated
  using (public.has_perm('claims') or (uploaded_by = auth.uid() and public.can_handle_claim(claim_id)));

create policy claim_events_select on public.claim_events for select to authenticated using (public.is_staff_or_admin());
create policy claim_email_log_select on public.claim_email_log for select to authenticated using (public.is_staff_or_admin());

-- functions: customers call submit/my/return/add_file; staff call take/status; perm 'claims' the rest
revoke execute on function public.next_claim_no() from public, anon, authenticated;
revoke execute on function public.claim_emails_due(int) from public, anon, authenticated;
revoke execute on function public.record_claim_email(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_emails_due(int) to service_role;
grant execute on function public.record_claim_email(bigint, text, text, text) to service_role;
revoke execute on function public.submit_claim(jsonb) from anon;
revoke execute on function public.claim_brands() from anon;
revoke execute on function public.my_claims() from anon;
revoke execute on function public.return_claim(uuid, text[]) from anon;
revoke execute on function public.add_claim_file(uuid, text, text, text, bigint, text) from anon;
revoke execute on function public.take_claim(uuid) from anon;
revoke execute on function public.assign_claim(uuid, uuid) from anon;
revoke execute on function public.set_claim_status(uuid, text, text, text[]) from anon;
revoke execute on function public.import_claims(jsonb, text) from anon;
revoke execute on function public.save_claim_units(jsonb, bigint[]) from anon;

-- ---------------------------------------------------------------------------
-- Storage: claim-files (private) · <claim_id>/<kind>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('claim-files', 'claim-files', false)
on conflict (id) do nothing;

create policy claim_files_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'claim-files' and public.claim_file_readable(name));
create policy claim_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-files' and public.claim_file_writable(name));
create policy claim_files_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'claim-files' and public.has_perm('claims'));
create policy claim_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'claim-files' and (public.has_perm('claims') or public.claim_file_writable(name)));

-- ---------------------------------------------------------------------------
-- Seed: brand rules for every brand, and the model lists from the old Apps Script form
-- ---------------------------------------------------------------------------
insert into public.claim_brand_rules (brand_id, enabled)
select b.id, true from public.brands b
on conflict (brand_id) do nothing;

insert into public.brands (name, slug, sort, is_published)
values ('SolarPPM', 'solarppm', 80, false)
on conflict (name) do nothing;
insert into public.claim_brand_rules (brand_id, enabled)
select b.id, true from public.brands b where b.slug = 'solarppm'
on conflict (brand_id) do nothing;

update public.claim_brand_rules r
   set require_fields = '{case_no}',
       required_docs = 'รูปฉลาก S/N และหน้าจอแสดง Error · หมายเลข Case จาก SolarEdge Engineer (ถ้ามี)'
  from public.brands b
 where b.id = r.brand_id and b.slug = 'solaredge' and r.require_fields = '{}';

insert into public.claim_models (product_type, brand_id, model, sort)
select 'inverter', b.id, m.model, m.sort
  from public.brands b,
       (values ('SE5000H-THR00BNN4', 10), ('SE10K-TH0TEBNN4', 20), ('SE27.6K-TH000BND4', 30), ('SE27.6K-RWR0IBNZ4', 40),
               ('SE30K-THR0IBNZ4', 50), ('SE33.3K-THOOIBND4', 60), ('SE82.8K-RWRP0BNU4', 70), ('SE82.8K-TH0P0BNU4', 80),
               ('SE90K-TH00IBNC4-IVM', 90), ('SE100K-TH00IBNC4', 100), ('SESU-RW0S0NNN4 (unit SE82.8K)', 110),
               ('SESU-RWROINNN4 (unit SE82.8K)', 120), ('SESUK-RWROINNN4 (unit SE90K)', 130), ('SESUK-RWROINNN4 (unit SE100K)', 140)) m(model, sort)
 where b.slug = 'solaredge'
on conflict do nothing;

insert into public.claim_models (product_type, brand_id, model, sort)
select 'optimizer', b.id, m.model, m.sort
  from public.brands b,
       (values ('P370', 10), ('P500', 20), ('P601', 30), ('P730', 40), ('P801', 50), ('P850', 60), ('P950', 70),
               ('P1100', 80), ('S1200', 90), ('S1400', 100), ('S1500', 110)) m(model, sort)
 where b.slug = 'solaredge'
on conflict do nothing;

insert into public.claim_models (product_type, brand_id, model, sort)
select 'accessory', b.id, m.model, m.sort
  from public.brands b,
       (values ('SE1000-SEN-IRR-S1', 10), ('SE1000-SEN-TAMB-S2', 20), ('SE1000-SEN-TMOD-S2', 30), ('SE-ACT-0750-250', 40),
               ('SECT-SPL-250A-A', 50), ('SE-MTR-3Y-400V-A', 60), ('SE-WND-3Y400-MB-K2', 70), ('FLD-3PH-FAN-EX', 80),
               ('FLD-3PH-FAN-NET', 90), ('SE1000-CCG-G-S1', 100), ('SE1000-CCG-F-S1', 110)) m(model, sort)
 where b.slug = 'solaredge'
on conflict do nothing;
