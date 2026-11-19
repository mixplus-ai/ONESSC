-- Migration 40: claims meeting #1 (2026-11-17), section 3.
--   * one claim can hold several inverters, each with its S/N and the failed panel position (0.0.0.0);
--     optimizers / accessories / panels name the inverter (string) they belong to
--   * each claimed piece is its own row (claim_units) with what the customer reported
--   * SolarEdge: every piece needs its own S/N and the model must be a SolarEdge item
--   * "ชื่อไซต์งาน" is now "ชื่อโครงการ (Project Name)" (same column site_name)
--   * stock documents made automatically per claim step (claim_stock_action):
--       step 2  TR  main stock → คลังจองเคลม (SN reserved for the customer)
--               BR  ใบเคลมสินค้า: staff cut the replacement out of the system (SN with the customer)
--       step 3  RT  receive the returned unit into คลังรับเคลมรอตรวจ
--               TR  inspection: good → main stock, bad → คลังของเสีย
--               WO  staff cut the defective unit out of the system
--       step 4  GN  replacement from the manufacturer into main stock
--     Every document is posted at once with serial_moves, so cancel_stock_doc can still reverse it.
--   * stock numbers (refresh_stock_from_serials) count only warehouses with role 'main'.

-- ---------------------------------------------------------------------------
-- Warehouses: role
-- ---------------------------------------------------------------------------
alter table public.warehouses
  add column if not exists role text not null default 'main'
    check (role in ('main', 'claim_hold', 'claim_check', 'defect'));
create unique index if not exists warehouses_one_system_role on public.warehouses (role) where role <> 'main';

insert into public.warehouses (code, name, sort, role) values
  ('CLM-HOLD', 'คลังจองเคลม', 90, 'claim_hold'),
  ('CLM-CHECK', 'คลังรับเคลมรอตรวจ', 91, 'claim_check'),
  ('DEFECT', 'คลังของเสีย', 92, 'defect')
on conflict (code) do nothing;
update public.warehouses set role = 'claim_hold' where code = 'CLM-HOLD' and role = 'main'
  and not exists (select 1 from public.warehouses w where w.role = 'claim_hold');
update public.warehouses set role = 'claim_check' where code = 'CLM-CHECK' and role = 'main'
  and not exists (select 1 from public.warehouses w where w.role = 'claim_check');
update public.warehouses set role = 'defect' where code = 'DEFECT' and role = 'main'
  and not exists (select 1 from public.warehouses w where w.role = 'defect');

-- stock for the shop / stock page: only SNs in main warehouses (claim and defect warehouses are not for sale)
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
                 (select count(*) from public.serials s join public.warehouses w on w.id = s.warehouse_id and w.role = 'main'
                   where s.sku = l.sku and s.status in ('in_stock', 'reserved') and s.condition = 'good') on_hand,
                 (select count(*) from public.serials s join public.warehouses w on w.id = s.warehouse_id and w.role = 'main'
                   where s.sku = l.sku and s.status = 'reserved') reserved
            from public.stock_levels l) x
   where x.sku = sl.sku;
  insert into public.stock_levels (sku, description, on_hand, reserved, available)
  select s.sku, max(s.description),
         count(*) filter (where s.status in ('in_stock', 'reserved') and s.condition = 'good'),
         count(*) filter (where s.status = 'reserved'),
         count(*) filter (where s.status = 'in_stock' and s.condition = 'good')
    from public.serials s
    join public.warehouses w on w.id = s.warehouse_id and w.role = 'main'
   where not exists (select 1 from public.stock_levels l where l.sku = s.sku)
   group by s.sku;
end $$;

-- ---------------------------------------------------------------------------
-- Claim units: what the customer reported for each piece
-- ---------------------------------------------------------------------------
alter table public.claim_units
  add column if not exists item_type   text check (item_type in ('inverter', 'optimizer', 'accessory', 'panel', 'battery', 'other')),
  add column if not exists reported_sn text,      -- S/N the customer reported for this piece
  add column if not exists ref_inv_sn  text,      -- inverter (string) this piece belongs to
  add column if not exists position    text check (position ~ '^\d{1,3}(\.\d{1,3}){3}$'),  -- failed panel position 0.0.0.0
  add column if not exists symptom     text,
  add column if not exists ret_result  text check (ret_result in ('good', 'bad'));         -- step 3 inspection
create index if not exists claim_units_reported_key_idx on public.claim_units (public.sn_key(reported_sn));

-- ---------------------------------------------------------------------------
-- submit_claim: one claim_unit per reported piece (details.units), inverters in details.inverters
--   details.inverters: [{sn, model, pos}]  every inverter on the job (claimed or only referenced)
--   details.units:     [{kind, model, sn, symptom, pos, inv_sn, volt, ohm}]  one row per claimed piece
-- Older clients (no details.units) keep the qty-based behaviour.
-- ---------------------------------------------------------------------------
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

  -- SolarEdge inverter: Case no., Issue and Description from the Engineer are required.
  if (v_type = 'inverter' or v_has_inv) and v_slug = 'solaredge' then
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
      if v_req = 'case_no' and (v_type = 'inverter' or v_has_inv) and coalesce(trim(v_details ->> 'case_no'), '') = '' then
        raise exception 'กรุณากรอกหมายเลข Case จาก Engineer';
      end if;
      if v_req = 'manager_sn' and (v_type = 'inverter' or v_has_inv) and coalesce(trim(v_details ->> 'manager_sn'), '') = '' then
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
          nullif(trim(v_details ->> 'case_no'), ''), left(nullif(trim(p ->> 'site_id'), ''), 120), v_qty, 'submitted')
  returning * into v_claim;

  if jsonb_array_length(v_rows) > 0 then
    for v_u in select * from jsonb_array_elements(v_rows) loop
      v_seq := v_seq + 1;
      insert into public.claim_units (claim_id, seq, pcode, item_type, reported_sn, ref_inv_sn, position, symptom)
      values (v_claim.id, v_seq, left(upper(trim(v_u ->> 'model')), 120), coalesce(v_u ->> 'kind', v_type),
              nullif(left(upper(trim(v_u ->> 'sn')), 80), ''),
              nullif(left(upper(trim(coalesce(v_u ->> 'inv_sn', case when coalesce(v_u ->> 'kind', v_type) = 'inverter' then v_u ->> 'sn' end))), 80), ''),
              nullif(trim(v_u ->> 'pos'), ''), nullif(left(trim(v_u ->> 'symptom'), 500), ''));
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

-- ---------------------------------------------------------------------------
-- Claim stock documents
-- ---------------------------------------------------------------------------
create or replace function public.claim_wh(p_role text)
returns uuid language sql stable security definer set search_path = ''
as $$ select w.id from public.warehouses w where w.role = p_role and w.is_active order by w.sort, w.code limit 1 $$;
revoke execute on function public.claim_wh(text) from public, anon, authenticated;

-- move one SN for a claim document: write serial_moves (before/after) and the serials row
create or replace function public.claim_serial_move(p_doc uuid, p_sn text, p_sku text, p_desc text, p_status text,
                                                    p_condition text, p_wh uuid, p_holder text, p_company uuid, p_date date)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := public.sn_key(p_sn);
  v_s public.serials;
  v_new public.serials;
begin
  select * into v_s from public.serials s where s.sn_key = v_key for update;
  if v_s.sn_key is null then
    v_new := row(v_key, upper(trim(p_sn)), p_sku, p_desc, p_status, p_condition, p_wh, p_holder, p_company, null, p_doc,
                 p_date, null, now())::public.serials;
  else
    v_new := v_s;
    v_new.sku := coalesce(nullif(p_sku, ''), v_s.sku);
    v_new.description := coalesce(p_desc, v_s.description);
    v_new.status := p_status; v_new.condition := p_condition; v_new.warehouse_id := p_wh;
    v_new.holder_name := p_holder; v_new.company_id := p_company; v_new.due_date := null;
    v_new.last_doc_id := p_doc; v_new.updated_at := now();
  end if;
  insert into public.serial_moves (doc_id, sn_key, before, after)
  values (p_doc, v_key, case when v_s.sn_key is null then null else to_jsonb(v_s) end, to_jsonb(v_new));
  insert into public.serials values (v_new.*)
  on conflict (sn_key) do update set
    sn = excluded.sn, sku = excluded.sku, description = excluded.description, status = excluded.status,
    condition = excluded.condition, warehouse_id = excluded.warehouse_id, holder_name = excluded.holder_name,
    company_id = excluded.company_id, due_date = excluded.due_date, last_doc_id = excluded.last_doc_id,
    first_in_at = excluded.first_in_at, sold_at = excluded.sold_at, updated_at = excluded.updated_at;
end $$;
revoke execute on function public.claim_serial_move(uuid, text, text, text, text, text, uuid, text, uuid, date) from public, anon, authenticated;

-- new posted document for a claim
create or replace function public.claim_new_doc(p_claim public.claims, p_type text, p_wh uuid, p_to uuid,
                                                p_partner text, p_ref text, p_reason text, p_note text)
returns public.stock_docs language plpgsql security definer set search_path = ''
as $$
declare v public.stock_docs;
begin
  insert into public.stock_docs (doc_no, doc_type, status, warehouse_id, to_warehouse_id, partner_name, company_id,
                                 ref_no, site_name, reason, note, claim_id, posted_by, posted_at)
  values (public.next_doc_no(p_type), p_type, 'posted', p_wh, p_to,
          coalesce(p_partner, p_claim.company_name, p_claim.contact_name), p_claim.company_id,
          coalesce(p_ref, p_claim.claim_no), p_claim.site_name, p_reason, p_note, p_claim.id, auth.uid(), now())
  returning * into v;
  return v;
end $$;
revoke execute on function public.claim_new_doc(public.claims, text, uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- Run one stock step for a claim. Returns {docs:[{id, doc_no, doc_type, n}], skipped:[{sn, reason}]}.
--   reserve   step 2  SN เบิก (iss_sn) in a main warehouse → คลังจองเคลม (reserved for the customer)
--   issue     step 2  SN เบิก in คลังจองเคลม (or still in a main warehouse) → out to the customer (BR ใบเคลมสินค้า)
--   receive   step 3  SN คืน (ret_sn) → คลังรับเคลมรอตรวจ (RT), waiting for inspection
--   inspect   step 3  p_items [{sn, result: good|bad, note}] → good: main warehouse, bad: คลังของเสีย (TR)
--   writeoff  step 3/5  this claim's SNs in คลังของเสีย → cut out (WO)
--   mfr_in    step 4  SN รับ (rcv_sn) from the manufacturer → main warehouse (GN)
create or replace function public.claim_stock_action(p_claim uuid, p_action text, p_items jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
  v_main uuid := public.claim_wh('main');
  v_hold uuid := public.claim_wh('claim_hold');
  v_check uuid := public.claim_wh('claim_check');
  v_defect uuid := public.claim_wh('defect');
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_docs jsonb := '[]'::jsonb;
  v_skip jsonb := '[]'::jsonb;
  v_doc public.stock_docs;
  v_docs_by jsonb := '{}'::jsonb;   -- warehouse/result → doc id
  v_k text;
  v_r record;
  v_s public.serials;
  v_role text;
  v_brand text;
  v_n int;
begin
  if not public.can_handle_claim(p_claim) then
    raise exception 'รับเรื่องเคลมนี้ก่อน จึงจะทำเอกสารคลังได้' using errcode = '42501';
  end if;
  select * into v_c from public.claims c where c.id = p_claim for update;
  if v_c.id is null then raise exception 'ไม่พบเคลม'; end if;
  if v_main is null or v_hold is null or v_check is null or v_defect is null then
    raise exception 'ยังไม่ได้ตั้งคลังหลัก / คลังจองเคลม / คลังรับเคลมรอตรวจ / คลังของเสีย';
  end if;

  if p_action = 'reserve' then
    for v_r in select distinct on (public.sn_key(u.iss_sn)) u.iss_sn sn, u.pcode from public.claim_units u
                where u.claim_id = p_claim and public.sn_key(u.iss_sn) is not null order by public.sn_key(u.iss_sn), u.seq loop
      select s.* into v_s from public.serials s where s.sn_key = public.sn_key(v_r.sn);
      select w.role into v_role from public.warehouses w where w.id = v_s.warehouse_id;
      if v_s.sn_key is not null and v_s.last_doc_id is not null
         and exists (select 1 from public.stock_docs d where d.id = v_s.last_doc_id and d.claim_id = p_claim and d.status = 'posted') then
        continue;  -- already moved for this claim
      elsif v_s.sn_key is null then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'ไม่พบ SN ในเอกสารคลัง');
      elsif v_s.status <> 'in_stock' or v_role is distinct from 'main' then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN ไม่ได้อยู่ในคลังหลัก (' || v_s.status || ')');
      elsif v_s.condition <> 'good' then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN เป็นของเสีย');
      else
        v_k := v_s.warehouse_id::text;
        if not v_docs_by ? v_k then
          v_doc := public.claim_new_doc(v_c, 'TR', v_s.warehouse_id, v_hold, null, null, null, 'ย้ายเข้าคลังจองเคลม (ขั้น 2 เบิกสินค้า)');
          v_docs_by := v_docs_by || jsonb_build_object(v_k, v_doc.id);
        end if;
        insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition)
        values ((v_docs_by ->> v_k)::uuid, 0, v_s.sku, v_s.description, v_s.sn, 'good');
        perform public.claim_serial_move((v_docs_by ->> v_k)::uuid, v_s.sn, v_s.sku, v_s.description, 'reserved', 'good', v_hold,
                                         coalesce(v_c.company_name, v_c.contact_name), v_c.company_id, v_today);
      end if;
    end loop;

  elsif p_action = 'issue' then
    for v_r in select distinct on (public.sn_key(u.iss_sn)) u.iss_sn sn from public.claim_units u
                where u.claim_id = p_claim and public.sn_key(u.iss_sn) is not null order by public.sn_key(u.iss_sn), u.seq loop
      select s.* into v_s from public.serials s where s.sn_key = public.sn_key(v_r.sn);
      select w.role into v_role from public.warehouses w where w.id = v_s.warehouse_id;
      if v_s.sn_key is not null and v_s.status = 'borrowed'
         and exists (select 1 from public.stock_docs d where d.id = v_s.last_doc_id and d.claim_id = p_claim and d.status = 'posted') then
        continue;  -- already cut out for this claim
      elsif v_s.sn_key is null then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'ไม่พบ SN ในเอกสารคลัง');
      elsif v_s.condition <> 'good' then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN เป็นของเสีย');
      elsif not ((v_role = 'claim_hold' and v_s.status = 'reserved') or (v_role = 'main' and v_s.status = 'in_stock')) then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN ไม่ได้อยู่ในคลังจองเคลม (' || v_s.status || ')');
      else
        v_k := v_s.warehouse_id::text;
        if not v_docs_by ? v_k then
          v_doc := public.claim_new_doc(v_c, 'BR', v_s.warehouse_id, null, null, null, null, 'จ่ายสินค้าเปลี่ยนให้ลูกค้า (ขั้น 2 ตัดออกจากระบบ)');
          v_docs_by := v_docs_by || jsonb_build_object(v_k, v_doc.id);
        end if;
        insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition)
        values ((v_docs_by ->> v_k)::uuid, 0, v_s.sku, v_s.description, v_s.sn, 'good');
        perform public.claim_serial_move((v_docs_by ->> v_k)::uuid, v_s.sn, v_s.sku, v_s.description, 'borrowed', 'good', null,
                                         coalesce(v_c.company_name, v_c.contact_name), v_c.company_id, v_today);
      end if;
    end loop;

  elsif p_action = 'receive' then
    for v_r in select distinct on (public.sn_key(u.ret_sn)) u.ret_sn sn, coalesce(u.ret_pcode, u.pcode) pcode from public.claim_units u
                where u.claim_id = p_claim and public.sn_key(u.ret_sn) is not null order by public.sn_key(u.ret_sn), u.seq loop
      select s.* into v_s from public.serials s where s.sn_key = public.sn_key(v_r.sn);
      if v_s.sn_key is not null and v_s.last_doc_id is not null
         and exists (select 1 from public.stock_docs d where d.id = v_s.last_doc_id and d.claim_id = p_claim and d.status = 'posted'
                       and d.doc_type in ('RT', 'TR', 'WO')) then
        continue;  -- already received (or inspected) for this claim
      elsif v_s.sn_key is not null and v_s.status in ('in_stock', 'reserved') then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN อยู่ในคลังอยู่แล้ว');
      elsif coalesce(v_r.pcode, v_s.sku) is null then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'ไม่มีรหัสสินค้า');
      else
        if v_doc.id is null then
          v_doc := public.claim_new_doc(v_c, 'RT', v_check, null, null, null, 'รับของเคลมคืนจากลูกค้า รอตรวจสอบ', 'ขั้น 3 ลูกค้าคืนของเสีย');
        end if;
        insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition)
        values (v_doc.id, 0, upper(coalesce(v_r.pcode, v_s.sku)), v_s.description, upper(trim(v_r.sn)), 'defective');
        perform public.claim_serial_move(v_doc.id, v_r.sn, upper(coalesce(v_r.pcode, v_s.sku)), v_s.description, 'in_stock', 'defective',
                                         v_check, null, null, v_today);
      end if;
    end loop;
    if v_doc.id is not null then v_docs_by := jsonb_build_object('rt', v_doc.id); end if;

  elsif p_action = 'inspect' then
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'เลือกผลตรวจอย่างน้อย 1 รายการ';
    end if;
    for v_r in select upper(trim(i ->> 'sn')) sn, i ->> 'result' result, nullif(trim(i ->> 'note'), '') note
                 from jsonb_array_elements(p_items) i where i ->> 'result' in ('good', 'bad') loop
      select s.* into v_s from public.serials s where s.sn_key = public.sn_key(v_r.sn);
      if v_s.sn_key is null or v_s.warehouse_id is distinct from v_check or v_s.status <> 'in_stock'
         or not exists (select 1 from public.claim_units u where u.claim_id = p_claim and public.sn_key(u.ret_sn) = v_s.sn_key) then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN ไม่ได้อยู่ในคลังรับเคลมรอตรวจของเคลมนี้');
        continue;
      end if;
      v_k := v_r.result;
      if not v_docs_by ? v_k then
        v_doc := public.claim_new_doc(v_c, 'TR', v_check, case v_k when 'good' then v_main else v_defect end, null, null, null,
                                      case v_k when 'good' then 'ผลตรวจ: ของดี ย้ายเข้าคลังหลัก' else 'ผลตรวจ: ของเสีย ย้ายเข้าคลังของเสีย' end);
        v_docs_by := v_docs_by || jsonb_build_object(v_k, v_doc.id);
      end if;
      insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition, note)
      values ((v_docs_by ->> v_k)::uuid, 0, v_s.sku, v_s.description, v_s.sn, case v_k when 'good' then 'good' else 'defective' end, v_r.note);
      perform public.claim_serial_move((v_docs_by ->> v_k)::uuid, v_s.sn, v_s.sku, v_s.description, 'in_stock',
                                       case v_k when 'good' then 'good' else 'defective' end,
                                       case v_k when 'good' then v_main else v_defect end, null, null, v_today);
      update public.claim_units u set ret_result = v_k, updated_by = auth.uid()
       where u.claim_id = p_claim and public.sn_key(u.ret_sn) = v_s.sn_key;
    end loop;

  elsif p_action = 'writeoff' then
    select b.name into v_brand from public.brands b where b.id = v_c.brand_id;
    for v_r in select s.* from public.serials s
                where s.warehouse_id = v_defect and s.status = 'in_stock'
                  and exists (select 1 from public.claim_units u where u.claim_id = p_claim
                                and (public.sn_key(u.ret_sn) = s.sn_key or public.sn_key(u.ok_sn) = s.sn_key)) loop
      if v_doc.id is null then
        v_doc := public.claim_new_doc(v_c, 'WO', v_defect, null, coalesce(v_brand, 'ผู้ผลิต'), null,
                                      'ตัดของเสียงานเคลม ' || v_c.claim_no || ' (ส่งคืนผู้ผลิต / ทำลาย)', 'ขั้น 3/5 ตัดของเสียออกจากระบบ');
      end if;
      insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition)
      values (v_doc.id, 0, v_r.sku, v_r.description, v_r.sn, 'defective');
      perform public.claim_serial_move(v_doc.id, v_r.sn, v_r.sku, v_r.description, 'written_off', 'defective', null, null, null, v_today);
    end loop;
    if v_doc.id is not null then v_docs_by := jsonb_build_object('wo', v_doc.id); end if;

  elsif p_action = 'mfr_in' then
    select b.name into v_brand from public.brands b where b.id = v_c.brand_id;
    for v_r in select distinct on (public.sn_key(u.rcv_sn)) u.rcv_sn sn, coalesce(u.rcv_pcode, u.pcode) pcode, u.rma_no, u.rcv_doc
                 from public.claim_units u
                where u.claim_id = p_claim and public.sn_key(u.rcv_sn) is not null order by public.sn_key(u.rcv_sn), u.seq loop
      select s.* into v_s from public.serials s where s.sn_key = public.sn_key(v_r.sn);
      if v_s.sn_key is not null and v_s.last_doc_id is not null
         and exists (select 1 from public.stock_docs d where d.id = v_s.last_doc_id and d.claim_id = p_claim and d.status = 'posted') then
        continue;
      elsif v_s.sn_key is not null and v_s.status in ('in_stock', 'reserved', 'borrowed', 'withdrawn') then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'SN มีอยู่ในระบบแล้ว (' || v_s.status || ')');
      elsif v_r.pcode is null then
        v_skip := v_skip || jsonb_build_object('sn', v_r.sn, 'reason', 'ไม่มีรหัสสินค้า');
      else
        if v_doc.id is null then
          v_doc := public.claim_new_doc(v_c, 'GN', v_main, null, coalesce(v_brand, 'ผู้ผลิต'),
                                        coalesce(v_r.rma_no, v_r.rcv_doc, v_c.claim_no), null, 'ขั้น 4 รับสินค้าเคลมจากผู้ผลิต');
        end if;
        insert into public.stock_doc_items (doc_id, sort, sku, description, sn, condition)
        values (v_doc.id, 0, upper(v_r.pcode), null, upper(trim(v_r.sn)), 'good');
        perform public.claim_serial_move(v_doc.id, v_r.sn, upper(v_r.pcode), null, 'in_stock', 'good', v_main, null, null, v_today);
      end if;
    end loop;
    if v_doc.id is not null then v_docs_by := jsonb_build_object('gn', v_doc.id); end if;

  else
    raise exception 'คำสั่งไม่ถูกต้อง';
  end if;

  -- number the rows of each new document and list them
  for v_k in select jsonb_object_keys(v_docs_by) loop
    update public.stock_doc_items i set sort = x.rn - 1
      from (select i2.id, row_number() over (order by i2.sn) rn from public.stock_doc_items i2 where i2.doc_id = (v_docs_by ->> v_k)::uuid) x
     where i.id = x.id;
    select count(*) into v_n from public.stock_doc_items i where i.doc_id = (v_docs_by ->> v_k)::uuid;
    v_docs := v_docs || (select jsonb_build_object('id', d.id, 'doc_no', d.doc_no, 'doc_type', d.doc_type, 'n', v_n)
                           from public.stock_docs d where d.id = (v_docs_by ->> v_k)::uuid);
  end loop;

  if jsonb_array_length(v_docs) > 0 and (select c.stock_source from public.stock_config c where c.id = 1) = 'docs' then
    perform public.refresh_stock_from_serials();
  end if;
  return jsonb_build_object('docs', v_docs, 'skipped', v_skip);
end $$;
revoke execute on function public.claim_stock_action(uuid, text, jsonb) from public, anon;
grant execute on function public.claim_stock_action(uuid, text, jsonb) to authenticated;

-- Stock documents and SN states for one claim (staff), for the claim page and printing.
--   auto: true once documents are the stock source or the go-live date has passed, so the app makes them on save
create or replace function public.claim_stock_info(p_claim uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not public.is_staff_or_admin() then null else jsonb_build_object(
    'auto', coalesce((select c.stock_source = 'docs' or (c.docs_start_date is not null and c.docs_start_date <= (now() at time zone 'Asia/Bangkok')::date)
                        from public.stock_config c where c.id = 1), false),
    'warehouses', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name, 'role', w.role, 'is_active', w.is_active, 'sort', w.sort) order by w.sort), '[]')
                     from public.warehouses w),
    'docs', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('items',
                       (select coalesce(jsonb_agg(jsonb_build_object('sku', i.sku, 'description', i.description, 'sn', i.sn, 'condition', i.condition, 'note', i.note) order by i.sort), '[]')
                          from public.stock_doc_items i where i.doc_id = d.id)) order by d.created_at), '[]')
               from public.stock_docs d where d.claim_id = p_claim),
    'serials', (select coalesce(jsonb_agg(jsonb_build_object('sn', s.sn, 'sn_key', s.sn_key, 'sku', s.sku, 'status', s.status, 'condition', s.condition,
                                                              'warehouse_id', s.warehouse_id, 'role', w.role, 'mine', d.claim_id = p_claim)), '[]')
                  from public.serials s
                  left join public.warehouses w on w.id = s.warehouse_id
                  left join public.stock_docs d on d.id = s.last_doc_id
                 where s.sn_key in (select public.sn_key(x) from public.claim_units u,
                                      unnest(array[u.iss_sn, u.ret_sn, u.rcv_sn, u.ok_sn]) x
                                     where u.claim_id = p_claim and public.sn_key(x) is not null))
  ) end
$$;
revoke execute on function public.claim_stock_info(uuid) from public, anon;
grant execute on function public.claim_stock_info(uuid) to authenticated;
