-- Migration 30: edit many products / codes at once in a table (หน้า "แก้สินค้าแบบตาราง").
--   products.bulk        edit product + code details in the table (name, brand, category, summary, unit, show/hide, open/close sale)
--   products.bulk_price  also edit prices in the table (base price, show price, special price + end date)
--   bulk_update_products(products, variants)  saves every changed row in one go; only the keys sent are changed
-- Staff with the old "products" permission can do both.

insert into public.permission_keys (key, label, description, sort, grp) values
  ('products.bulk', 'สินค้า: แก้รายละเอียดแบบตาราง (หลายรายการพร้อมกัน)', 'ชื่อ แบรนด์ หมวด คำอธิบายสั้น หน่วย แสดง/ซ่อน เปิด/ปิดขาย', 6, 'sales'),
  ('products.bulk_price', 'สินค้า: แก้ราคาแบบตาราง', 'ราคาปกติ แสดงราคา ราคาพิเศษ และวันสิ้นสุดราคาพิเศษ', 7, 'sales')
on conflict (key) do nothing;

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
      sort         = case when e ? 'sort' then coalesce(nullif(e ->> 'sort', '')::int, 0) else p.sort end
    where p.id = (e ->> 'id')::uuid;
    get diagnostics n = row_count; v_np := v_np + n;
  end loop;

  for e in select * from jsonb_array_elements(p_variants) loop
    if not v_info and (e ?| array['name', 'detail', 'unit', 'is_active']) then
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
      special_ends_at = case when e ? 'special_ends_at' then nullif(e ->> 'special_ends_at', '')::timestamptz else v.special_ends_at end
    where v.id = (e ->> 'id')::uuid;
    get diagnostics n = row_count; v_nv := v_nv + n;
  end loop;

  return jsonb_build_object('products', v_np, 'variants', v_nv);
end $$;
revoke execute on function public.bulk_update_products(jsonb, jsonb) from public, anon;
grant execute on function public.bulk_update_products(jsonb, jsonb) to authenticated;
