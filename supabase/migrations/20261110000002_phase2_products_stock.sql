-- One App SSC · Phase 2: products, prices, promotions, packages, stock, RFQ, reservations
--
-- ราคา: สาธารณะเห็นราคาปกติ (base_price) · ลูกค้าที่ล็อกอินและผูกบริษัทแล้วเห็นราคาเฉพาะบริษัท (Staff ตั้ง)
--       · ราคาโปรโมชั่นเห็นเหมือนกันทุกคนและมาก่อนราคาอื่น
-- สต๊อก: อ่านจาก Google Sheet (แท็บ "รวม") ด้วย edge function stock-sync หรืออัปโหลดไฟล์ · Staff ดูได้ Admin ซิงก์/แก้
-- รูป: หนึ่งสินค้า (products) มีรูปชุดเดียว · หลายรหัส (product_variants) ใช้รูปร่วมกันแต่รายละเอียดต่างกัน

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
insert into public.permission_keys (key, label, description, sort) values
  ('products', 'สินค้า โปรโมชั่น แพ็กเกจ', 'เพิ่ม/แก้ไขสินค้า รูป ราคาปกติ โปรโมชั่น และแพ็กเกจ', 5)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(trim(name)) > 0),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  logo_url      text,
  description   text,
  -- stock-sheet group codes that belong to this brand, e.g. {SLE-IVT,SLE-SPP}
  stock_groups  text[] not null default '{}',
  is_published  boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.product_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(trim(name)) > 0),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  parent_id     uuid references public.product_categories (id) on delete set null,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

-- A product = one model / family with one shared set of images and documents.
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references public.brands (id) on delete set null,
  category_id   uuid references public.product_categories (id) on delete set null,
  name          text not null check (length(trim(name)) > 0),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  summary       text,
  description   text,
  specs         jsonb not null default '[]'::jsonb,   -- [{"label":"กำลังไฟ","value":"10 kW"}]
  tags          text[] not null default '{}',
  cover_url     text,
  images        text[] not null default '{}',
  datasheet_url text,
  manual_url    text,
  video_url     text,
  is_published  boolean not null default false,
  is_featured   boolean not null default false,
  sort          int not null default 0,
  legacy_ref    text,                                  -- id/row in the old siamsolar catalog
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_brand_idx on public.products (brand_id);
create index products_category_idx on public.products (category_id);

-- A variant = one SKU (รหัสสินค้า). Shares the product's images; own detail and price.
create table public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  sku           text not null unique check (length(trim(sku)) > 0),
  name          text not null check (length(trim(name)) > 0),  -- e.g. "10 kW 3 เฟส"
  detail        text,                                            -- รายละเอียดเฉพาะรหัสนี้
  specs         jsonb not null default '[]'::jsonb,
  unit          text not null default 'ชิ้น',
  base_price    numeric(12, 2) check (base_price is null or base_price >= 0),  -- null = สอบถามราคา
  is_active     boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id);

-- ---------------------------------------------------------------------------
-- Prices per company (Staff sets; user sees only their approved company's rows)
-- ---------------------------------------------------------------------------
create table public.company_prices (
  company_id    uuid not null references public.companies (id) on delete cascade,
  variant_id    uuid not null references public.product_variants (id) on delete cascade,
  price         numeric(12, 2) not null check (price >= 0),
  note          text,
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (company_id, variant_id)
);
create index company_prices_variant_idx on public.company_prices (variant_id);

-- ---------------------------------------------------------------------------
-- Promotions (same price for everyone) and packages
-- ---------------------------------------------------------------------------
create table public.promotions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  description   text,
  banner_url    text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_published  boolean not null default false,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.promotion_items (
  promotion_id  uuid not null references public.promotions (id) on delete cascade,
  variant_id    uuid not null references public.product_variants (id) on delete cascade,
  promo_price   numeric(12, 2) not null check (promo_price >= 0),
  primary key (promotion_id, variant_id)
);
create index promotion_items_variant_idx on public.promotion_items (variant_id);

create table public.packages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  summary       text,
  description   text,
  cover_url     text,
  price         numeric(12, 2) check (price is null or price >= 0),   -- null = สอบถามราคา
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_published  boolean not null default false,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.package_items (
  package_id    uuid not null references public.packages (id) on delete cascade,
  variant_id    uuid not null references public.product_variants (id) on delete cascade,
  qty           numeric(12, 2) not null default 1 check (qty > 0),
  sort          int not null default 0,
  primary key (package_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- Stock (mirror of the Google Sheet; keyed by the sheet's รหัสสินค้า = variant sku)
-- ---------------------------------------------------------------------------
create table public.stock_config (
  id                 int primary key default 1 check (id = 1),
  source_url         text,              -- Google Sheet / Drive link
  sheet_name         text not null default 'รวม',
  backorder_sheet    text not null default 'ค้างส่ง',
  low_threshold      int not null default 5 check (low_threshold >= 0),
  show_qty_to_users  boolean not null default true,  -- logged-in customers see the number
  reservation_days   int not null default 7 check (reservation_days between 1 and 90),
  updated_by         uuid references auth.users (id) on delete set null,
  updated_at         timestamptz not null default now()
);
insert into public.stock_config (id) values (1);

create table public.stock_syncs (
  id            bigint generated always as identity primary key,
  source        text not null check (source in ('url', 'upload', 'cron')),
  file_name     text,
  sheet_date    text,            -- "วันที่ 30/10/2026" header from the sheet
  rows_total    int not null default 0,
  rows_matched  int not null default 0,   -- rows whose sku exists in product_variants
  backorders    int not null default 0,
  status        text not null default 'ok' check (status in ('ok', 'error')),
  error         text,
  started_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.stock_levels (
  sku           text primary key,
  store         text,
  stock_group   text,             -- กลุ่ม (KSTAR, SLE-IVT …)
  description   text,
  on_hand       numeric(12, 2) not null default 0,  -- สต๊อค
  reserved      numeric(12, 2) not null default 0,  -- หักจอง
  available     numeric(12, 2) not null default 0,  -- คงเหลือ
  incoming      numeric(12, 2) not null default 0,  -- ค้างรับ
  sync_id       bigint references public.stock_syncs (id) on delete set null,
  synced_at     timestamptz not null default now()
);

-- ค้างส่ง: open delivery orders from the accounting system (customer names → staff only)
create table public.stock_backorders (
  id            bigint generated always as identity primary key,
  sku           text not null,
  doc_no        text,
  doc_type      text,
  doc_date      date,
  pi_no         text,
  customer      text,
  delivery_note text,
  sales         text,
  qty           numeric(12, 2) not null default 0,
  sync_id       bigint references public.stock_syncs (id) on delete cascade
);
create index stock_backorders_sku_idx on public.stock_backorders (sku);

-- ---------------------------------------------------------------------------
-- Document numbers: QT-69-0001 (ใบขอราคา) · RS-69-0001 (ใบจอง) · year = พ.ศ. 2 หลัก
-- ---------------------------------------------------------------------------
create table public.doc_counters (
  prefix  text not null,
  yy      int not null,
  last_no int not null default 0,
  primary key (prefix, yy)
);

create or replace function public.next_doc_no(p_prefix text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_yy int := (extract(year from (now() at time zone 'Asia/Bangkok'))::int + 543) % 100;
  v_no int;
begin
  insert into public.doc_counters (prefix, yy, last_no) values (p_prefix, v_yy, 1)
  on conflict (prefix, yy) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_no;
  return format('%s-%s-%s', p_prefix, lpad(v_yy::text, 2, '0'), lpad(v_no::text, 4, '0'));
end $$;

-- ---------------------------------------------------------------------------
-- RFQ (ขอใบเสนอราคา)
-- ---------------------------------------------------------------------------
create table public.quote_requests (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  company_id      uuid references public.companies (id) on delete set null,
  contact_name    text,
  contact_phone   text,
  project_note    text check (length(project_note) <= 5000),
  status          text not null default 'new' check (status in ('new', 'in_progress', 'quoted', 'won', 'lost', 'cancelled')),
  quoted_total    numeric(14, 2),
  quote_file_path text,            -- object path in the quote-files bucket
  staff_note      text,
  handled_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index quote_requests_user_idx on public.quote_requests (user_id);
create index quote_requests_status_idx on public.quote_requests (status);

create table public.quote_request_items (
  id              bigint generated always as identity primary key,
  quote_id        uuid not null references public.quote_requests (id) on delete cascade,
  variant_id      uuid references public.product_variants (id) on delete set null,
  package_id      uuid references public.packages (id) on delete set null,
  label           text not null,           -- snapshot "SKU · name" so history survives edits
  qty             numeric(12, 2) not null check (qty > 0),
  unit_price      numeric(12, 2),           -- price the customer saw when sending
  check (variant_id is not null or package_id is not null)
);
create index quote_request_items_quote_idx on public.quote_request_items (quote_id);

-- ---------------------------------------------------------------------------
-- Reservations (จองสินค้า) — hold stock until staff records it in the stock system
-- ---------------------------------------------------------------------------
create table public.reservations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  company_id      uuid references public.companies (id) on delete set null,
  note            text check (length(note) <= 2000),
  -- pending/confirmed hold stock in the app; closed = recorded in the sheet (it now shows in หักจอง)
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'closed', 'cancelled')),
  expires_at      timestamptz not null,
  staff_note      text,
  handled_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index reservations_user_idx on public.reservations (user_id);
create index reservations_status_idx on public.reservations (status);

create table public.reservation_items (
  id              bigint generated always as identity primary key,
  reservation_id  uuid not null references public.reservations (id) on delete cascade,
  variant_id      uuid not null references public.product_variants (id) on delete restrict,
  sku             text not null,
  label           text not null,
  qty             numeric(12, 2) not null check (qty > 0)
);
create index reservation_items_res_idx on public.reservation_items (reservation_id);
create index reservation_items_sku_idx on public.reservation_items (sku);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + audit
-- ---------------------------------------------------------------------------
create trigger brands_touch before update on public.brands for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger variants_touch before update on public.product_variants for each row execute function public.touch_updated_at();
create trigger company_prices_touch before update on public.company_prices for each row execute function public.touch_updated_at();
create trigger promotions_touch before update on public.promotions for each row execute function public.touch_updated_at();
create trigger packages_touch before update on public.packages for each row execute function public.touch_updated_at();
create trigger stock_config_touch before update on public.stock_config for each row execute function public.touch_updated_at();
create trigger quote_requests_touch before update on public.quote_requests for each row execute function public.touch_updated_at();
create trigger reservations_touch before update on public.reservations for each row execute function public.touch_updated_at();

create trigger audit_brands after insert or update or delete on public.brands for each row execute function public.audit_row();
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
create trigger audit_variants after insert or update or delete on public.product_variants for each row execute function public.audit_row();
create trigger audit_promotions after insert or update or delete on public.promotions for each row execute function public.audit_row();
create trigger audit_packages after insert or update or delete on public.packages for each row execute function public.audit_row();
create trigger audit_stock_config after update on public.stock_config for each row execute function public.audit_row();
create trigger audit_quote_requests after update or delete on public.quote_requests for each row execute function public.audit_row();
create trigger audit_reservations after update or delete on public.reservations for each row execute function public.audit_row();

-- company_prices has a composite key → own audit trigger so every price change is traceable
create or replace function public.audit_company_price()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_row public.company_prices := coalesce(new, old);
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.audit_logs (actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), v_email, lower(tg_op), 'company_prices', v_row.company_id || ':' || v_row.variant_id,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return v_row;
end $$;
create trigger audit_company_prices after insert or update or delete on public.company_prices
  for each row execute function public.audit_company_price();

-- staff stamp on company prices
create or replace function public.company_prices_stamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger company_prices_stamp before insert or update on public.company_prices
  for each row execute function public.company_prices_stamp();

-- Staff may only change the workflow columns of a quote / reservation
create or replace function public.quote_requests_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  new.id := old.id; new.code := old.code; new.user_id := old.user_id;
  new.company_id := old.company_id; new.created_at := old.created_at;
  new.contact_name := old.contact_name; new.contact_phone := old.contact_phone;
  new.project_note := old.project_note;
  if public.is_staff_or_admin() then new.handled_by := auth.uid(); else new.handled_by := old.handled_by; end if;
  return new;
end $$;
create trigger quote_requests_guard before update on public.quote_requests
  for each row execute function public.quote_requests_guard();

create or replace function public.reservations_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  new.id := old.id; new.code := old.code; new.user_id := old.user_id;
  new.company_id := old.company_id; new.created_at := old.created_at; new.note := old.note;
  if public.is_staff_or_admin() then new.handled_by := auth.uid(); else new.handled_by := old.handled_by; end if;
  return new;
end $$;
create trigger reservations_guard before update on public.reservations
  for each row execute function public.reservations_guard();

-- ---------------------------------------------------------------------------
-- Stock read model
-- ---------------------------------------------------------------------------
-- Quantity held by app reservations that staff have not yet recorded in the sheet
create or replace function public.app_holds()
returns table (sku text, held numeric)
language sql stable security definer set search_path = ''
as $$
  select ri.sku, sum(ri.qty)
  from public.reservation_items ri
  join public.reservations r on r.id = ri.reservation_id
  where r.status in ('pending', 'confirmed') and r.expires_at > now()
  group by ri.sku
$$;

-- Public stock status for a list of SKUs. Anonymous visitors get the status only;
-- signed-in users also get the number when stock_config.show_qty_to_users is on.
create or replace function public.stock_status(p_skus text[])
returns table (sku text, status text, available numeric, synced_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with cfg as (select low_threshold, show_qty_to_users from public.stock_config where id = 1),
  s as (
    select k.sku,
           sl.available - coalesce(h.held, 0) as avail,
           sl.incoming,
           sl.synced_at,
           sl.sku is not null as known
    from unnest(p_skus) as k(sku)
    left join public.stock_levels sl on sl.sku = k.sku
    left join public.app_holds() h on h.sku = k.sku
  )
  select s.sku,
         case when not s.known then 'unknown'
              when s.avail <= 0 and s.incoming > 0 then 'incoming'
              when s.avail <= 0 then 'out'
              when s.avail <= cfg.low_threshold then 'low'
              else 'in_stock' end,
         case when s.known and (public.is_staff_or_admin() or (auth.uid() is not null and cfg.show_qty_to_users))
              then greatest(s.avail, 0) end,
         s.synced_at
  from s cross join cfg
$$;

-- Staff stock board: every sheet row + app holds + catalog link
create or replace function public.stock_board()
returns table (
  sku text, store text, stock_group text, description text,
  on_hand numeric, reserved numeric, available numeric, incoming numeric,
  app_held numeric, sellable numeric, backorder_qty numeric,
  variant_id uuid, product_id uuid, product_name text, synced_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_or_admin() then
    raise exception 'เฉพาะ Staff / Admin' using errcode = '42501';
  end if;
  return query
  select sl.sku, sl.store, sl.stock_group, sl.description,
         sl.on_hand, sl.reserved, sl.available, sl.incoming,
         coalesce(h.held, 0), sl.available - coalesce(h.held, 0),
         coalesce(b.qty, 0),
         v.id, p.id, p.name, sl.synced_at
  from public.stock_levels sl
  left join public.app_holds() h on h.sku = sl.sku
  left join (select bo.sku, sum(bo.qty) qty from public.stock_backorders bo group by bo.sku) b on b.sku = sl.sku
  left join public.product_variants v on v.sku = sl.sku
  left join public.products p on p.id = v.product_id
  order by sl.stock_group nulls last, sl.sku;
end $$;

-- Replace the stock mirror with a parsed sheet. Called by the stock-sync edge function
-- (service role, no auth.uid()) or by an Admin uploading a file from the back office.
-- p_rows: [{sku, store, group, description, on_hand, reserved, available, incoming}]
-- p_backorders: [{sku, doc_no, doc_type, doc_date, pi_no, customer, delivery_note, sales, qty}] or null to keep
create or replace function public.apply_stock_sync(
  p_source text, p_file_name text, p_sheet_date text, p_rows jsonb, p_backorders jsonb default null
)
returns public.stock_syncs
language plpgsql security definer set search_path = ''
as $$
declare
  v_sync public.stock_syncs;
  v_total int;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่ซิงก์สต๊อกได้' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบแถวสต๊อกในไฟล์ (ตรวจชื่อแท็บและหัวตาราง "รหัสสินค้า")';
  end if;

  insert into public.stock_syncs (source, file_name, sheet_date, started_by)
  values (p_source, p_file_name, p_sheet_date, auth.uid())
  returning * into v_sync;

  -- the sheet is the source of truth: rows missing from it are removed
  delete from public.stock_levels;
  insert into public.stock_levels (sku, store, stock_group, description, on_hand, reserved, available, incoming, sync_id, synced_at)
  select distinct on (trim(r ->> 'sku'))
         trim(r ->> 'sku'), nullif(trim(r ->> 'store'), ''), nullif(trim(r ->> 'group'), ''), nullif(trim(r ->> 'description'), ''),
         coalesce((r ->> 'on_hand')::numeric, 0), coalesce((r ->> 'reserved')::numeric, 0),
         coalesce((r ->> 'available')::numeric, 0), coalesce((r ->> 'incoming')::numeric, 0),
         v_sync.id, now()
  from jsonb_array_elements(p_rows) r
  where nullif(trim(r ->> 'sku'), '') is not null;
  get diagnostics v_total = row_count;

  if p_backorders is not null and jsonb_typeof(p_backorders) = 'array' then
    delete from public.stock_backorders;
    insert into public.stock_backorders (sku, doc_no, doc_type, doc_date, pi_no, customer, delivery_note, sales, qty, sync_id)
    select trim(b ->> 'sku'), b ->> 'doc_no', b ->> 'doc_type', nullif(b ->> 'doc_date', '')::date, b ->> 'pi_no',
           b ->> 'customer', b ->> 'delivery_note', b ->> 'sales', coalesce((b ->> 'qty')::numeric, 0), v_sync.id
    from jsonb_array_elements(p_backorders) b
    where nullif(trim(b ->> 'sku'), '') is not null;
  end if;

  update public.stock_syncs
     set rows_total = v_total,
         rows_matched = (select count(*) from public.stock_levels sl join public.product_variants v on v.sku = sl.sku),
         backorders = (select count(*) from public.stock_backorders)
   where id = v_sync.id
  returning * into v_sync;
  return v_sync;
end $$;

create or replace function public.log_stock_sync_error(p_source text, p_file_name text, p_error text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'เฉพาะ Admin' using errcode = '42501';
  end if;
  insert into public.stock_syncs (source, file_name, status, error, started_by)
  values (p_source, p_file_name, 'error', left(p_error, 2000), auth.uid());
end $$;

-- Admin: create draft products for sheet rows that are not in the catalog yet
-- (one product per SKU, unpublished, brand matched by brands.stock_groups or created from the group code)
create or replace function public.import_products_from_stock()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_brand uuid;
  v_product uuid;
  v_slug text;
  v_count int := 0;
begin
  if not public.has_perm('products') then
    raise exception 'ไม่มีสิทธิ์จัดการสินค้า' using errcode = '42501';
  end if;
  for v_row in
    select sl.* from public.stock_levels sl
    where not exists (select 1 from public.product_variants v where v.sku = sl.sku)
    order by sl.stock_group, sl.sku
  loop
    v_brand := null;
    if v_row.stock_group is not null then
      select b.id into v_brand from public.brands b
       where v_row.stock_group = any (b.stock_groups) or upper(b.name) = upper(v_row.stock_group)
       limit 1;
      if v_brand is null then
        v_slug := trim(both '-' from regexp_replace(lower(v_row.stock_group), '[^a-z0-9]+', '-', 'g'));
        if v_slug = '' then v_slug := 'brand'; end if;
        while exists (select 1 from public.brands where slug = v_slug) loop
          v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
        end loop;
        insert into public.brands (name, slug, stock_groups) values (v_row.stock_group, v_slug, array[v_row.stock_group])
        returning id into v_brand;
      end if;
    end if;

    v_slug := trim(both '-' from regexp_replace(lower(v_row.sku), '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then v_slug := 'p'; end if;
    while exists (select 1 from public.products where slug = v_slug) loop
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end loop;
    insert into public.products (brand_id, name, slug, summary, is_published)
    values (v_brand, coalesce(v_row.description, v_row.sku), v_slug, v_row.description, false)
    returning id into v_product;
    insert into public.product_variants (product_id, sku, name, detail)
    values (v_product, v_row.sku, v_row.sku, v_row.description);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Move a variant to another product (grouping several SKUs under one image set);
-- deletes the old product when it becomes empty.
create or replace function public.move_variant(p_variant_id uuid, p_product_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_old uuid;
begin
  if not public.has_perm('products') then
    raise exception 'ไม่มีสิทธิ์จัดการสินค้า' using errcode = '42501';
  end if;
  select product_id into v_old from public.product_variants where id = p_variant_id;
  if v_old is null then raise exception 'ไม่พบรหัสสินค้า'; end if;
  update public.product_variants set product_id = p_product_id where id = p_variant_id;
  delete from public.products p where p.id = v_old and v_old <> p_product_id
    and not exists (select 1 from public.product_variants v where v.product_id = v_old);
end $$;

-- ---------------------------------------------------------------------------
-- Customer RPCs: send RFQ, reserve, cancel
-- p_items: [{"variant_id": uuid, "qty": n}] and/or [{"package_id": uuid, "qty": n}]
-- ---------------------------------------------------------------------------
create or replace function public.effective_price(p_variant_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select min(pi.promo_price) from public.promotion_items pi
       join public.promotions pr on pr.id = pi.promotion_id
      where pi.variant_id = p_variant_id and pr.is_published
        and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now())),
    (select cp.price from public.company_prices cp
      where cp.variant_id = p_variant_id and cp.company_id = public.my_company_id()),
    (select v.base_price from public.product_variants v where v.id = p_variant_id)
  )
$$;

create or replace function public.create_quote_request(p_items jsonb, p_note text default null, p_contact_name text default null, p_contact_phone text default null)
returns public.quote_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_q public.quote_requests;
  v_profile public.profiles;
  v_item jsonb;
  v_label text;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active;
  if not found then raise exception 'กรุณาเข้าสู่ระบบ' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ยังไม่มีสินค้าในรายการ';
  end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'รายการมากเกินไป'; end if;

  insert into public.quote_requests (code, user_id, company_id, contact_name, contact_phone, project_note)
  values (public.next_doc_no('QT'), v_profile.id, public.my_company_id(),
          coalesce(nullif(trim(p_contact_name), ''), v_profile.full_name),
          coalesce(nullif(trim(p_contact_phone), ''), v_profile.phone),
          nullif(trim(p_note), ''))
  returning * into v_q;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'qty')::numeric is null or (v_item ->> 'qty')::numeric <= 0 then
      raise exception 'จำนวนต้องมากกว่า 0';
    end if;
    if v_item ? 'variant_id' then
      select v.sku || ' · ' || p.name || case when v.name <> v.sku then ' ' || v.name else '' end into v_label
        from public.product_variants v join public.products p on p.id = v.product_id
       where v.id = (v_item ->> 'variant_id')::uuid and v.is_active;
      if v_label is null then raise exception 'ไม่พบสินค้าบางรายการ'; end if;
      insert into public.quote_request_items (quote_id, variant_id, label, qty, unit_price)
      values (v_q.id, (v_item ->> 'variant_id')::uuid, v_label, (v_item ->> 'qty')::numeric,
              public.effective_price((v_item ->> 'variant_id')::uuid));
    else
      select pk.name into v_label from public.packages pk where pk.id = (v_item ->> 'package_id')::uuid and pk.is_published;
      if v_label is null then raise exception 'ไม่พบแพ็กเกจ'; end if;
      insert into public.quote_request_items (quote_id, package_id, label, qty, unit_price)
      select v_q.id, pk.id, 'แพ็กเกจ · ' || pk.name, (v_item ->> 'qty')::numeric, pk.price
        from public.packages pk where pk.id = (v_item ->> 'package_id')::uuid;
    end if;
    v_label := null;
  end loop;
  return v_q;
end $$;

create or replace function public.create_reservation(p_items jsonb, p_note text default null)
returns public.reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.reservations;
  v_profile public.profiles;
  v_item jsonb;
  v_variant public.product_variants;
  v_avail numeric;
  v_days int;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active;
  if not found then raise exception 'กรุณาเข้าสู่ระบบ' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ยังไม่มีสินค้าในรายการ';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'รายการมากเกินไป'; end if;
  select reservation_days into v_days from public.stock_config where id = 1;

  -- serialize reservations so two customers cannot both take the last unit
  perform pg_advisory_xact_lock(hashtext('onessc.reservations'));

  insert into public.reservations (code, user_id, company_id, note, expires_at)
  values (public.next_doc_no('RS'), v_profile.id, public.my_company_id(), nullif(trim(p_note), ''), now() + make_interval(days => v_days))
  returning * into v_r;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not v_item ? 'variant_id' then raise exception 'จองได้เฉพาะสินค้ารายรหัส'; end if;
    if (v_item ->> 'qty')::numeric is null or (v_item ->> 'qty')::numeric <= 0 then
      raise exception 'จำนวนต้องมากกว่า 0';
    end if;
    select * into v_variant from public.product_variants where id = (v_item ->> 'variant_id')::uuid and is_active;
    if not found then raise exception 'ไม่พบสินค้าบางรายการ'; end if;
    select sl.available - coalesce((select h.held from public.app_holds() h where h.sku = sl.sku), 0)
      into v_avail from public.stock_levels sl where sl.sku = v_variant.sku;
    if coalesce(v_avail, 0) < (v_item ->> 'qty')::numeric then
      raise exception 'สินค้า % คงเหลือไม่พอ (จองได้ %)', v_variant.sku, greatest(coalesce(v_avail, 0), 0);
    end if;
    insert into public.reservation_items (reservation_id, variant_id, sku, label, qty)
    select v_r.id, v_variant.id, v_variant.sku, v_variant.sku || ' · ' || p.name, (v_item ->> 'qty')::numeric
      from public.products p where p.id = v_variant.product_id;
  end loop;
  return v_r;
end $$;

create or replace function public.cancel_my_request(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_kind = 'reservation' then
    update public.reservations set status = 'cancelled'
     where id = p_id and user_id = auth.uid() and status in ('pending', 'confirmed');
  elsif p_kind = 'quote' then
    update public.quote_requests set status = 'cancelled'
     where id = p_id and user_id = auth.uid() and status in ('new', 'in_progress');
  end if;
  if not found then raise exception 'ยกเลิกรายการนี้ไม่ได้'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.company_prices enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_items enable row level security;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.stock_config enable row level security;
alter table public.stock_syncs enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_backorders enable row level security;
alter table public.doc_counters enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_request_items enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_items enable row level security;

-- catalog: published rows are public; 'products' permission edits
create policy brands_select on public.brands for select to anon, authenticated
  using (is_published or public.is_staff_or_admin());
create policy brands_write on public.brands for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));

create policy categories_select on public.product_categories for select to anon, authenticated using (true);
create policy categories_write on public.product_categories for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));

create policy products_select on public.products for select to anon, authenticated
  using (is_published or public.is_staff_or_admin());
create policy products_write on public.products for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));

create policy variants_select on public.product_variants for select to anon, authenticated
  using (public.is_staff_or_admin()
         or (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_published)));
create policy variants_write on public.product_variants for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));

-- company prices: Staff/Admin manage all; a customer reads only their approved company's prices
create policy company_prices_select on public.company_prices for select to authenticated
  using (public.is_staff_or_admin() or company_id = public.my_company_id());
create policy company_prices_write on public.company_prices for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- promotions / packages: public when published and running
create policy promotions_select on public.promotions for select to anon, authenticated
  using ((is_published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or public.is_staff_or_admin());
create policy promotions_write on public.promotions for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));
create policy promotion_items_select on public.promotion_items for select to anon, authenticated
  using (exists (select 1 from public.promotions pr where pr.id = promotion_id));
create policy promotion_items_write on public.promotion_items for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));

create policy packages_select on public.packages for select to anon, authenticated
  using ((is_published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or public.is_staff_or_admin());
create policy packages_write on public.packages for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));
create policy package_items_select on public.package_items for select to anon, authenticated
  using (exists (select 1 from public.packages pk where pk.id = package_id));
create policy package_items_write on public.package_items for all to authenticated
  using (public.has_perm('products')) with check (public.has_perm('products'));

-- stock: Staff read; Admin writes (sync goes through apply_stock_sync). Public uses stock_status().
create policy stock_config_select on public.stock_config for select to authenticated using (public.is_staff_or_admin());
create policy stock_config_update on public.stock_config for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy stock_syncs_select on public.stock_syncs for select to authenticated using (public.is_staff_or_admin());
create policy stock_levels_select on public.stock_levels for select to authenticated using (public.is_staff_or_admin());
create policy stock_levels_write on public.stock_levels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy stock_backorders_select on public.stock_backorders for select to authenticated using (public.is_staff_or_admin());
-- doc_counters: no policies → only security-definer functions touch it

-- RFQ / reservations: owner reads own; Staff/Admin read and update workflow columns.
-- Customers create rows only through create_quote_request / create_reservation.
create policy quote_requests_select on public.quote_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());
create policy quote_requests_update on public.quote_requests for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy quote_items_select on public.quote_request_items for select to authenticated
  using (exists (select 1 from public.quote_requests q where q.id = quote_id and (q.user_id = auth.uid() or public.is_staff_or_admin())));

create policy reservations_select on public.reservations for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());
create policy reservations_update on public.reservations for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy reservation_items_select on public.reservation_items for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (r.user_id = auth.uid() or public.is_staff_or_admin())));

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
revoke execute on function public.next_doc_no(text) from public, anon, authenticated;
revoke execute on function public.app_holds() from public, anon, authenticated;
revoke execute on function public.audit_company_price() from public, anon, authenticated;
revoke execute on function public.company_prices_stamp() from public, anon, authenticated;
revoke execute on function public.quote_requests_guard() from public, anon, authenticated;
revoke execute on function public.reservations_guard() from public, anon, authenticated;
revoke execute on function public.effective_price(uuid) from public, anon;
revoke execute on function public.stock_board() from public, anon;
revoke execute on function public.apply_stock_sync(text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.log_stock_sync_error(text, text, text) from public, anon;
revoke execute on function public.import_products_from_stock() from public, anon;
revoke execute on function public.move_variant(uuid, uuid) from public, anon;
revoke execute on function public.create_quote_request(jsonb, text, text, text) from public, anon;
revoke execute on function public.create_reservation(jsonb, text) from public, anon;
revoke execute on function public.cancel_my_request(text, uuid) from public, anon;

grant execute on function public.stock_status(text[]) to anon, authenticated;
grant execute on function public.effective_price(uuid) to authenticated;
grant execute on function public.stock_board() to authenticated;
grant execute on function public.apply_stock_sync(text, text, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.log_stock_sync_error(text, text, text) to authenticated, service_role;
grant execute on function public.import_products_from_stock() to authenticated;
grant execute on function public.move_variant(uuid, uuid) to authenticated;
grant execute on function public.create_quote_request(jsonb, text, text, text) to authenticated;
grant execute on function public.create_reservation(jsonb, text) to authenticated;
grant execute on function public.cancel_my_request(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: product images/documents (public) and quotation files (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('product-media', 'product-media', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('quote-files', 'quote-files', false)
on conflict (id) do nothing;

create policy product_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and public.has_perm('products'));
create policy product_media_update on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and public.has_perm('products'));
create policy product_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and public.has_perm('products'));

-- quote-files/<quote_id>/<file>: Staff upload; the customer who asked can download
create policy quote_files_select on storage.objects for select to authenticated
  using (bucket_id = 'quote-files' and (
    public.is_staff_or_admin()
    or exists (select 1 from public.quote_requests q
               where q.id::text = split_part(name, '/', 1) and q.user_id = auth.uid())));
create policy quote_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'quote-files' and public.is_staff_or_admin());
create policy quote_files_update on storage.objects for update to authenticated
  using (bucket_id = 'quote-files' and public.is_staff_or_admin());
create policy quote_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quote-files' and public.is_staff_or_admin());

-- ---------------------------------------------------------------------------
-- Seed: brands known from the stock sheet (Admin can rename / add logos later)
-- ---------------------------------------------------------------------------
insert into public.brands (name, slug, stock_groups, sort) values
  ('SolarEdge', 'solaredge', '{SLE-IVT,SLE-SPP}', 10),
  ('KSTAR', 'kstar', '{KSTAR}', 20),
  ('SUNWODA', 'sunwoda', '{SUNWODA}', 30),
  ('SMA', 'sma', '{SMA}', 40),
  ('JINKO', 'jinko', '{JINKO}', 50),
  ('LEAPTON', 'leapton', '{LEAPTON}', 60),
  ('SCHUTTEN', 'schutten', '{SCHUTTEN}', 70)
on conflict (name) do nothing;

insert into public.product_categories (name, slug, sort) values
  ('อินเวอร์เตอร์', 'inverter', 10),
  ('แบตเตอรี่', 'battery', 20),
  ('แผงโซลาร์เซลล์', 'pv-module', 30),
  ('ออปติไมเซอร์', 'optimizer', 40),
  ('อุปกรณ์เสริม / สายไฟ', 'accessory', 50),
  ('อะไหล่', 'spare-part', 60)
on conflict (name) do nothing;
