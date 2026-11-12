-- Migration 29: product warranty that starts when a serial is sold on a PI (stock document SO).
--   products.warranty_months          warranty for every code of the product (months)
--   product_variants.warranty_months  optional override for one code
--   sku_warranty_months(sku)          the months that apply to a stock code (variant override → product → null)
--   sns_info(...)                     + warranty_months, warranty_end (PI date + months) for the staff SN views
--   warranty_check(sn)                any signed-in user: model, purchase (PI) date, warranty end — no customer names

-- Warranty written on the PI line (promotion with a shorter warranty, special deal with a longer one).
--   stock_doc_items.warranty_months  months for this SN on this SO; empty = product default
--   when the SO is confirmed, empty lines get the product default copied in, so a later change to the
--   product's warranty never changes units already sold
alter table public.stock_doc_items add column if not exists warranty_months int
  check (warranty_months is null or warranty_months between 0 and 600);

alter table public.products add column if not exists warranty_months int
  check (warranty_months is null or warranty_months between 0 and 600);
alter table public.product_variants add column if not exists warranty_months int
  check (warranty_months is null or warranty_months between 0 and 600);

create or replace function public.sku_warranty_months(p_sku text)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(v.warranty_months, p.warranty_months)
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where upper(v.sku) = upper(trim(p_sku))
   limit 1
$$;

drop function if exists public.sns_info(text[]);
create function public.sns_info(p_sns text[])
returns table (sn text, sn_key text, sku text, description text, status text, condition text,
               sold_at date, sold_doc_id uuid, sold_doc_no text, sold_to text, sold_company_id uuid, ref_no text,
               warranty_months int, warranty_end date)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_perm('stock.view') or public.has_perm('stock.docs') or public.has_perm('stock.post')
          or public.has_perm('claims.view') or public.has_perm('claims')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  return query
  select q.sn, k.key, coalesce(s.sku, so.sku), s.description, s.status, s.condition,
         so.doc_date, so.id, so.doc_no, coalesce(c.name, so.partner_name), so.company_id, so.ref_no,
         w.m, case when so.doc_date is not null and w.m is not null then (so.doc_date + make_interval(months => w.m))::date end
    from unnest(p_sns) q(sn)
    cross join lateral (select public.sn_key(q.sn) key) k
    left join public.serials s on s.sn_key = k.key
    left join lateral (
      select d.*, i.sku, i.warranty_months line_months from public.stock_doc_items i join public.stock_docs d on d.id = i.doc_id
       where i.sn_key = k.key and d.doc_type = 'SO' and d.status = 'posted'
       order by d.doc_date desc, d.posted_at desc limit 1) so on true
    left join public.companies c on c.id = so.company_id
    cross join lateral (select coalesce(so.line_months, public.sku_warranty_months(coalesce(so.sku, s.sku))) m) w
   where k.key is not null;
end $$;
revoke execute on function public.sns_info(text[]) from public, anon;
grant execute on function public.sns_info(text[]) to authenticated;

-- customer-facing check: only what is printed on the PI line, never who bought it
create or replace function public.warranty_check(p_sn text)
returns table (sn text, sku text, product_name text, brand text, sold_at date, warranty_months int, warranty_end date)
language sql stable security definer set search_path = ''
as $$
  select i.sn, i.sku, coalesce(p.name || case when v.name is not null and v.name <> v.sku then ' · ' || v.name else '' end, i.description),
         b.name, d.doc_date, w.m,
         case when w.m is not null then (d.doc_date + make_interval(months => w.m))::date end
    from public.stock_doc_items i
    join public.stock_docs d on d.id = i.doc_id and d.doc_type = 'SO' and d.status = 'posted'
    left join public.product_variants v on upper(v.sku) = upper(i.sku)
    left join public.products p on p.id = v.product_id
    left join public.brands b on b.id = p.brand_id
    cross join lateral (select coalesce(i.warranty_months, public.sku_warranty_months(i.sku)) m) w
   where auth.uid() is not null
     and i.sn_key = public.sn_key(p_sn)
     and length(public.sn_key(p_sn)) >= 6
   order by d.doc_date desc, d.posted_at desc
   limit 1
$$;
revoke execute on function public.warranty_check(text) from public, anon;
grant execute on function public.warranty_check(text) to authenticated;
revoke execute on function public.sku_warranty_months(text) from public, anon;
grant execute on function public.sku_warranty_months(text) to authenticated;

-- save_stock_doc (from migration 22) now also keeps warranty_months on SO lines
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
  insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition, note, warranty_months)
  select v_d.id, (o - 1)::int, upper(trim(i ->> 'sku')), nullif(trim(i ->> 'description'), ''), upper(trim(i ->> 'sn')),
         case when i ->> 'condition' = 'defective' then 'defective' else 'good' end, nullif(trim(i ->> 'note'), ''),
         case when v_type = 'SO' then nullif(trim(coalesce(i ->> 'warranty_months', '')), '')::int end
    from jsonb_array_elements(p_items) with ordinality t(i, o)
   where public.sn_key(i ->> 'sn') is not null;

  select * into v_d from public.stock_docs d where d.id = v_d.id;
  return v_d;
end $$;

-- snapshot the product warranty on the lines when an SO is confirmed
create or replace function public.stock_docs_warranty_snapshot()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'posted' and new.doc_type = 'SO' then
    update public.stock_doc_items i set warranty_months = public.sku_warranty_months(i.sku)
     where i.doc_id = new.id and i.warranty_months is null;
  end if;
  return null;
end $$;
drop trigger if exists stock_docs_warranty_snapshot on public.stock_docs;
create trigger stock_docs_warranty_snapshot after update of status on public.stock_docs
  for each row execute function public.stock_docs_warranty_snapshot();
revoke execute on function public.stock_docs_warranty_snapshot() from public, anon, authenticated;

-- correct the warranty of one code on a confirmed SO (perm stock.post); p_months null = back to product default
create or replace function public.set_doc_item_warranty(p_doc uuid, p_sku text, p_months int)
returns int language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  if not public.has_perm('stock.post') then raise exception 'ไม่มีสิทธิ์แก้ประกันในใบขาย' using errcode = '42501'; end if;
  if p_months is not null and (p_months < 0 or p_months > 600) then raise exception 'ประกันต้องอยู่ระหว่าง 0–600 เดือน'; end if;
  if not exists (select 1 from public.stock_docs d where d.id = p_doc and d.doc_type = 'SO' and d.status = 'posted') then
    raise exception 'แก้ได้เฉพาะใบขาย (SO) ที่ยืนยันแล้ว';
  end if;
  update public.stock_doc_items i set warranty_months = coalesce(p_months, public.sku_warranty_months(i.sku))
   where i.doc_id = p_doc and upper(i.sku) = upper(trim(p_sku));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.set_doc_item_warranty(uuid, text, int) from public, anon;
grant execute on function public.set_doc_item_warranty(uuid, text, int) to authenticated;

-- the checker's signature also covers the warranty written on each line (unchanged for lines without one)
create or replace function public.stock_doc_hash(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select md5(
    (select (to_jsonb(d) - array['status', 'updated_at', 'checked_by', 'checked_at', 'checked_hash', 'posted_by', 'posted_at',
                                 'cancelled_by', 'cancelled_at', 'cancel_reason', 'created_at', 'created_by'])::text
       from public.stock_docs d where d.id = p_id)
    || coalesce((select string_agg(i.sku || ':' || i.sn_key || ':' || i.condition || coalesce(':w' || i.warranty_months, ''), ',' order by i.sn_key)
                   from public.stock_doc_items i where i.doc_id = p_id), ''))
$$;
