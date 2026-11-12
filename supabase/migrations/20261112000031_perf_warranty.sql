-- Migration 31: two-step warranty, e.g. "15/30 ปี" = 15 years product warranty / 30 years performance warranty (solar panels).
--   products.perf_warranty_months / product_variants.perf_warranty_months   performance warranty (months), optional
--   sku_perf_warranty_months(sku)   variant value → product value
--   sns_info / warranty_check       + perf_months, perf_end (counted from the same PI date)
--   bulk_update_products            table editor can also set warranty_months and perf_warranty_months (permission products.bulk)
-- Runs after migrations 29 and 30.

alter table public.products add column if not exists perf_warranty_months int
  check (perf_warranty_months is null or perf_warranty_months between 0 and 600);
alter table public.product_variants add column if not exists perf_warranty_months int
  check (perf_warranty_months is null or perf_warranty_months between 0 and 600);

create or replace function public.sku_perf_warranty_months(p_sku text)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(v.perf_warranty_months, p.perf_warranty_months)
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where upper(v.sku) = upper(trim(p_sku))
   limit 1
$$;
revoke execute on function public.sku_perf_warranty_months(text) from public, anon;
grant execute on function public.sku_perf_warranty_months(text) to authenticated;

drop function if exists public.sns_info(text[]);
create function public.sns_info(p_sns text[])
returns table (sn text, sn_key text, sku text, description text, status text, condition text,
               sold_at date, sold_doc_id uuid, sold_doc_no text, sold_to text, sold_company_id uuid, ref_no text,
               warranty_months int, warranty_end date, perf_months int, perf_end date)
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
         w.m, case when so.doc_date is not null and w.m is not null then (so.doc_date + make_interval(months => w.m))::date end,
         pf.m, case when so.doc_date is not null and pf.m is not null then (so.doc_date + make_interval(months => pf.m))::date end
    from unnest(p_sns) q(sn)
    cross join lateral (select public.sn_key(q.sn) key) k
    left join public.serials s on s.sn_key = k.key
    left join lateral (
      select d.*, i.sku, i.warranty_months line_months from public.stock_doc_items i join public.stock_docs d on d.id = i.doc_id
       where i.sn_key = k.key and d.doc_type = 'SO' and d.status = 'posted'
       order by d.doc_date desc, d.posted_at desc limit 1) so on true
    left join public.companies c on c.id = so.company_id
    cross join lateral (select coalesce(so.line_months, public.sku_warranty_months(coalesce(so.sku, s.sku))) m) w
    cross join lateral (select public.sku_perf_warranty_months(coalesce(so.sku, s.sku)) m) pf
   where k.key is not null;
end $$;
revoke execute on function public.sns_info(text[]) from public, anon;
grant execute on function public.sns_info(text[]) to authenticated;

-- customer-facing check: dates and model only, never who bought it
drop function if exists public.warranty_check(text);
create function public.warranty_check(p_sn text)
returns table (sn text, sku text, product_name text, brand text, sold_at date, warranty_months int, warranty_end date, perf_months int, perf_end date)
language sql stable security definer set search_path = ''
as $$
  select i.sn, i.sku, coalesce(p.name || case when v.name is not null and v.name <> v.sku then ' · ' || v.name else '' end, i.description),
         b.name, d.doc_date, w.m,
         case when w.m is not null then (d.doc_date + make_interval(months => w.m))::date end,
         pf.m, case when pf.m is not null then (d.doc_date + make_interval(months => pf.m))::date end
    from public.stock_doc_items i
    join public.stock_docs d on d.id = i.doc_id and d.doc_type = 'SO' and d.status = 'posted'
    left join public.product_variants v on upper(v.sku) = upper(i.sku)
    left join public.products p on p.id = v.product_id
    left join public.brands b on b.id = p.brand_id
    cross join lateral (select coalesce(i.warranty_months, public.sku_warranty_months(i.sku)) m) w
    cross join lateral (select public.sku_perf_warranty_months(i.sku) m) pf
   where auth.uid() is not null
     and i.sn_key = public.sn_key(p_sn)
     and length(public.sn_key(p_sn)) >= 6
   order by d.doc_date desc, d.posted_at desc
   limit 1
$$;
revoke execute on function public.warranty_check(text) from public, anon;
grant execute on function public.warranty_check(text) to authenticated;

create or replace function public.bulk_update_products(p_products jsonb, p_variants jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_full boolean := public.has_perm('products');
  v_info boolean := v_full or public.has_perm('products.bulk');
  v_price boolean := v_full or public.has_perm('products.bulk_price');
  v_np int := 0; v_nv int := 0; n int;
  e jsonb;
begin
  if not (v_info or v_price) then raise exception 'ไม่มีสิทธิ์แก้สินค้าแบบตาราง' using errcode = '42501'; end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' then p_products := '[]'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then p_variants := '[]'; end if;
  if jsonb_array_length(p_products) + jsonb_array_length(p_variants) > 2000 then raise exception 'แก้ได้ครั้งละไม่เกิน 2000 แถว'; end if;

  for e in select * from jsonb_array_elements(p_products) loop
    if not v_info and (e - 'id') <> '{}'::jsonb then raise exception 'ไม่มีสิทธิ์แก้รายละเอียดสินค้า' using errcode = '42501'; end if;
    if e ? 'name' and coalesce(trim(e ->> 'name'), '') = '' then raise exception 'ชื่อสินค้าว่างไม่ได้'; end if;
    update public.products p set
      name         = case when e ? 'name' then trim(e ->> 'name') else p.name end,
      brand_id     = case when e ? 'brand_id' then nullif(e ->> 'brand_id', '')::uuid else p.brand_id end,
      category_id  = case when e ? 'category_id' then nullif(e ->> 'category_id', '')::uuid else p.category_id end,
      summary      = case when e ? 'summary' then nullif(trim(e ->> 'summary'), '') else p.summary end,
      is_published = case when e ? 'is_published' then (e ->> 'is_published')::boolean else p.is_published end,
      is_featured  = case when e ? 'is_featured' then (e ->> 'is_featured')::boolean else p.is_featured end,
      sort         = case when e ? 'sort' then coalesce(nullif(e ->> 'sort', '')::int, 0) else p.sort end,
      warranty_months      = case when e ? 'warranty_months' then nullif(e ->> 'warranty_months', '')::int else p.warranty_months end,
      perf_warranty_months = case when e ? 'perf_warranty_months' then nullif(e ->> 'perf_warranty_months', '')::int else p.perf_warranty_months end
    where p.id = (e ->> 'id')::uuid;
    get diagnostics n = row_count; v_np := v_np + n;
  end loop;

  for e in select * from jsonb_array_elements(p_variants) loop
    if not v_info and (e ?| array['name', 'detail', 'unit', 'is_active', 'warranty_months', 'perf_warranty_months']) then
      raise exception 'ไม่มีสิทธิ์แก้รายละเอียดรหัสสินค้า' using errcode = '42501';
    end if;
    if not v_price and (e ?| array['base_price', 'show_price', 'special_price', 'special_ends_at']) then
      raise exception 'ไม่มีสิทธิ์แก้ราคา' using errcode = '42501';
    end if;
    if e ? 'name' and coalesce(trim(e ->> 'name'), '') = '' then raise exception 'ชื่อรุ่นว่างไม่ได้'; end if;
    update public.product_variants v set
      name            = case when e ? 'name' then trim(e ->> 'name') else v.name end,
      detail          = case when e ? 'detail' then nullif(trim(e ->> 'detail'), '') else v.detail end,
      unit            = case when e ? 'unit' then coalesce(nullif(trim(e ->> 'unit'), ''), 'ชิ้น') else v.unit end,
      is_active       = case when e ? 'is_active' then (e ->> 'is_active')::boolean else v.is_active end,
      base_price      = case when e ? 'base_price' then nullif(e ->> 'base_price', '')::numeric else v.base_price end,
      show_price      = case when e ? 'show_price' then (e ->> 'show_price')::boolean else v.show_price end,
      special_price   = case when e ? 'special_price' then nullif(e ->> 'special_price', '')::numeric else v.special_price end,
      special_ends_at = case when e ? 'special_ends_at' then nullif(e ->> 'special_ends_at', '')::timestamptz else v.special_ends_at end,
      warranty_months      = case when e ? 'warranty_months' then nullif(e ->> 'warranty_months', '')::int else v.warranty_months end,
      perf_warranty_months = case when e ? 'perf_warranty_months' then nullif(e ->> 'perf_warranty_months', '')::int else v.perf_warranty_months end
    where v.id = (e ->> 'id')::uuid;
    get diagnostics n = row_count; v_nv := v_nv + n;
  end loop;

  return jsonb_build_object('products', v_np, 'variants', v_nv);
end $$;
revoke execute on function public.bulk_update_products(jsonb, jsonb) from public, anon;
grant execute on function public.bulk_update_products(jsonb, jsonb) to authenticated;
