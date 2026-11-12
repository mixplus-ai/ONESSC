-- Migration 29: product warranty that starts when a serial is sold on a PI (stock document SO).
--   products.warranty_months          warranty for every code of the product (months)
--   product_variants.warranty_months  optional override for one code
--   sku_warranty_months(sku)          the months that apply to a stock code (variant override → product → null)
--   sns_info(...)                     + warranty_months, warranty_end (PI date + months) for the staff SN views
--   warranty_check(sn)                any signed-in user: model, purchase (PI) date, warranty end — no customer names

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
      select d.*, i.sku from public.stock_doc_items i join public.stock_docs d on d.id = i.doc_id
       where i.sn_key = k.key and d.doc_type = 'SO' and d.status = 'posted'
       order by d.doc_date desc, d.posted_at desc limit 1) so on true
    left join public.companies c on c.id = so.company_id
    cross join lateral (select public.sku_warranty_months(coalesce(so.sku, s.sku)) m) w
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
    cross join lateral (select public.sku_warranty_months(i.sku) m) w
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
