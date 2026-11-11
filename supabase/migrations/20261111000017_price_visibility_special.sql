-- One App SSC · per-SKU price visibility and a quick "ราคาพิเศษ" (special price) set from the product page.
-- show_price = false → the website shows "สอบถามราคา" instead of any price (base, company, promo or special).
-- special_price (optional end date) acts like a promotion price for everyone: the lower of a running promotion and
-- a running special price wins, and both beat the company price, as promotions already do.

alter table public.product_variants
  add column if not exists show_price      boolean not null default true,
  add column if not exists special_price   numeric(12, 2) check (special_price is null or special_price >= 0),
  add column if not exists special_ends_at timestamptz;

comment on column public.product_variants.show_price      is 'false = หน้าเว็บขึ้น สอบถามราคา';
comment on column public.product_variants.special_price   is 'ราคาพิเศษ (ทุกคนเห็น) ว่าง = ไม่มี';
comment on column public.product_variants.special_ends_at is 'ราคาพิเศษหมดเขต ว่าง = ไม่มีวันหมด';

-- Price used for quote snapshots (staff side). Special price counts like a promotion.
create or replace function public.effective_price(p_variant_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select min(x) from (
       select pi.promo_price as x from public.promotion_items pi
         join public.promotions pr on pr.id = pi.promotion_id
        where pi.variant_id = p_variant_id and pr.is_published
          and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now())
       union all
       select v.special_price from public.product_variants v
        where v.id = p_variant_id and v.special_price is not null and (v.special_ends_at is null or v.special_ends_at > now())
     ) s),
    (select cp.price from public.company_prices cp
      where cp.variant_id = p_variant_id and cp.company_id = public.my_company_id()),
    (select v.base_price from public.product_variants v where v.id = p_variant_id)
  )
$$;
revoke execute on function public.effective_price(uuid) from public, anon;
grant execute on function public.effective_price(uuid) to authenticated;
