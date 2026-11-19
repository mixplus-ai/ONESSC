-- Warehouse meeting no. 1 (2026-11-17), section 4:
--   * delivery / receipt documents carry the truck: plate, driver, driver phone
--   * attached photos get a kind (plate, vehicle papers, driver papers, goods on the truck) so the
--     printed detail sheet can show them under the right heading
--   * BR is now "ใบเคลมสินค้า" (claim issue): no return date needed; borrowing moves to WD
--   * GR is the foreign receipt (ref = PI / invoice), GN the domestic one (ref = supplier delivery note)
-- Safe to run more than once.

alter table public.stock_docs
  add column if not exists vehicle_plate text,
  add column if not exists driver_name   text,
  add column if not exists driver_phone  text;

alter table public.stock_doc_files
  add column if not exists kind text not null default 'other';
alter table public.stock_doc_files drop constraint if exists stock_doc_files_kind_check;
alter table public.stock_doc_files add constraint stock_doc_files_kind_check
  check (kind in ('other', 'plate', 'vehicle_doc', 'driver_doc', 'goods'));

-- a draft's photo can be re-labelled (kind only); posted evidence stays as it is
drop policy if exists stock_doc_files_update on public.stock_doc_files;
create policy stock_doc_files_update on public.stock_doc_files for update to authenticated
  using (((select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')))
         and exists (select 1 from public.stock_docs d where d.id = doc_id and d.status = 'draft'))
  with check (((select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')))
              and path like doc_id::text || '/%');

-- save_stock_doc: same as migration 29 plus the vehicle fields
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
    claim_id        = nullif(p_doc ->> 'claim_id', '')::uuid,
    vehicle_plate   = nullif(trim(p_doc ->> 'vehicle_plate'), ''),
    driver_name     = nullif(trim(p_doc ->> 'driver_name'), ''),
    driver_phone    = nullif(trim(p_doc ->> 'driver_phone'), '')
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

-- post_stock_doc: same as migration 22 with the new names (GR asks for the PI, BR = claim issue needs no return date)
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
  if v_d.doc_type = 'GR' and v_d.ref_no is null then raise exception 'กรุณาใส่เลขที่ PI / Invoice ของผู้ขาย'; end if;
  if v_d.doc_type = 'GN' and v_d.ref_no is null then raise exception 'กรุณาใส่เลขที่ใบส่งของของผู้ขาย'; end if;
  if v_d.doc_type in ('SO', 'BR', 'WD', 'RV', 'RT') and v_d.partner_name is null then raise exception 'กรุณาใส่ชื่อลูกค้า/ผู้รับ'; end if;
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
