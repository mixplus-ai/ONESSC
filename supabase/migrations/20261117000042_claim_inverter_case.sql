-- Migration 42 (owner 2026-11-17): every inverter in a claim has its own S/N Manager, Case no. (from the Engineer),
-- Issue and Description — all four required for every inverter added, any brand (owner: บังคับให้ใส่ทุกช่อง).
--   details.units[]: inverter rows carry manager_sn, case_no, issue, description
--   claim_units.case_no / manager_sn keep them per piece; claims.case_id lists every case no. of the claim
alter table public.claim_units
  add column if not exists case_no text,
  add column if not exists manager_sn text;

create or replace function public.submit_claim(p jsonb)
returns table (id uuid, claim_no text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.profiles;
  v_type text := nullif(trim(p ->> 'product_type'), '');
  v_brand uuid := nullif(p ->> 'brand_id', '')::uuid;
  v_slug text;
  v_rule public.claim_brand_rules;
  v_details jsonb := coalesce(p -> 'details', '{}'::jsonb);
  v_sns text[] := '{}';
  v_units jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_qty int := 0;
  v_model text := nullif(trim(p ->> 'model'), '');
  v_item jsonb;
  v_n int;
  v_company public.companies;
  v_claim public.claims;
  v_seq int := 0;
  v_u jsonb;
  v_req text;
  v_allowed text[];
  v_bad text;
  v_has_inv boolean;
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
  select b.slug into v_slug from public.brands b where b.id = v_brand;

  if jsonb_typeof(v_details -> 'units') = 'array' and jsonb_array_length(v_details -> 'units') > 0 then
    -- new form: one row per claimed piece
    v_rows := v_details -> 'units';
    if jsonb_array_length(v_rows) > 200 then raise exception 'เคลมได้ไม่เกิน 200 ชิ้นต่อใบ'; end if;
    for v_u in select * from jsonb_array_elements(v_rows) loop
      if coalesce(v_u ->> 'kind', v_type) not in ('inverter', 'optimizer', 'accessory', 'panel', 'battery', 'other') then
        raise exception 'ประเภทสินค้าไม่ถูกต้อง';
      end if;
      if coalesce(trim(v_u ->> 'model'), '') = '' then raise exception 'กรุณาเลือกรุ่นสินค้าให้ครบทุกชิ้น'; end if;
      if coalesce(trim(v_u ->> 'pos'), '') <> '' and trim(v_u ->> 'pos') !~ '^\d{1,3}(\.\d{1,3}){3}$' then
        raise exception 'ตำแหน่งต้องเป็นรูปแบบ 0.0.0.0 (แต่ละช่องไม่เกิน 3 หลัก)';
      end if;
    end loop;
    v_has_inv := exists (select 1 from jsonb_array_elements(v_rows) u where coalesce(u ->> 'kind', v_type) = 'inverter');
    if v_type = 'inverter' and not v_has_inv then raise exception 'กรุณาเพิ่ม Inverter ที่เคลมอย่างน้อย 1 ตัว'; end if;
    if v_has_inv and exists (select 1 from jsonb_array_elements(v_rows) u
                              where coalesce(u ->> 'kind', v_type) = 'inverter' and coalesce(trim(u ->> 'sn'), '') = '') then
      raise exception 'กรุณากรอก S/N ของ Inverter ทุกตัว';
    end if;
    -- SolarEdge: one piece per row, each with its own S/N, and only SolarEdge items
    if v_slug = 'solaredge' then
      if exists (select 1 from jsonb_array_elements(v_rows) u where coalesce(trim(u ->> 'sn'), '') = '') then
        raise exception 'SolarEdge เคลมเป็นรายชิ้น กรุณากรอก S/N ทุกชิ้น';
      end if;
      select array_agg(distinct upper(x)) into v_allowed from (
        select m.sku x from public.claim_stock_models(v_brand) m
        union select cm.model from public.claim_models cm where cm.brand_id = v_brand and cm.is_active) z;
      if cardinality(coalesce(v_allowed, '{}')) > 0 then
        select string_agg(distinct trim(u ->> 'model'), ', ') into v_bad
          from jsonb_array_elements(v_rows) u where upper(trim(u ->> 'model')) <> all (v_allowed);
        if v_bad is not null then raise exception 'เคลม SolarEdge เลือกได้เฉพาะสินค้า SolarEdge: %', v_bad; end if;
      end if;
    end if;
    v_qty := jsonb_array_length(v_rows);
    v_model := coalesce(v_model, (select left(string_agg(distinct trim(u ->> 'model'), ', '), 300) from jsonb_array_elements(v_rows) u));
    v_sns := coalesce((select array_agg(trim(u ->> 'sn')) from jsonb_array_elements(v_rows) u where coalesce(trim(u ->> 'sn'), '') <> ''), '{}');
    -- one S/N cannot be claimed twice in the same claim
    select string_agg(k, ', ') into v_bad from (
      select public.sn_key(u ->> 'sn') k from jsonb_array_elements(v_rows) u group by 1 having count(*) > 1) z where k is not null;
    if v_bad is not null then raise exception 'S/N ซ้ำในใบเคลม: %', v_bad; end if;
  elsif v_type = 'optimizer' then
    -- older client: optimizer items with qty
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
    v_has_inv := false;
  else
    if v_model is null then raise exception 'กรุณาเลือกหรือกรอกรุ่นสินค้า'; end if;
    v_qty := case when v_type in ('inverter', 'accessory') then 1
                  else coalesce(nullif(v_details ->> 'qty', '')::int, 1) end;
    if v_qty < 1 or v_qty > 200 then raise exception 'จำนวนต้องอยู่ระหว่าง 1–200'; end if;
    v_units := (select jsonb_agg(jsonb_build_object('pcode', v_model)) from generate_series(1, v_qty));
    v_sns := coalesce((select array_agg(s) from regexp_split_to_table(
               coalesce(v_details ->> 'bad_sn', '') || ' ' || coalesce(v_details ->> 'sn', ''), '[\s,;]+') s where s <> ''), '{}');
    if v_type = 'inverter' and cardinality(v_sns) = 0 then raise exception 'กรุณากรอก S/N ตัวที่เสีย'; end if;
    v_has_inv := v_type = 'inverter';
  end if;

  -- Owner 2026-11-17: every inverter on the claim (any brand) needs S/N Manager, Case no. from the Engineer,
  -- Issue and Description — the claimed ones (details.units) and the ones only referenced (details.inverters).
  if jsonb_array_length(v_rows) > 0 then
    select string_agg(coalesce(nullif(trim(x ->> 'sn'), ''), '?'), ', ') into v_bad
      from (select u x from jsonb_array_elements(v_rows) u where coalesce(u ->> 'kind', v_type) = 'inverter'
            union all
            select i from jsonb_array_elements(case when jsonb_typeof(v_details -> 'inverters') = 'array' then v_details -> 'inverters' else '[]'::jsonb end) i) z
     where coalesce(trim(coalesce(x ->> 'manager_sn', v_details ->> 'manager_sn')), '') = ''
        or coalesce(trim(coalesce(x ->> 'case_no', v_details ->> 'case_no')), '') = ''
        or coalesce(trim(coalesce(x ->> 'issue', v_details ->> 'issue')), '') = ''
        or coalesce(trim(coalesce(x ->> 'description', v_details ->> 'description')), '') = '';
    if v_bad is not null then
      raise exception 'กรุณากรอก S/N Manager, หมายเลข Case จาก Engineer, Issue และ Description ของ Inverter ทุกตัว (%)', v_bad;
    end if;
  elsif (v_type = 'inverter' or v_has_inv) and v_slug = 'solaredge' then
    if coalesce(trim(v_details ->> 'case_no'), '') = '' then
      raise exception 'กรุณากรอกหมายเลข Case จาก Engineer (ติดต่อ Support เพื่อขอเลข Case)';
    end if;
    if coalesce(trim(v_details ->> 'issue'), '') = '' then raise exception 'กรุณากรอก Issue'; end if;
    if coalesce(trim(v_details ->> 'description'), '') = '' then raise exception 'กรุณากรอก Description'; end if;
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
        raise exception 'กรุณากรอก %', case v_req when 'installer_name' then 'ผู้ติดตั้ง (EPC)' else 'ชื่อโครงการ (Project Name)' end;
      end if;
      if v_req = 'case_no' and (v_type = 'inverter' or v_has_inv) and coalesce(trim(v_details ->> 'case_no'), '') = ''
         and not exists (select 1 from jsonb_array_elements(v_rows) u where coalesce(trim(u ->> 'case_no'), '') <> '') then
        raise exception 'กรุณากรอกหมายเลข Case จาก Engineer';
      end if;
      if v_req = 'manager_sn' and (v_type = 'inverter' or v_has_inv) and coalesce(trim(v_details ->> 'manager_sn'), '') = ''
         and (jsonb_array_length(v_rows) = 0 or exists (select 1 from jsonb_array_elements(v_rows) u
                where coalesce(u ->> 'kind', v_type) = 'inverter' and coalesce(trim(u ->> 'manager_sn'), '') = '')) then
        raise exception 'กรุณากรอก S/N Manager Inverter';
      end if;
      if v_req = 'ref_inv_sn' and jsonb_array_length(v_rows) > 0 and exists (
           select 1 from jsonb_array_elements(v_rows) u
            where coalesce(u ->> 'kind', v_type) in ('optimizer', 'accessory', 'panel') and coalesce(trim(u ->> 'inv_sn'), '') = '') then
        raise exception 'กรุณาเลือก Inverter อ้างอิงของทุกชิ้น';
      end if;
    end loop;
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
          left(coalesce((select string_agg(distinct trim(u ->> 'case_no'), ', ') from jsonb_array_elements(v_rows) u where coalesce(trim(u ->> 'case_no'), '') <> ''),
                        nullif(trim(v_details ->> 'case_no'), '')), 300),
          left(nullif(trim(p ->> 'site_id'), ''), 120), v_qty, 'submitted')
  returning * into v_claim;

  if jsonb_array_length(v_rows) > 0 then
    for v_u in select * from jsonb_array_elements(v_rows) loop
      v_seq := v_seq + 1;
      insert into public.claim_units (claim_id, seq, pcode, item_type, reported_sn, ref_inv_sn, position, symptom, case_no, manager_sn)
      values (v_claim.id, v_seq, left(upper(trim(v_u ->> 'model')), 120), coalesce(v_u ->> 'kind', v_type),
              nullif(left(upper(trim(v_u ->> 'sn')), 80), ''),
              nullif(left(upper(trim(coalesce(v_u ->> 'inv_sn', case when coalesce(v_u ->> 'kind', v_type) = 'inverter' then v_u ->> 'sn' end))), 80), ''),
              nullif(trim(v_u ->> 'pos'), ''), nullif(left(trim(v_u ->> 'symptom'), 500), ''),
              nullif(left(trim(v_u ->> 'case_no'), 100), ''), nullif(left(upper(trim(v_u ->> 'manager_sn')), 80), ''));
    end loop;
  else
    for v_u in select * from jsonb_array_elements(v_units) loop
      v_seq := v_seq + 1;
      insert into public.claim_units (claim_id, seq, pcode, item_type) values (v_claim.id, v_seq, left(v_u ->> 'pcode', 120), v_type);
    end loop;
  end if;

  return query select v_claim.id, v_claim.claim_no;
end $$;
revoke execute on function public.submit_claim(jsonb) from public, anon;
grant execute on function public.submit_claim(jsonb) to authenticated;
