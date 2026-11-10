-- One App SSC · Phase 3.1: promo codes for training sessions
--
-- Staff/Admin create a code for one session (or every session): free, a baht discount, or a percent discount.
-- The customer types it when booking. A code that makes the price 0 books as "free": no billing details,
-- no slip, no quotation. Uses are counted from active bookings, so a cancelled booking frees its use.
-- book_session keeps its signature: p_coupon_code takes either a promo code or a personal reward coupon.

create table public.training_promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  session_id  uuid references public.course_sessions (id) on delete cascade,   -- null = ทุกรอบ
  kind        text not null check (kind in ('free', 'amount', 'percent')),
  value       numeric(12, 2) not null default 0 check (value >= 0),
  max_uses    int check (max_uses is null or max_uses > 0),                     -- null = ไม่จำกัด
  expires_on  date,
  is_active   boolean not null default true,
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (kind <> 'percent' or value between 1 and 100),
  check (kind <> 'amount' or value > 0)
);
create unique index training_promo_codes_code_idx on public.training_promo_codes (code);
create index training_promo_codes_session_idx on public.training_promo_codes (session_id);
create trigger training_promo_codes_touch before update on public.training_promo_codes
  for each row execute function public.touch_updated_at();
create trigger audit_training_promo_codes after insert or update or delete on public.training_promo_codes
  for each row execute function public.audit_row();

alter table public.training_registrations
  add column promo_code_id uuid references public.training_promo_codes (id) on delete set null;
create index training_regs_promo_idx on public.training_registrations (promo_code_id);

alter table public.training_promo_codes enable row level security;
create policy promo_codes_select on public.training_promo_codes for select to authenticated using (public.is_staff_or_admin());
create policy promo_codes_write on public.training_promo_codes for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- active bookings that used each code
create or replace function public.promo_code_uses()
returns table (promo_code_id uuid, used int)
language sql stable security definer set search_path = ''
as $$
  select r.promo_code_id, count(*)::int from public.training_registrations r
   where r.promo_code_id is not null and r.status in ('registered', 'attended') and public.is_staff_or_admin()
   group by r.promo_code_id
$$;

-- the usable promo row for a code, or an error saying why not
create or replace function public._find_promo(p_code text, p_session_id uuid)
returns public.training_promo_codes language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.training_promo_codes;
  v_used int;
begin
  select * into v from public.training_promo_codes where code = upper(trim(p_code));
  if not found then return null; end if;
  if not v.is_active or (v.expires_on is not null and v.expires_on < public.bkk_today()) then
    raise exception 'โค้ด % หมดอายุแล้ว', v.code;
  end if;
  if p_session_id is not null and v.session_id is not null and v.session_id <> p_session_id then
    raise exception 'โค้ด % ใช้กับรอบอบรมนี้ไม่ได้', v.code;
  end if;
  if v.max_uses is not null then
    select count(*) into v_used from public.training_registrations
     where promo_code_id = v.id and status in ('registered', 'attended');
    if v_used >= v.max_uses then raise exception 'โค้ด % ถูกใช้ครบจำนวนแล้ว', v.code; end if;
  end if;
  return v;
end $$;

-- booking form: check a code before submitting (signed-in users only)
create or replace function public.check_promo_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.training_promo_codes;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ' using errcode = '42501'; end if;
  v := public._find_promo(p_code, null);
  if v.id is null then raise exception 'ไม่พบโค้ดโปรโมชั่นนี้'; end if;
  return jsonb_build_object('code', v.code, 'kind', v.kind, 'value', v.value, 'session_id', v.session_id);
end $$;

create or replace function public.book_session(
  p_session_id uuid,
  p_sale_name text default null,
  p_source text default null,
  p_billing jsonb default null,
  p_coupon_code text default null,
  p_wants_quote boolean default false,
  p_note text default null
)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg public.training_settings;
  v_s public.course_sessions;
  v_c public.courses;
  v_reg public.training_registrations;
  v_price numeric;
  v_discount numeric := 0;
  v_sub numeric;
  v_vat numeric := 0;
  v_wht numeric := 0;
  v_type text := coalesce(p_billing ->> 'type', 'person');
  v_coupon public.redemptions;
  v_promo public.training_promo_codes;
  v_booked int;
  v_active int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'กรุณาเข้าสู่ระบบ' using errcode = '42501';
  end if;
  select * into v_cfg from public.training_settings where id = 1;
  if public.is_training_banned(auth.uid()) then
    raise exception 'บัญชีของคุณถูกระงับสิทธิ์การจองถึงสิ้นปี เนื่องจากเลื่อน/ยกเลิก/ไม่มาเกิน % ครั้ง', v_cfg.strike_limit;
  end if;
  select * into v_s from public.course_sessions where id = p_session_id for update;
  if not found or v_s.is_archived then raise exception 'ไม่พบรอบอบรม'; end if;
  if v_s.status <> 'open' then raise exception 'รอบนี้ปิดรับสมัครแล้ว'; end if;
  if v_s.starts_on < public.bkk_today() then raise exception 'รอบนี้ผ่านไปแล้ว'; end if;
  select * into v_c from public.courses where id = v_s.course_id;
  if not v_c.is_active then raise exception 'หลักสูตรนี้ปิดรับสมัคร'; end if;
  if exists (select 1 from public.training_registrations
              where session_id = v_s.id and user_id = auth.uid() and status in ('registered', 'attended')) then
    raise exception 'คุณลงทะเบียนรอบนี้ไว้แล้ว';
  end if;
  select count(*) into v_active from public.training_registrations r join public.course_sessions s on s.id = r.session_id
   where r.user_id = auth.uid() and r.status = 'registered' and s.starts_on >= public.bkk_today();
  if v_active >= v_cfg.max_active_bookings then
    raise exception 'จองล่วงหน้าได้สูงสุด % รอบ', v_cfg.max_active_bookings;
  end if;
  select count(*) into v_booked from public.training_registrations where session_id = v_s.id and status in ('registered', 'attended');
  if v_booked >= v_s.capacity then raise exception 'รอบนี้เต็มแล้ว'; end if;
  v_price := public._session_price(v_s.id);

  if coalesce(trim(p_coupon_code), '') <> '' then
    perform pg_advisory_xact_lock(hashtext('onessc.promo.' || upper(trim(p_coupon_code))));
    v_promo := public._find_promo(p_coupon_code, v_s.id);
    if v_promo.id is not null then
      v_discount := case v_promo.kind
                      when 'free' then v_price
                      when 'amount' then least(v_promo.value, v_price)
                      else round(v_price * v_promo.value / 100, 2) end;
    else
      if v_price <= 0 then raise exception 'รอบนี้ไม่มีค่าใช้จ่าย ไม่ต้องใช้คูปอง'; end if;
      select * into v_coupon from public.redemptions red
       where upper(red.code) = upper(trim(p_coupon_code)) and red.user_id = auth.uid()
         and red.wallet = 'personal' and red.status = 'issued'
         and exists (select 1 from public.rewards rw where rw.id = red.reward_id and coalesce(rw.discount_baht, 0) > 0)
       for update;
      if not found then raise exception 'โค้ดส่วนลดไม่ถูกต้องหรือถูกใช้แล้ว'; end if;
      select least(rw.discount_baht, v_price) into v_discount from public.rewards rw where rw.id = v_coupon.reward_id;
    end if;
  end if;

  v_sub := v_price - v_discount;
  if v_sub > 0 then
    if v_type not in ('company', 'person', 'person_no_vat') then raise exception 'ประเภทใบเสร็จไม่ถูกต้อง'; end if;
    if v_type = 'person_no_vat' and not v_cfg.person_no_vat then raise exception 'ต้องออกใบกำกับภาษี'; end if;
    if coalesce(trim(p_billing ->> 'name'), '') = '' then raise exception 'กรุณากรอกชื่อสำหรับออกใบเสร็จ'; end if;
    if v_type = 'company' and coalesce(p_billing ->> 'tax_id', '') !~ '^[0-9]{13}$' then
      raise exception 'กรุณากรอกเลขผู้เสียภาษี 13 หลัก';
    end if;
    if v_s.vat and v_type <> 'person_no_vat' then v_vat := round(v_sub * v_cfg.vat_rate / 100, 2); end if;
    if v_type = 'company' and v_s.wht_allowed then v_wht := round(v_sub * v_cfg.wht_rate / 100, 2); end if;
  end if;

  insert into public.training_registrations (
    code, user_id, session_id, pay_status, wants_quote, subtotal, discount, vat_amount, wht_amount, total,
    billing, coupon_code, promo_code_id, sale_name, source, note)
  values (
    public.next_doc_no('TR'), auth.uid(), v_s.id,
    case when v_sub + v_vat - v_wht > 0 then 'unpaid' else 'free' end,
    coalesce(p_wants_quote, false) and v_sub > 0,
    v_price, v_discount, v_vat, v_wht, v_sub + v_vat - v_wht,
    case when v_sub > 0 then p_billing end, coalesce(v_promo.code, v_coupon.code), v_promo.id,
    nullif(trim(p_sale_name), ''), nullif(trim(p_source), ''), nullif(trim(p_note), ''))
  returning * into v_reg;
  if v_coupon.id is not null then
    update public.redemptions set status = 'used', used_at = now(), used_ref = v_reg.code where id = v_coupon.id;
  end if;
  return v_reg;
end $$;

-- reschedule keeps the promo code on the new booking
create or replace function public.reschedule_registration(p_id uuid, p_new_session_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
  v_old public.course_sessions;
  v_new public.course_sessions;
  v_days int;
  v_staff boolean := public.has_perm('courses');
  v_booked int;
  v_new_reg public.training_registrations;
  v_banned boolean := false;
begin
  select * into v_reg from public.training_registrations where id = p_id for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if not v_staff and v_reg.user_id is distinct from auth.uid() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if v_reg.status <> 'registered' then raise exception 'เลื่อนรายการนี้ไม่ได้'; end if;
  select * into v_old from public.course_sessions where id = v_reg.session_id;
  select change_days_before into v_days from public.training_settings where id = 1;
  if not v_staff and v_old.starts_on - public.bkk_today() < v_days then
    raise exception 'เลื่อนได้ถึง % วันก่อนวันอบรม กรุณาติดต่อทีมงาน', v_days;
  end if;
  select * into v_new from public.course_sessions where id = p_new_session_id for update;
  if not found or v_new.is_archived or v_new.status <> 'open' or v_new.starts_on < public.bkk_today() then
    raise exception 'รอบใหม่ไม่เปิดรับสมัคร';
  end if;
  if v_new.course_id <> v_old.course_id then raise exception 'เลื่อนได้เฉพาะรอบของหลักสูตรเดียวกัน'; end if;
  if v_new.id = v_old.id then raise exception 'เลือกรอบอื่น'; end if;
  select count(*) into v_booked from public.training_registrations where session_id = v_new.id and status in ('registered', 'attended');
  if v_booked >= v_new.capacity then raise exception 'รอบใหม่เต็มแล้ว'; end if;
  update public.training_registrations
     set status = 'rescheduled', cancelled_at = now(), cancel_reason = coalesce(nullif(trim(p_reason), ''), 'เลื่อนรอบ')
   where id = p_id;
  insert into public.training_registrations (
    code, user_id, session_id, pay_status, wants_quote, quote_file_path, subtotal, discount, vat_amount, wht_amount, total,
    billing, coupon_code, promo_code_id, slip_path, wht_cert_path, receipt_path, paid_at, sale_name, source, note, rescheduled_from)
  values (
    public.next_doc_no('TR'), v_reg.user_id, v_new.id, v_reg.pay_status, v_reg.wants_quote, v_reg.quote_file_path,
    v_reg.subtotal, v_reg.discount, v_reg.vat_amount, v_reg.wht_amount, v_reg.total, v_reg.billing, v_reg.coupon_code,
    v_reg.promo_code_id, v_reg.slip_path, v_reg.wht_cert_path, v_reg.receipt_path, v_reg.paid_at, v_reg.sale_name,
    v_reg.source, v_reg.note, v_reg.id)
  returning * into v_new_reg;
  update public.redemptions set used_ref = v_new_reg.code where code = v_reg.coupon_code and used_ref = v_reg.code;
  if not v_staff and v_reg.user_id is not null then
    v_banned := public._add_strike(v_reg.user_id, v_reg.id, 'reschedule', p_reason);
  end if;
  return jsonb_build_object('id', v_new_reg.id, 'code', v_new_reg.code, 'banned', v_banned,
                            'strikes', public.strike_count(v_reg.user_id));
end $$;

-- staff cannot move a booking onto or off a promo code by editing the row
create or replace function public.training_regs_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  -- Not security definer on purpose: current_user is the role running the UPDATE. Inside the
  -- security-definer RPCs it is the function owner, so their writes go through; a direct
  -- table update from the API runs as authenticated (staff only, via RLS) and is limited here.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.id := old.id; new.code := old.code; new.user_id := old.user_id; new.session_id := old.session_id;
  new.legacy_user_id := old.legacy_user_id; new.status := old.status; new.points_awarded := old.points_awarded;
  new.cert_no := old.cert_no; new.cert_issued_at := old.cert_issued_at; new.cert_expires_on := old.cert_expires_on;
  new.checked_in_at := old.checked_in_at; new.check_in_method := old.check_in_method;
  new.evaluation := old.evaluation; new.evaluated_at := old.evaluated_at; new.created_at := old.created_at;
  new.rescheduled_from := old.rescheduled_from; new.coupon_code := old.coupon_code; new.promo_code_id := old.promo_code_id;
  if new.pay_status = 'paid' and old.pay_status <> 'paid' then new.paid_at := coalesce(new.paid_at, now()); end if;
  return new;
end $$;

revoke execute on function public._find_promo(text, uuid) from public, anon, authenticated;
revoke execute on function public.check_promo_code(text) from public, anon;
revoke execute on function public.promo_code_uses() from public, anon;
grant execute on function public.check_promo_code(text) to authenticated;
grant execute on function public.promo_code_uses() to authenticated;
