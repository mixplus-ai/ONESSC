-- Supabase blocks DELETE without WHERE for API roles (pg-safeupdate), so the full
-- replace in apply_stock_sync failed with "DELETE requires a WHERE clause".

-- p_backorders: [{sku, doc_no, doc_type, doc_date, pi_no, customer, delivery_note, sales, qty}] or null to keep
create or replace function public.apply_stock_sync(
  p_source text, p_file_name text, p_sheet_date text, p_rows jsonb, p_backorders jsonb default null
)
returns public.stock_syncs
language plpgsql security definer set search_path = ''
as $$
declare
  v_sync public.stock_syncs;
  v_total int;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่ซิงก์สต๊อกได้' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบแถวสต๊อกในไฟล์ (ตรวจชื่อแท็บและหัวตาราง "รหัสสินค้า")';
  end if;

  insert into public.stock_syncs (source, file_name, sheet_date, started_by)
  values (p_source, p_file_name, p_sheet_date, auth.uid())
  returning * into v_sync;

  -- the sheet is the source of truth: rows missing from it are removed
  delete from public.stock_levels where true;
  insert into public.stock_levels (sku, store, stock_group, description, on_hand, reserved, available, incoming, sync_id, synced_at)
  select distinct on (trim(r ->> 'sku'))
         trim(r ->> 'sku'), nullif(trim(r ->> 'store'), ''), nullif(trim(r ->> 'group'), ''), nullif(trim(r ->> 'description'), ''),
         coalesce((r ->> 'on_hand')::numeric, 0), coalesce((r ->> 'reserved')::numeric, 0),
         coalesce((r ->> 'available')::numeric, 0), coalesce((r ->> 'incoming')::numeric, 0),
         v_sync.id, now()
  from jsonb_array_elements(p_rows) r
  where nullif(trim(r ->> 'sku'), '') is not null;
  get diagnostics v_total = row_count;

  if p_backorders is not null and jsonb_typeof(p_backorders) = 'array' then
    delete from public.stock_backorders where true;
    insert into public.stock_backorders (sku, doc_no, doc_type, doc_date, pi_no, customer, delivery_note, sales, qty, sync_id)
    select trim(b ->> 'sku'), b ->> 'doc_no', b ->> 'doc_type', nullif(b ->> 'doc_date', '')::date, b ->> 'pi_no',
           b ->> 'customer', b ->> 'delivery_note', b ->> 'sales', coalesce((b ->> 'qty')::numeric, 0), v_sync.id
    from jsonb_array_elements(p_backorders) b
    where nullif(trim(b ->> 'sku'), '') is not null;
  end if;

  update public.stock_syncs
     set rows_total = v_total,
         rows_matched = (select count(*) from public.stock_levels sl join public.product_variants v on v.sku = sl.sku),
         backorders = (select count(*) from public.stock_backorders)
   where id = v_sync.id
  returning * into v_sync;
  return v_sync;
end $$;
