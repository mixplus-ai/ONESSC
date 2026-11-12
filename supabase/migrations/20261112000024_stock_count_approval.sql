-- One App SSC · stock documents phase 3 (owner 2026-11-12):
--  * stock count (ตรวจนับ) on a phone: scan every SN on the shelf, compare with what the records say,
--    and turn the difference into draft documents (write-off for missing, transfer for SNs booked in another warehouse)
--  * two-level approval: for the document types Admin picks, a checker (ผู้ตรวจ) signs off the draft first
--    and a different person posts it

insert into public.permission_keys (key, label, description, sort, grp) values
  ('stock.check', 'เอกสารคลัง: ผู้ตรวจเอกสาร (ชั้นที่ 1)', 'ตรวจร่างก่อนผู้อนุมัติยืนยัน สำหรับประเภทที่ Admin กำหนดให้อนุมัติ 2 ชั้น', 37, 'sales'),
  ('stock.count', 'ตรวจนับสต๊อก: สแกนนับ SN', 'เปิดใบตรวจนับและสแกน SN ด้วยมือถือ', 38, 'sales')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- two-level approval
-- ---------------------------------------------------------------------------
alter table public.stock_config add column check_types text[] not null default '{}';
alter table public.stock_docs
  add column checked_by   uuid references auth.users (id) on delete set null,
  add column checked_at   timestamptz,
  add column checked_hash text;

-- everyone who works with stock documents reads the config (which types need a checker)
drop policy stock_config_select on public.stock_config;
create policy stock_config_select on public.stock_config for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post'))
         or (select public.has_perm('stock.check')) or (select public.has_perm('stock.count')));
-- checkers see documents too
drop policy stock_docs_select on public.stock_docs;
create policy stock_docs_select on public.stock_docs for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')) or (select public.has_perm('stock.check')));
drop policy stock_doc_items_select on public.stock_doc_items;
create policy stock_doc_items_select on public.stock_doc_items for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')) or (select public.has_perm('stock.check')));

-- what the checker saw: header fields + every SN line
create or replace function public.stock_doc_hash(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select md5(
    (select (to_jsonb(d) - array['status', 'updated_at', 'checked_by', 'checked_at', 'checked_hash', 'posted_by', 'posted_at',
                                 'cancelled_by', 'cancelled_at', 'cancel_reason', 'created_at', 'created_by'])::text
       from public.stock_docs d where d.id = p_id)
    || coalesce((select string_agg(i.sku || ':' || i.sn_key || ':' || i.condition, ',' order by i.sn_key)
                   from public.stock_doc_items i where i.doc_id = p_id), ''))
$$;

create or replace function public.set_stock_check_types(p_types text[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'ตั้งค่าได้เฉพาะ Admin' using errcode = '42501'; end if;
  update public.stock_config c
     set check_types = (select coalesce(array_agg(distinct t), '{}') from unnest(p_types) t
                         where t in ('OB', 'GR', 'GN', 'RT', 'SO', 'BR', 'WD', 'WO', 'TR', 'RV'))
   where c.id = 1;
end $$;

-- checker signs off (p_ok) or withdraws the sign-off on a draft
create or replace function public.check_stock_doc(p_id uuid, p_ok boolean default true)
returns public.stock_docs
language plpgsql security definer set search_path = ''
as $$
declare v_d public.stock_docs;
begin
  if not (public.has_perm('stock.check') or public.has_perm('stock.post')) then
    raise exception 'ตรวจเอกสารได้เฉพาะผู้มีสิทธิ์ผู้ตรวจ' using errcode = '42501';
  end if;
  select * into v_d from public.stock_docs d where d.id = p_id for update;
  if v_d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_d.status <> 'draft' then raise exception 'เอกสารนี้ยืนยันหรือยกเลิกไปแล้ว'; end if;
  if p_ok and not exists (select 1 from public.stock_doc_items i where i.doc_id = p_id) then raise exception 'ยังไม่มี SN ในเอกสาร'; end if;
  update public.stock_docs d
     set checked_by = case when p_ok then auth.uid() end,
         checked_at = case when p_ok then now() end,
         checked_hash = case when p_ok then public.stock_doc_hash(p_id) end
   where d.id = p_id returning * into v_d;
  return v_d;
end $$;

-- a draft edited after it was checked loses the check (save_stock_doc rewrites the lines, so look after that)
create or replace function public.stock_docs_check_reset()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.stock_docs d set checked_by = null, checked_at = null, checked_hash = null
   where d.id in (select distinct n.doc_id from new_items n)
     and d.status = 'draft' and d.checked_hash is not null
     and d.checked_hash <> public.stock_doc_hash(d.id);
  return null;
end $$;
create trigger stock_doc_items_check_reset after insert on public.stock_doc_items
  referencing new table as new_items for each statement execute function public.stock_docs_check_reset();

-- posting: the checker must have signed this exact version, and the poster must be someone else
create or replace function public.stock_docs_post_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_types text[] := coalesce((select c.check_types from public.stock_config c where c.id = 1), '{}');
begin
  if old.status = 'draft' and new.status = 'posted' and new.doc_type = any (v_types) then
    if new.checked_at is null then
      raise exception 'เอกสารประเภทนี้ต้องผ่านผู้ตรวจ (ชั้นที่ 1) ก่อนยืนยัน';
    end if;
    if new.checked_hash is distinct from public.stock_doc_hash(new.id) then
      raise exception 'เอกสารถูกแก้ไขหลังผู้ตรวจตรวจแล้ว กรุณาให้ตรวจอีกครั้ง';
    end if;
    if new.checked_by = new.posted_by then
      raise exception 'ผู้ตรวจและผู้อนุมัติต้องเป็นคนละคน';
    end if;
  end if;
  return new;
end $$;
create trigger stock_docs_post_guard before update of status on public.stock_docs
  for each row execute function public.stock_docs_post_guard();

-- ---------------------------------------------------------------------------
-- stock count
-- ---------------------------------------------------------------------------
create table public.stock_counts (
  id            uuid primary key default gen_random_uuid(),
  count_no      text unique not null,                     -- SC-69-0001
  warehouse_id  uuid not null references public.warehouses (id),
  skus          text[],                                   -- null = every code in the warehouse
  status        text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  note          text,
  started_by    uuid references auth.users (id) on delete set null default auth.uid(),
  started_at    timestamptz not null default now(),
  closed_by     uuid references auth.users (id) on delete set null,
  closed_at     timestamptz,
  result        jsonb                                     -- snapshot of the comparison when closed
);
create index stock_counts_status_idx on public.stock_counts (status, started_at desc);

create table public.stock_count_scans (
  id          bigint generated always as identity primary key,
  count_id    uuid not null references public.stock_counts (id) on delete cascade,
  sn          text not null check (length(trim(sn)) between 1 and 80),
  sn_key      text generated always as (public.sn_key(sn)) stored,
  scanned_by  uuid references auth.users (id) on delete set null default auth.uid(),
  scanned_at  timestamptz not null default now()
);
create unique index stock_count_scans_one on public.stock_count_scans (count_id, sn_key);

alter table public.stock_counts enable row level security;
alter table public.stock_count_scans enable row level security;
create policy stock_counts_select on public.stock_counts for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')) or (select public.has_perm('stock.count')));
create policy stock_count_scans_select on public.stock_count_scans for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')) or (select public.has_perm('stock.count')));
create trigger audit_stock_counts after insert or update or delete on public.stock_counts
  for each row execute function public.audit_row();

create or replace function public.can_count()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_perm('stock.count') or public.has_perm('stock.docs') or public.has_perm('stock.post') $$;

create or replace function public.start_stock_count(p_warehouse uuid, p_skus text[] default null, p_note text default null)
returns public.stock_counts
language plpgsql security definer set search_path = ''
as $$
declare v_c public.stock_counts;
begin
  if not public.can_count() then raise exception 'ไม่มีสิทธิ์ตรวจนับ' using errcode = '42501'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.is_active) then raise exception 'เลือกคลัง'; end if;
  insert into public.stock_counts (count_no, warehouse_id, skus, note)
  values (public.next_doc_no('SC'), p_warehouse,
          nullif((select array_agg(distinct upper(trim(s))) from unnest(p_skus) s where trim(s) <> ''), '{}'),
          nullif(trim(p_note), ''))
  returning * into v_c;
  return v_c;
end $$;

-- what one SN is, seen from a count: ok (here and expected), other_wh, out (sold/loaned…), other_sku, unknown
create or replace function public.stock_count_classify(p_count public.stock_counts, p_key text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case
    when s.sn_key is null then jsonb_build_object('result', 'unknown')
    else jsonb_build_object(
      'result', case
        when s.status not in ('in_stock', 'reserved') then 'out'
        when s.warehouse_id is distinct from p_count.warehouse_id then 'other_wh'
        when p_count.skus is not null and not (s.sku = any (p_count.skus)) then 'other_sku'
        else 'ok' end,
      'sku', s.sku, 'description', s.description, 'status', s.status, 'condition', s.condition,
      'warehouse_id', s.warehouse_id, 'warehouse', w.code, 'holder', s.holder_name)
  end
  from (select 1) one
  left join public.serials s on s.sn_key = p_key
  left join public.warehouses w on w.id = s.warehouse_id
$$;

-- scan one or many SNs into an open count; returns what each one is
create or replace function public.stock_count_scan(p_count uuid, p_sns text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.stock_counts;
  v_sn text;
  v_key text;
  v_dup boolean;
  v_out jsonb := '[]';
begin
  if not public.can_count() then raise exception 'ไม่มีสิทธิ์ตรวจนับ' using errcode = '42501'; end if;
  select * into v_c from public.stock_counts c where c.id = p_count;
  if v_c.id is null then raise exception 'ไม่พบใบตรวจนับ'; end if;
  if v_c.status <> 'open' then raise exception 'ใบตรวจนับนี้ปิดแล้ว'; end if;
  foreach v_sn in array coalesce(p_sns, '{}') loop
    v_sn := upper(trim(v_sn));
    v_key := public.sn_key(v_sn);
    continue when v_key is null or length(v_sn) > 80;
    insert into public.stock_count_scans (count_id, sn) values (p_count, v_sn) on conflict do nothing;
    v_dup := not found;
    v_out := v_out || (jsonb_build_object('sn', v_sn, 'dup', v_dup) || public.stock_count_classify(v_c, v_key));
  end loop;
  return v_out;
end $$;

create or replace function public.stock_count_unscan(p_count uuid, p_sn text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_count() then raise exception 'ไม่มีสิทธิ์ตรวจนับ' using errcode = '42501'; end if;
  if (select c.status from public.stock_counts c where c.id = p_count) is distinct from 'open' then raise exception 'ใบตรวจนับนี้ปิดแล้ว'; end if;
  delete from public.stock_count_scans s where s.count_id = p_count and s.sn_key = public.sn_key(p_sn);
end $$;

-- compare: expected = SNs the records place in this warehouse (in stock / reserved, the chosen codes)
create or replace function public.stock_count_report(p_count uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_c public.stock_counts; v_out jsonb;
begin
  if not (public.can_count() or public.has_perm('stock.view')) then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into v_c from public.stock_counts c where c.id = p_count;
  if v_c.id is null then raise exception 'ไม่พบใบตรวจนับ'; end if;
  if v_c.status = 'closed' and v_c.result is not null then return v_c.result; end if;
    with exp as (
      select s.* from public.serials s
       where s.warehouse_id = v_c.warehouse_id and s.status in ('in_stock', 'reserved')
         and (v_c.skus is null or s.sku = any (v_c.skus))),
    sc as (select * from public.stock_count_scans x where x.count_id = p_count)
    select jsonb_build_object(
      'expected', (select count(*) from exp),
      'scanned', (select count(*) from sc),
      'matched', (select count(*) from sc join exp on exp.sn_key = sc.sn_key),
      'by_sku', coalesce((select jsonb_agg(z order by z.sku) from (
          select e.sku, count(*) expected, count(sc.sn_key) counted
            from exp e left join sc on sc.sn_key = e.sn_key group by e.sku) z), '[]'),
      'missing', coalesce((select jsonb_agg(jsonb_build_object('sn', e.sn, 'sku', e.sku, 'description', e.description,
                                                               'status', e.status, 'condition', e.condition) order by e.sku, e.sn)
                             from exp e where not exists (select 1 from sc where sc.sn_key = e.sn_key)), '[]'),
      'extra', coalesce((select jsonb_agg(jsonb_build_object('sn', sc.sn) || public.stock_count_classify(v_c, sc.sn_key) order by sc.id)
                           from sc where not exists (select 1 from exp e where e.sn_key = sc.sn_key)), '[]'))
    into v_out;
  return v_out;
end $$;

-- close: freeze the comparison and (optionally) make draft documents for the difference.
-- Drafts still go through the normal check / post, so nothing moves until someone approves them.
create or replace function public.close_stock_count(p_count uuid, p_make_docs boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.stock_counts;
  v_r jsonb;
  v_d public.stock_docs;
  v_docs jsonb := '[]';
  v_wh uuid;
  v_items jsonb;
begin
  if not (public.has_perm('stock.docs') or public.has_perm('stock.post')) then
    raise exception 'ปิดใบตรวจนับได้เฉพาะผู้มีสิทธิ์ทำเอกสารคลัง' using errcode = '42501';
  end if;
  select * into v_c from public.stock_counts c where c.id = p_count for update;
  if v_c.id is null then raise exception 'ไม่พบใบตรวจนับ'; end if;
  if v_c.status <> 'open' then raise exception 'ใบตรวจนับนี้ปิดแล้ว'; end if;
  v_r := public.stock_count_report(p_count);

  if p_make_docs then
    -- missing on the shelf -> write-off draft
    if jsonb_array_length(v_r -> 'missing') > 0 then
      v_d := public.save_stock_doc(null,
        jsonb_build_object('doc_type', 'WO', 'warehouse_id', v_c.warehouse_id, 'ref_no', v_c.count_no,
                           'reason', 'ตรวจนับไม่พบ ตามใบตรวจนับ ' || v_c.count_no,
                           'note', 'สร้างจากใบตรวจนับ ตรวจสอบก่อนยืนยัน ถ้าพบของภายหลังให้ลบ SN นั้นออก'),
        (select jsonb_agg(jsonb_build_object('sku', m ->> 'sku', 'description', m ->> 'description', 'sn', m ->> 'sn',
                                             'condition', m ->> 'condition')) from jsonb_array_elements(v_r -> 'missing') m));
      v_docs := v_docs || jsonb_build_object('id', v_d.id, 'doc_no', v_d.doc_no, 'doc_type', 'WO', 'n', jsonb_array_length(v_r -> 'missing'));
    end if;
    -- found here but booked in another warehouse -> one transfer draft per source warehouse
    for v_wh in select distinct (e ->> 'warehouse_id')::uuid from jsonb_array_elements(v_r -> 'extra') e where e ->> 'result' = 'other_wh' loop
      select jsonb_agg(jsonb_build_object('sku', e ->> 'sku', 'description', e ->> 'description', 'sn', e ->> 'sn', 'condition', e ->> 'condition'))
        into v_items from jsonb_array_elements(v_r -> 'extra') e
       where e ->> 'result' = 'other_wh' and (e ->> 'warehouse_id')::uuid = v_wh;
      v_d := public.save_stock_doc(null,
        jsonb_build_object('doc_type', 'TR', 'warehouse_id', v_wh, 'to_warehouse_id', v_c.warehouse_id, 'ref_no', v_c.count_no,
                           'note', 'ตรวจนับพบในคลังนี้ แต่ในระบบอยู่อีกคลัง (ใบตรวจนับ ' || v_c.count_no || ')'),
        v_items);
      v_docs := v_docs || jsonb_build_object('id', v_d.id, 'doc_no', v_d.doc_no, 'doc_type', 'TR', 'n', jsonb_array_length(v_items));
    end loop;
  end if;

  v_r := v_r || jsonb_build_object('docs', v_docs);
  update public.stock_counts c set status = 'closed', closed_by = auth.uid(), closed_at = now(), result = v_r where c.id = p_count;
  return v_r;
end $$;

create or replace function public.cancel_stock_count(p_count uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_count() then raise exception 'ไม่มีสิทธิ์ตรวจนับ' using errcode = '42501'; end if;
  update public.stock_counts c set status = 'cancelled', closed_by = auth.uid(), closed_at = now()
   where c.id = p_count and c.status = 'open';
end $$;

revoke execute on function public.stock_doc_hash(uuid) from public, anon, authenticated;
revoke execute on function public.stock_docs_check_reset() from public, anon, authenticated;
revoke execute on function public.stock_docs_post_guard() from public, anon, authenticated;
revoke execute on function public.stock_count_classify(public.stock_counts, text) from public, anon, authenticated;
revoke execute on function public.can_count() from public, anon;
revoke execute on function public.set_stock_check_types(text[]) from public, anon;
revoke execute on function public.check_stock_doc(uuid, boolean) from public, anon;
revoke execute on function public.start_stock_count(uuid, text[], text) from public, anon;
revoke execute on function public.stock_count_scan(uuid, text[]) from public, anon;
revoke execute on function public.stock_count_unscan(uuid, text) from public, anon;
revoke execute on function public.stock_count_report(uuid) from public, anon;
revoke execute on function public.close_stock_count(uuid, boolean) from public, anon;
revoke execute on function public.cancel_stock_count(uuid) from public, anon;
grant execute on function public.can_count() to authenticated;
grant execute on function public.set_stock_check_types(text[]) to authenticated;
grant execute on function public.check_stock_doc(uuid, boolean) to authenticated;
grant execute on function public.start_stock_count(uuid, text[], text) to authenticated;
grant execute on function public.stock_count_scan(uuid, text[]) to authenticated;
grant execute on function public.stock_count_unscan(uuid, text) to authenticated;
grant execute on function public.stock_count_report(uuid) to authenticated;
grant execute on function public.close_stock_count(uuid, boolean) to authenticated;
grant execute on function public.cancel_stock_count(uuid) to authenticated;
