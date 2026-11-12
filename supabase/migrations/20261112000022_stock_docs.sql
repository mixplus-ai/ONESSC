-- One App SSC · stock in/out by document, every unit by serial number (owner 2026-11-12).
-- Every unit that enters or leaves the warehouse is on a document, one row per SN. A document is a draft
-- until a Staff member with the right posts it; posting moves the SNs (status, warehouse, holder) in one
-- go and records what each SN looked like before, so cancelling a posted document puts them back.
-- Stock per code = SNs in stock. When Admin switches stock_config.stock_source to 'docs', stock_levels
-- (what the shop and the stock page show) is filled from the SNs and the Google Sheet sync is refused.
--
-- Document types
--   in : OB ยอดยกมา · GR รับจาก PO · GN รับตามใบส่งของผู้ขาย · RT รับคืน (ยืม/เบิก/ขาย/เคลม)
--   out: SO ขาย/ส่งสินค้า · BR ยืม · WD เบิกชั่วคราว · WO จำหน่ายออก
--   other: TR โอนคลัง · RV จองสินค้า (no stock change, SN held for a customer)

-- ---------------------------------------------------------------------------
-- Warehouses
-- ---------------------------------------------------------------------------
create table public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (length(trim(code)) between 1 and 30),
  name       text not null,
  is_active  boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.warehouses (code, name, sort) values ('BGL4', 'คลัง BGL 4', 1);

alter table public.stock_config
  add column stock_source    text not null default 'sheet' check (stock_source in ('sheet', 'docs')),
  add column docs_start_date date;

insert into public.permission_keys (key, label, description, sort, grp) values
  ('stock.docs', 'เอกสารคลัง: สร้างและแก้ร่างเอกสารรับเข้า/จ่ายออก', 'สแกน SN ลงเอกสาร บันทึกร่าง', 35, 'sales'),
  ('stock.post', 'เอกสารคลัง: อนุมัติ/ยืนยันตัดสต๊อก และยกเลิกเอกสาร', 'ยืนยันแล้ว SN จะย้ายสถานะทันที', 36, 'sales')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.stock_docs (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text unique,                 -- given on save: GR-69-0001
  doc_type         text not null check (doc_type in ('OB', 'GR', 'GN', 'RT', 'SO', 'BR', 'WD', 'WO', 'TR', 'RV')),
  status           text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  doc_date         date not null default (now() at time zone 'Asia/Bangkok')::date,
  warehouse_id     uuid not null references public.warehouses (id),
  to_warehouse_id  uuid references public.warehouses (id),          -- TR
  partner_name     text,                        -- supplier / customer / borrower
  partner_tax_id   text,
  company_id       uuid references public.companies (id) on delete set null,
  ref_no           text,                        -- PO / supplier delivery note / PI / invoice
  customer_po      text,                        -- SO: customer's PO
  site_name        text,                        -- SO/BR: where it is installed or used
  due_date         date,                        -- BR/WD: return by
  reason           text,                        -- WO/RT/OB note on why
  note             text,
  return_of        uuid references public.stock_docs (id),          -- RT: the BR/WD/SO it returns from
  delivery_id      uuid references public.deliveries (id) on delete set null,
  claim_id         uuid references public.claims (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  posted_by        uuid references auth.users (id) on delete set null,
  posted_at        timestamptz,
  cancelled_by     uuid references auth.users (id) on delete set null,
  cancelled_at     timestamptz,
  cancel_reason    text
);
create index stock_docs_type_idx on public.stock_docs (doc_type, doc_date desc);
create index stock_docs_status_idx on public.stock_docs (status, doc_date desc);
create index stock_docs_company_idx on public.stock_docs (company_id);
create index stock_docs_return_of_idx on public.stock_docs (return_of);

-- one row per SN
create table public.stock_doc_items (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.stock_docs (id) on delete cascade,
  sort        int not null default 0,
  sku         text not null check (length(trim(sku)) between 1 and 80),
  description text,
  sn          text not null check (length(trim(sn)) between 1 and 80),
  sn_key      text generated always as (public.sn_key(sn)) stored,
  condition   text not null default 'good' check (condition in ('good', 'defective')),
  note        text
);
create unique index stock_doc_items_doc_sn on public.stock_doc_items (doc_id, sn_key);
create index stock_doc_items_sn_idx on public.stock_doc_items (sn_key);
create index stock_doc_items_doc_idx on public.stock_doc_items (doc_id, sort);

-- current state of every SN the system has seen
create table public.serials (
  sn_key        text primary key,
  sn            text not null,
  sku           text not null,
  description   text,
  status        text not null check (status in ('in_stock', 'reserved', 'borrowed', 'withdrawn', 'sold', 'written_off')),
  condition     text not null default 'good' check (condition in ('good', 'defective')),
  warehouse_id  uuid references public.warehouses (id),
  holder_name   text,               -- customer / borrower when out
  company_id    uuid references public.companies (id) on delete set null,
  due_date      date,
  last_doc_id   uuid references public.stock_docs (id),
  first_in_at   date,               -- first receive date
  sold_at       date,
  updated_at    timestamptz not null default now()
);
create index serials_sku_idx on public.serials (sku, status);
create index serials_status_idx on public.serials (status);

-- what each posted document did to each SN (before = the serials row before posting, null if new)
create table public.serial_moves (
  id          bigint generated always as identity primary key,
  doc_id      uuid not null references public.stock_docs (id) on delete cascade,
  sn_key      text not null,
  before      jsonb,
  after       jsonb not null,
  created_at  timestamptz not null default now()
);
create index serial_moves_sn_idx on public.serial_moves (sn_key, id);
create index serial_moves_doc_idx on public.serial_moves (doc_id);

-- claim SN lookups by the same normalised key
create index if not exists claim_units_iss_key_idx on public.claim_units (public.sn_key(iss_sn));
create index if not exists claim_units_ret_key_idx on public.claim_units (public.sn_key(ret_sn));
create index if not exists claim_units_rcv_key_idx on public.claim_units (public.sn_key(rcv_sn));
create index if not exists claim_units_ok_key_idx on public.claim_units (public.sn_key(ok_sn));

create trigger stock_docs_touch before update on public.stock_docs
  for each row execute function public.touch_updated_at();
create trigger audit_stock_docs after insert or update or delete on public.stock_docs
  for each row execute function public.audit_row();
create trigger audit_warehouses after insert or update or delete on public.warehouses
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- RLS: read for stock viewers; writes through the RPCs below (warehouses: Admin)
-- ---------------------------------------------------------------------------
alter table public.warehouses enable row level security;
alter table public.stock_docs enable row level security;
alter table public.stock_doc_items enable row level security;
alter table public.serials enable row level security;
alter table public.serial_moves enable row level security;

create policy warehouses_select on public.warehouses for select to authenticated using ((select public.is_staff_or_admin()));
create policy warehouses_admin on public.warehouses for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy stock_docs_select on public.stock_docs for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')));
create policy stock_doc_items_select on public.stock_doc_items for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')));
create policy serials_select on public.serials for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')));
create policy serial_moves_select on public.serial_moves for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')));

-- ---------------------------------------------------------------------------
-- Save a draft (create or replace header + items). p_doc: header fields, p_items: [{sku, description, sn, condition, note}]
-- ---------------------------------------------------------------------------
create or replace function public.save_stock_doc(p_id uuid, p_doc jsonb, p_items jsonb)
returns public.stock_docs
language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.stock_docs;
  v_type text := upper(coalesce(p_doc ->> 'doc_type', ''));
  v_dup text;
begin
  if not (public.has_perm('stock.docs') or public.has_perm('stock.post')) then
    raise exception 'ไม่มีสิทธิ์สร้างเอกสารคลัง' using errcode = '42501';
  end if;
  if v_type not in ('OB', 'GR', 'GN', 'RT', 'SO', 'BR', 'WD', 'WO', 'TR', 'RV') then raise exception 'ประเภทเอกสารไม่ถูกต้อง'; end if;
  if v_type = 'OB' and not public.is_admin() then raise exception 'ใบยอดยกมาทำได้เฉพาะ Admin' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then p_items := '[]'::jsonb; end if;

  select string_agg(k, ', ') into v_dup from (
    select public.sn_key(i ->> 'sn') k from jsonb_array_elements(p_items) i
     group by 1 having count(*) > 1) z
   where k is not null;
  if v_dup is not null then raise exception 'SN ซ้ำในเอกสาร: %', v_dup; end if;

  if p_id is not null then
    select * into v_d from public.stock_docs d where d.id = p_id for update;
    if v_d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
    if v_d.status <> 'draft' then raise exception 'เอกสารยืนยันแล้ว แก้ไม่ได้ ถ้าผิดให้ยกเลิกแล้วทำใหม่'; end if;
    if v_d.doc_type <> v_type then raise exception 'เปลี่ยนประเภทเอกสารไม่ได้'; end if;
  end if;

  if p_id is null then
    insert into public.stock_docs (doc_no, doc_type, warehouse_id)
    values (public.next_doc_no(v_type), v_type, (p_doc ->> 'warehouse_id')::uuid)
    returning * into v_d;
  end if;

  update public.stock_docs d set
    doc_date        = coalesce(nullif(p_doc ->> 'doc_date', '')::date, d.doc_date),
    warehouse_id    = (p_doc ->> 'warehouse_id')::uuid,
    to_warehouse_id = nullif(p_doc ->> 'to_warehouse_id', '')::uuid,
    partner_name    = nullif(trim(p_doc ->> 'partner_name'), ''),
    partner_tax_id  = nullif(regexp_replace(coalesce(p_doc ->> 'partner_tax_id', ''), '\D', '', 'g'), ''),
    company_id      = coalesce(nullif(p_doc ->> 'company_id', '')::uuid,
                               (select c.id from public.companies c
                                 where c.tax_id = nullif(regexp_replace(coalesce(p_doc ->> 'partner_tax_id', ''), '\D', '', 'g'), ''))),
    ref_no          = nullif(trim(p_doc ->> 'ref_no'), ''),
    customer_po     = nullif(trim(p_doc ->> 'customer_po'), ''),
    site_name       = nullif(trim(p_doc ->> 'site_name'), ''),
    due_date        = nullif(p_doc ->> 'due_date', '')::date,
    reason          = nullif(trim(p_doc ->> 'reason'), ''),
    note            = nullif(trim(p_doc ->> 'note'), ''),
    return_of       = nullif(p_doc ->> 'return_of', '')::uuid,
    delivery_id     = nullif(p_doc ->> 'delivery_id', '')::uuid,
    claim_id        = nullif(p_doc ->> 'claim_id', '')::uuid
  where d.id = v_d.id;

  delete from public.stock_doc_items i where i.doc_id = v_d.id;
  insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition, note)
  select v_d.id, (o - 1)::int, upper(trim(i ->> 'sku')), nullif(trim(i ->> 'description'), ''), upper(trim(i ->> 'sn')),
         case when i ->> 'condition' = 'defective' then 'defective' else 'good' end, nullif(trim(i ->> 'note'), '')
    from jsonb_array_elements(p_items) with ordinality t(i, o)
   where public.sn_key(i ->> 'sn') is not null;

  select * into v_d from public.stock_docs d where d.id = v_d.id;
  return v_d;
end $$;

-- delete a draft
create or replace function public.delete_stock_draft(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_perm('stock.docs') or public.has_perm('stock.post')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  delete from public.stock_docs d where d.id = p_id and d.status = 'draft';
  if not found then raise exception 'ลบได้เฉพาะเอกสารร่าง'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- stock_levels from SNs (used when stock_source = 'docs')
-- ---------------------------------------------------------------------------
create or replace function public.refresh_stock_from_serials()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.stock_levels sl
     set on_hand   = coalesce(x.on_hand, 0),
         reserved  = coalesce(x.reserved, 0),
         available = coalesce(x.on_hand, 0) - coalesce(x.reserved, 0),
         synced_at = now()
    from (select l.sku,
                 (select count(*) from public.serials s where s.sku = l.sku and s.status in ('in_stock', 'reserved') and s.condition = 'good') on_hand,
                 (select count(*) from public.serials s where s.sku = l.sku and s.status = 'reserved') reserved
            from public.stock_levels l) x
   where x.sku = sl.sku;
  insert into public.stock_levels (sku, description, on_hand, reserved, available)
  select s.sku, max(s.description),
         count(*) filter (where s.status in ('in_stock', 'reserved') and s.condition = 'good'),
         count(*) filter (where s.status = 'reserved'),
         count(*) filter (where s.status = 'in_stock' and s.condition = 'good')
    from public.serials s
   where not exists (select 1 from public.stock_levels l where l.sku = s.sku)
   group by s.sku;
end $$;

-- the Google Sheet sync stops once stock comes from documents
create or replace function public.stock_syncs_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'ok' and (select c.stock_source from public.stock_config c where c.id = 1) = 'docs' then
    raise exception 'ยอดสต๊อกใช้จากเอกสารคลังแล้ว ไม่ดึงจาก Google Sheet';
  end if;
  return new;
end $$;
create trigger stock_syncs_guard before insert on public.stock_syncs
  for each row execute function public.stock_syncs_guard();

-- Admin: switch where stock numbers come from
create or replace function public.set_stock_source(p_source text, p_start date default null)
returns public.stock_config
language plpgsql security definer set search_path = ''
as $$
declare v public.stock_config;
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin' using errcode = '42501'; end if;
  if p_source not in ('sheet', 'docs') then raise exception 'ค่าไม่ถูกต้อง'; end if;
  update public.stock_config c
     set stock_source = p_source, docs_start_date = coalesce(p_start, c.docs_start_date),
         updated_by = auth.uid(), updated_at = now()
   where c.id = 1
  returning * into v;
  if p_source = 'docs' then perform public.refresh_stock_from_serials(); end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Post: check every SN, then move them
-- ---------------------------------------------------------------------------
create or replace function public.post_stock_doc(p_id uuid)
returns public.stock_docs
language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.stock_docs;
  v_i record;
  v_s public.serials;
  v_new public.serials;
  v_bad text;
  v_n int;
begin
  if not public.has_perm('stock.post') then
    raise exception 'ยืนยันเอกสารได้เฉพาะผู้มีสิทธิ์อนุมัติเอกสารคลัง' using errcode = '42501';
  end if;
  select * into v_d from public.stock_docs d where d.id = p_id for update;
  if v_d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_d.status <> 'draft' then raise exception 'เอกสารนี้ยืนยันหรือยกเลิกไปแล้ว'; end if;
  select count(*) into v_n from public.stock_doc_items i where i.doc_id = p_id;
  if v_n = 0 then raise exception 'ยังไม่มี SN ในเอกสาร'; end if;

  -- header rules per type
  if v_d.doc_type = 'GR' and v_d.ref_no is null then raise exception 'กรุณาใส่เลขที่ PO'; end if;
  if v_d.doc_type = 'GN' and v_d.ref_no is null then raise exception 'กรุณาใส่เลขที่ใบส่งของของผู้ขาย'; end if;
  if v_d.doc_type in ('SO', 'BR', 'WD', 'RV', 'RT') and v_d.partner_name is null then raise exception 'กรุณาใส่ชื่อลูกค้า/ผู้รับ'; end if;
  if v_d.doc_type = 'BR' and v_d.due_date is null then raise exception 'ใบยืมต้องมีวันกำหนดคืน'; end if;
  if v_d.doc_type = 'WO' and v_d.reason is null then raise exception 'ใบจำหน่ายออกต้องระบุเหตุผล'; end if;
  if v_d.doc_type = 'TR' and (v_d.to_warehouse_id is null or v_d.to_warehouse_id = v_d.warehouse_id) then
    raise exception 'เลือกคลังปลายทางที่ไม่ใช่คลังเดิม';
  end if;
  if v_d.doc_type = 'OB' and not public.is_admin() then raise exception 'ใบยอดยกมายืนยันได้เฉพาะ Admin' using errcode = '42501'; end if;

  for v_i in select * from public.stock_doc_items i where i.doc_id = p_id order by i.sort loop
    select * into v_s from public.serials s where s.sn_key = v_i.sn_key for update;
    v_bad := null;

    if v_d.doc_type in ('OB', 'GR', 'GN') then
      if v_s.sn_key is not null and v_s.status in ('in_stock', 'reserved', 'borrowed', 'withdrawn') then
        v_bad := format('SN %s มีอยู่ในระบบแล้ว (%s)', v_i.sn, v_s.status);
      end if;
    elsif v_d.doc_type = 'RT' then
      if v_s.sn_key is null or v_s.status not in ('borrowed', 'withdrawn', 'sold') then
        v_bad := format('SN %s ไม่ได้อยู่นอกคลัง จึงรับคืนไม่ได้', v_i.sn);
      elsif v_d.return_of is not null and v_s.last_doc_id is distinct from v_d.return_of then
        v_bad := format('SN %s ไม่ได้ออกไปตามเอกสารที่อ้างอิง', v_i.sn);
      end if;
    else
      if v_s.sn_key is null then
        v_bad := format('ไม่พบ SN %s ในคลัง', v_i.sn);
      elsif v_s.warehouse_id is distinct from v_d.warehouse_id then
        v_bad := format('SN %s ไม่ได้อยู่ในคลังที่เลือก', v_i.sn);
      elsif v_d.doc_type in ('SO', 'BR', 'WD') and not (v_s.status = 'in_stock' or (v_s.status = 'reserved' and v_d.doc_type = 'SO')) then
        v_bad := format('SN %s สถานะ %s จ่ายออกไม่ได้', v_i.sn, v_s.status);
      elsif v_d.doc_type in ('SO', 'BR', 'WD', 'RV') and v_s.condition <> 'good' then
        v_bad := format('SN %s เป็นของเสีย จ่ายได้เฉพาะใบจำหน่ายออก', v_i.sn);
      elsif v_d.doc_type in ('WO', 'TR') and v_s.status not in ('in_stock', 'reserved') then
        v_bad := format('SN %s ไม่ได้อยู่ในคลัง', v_i.sn);
      elsif v_d.doc_type = 'RV' and v_s.status <> 'in_stock' then
        v_bad := format('SN %s ไม่ว่างให้จอง (%s)', v_i.sn, v_s.status);
      elsif v_s.sku <> v_i.sku then
        v_bad := format('SN %s เป็นรหัส %s ไม่ใช่ %s', v_i.sn, v_s.sku, v_i.sku);
      end if;
    end if;
    if v_bad is not null then raise exception '%', v_bad; end if;

    -- new state
    if v_s.sn_key is null then
      v_new := row(v_i.sn_key, v_i.sn, v_i.sku, v_i.description, 'in_stock', v_i.condition, v_d.warehouse_id,
                   null, null, null, p_id, v_d.doc_date, null, now())::public.serials;
    else
      v_new := v_s;
      v_new.last_doc_id := p_id;
      v_new.updated_at := now();
    end if;

    case v_d.doc_type
      when 'OB', 'GR', 'GN' then
        v_new.sn := v_i.sn; v_new.sku := v_i.sku; v_new.description := coalesce(v_i.description, v_new.description);
        v_new.status := 'in_stock'; v_new.condition := v_i.condition; v_new.warehouse_id := v_d.warehouse_id;
        v_new.holder_name := null; v_new.company_id := null; v_new.due_date := null; v_new.sold_at := null;
        v_new.first_in_at := coalesce(v_new.first_in_at, v_d.doc_date);
      when 'RT' then
        v_new.status := 'in_stock'; v_new.condition := v_i.condition; v_new.warehouse_id := v_d.warehouse_id;
        v_new.holder_name := null; v_new.company_id := null; v_new.due_date := null;
      when 'SO' then
        v_new.status := 'sold'; v_new.holder_name := v_d.partner_name; v_new.company_id := v_d.company_id;
        v_new.sold_at := v_d.doc_date; v_new.due_date := null; v_new.warehouse_id := null;
      when 'BR', 'WD' then
        v_new.status := case v_d.doc_type when 'BR' then 'borrowed' else 'withdrawn' end;
        v_new.holder_name := v_d.partner_name; v_new.company_id := v_d.company_id; v_new.due_date := v_d.due_date;
        v_new.warehouse_id := null;
      when 'WO' then
        v_new.status := 'written_off'; v_new.warehouse_id := null; v_new.holder_name := null; v_new.company_id := null;
      when 'TR' then
        v_new.warehouse_id := v_d.to_warehouse_id;
      when 'RV' then
        v_new.status := 'reserved'; v_new.holder_name := v_d.partner_name; v_new.company_id := v_d.company_id;
        v_new.due_date := v_d.due_date;
    end case;

    insert into public.serial_moves (doc_id, sn_key, before, after)
    values (p_id, v_i.sn_key, case when v_s.sn_key is null then null else to_jsonb(v_s) end, to_jsonb(v_new));

    insert into public.serials values (v_new.*)
    on conflict (sn_key) do update set
      sn = excluded.sn, sku = excluded.sku, description = excluded.description, status = excluded.status,
      condition = excluded.condition, warehouse_id = excluded.warehouse_id, holder_name = excluded.holder_name,
      company_id = excluded.company_id, due_date = excluded.due_date, last_doc_id = excluded.last_doc_id,
      first_in_at = excluded.first_in_at, sold_at = excluded.sold_at, updated_at = excluded.updated_at;
  end loop;

  update public.stock_docs d set status = 'posted', posted_by = auth.uid(), posted_at = now()
   where d.id = p_id returning * into v_d;

  if (select c.stock_source from public.stock_config c where c.id = 1) = 'docs' then
    perform public.refresh_stock_from_serials();
  end if;
  return v_d;
end $$;

-- ---------------------------------------------------------------------------
-- Cancel: a draft is just marked cancelled; a posted document puts every SN back, as long as
-- no later document has moved that SN since (cancel the later one first).
-- ---------------------------------------------------------------------------
create or replace function public.cancel_stock_doc(p_id uuid, p_reason text)
returns public.stock_docs
language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.stock_docs;
  v_m record;
  v_later text;
begin
  if not public.has_perm('stock.post') then
    raise exception 'ยกเลิกเอกสารได้เฉพาะผู้มีสิทธิ์อนุมัติเอกสารคลัง' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผลที่ยกเลิก'; end if;
  select * into v_d from public.stock_docs d where d.id = p_id for update;
  if v_d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_d.status = 'cancelled' then raise exception 'เอกสารนี้ยกเลิกไปแล้ว'; end if;

  if v_d.status = 'posted' then
    select string_agg(distinct s.sn || ' (' || coalesce(d2.doc_no, '?') || ')', ', ') into v_later
      from public.serial_moves m
      join public.serials s on s.sn_key = m.sn_key
      left join public.stock_docs d2 on d2.id = s.last_doc_id
     where m.doc_id = p_id and s.last_doc_id is distinct from p_id;
    if v_later is not null then
      raise exception 'SN ถูกใช้ในเอกสารถัดไปแล้ว ต้องยกเลิกเอกสารนั้นก่อน: %', v_later;
    end if;
    for v_m in select * from public.serial_moves m where m.doc_id = p_id order by m.id desc loop
      if v_m.before is null then
        delete from public.serials s where s.sn_key = v_m.sn_key;
      else
        update public.serials s set
          sn = v_m.before ->> 'sn', sku = v_m.before ->> 'sku', description = v_m.before ->> 'description',
          status = v_m.before ->> 'status', condition = v_m.before ->> 'condition',
          warehouse_id = (v_m.before ->> 'warehouse_id')::uuid, holder_name = v_m.before ->> 'holder_name',
          company_id = (v_m.before ->> 'company_id')::uuid, due_date = (v_m.before ->> 'due_date')::date,
          last_doc_id = (v_m.before ->> 'last_doc_id')::uuid, first_in_at = (v_m.before ->> 'first_in_at')::date,
          sold_at = (v_m.before ->> 'sold_at')::date, updated_at = now()
        where s.sn_key = v_m.sn_key;
      end if;
    end loop;
  end if;

  update public.stock_docs d
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_reason)
   where d.id = p_id returning * into v_d;

  if (select c.stock_source from public.stock_config c where c.id = 1) = 'docs' then
    perform public.refresh_stock_from_serials();
  end if;
  return v_d;
end $$;

-- ---------------------------------------------------------------------------
-- SN history: current state, every document (posted or cancelled) and every claim that names it
-- ---------------------------------------------------------------------------
create or replace function public.sn_history(p_sn text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_key text := public.sn_key(p_sn);
begin
  if not (public.has_perm('stock.view') or public.has_perm('stock.docs') or public.has_perm('stock.post')
          or public.has_perm('claims.view') or public.has_perm('claims')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  if v_key is null then return null; end if;
  return jsonb_build_object(
    'sn_key', v_key,
    'serial', (select to_jsonb(s) || jsonb_build_object('warehouse', w.name, 'company', c.name)
                 from public.serials s
                 left join public.warehouses w on w.id = s.warehouse_id
                 left join public.companies c on c.id = s.company_id
                where s.sn_key = v_key),
    'docs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'doc_no', d.doc_no, 'doc_type', d.doc_type, 'status', d.status, 'doc_date', d.doc_date,
               'partner_name', d.partner_name, 'company', c.name, 'ref_no', d.ref_no, 'customer_po', d.customer_po,
               'site_name', d.site_name, 'due_date', d.due_date, 'reason', d.reason, 'warehouse', w.name,
               'to_warehouse', w2.name, 'sku', i.sku, 'description', i.description, 'condition', i.condition,
               'posted_at', d.posted_at, 'cancel_reason', d.cancel_reason)
             order by d.doc_date, coalesce(d.posted_at, d.created_at))
        from public.stock_doc_items i
        join public.stock_docs d on d.id = i.doc_id
        left join public.companies c on c.id = d.company_id
        left join public.warehouses w on w.id = d.warehouse_id
        left join public.warehouses w2 on w2.id = d.to_warehouse_id
       where i.sn_key = v_key and d.posted_at is not null), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cl.id, 'claim_no', cl.claim_no, 'status', cl.status, 'created_at', cl.created_at,
               'company_name', coalesce(co.name, cl.company_name), 'model', cl.model, 'symptom', cl.symptom,
               'site_name', cl.site_name, 'case_id', cl.case_id)
             order by cl.created_at)
        from public.claims cl
        left join public.companies co on co.id = cl.company_id
       where exists (select 1 from unnest(cl.reported_sns) r where public.sn_key(r) = v_key)
          or exists (select 1 from public.claim_units u
                      where u.claim_id = cl.id
                        and v_key in (public.sn_key(u.iss_sn), public.sn_key(u.ret_sn), public.sn_key(u.rcv_sn), public.sn_key(u.ok_sn)))), '[]'::jsonb),
    'sn_changes', coalesce((
      select jsonb_agg(jsonb_build_object('old_sn', r.old_sn, 'new_sn', r.new_sn, 'status', r.status, 'created_at', r.created_at) order by r.created_at)
        from public.claim_sn_changes r
       where public.sn_key(r.old_sn) = v_key or public.sn_key(r.new_sn) = v_key), '[]'::jsonb)
  );
end $$;

-- partial search: SNs whose key contains the text (stock + claims), at most 30
create or replace function public.sn_search(p_q text)
returns table (sn text, sku text, status text, source text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_key text := public.sn_key(p_q);
begin
  if not (public.has_perm('stock.view') or public.has_perm('stock.docs') or public.has_perm('stock.post')
          or public.has_perm('claims.view') or public.has_perm('claims')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  if v_key is null or length(v_key) < 4 then return; end if;
  return query
  select x.sn, x.sku, x.status, x.source from (
    select s.sn, s.sku, s.status, 'stock'::text source from public.serials s where s.sn_key like '%' || v_key || '%'
    union all
    select distinct on (public.sn_key(r)) r, cl.model, cl.status, 'claim'
      from public.claims cl, unnest(cl.reported_sns) r
     where public.sn_key(r) like '%' || v_key || '%'
       and not exists (select 1 from public.serials s where s.sn_key = public.sn_key(r))
  ) x
  limit 30;
end $$;

-- out-of-warehouse SNs on one document that have not come back yet (for an RT that returns it)
create or replace function public.stock_doc_open_sns(p_doc uuid)
returns table (sku text, description text, sn text)
language sql stable security definer set search_path = ''
as $$
  select s.sku, s.description, s.sn from public.serials s
   where s.last_doc_id = p_doc and s.status in ('borrowed', 'withdrawn', 'sold')
     and (public.has_perm('stock.docs') or public.has_perm('stock.post'))
   order by s.sku, s.sn
$$;

revoke execute on function public.save_stock_doc(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.delete_stock_draft(uuid) from public, anon;
revoke execute on function public.refresh_stock_from_serials() from public, anon, authenticated;
revoke execute on function public.stock_syncs_guard() from public, anon, authenticated;
revoke execute on function public.set_stock_source(text, date) from public, anon;
revoke execute on function public.post_stock_doc(uuid) from public, anon;
revoke execute on function public.cancel_stock_doc(uuid, text) from public, anon;
revoke execute on function public.sn_history(text) from public, anon;
revoke execute on function public.sn_search(text) from public, anon;
revoke execute on function public.stock_doc_open_sns(uuid) from public, anon;
grant execute on function public.save_stock_doc(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.delete_stock_draft(uuid) to authenticated;
grant execute on function public.set_stock_source(text, date) to authenticated;
grant execute on function public.post_stock_doc(uuid) to authenticated;
grant execute on function public.cancel_stock_doc(uuid, text) to authenticated;
grant execute on function public.sn_history(text) to authenticated;
grant execute on function public.sn_search(text) to authenticated;
grant execute on function public.stock_doc_open_sns(uuid) to authenticated;
