-- One App SSC · claim form v2 (owner 2026-11-12)
--  * Site ID is required and saved to claims.site_id (board column E)
--  * inverter claims always need the Case number from the Engineer
--  * details.units = one row per S/N: {model, sn, symptom, volt, ohm} (optimizer gets V / resistance),
--    details.po_no = PO / PI the customer bought with; their S/Ns count as reported S/Ns too
--  * claim_stock_models(brand): product codes + names from the stock sheet for that brand, for the model picker

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
  if coalesce(trim(p ->> 'site_id'), '') = '' then
    raise exception 'กรุณากรอก Site ID';
  end if;
  if v_type = 'inverter' and coalesce(trim(v_details ->> 'case_no'), '') = '' then
    raise exception 'กรุณากรอกหมายเลข Case จาก Engineer (ติดต่อ Support เพื่อขอเลข Case)';
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
  -- one row per S/N (with its own symptom / measurements) in details.units
  if jsonb_typeof(v_details -> 'units') = 'array' then
    v_sns := v_sns || coalesce((select array_agg(trim(u ->> 'sn')) from jsonb_array_elements(v_details -> 'units') u where coalesce(trim(u ->> 'sn'), '') <> ''), '{}');
  end if;
  v_sns := (select coalesce(array_agg(distinct upper(s)), '{}') from unnest(v_sns) s);
  if cardinality(v_sns) > 500 then raise exception 'SN มากเกินไป กรุณาแนบไฟล์ Excel แทน'; end if;

  if v_me.company_status = 'approved' and v_me.company_id is not null then
    select * into v_company from public.companies c where c.id = v_me.company_id;
  end if;

  insert into public.claims (source, user_id, company_id, company_name, brand_id, product_type, model,
                             contact_name, contact_phone, contact_email, installer_name, site_name,
                             details, symptom, reported_sns, delivery_type, delivery_address, legacy_ref,
                             case_id, site_id, qty, status)
  values ('customer', v_me.id, v_company.id,
          coalesce(v_company.name, nullif(trim(p ->> 'company_name'), ''), v_me.company_name),
          v_brand, v_type, left(v_model, 300),
          trim(p ->> 'contact_name'), trim(p ->> 'contact_phone'), v_me.email,
          nullif(trim(p ->> 'installer_name'), ''), nullif(trim(p ->> 'site_name'), ''),
          v_details, nullif(trim(p ->> 'symptom'), ''), v_sns,
          case when p ->> 'delivery_type' = 'shipping' then 'shipping' else 'pickup' end,
          case when p ->> 'delivery_type' = 'shipping' then nullif(trim(p ->> 'delivery_address'), '') end,
          nullif(trim(p ->> 'legacy_ref'), ''),
          nullif(trim(v_details ->> 'case_no'), ''), left(nullif(trim(p ->> 'site_id'), ''), 120), v_qty, 'submitted')
  returning * into v_claim;

  for v_u in select * from jsonb_array_elements(v_units) loop
    v_seq := v_seq + 1;
    insert into public.claim_units (claim_id, seq, pcode) values (v_claim.id, v_seq, left(v_u ->> 'pcode', 120));
  end loop;

  return query select v_claim.id, v_claim.claim_no;
end $$;

-- product codes + names from the stock sheet for one brand (customers cannot read stock_levels)
create or replace function public.claim_stock_models(p_brand uuid)
returns table (sku text, description text)
language sql stable security definer set search_path = ''
as $$
  select distinct on (sl.sku) sl.sku, sl.description
  from public.stock_levels sl
  join public.brands b on b.id = p_brand
  where sl.stock_group = any (coalesce(b.stock_groups, '{}')) or upper(sl.stock_group) = upper(b.name)
  order by sl.sku
$$;
revoke execute on function public.claim_stock_models(uuid) from public, anon;
grant execute on function public.claim_stock_models(uuid) to authenticated;
