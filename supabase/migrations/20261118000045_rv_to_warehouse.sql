-- RV (ใบจอง) can move the reserved SNs into a destination warehouse (e.g. คลังจอง).
-- Same as post_stock_doc in 20261117100033 except the RV case sets warehouse_id from to_warehouse_id.

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
  if v_d.doc_type = 'RV' and v_d.to_warehouse_id is not null
     and not exists (select 1 from public.warehouses w where w.id = v_d.to_warehouse_id and w.is_active) then
    raise exception 'คลังปลายทางของใบจองไม่ถูกต้อง';
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
        v_new.warehouse_id := coalesce(v_d.to_warehouse_id, v_new.warehouse_id);
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

