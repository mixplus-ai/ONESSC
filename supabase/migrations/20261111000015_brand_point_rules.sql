-- Company points per brand: each brand has its own "baht per point" rule and tiers.
-- Staff picks the brand when recording a tax invoice; a brand without an active rule
-- falls back to the central rule in points_config. The company balance stays one pool.

create table public.brand_point_rules (
  brand_id        uuid primary key references public.brands (id) on delete cascade,
  baht_per_point  numeric(14, 2) not null check (baht_per_point > 0),
  tiers           jsonb not null default '[{"min":0,"multiplier":1}]'::jsonb,
  terms           text,                       -- เงื่อนไขของแบรนด์ (แสดงให้ลูกค้าเห็น)
  is_active       boolean not null default true,
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.brand_point_rules enable row level security;
create policy brand_point_rules_select on public.brand_point_rules for select to authenticated using (true);
create policy brand_point_rules_write on public.brand_point_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create trigger brand_point_rules_touch before update on public.brand_point_rules for each row execute function public.touch_updated_at();
create trigger audit_brand_point_rules after insert or update or delete on public.brand_point_rules for each row execute function public.audit_row();

-- no "on delete set null": ledger rows are immutable, so a brand with point history cannot be deleted (unpublish it instead)
alter table public.point_ledger add column brand_id uuid references public.brands (id);
create index point_ledger_brand_idx on public.point_ledger (brand_id) where brand_id is not null;

-- a bonus can be limited to one brand (null = every brand)
alter table public.company_point_bonuses add column brand_id uuid references public.brands (id) on delete cascade;

drop function public.edit_company_purchase(bigint, text, text, date, numeric, text, text, uuid, text, numeric);
drop function public.add_company_purchase(uuid, text, date, numeric, text, text, uuid, text, numeric);
drop function public.calc_company_points(numeric, uuid, date);

create or replace function public.calc_company_points(p_amount numeric, p_bonus_id uuid default null, p_doc_date date default null, p_brand_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg public.points_config;
  v_rule public.brand_point_rules;
  v_brand text;
  v_bpp numeric;
  v_tiers jsonb;
  v_tier numeric := 1;
  v_bonus public.company_point_bonuses;
  v_bonus_mult numeric := 1;
  v_base numeric;
  v_points numeric;
  v_date date := coalesce(p_doc_date, public.bkk_today());
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'ยอดซื้อต้องมากกว่า 0'; end if;
  select * into v_cfg from public.points_config where id = 1;
  v_bpp := v_cfg.company_baht_per_point;
  v_tiers := v_cfg.company_tiers;
  if p_brand_id is not null then
    select name into v_brand from public.brands where id = p_brand_id;
    if v_brand is null then raise exception 'ไม่พบแบรนด์'; end if;
    select * into v_rule from public.brand_point_rules where brand_id = p_brand_id and is_active;
    if found then
      v_bpp := v_rule.baht_per_point;
      v_tiers := v_rule.tiers;
    end if;
  end if;
  select coalesce((t ->> 'multiplier')::numeric, 1) into v_tier
    from jsonb_array_elements(v_tiers) t
   where coalesce((t ->> 'min')::numeric, 0) <= p_amount
   order by coalesce((t ->> 'min')::numeric, 0) desc
   limit 1;
  v_tier := coalesce(v_tier, 1);
  if p_bonus_id is not null then
    select * into v_bonus from public.company_point_bonuses
     where id = p_bonus_id and is_active
       and (starts_on is null or starts_on <= v_date) and (ends_on is null or ends_on >= v_date);
    if not found then raise exception 'โบนัสนี้ไม่อยู่ในช่วงเวลาที่ใช้ได้'; end if;
    if v_bonus.brand_id is not null and v_bonus.brand_id is distinct from p_brand_id then
      raise exception 'โบนัส "%" ใช้ได้เฉพาะแบรนด์ที่กำหนด', v_bonus.label;
    end if;
    v_bonus_mult := v_bonus.multiplier;
  end if;
  v_base := p_amount / v_bpp;
  v_points := floor(v_base * v_tier * v_bonus_mult);
  return jsonb_build_object(
    'amount', p_amount, 'baht_per_point', v_bpp,
    'brand_id', p_brand_id, 'brand_name', v_brand,
    'rule', case when v_rule.brand_id is not null then 'brand' else 'default' end,
    'base', round(v_base, 2), 'tier_multiplier', v_tier,
    'bonus_id', p_bonus_id, 'bonus_label', v_bonus.label, 'bonus_multiplier', v_bonus_mult,
    'points', v_points, 'expires_on', public.company_expiry_for(v_date));
end $$;

create or replace function public.add_company_purchase(
  p_company_id uuid, p_invoice_no text, p_doc_date date, p_amount numeric,
  p_items text default null, p_file_path text default null, p_bonus_id uuid default null,
  p_note text default null, p_points_override numeric default null, p_brand_id uuid default null
)
returns public.point_ledger language plpgsql security definer set search_path = ''
as $$
declare
  v_calc jsonb;
  v_points numeric;
  v_row public.point_ledger;
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'ไม่พบบริษัท'; end if;
  if coalesce(trim(p_invoice_no), '') = '' then raise exception 'กรุณากรอกเลขที่ใบกำกับภาษี'; end if;
  if p_doc_date is null then raise exception 'กรุณากรอกวันที่'; end if;
  -- one invoice can carry several brands; each brand is recorded once per invoice
  if exists (select 1 from public.point_ledger where wallet = 'company' and company_id = p_company_id
               and kind = 'purchase' and voided_at is null and lower(invoice_no) = lower(trim(p_invoice_no))
               and brand_id is not distinct from p_brand_id) then
    raise exception 'เลขที่ใบกำกับ % บันทึกแต้ม%ให้บริษัทนี้แล้ว', trim(p_invoice_no),
      coalesce(' แบรนด์ ' || (select name from public.brands where id = p_brand_id), '');
  end if;
  v_calc := public.calc_company_points(p_amount, p_bonus_id, p_doc_date, p_brand_id);
  v_points := coalesce(p_points_override, (v_calc ->> 'points')::numeric);
  if p_points_override is not null then
    if coalesce(trim(p_note), '') = '' then raise exception 'กรุณาระบุเหตุผลเมื่อแก้จำนวนแต้มเอง'; end if;
    v_calc := v_calc || jsonb_build_object('override', p_points_override);
  end if;
  if v_points <= 0 then raise exception 'ยอดซื้อนี้ยังไม่ถึงเกณฑ์ได้แต้ม (ได้ % แต้ม)', v_points; end if;
  insert into public.point_ledger (wallet, company_id, brand_id, points, kind, expires_on, invoice_no, doc_date, amount, items, file_path, calc, note, created_by)
  values ('company', p_company_id, p_brand_id, v_points, 'purchase', (v_calc ->> 'expires_on')::date, trim(p_invoice_no), p_doc_date, p_amount,
          nullif(trim(p_items), ''), nullif(p_file_path, ''), v_calc, nullif(trim(p_note), ''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.edit_company_purchase(
  p_id bigint, p_reason text, p_invoice_no text, p_doc_date date, p_amount numeric,
  p_items text default null, p_file_path text default null, p_bonus_id uuid default null,
  p_note text default null, p_points_override numeric default null, p_brand_id uuid default null
)
returns public.point_ledger language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.point_ledger;
  v_new public.point_ledger;
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into v_old from public.point_ledger where id = p_id and wallet = 'company' and kind = 'purchase';
  if not found then raise exception 'ไม่พบรายการยอดซื้อ'; end if;
  perform public._void_point_row(p_id, 'แก้ไข: ' || coalesce(trim(p_reason), ''));
  v_new := public.add_company_purchase(v_old.company_id, p_invoice_no, p_doc_date, p_amount, p_items,
                                       coalesce(nullif(p_file_path, ''), v_old.file_path), p_bonus_id,
                                       coalesce(nullif(trim(p_note), ''), trim(p_reason)), p_points_override, p_brand_id);
  update public.point_ledger set replaces_id = p_id where id = v_new.id;
  select * into v_new from public.point_ledger where id = v_new.id;
  return v_new;
end $$;

revoke execute on function public.calc_company_points(numeric, uuid, date, uuid) from public, anon;
revoke execute on function public.add_company_purchase(uuid, text, date, numeric, text, text, uuid, text, numeric, uuid) from public, anon;
revoke execute on function public.edit_company_purchase(bigint, text, text, date, numeric, text, text, uuid, text, numeric, uuid) from public, anon;
grant execute on function public.calc_company_points(numeric, uuid, date, uuid) to authenticated;
grant execute on function public.add_company_purchase(uuid, text, date, numeric, text, text, uuid, text, numeric, uuid) to authenticated;
grant execute on function public.edit_company_purchase(bigint, text, text, date, numeric, text, text, uuid, text, numeric, uuid) to authenticated;
