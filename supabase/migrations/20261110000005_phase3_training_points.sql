-- One App SSC · Phase 3: training (from cerssc), personal points, company points, rewards & coupons
--
-- อบรม: หลักสูตร → รอบอบรม → ลงทะเบียน (จองล่วงหน้าได้ N รอบ, เลื่อน/ยกเลิกได้ถึง X วันก่อน,
--        เลื่อน/ยกเลิก/ไม่มาเกินกำหนดในปีเดียวกัน = ยกเลิกทุกการจองและระงับสิทธิ์ถึงสิ้นปี)
--        เช็กอินด้วยรหัส 6 หลัก/QR + GPS · ทำแบบประเมินแล้วได้ใบประกาศ (มี QR ตรวจสอบ)
-- แต้ม: บัญชีเดียว (point_ledger) สองกระเป๋า
--        personal = แต้มส่วนตัว ได้จากชั่วโมงอบรม หมดอายุ 31 ธ.ค. ของปีที่ได้ · ลูกค้าแลกเอง ได้คูปอง
--        company  = แต้มบริษัท (ตามเลขผู้เสียภาษี) Staff/Admin บันทึกจากยอดซื้อ คำนวณตามกติกาที่ Admin ตั้ง
--                   Staff/Admin เป็นผู้ตัดแต้มเป็นส่วนลด
--        ไม่มีการแก้ยอดรวมตรง ๆ: ทุกการเปลี่ยนเป็นแถวใน ledger · ยกเลิก = void (แถวยังอยู่ พร้อมเหตุผล)
--        แต้มแต่ละก้อนมีวันหมดอายุ (expires_on) การหักแต้มตัดจากก้อนที่หมดอายุก่อน (FIFO)

-- ---------------------------------------------------------------------------
-- Permissions / profile fields
-- ---------------------------------------------------------------------------
update public.permission_keys
   set label = 'อบรมและกิจกรรม',
       description = 'หลักสูตร รอบอบรม รายชื่อผู้เข้าอบรม เช็กอิน การชำระเงิน ใบประกาศ'
 where key = 'courses';

alter table public.profiles add column if not exists name_en text;   -- ชื่อภาษาอังกฤษบนใบประกาศ

-- today in Thailand
create or replace function public.bkk_today()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

-- ---------------------------------------------------------------------------
-- Settings (one row each; Admin edits)
-- ---------------------------------------------------------------------------
create table public.training_settings (
  id                    int primary key default 1 check (id = 1),
  max_active_bookings   int not null default 5 check (max_active_bookings between 1 and 50),
  change_days_before    int not null default 3 check (change_days_before between 0 and 60),
  strike_limit          int not null default 2 check (strike_limit between 0 and 20),
  auto_no_show          boolean not null default true,
  checkin_open_minutes  int not null default 120 check (checkin_open_minutes between 0 and 1440),
  checkin_radius_m      int not null default 100 check (checkin_radius_m >= 0),   -- 0 = ไม่ตรวจ GPS
  cert_format           text not null default 'SSC-{CODE}-{YYYY}-{RUN}',
  cert_run_digits       int not null default 4 check (cert_run_digits between 1 and 8),
  cert_valid_months     int not null default 12 check (cert_valid_months between 0 and 120),  -- 0 = ไม่มีวันหมดอายุ
  cert_requires_evaluation boolean not null default true,
  vat_rate              numeric(5, 2) not null default 7,
  wht_rate              numeric(5, 2) not null default 3,
  person_no_vat         boolean not null default true,   -- บุคคลเลือก "ไม่รับใบกำกับภาษี" ได้
  pay_info              text,
  wht_payee_info        text,
  sales_list            text[] not null default '{}',
  source_list           text[] not null default '{}',
  evaluation_questions  jsonb not null default '["ความพึงพอใจต่อเนื้อหาหลักสูตร","ความพึงพอใจต่อวิทยากร","ความพึงพอใจต่อสถานที่และการจัดงาน","นำความรู้ไปใช้ในงานได้"]'::jsonb,
  updated_by            uuid references auth.users (id) on delete set null,
  updated_at            timestamptz not null default now()
);
insert into public.training_settings (id) values (1);

create table public.points_config (
  id                    int primary key default 1 check (id = 1),
  -- personal
  points_per_hour       numeric(8, 2) not null default 1 check (points_per_hour >= 0),
  rewards_enabled       boolean not null default true,
  lucky_cost            numeric(10, 2) not null default 10 check (lucky_cost >= 0),   -- 0 = ปิดสุ่มรางวัล
  -- company (ค่าเริ่มต้นเป็นตัวอย่าง Admin ต้องตั้งค่าจริง)
  company_baht_per_point numeric(14, 2) not null default 1000 check (company_baht_per_point > 0),
  company_tiers         jsonb not null default '[{"min":0,"multiplier":1}]'::jsonb,  -- ขั้นบันไดตามยอดต่อบิล
  company_expiry        text not null default 'end_of_next_year'
                        check (company_expiry in ('end_of_year', 'end_of_next_year', 'none')),
  updated_by            uuid references auth.users (id) on delete set null,
  updated_at            timestamptz not null default now()
);
insert into public.points_config (id) values (1);

-- ตัวคูณพิเศษตามช่วงเวลา เช่น "สินค้าโปรโมชั่น ×2" — Staff เลือกตอนบันทึกยอดซื้อ
create table public.company_point_bonuses (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (length(trim(label)) > 0),
  multiplier  numeric(6, 2) not null check (multiplier > 0),
  starts_on   date,
  ends_on     date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- ---------------------------------------------------------------------------
-- Courses, sessions, certificate templates, materials
-- ---------------------------------------------------------------------------
create table public.cert_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  image_url   text,
  -- {"dateLang":"en","fields":{"name":{"show":true,"x":0.5,"y":0.39,"size":0.05,"color":"#000","align":"center"}, ...}}
  config      jsonb not null default '{}'::jsonb,
  legacy_id   text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  title            text not null check (length(trim(title)) > 0),
  subtitle         text,
  description      text,
  hours            numeric(5, 2) check (hours is null or hours >= 0),
  price            numeric(12, 2) check (price is null or price >= 0),   -- null / 0 = ฟรี
  color            text,
  cover_url        text,
  cert_template_id uuid references public.cert_templates (id) on delete set null,
  is_active        boolean not null default true,
  sort             int not null default 0,
  legacy_id        text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.course_sessions (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses (id) on delete cascade,
  title            text,
  starts_on        date not null,
  ends_on          date,
  start_time       time not null default '09:00',
  end_time         time not null default '16:00',
  hours            numeric(5, 2) check (hours is null or hours >= 0),     -- null = ใช้ชั่วโมงของหลักสูตร
  location         text,
  map_url          text,
  lat              numeric(9, 6),
  lng              numeric(9, 6),
  capacity         int not null default 30 check (capacity > 0),
  status           text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  price            numeric(12, 2) check (price is null or price >= 0),    -- null = ใช้ราคาหลักสูตร
  vat              boolean not null default true,
  wht_allowed      boolean not null default true,
  checkin_code     text not null default lpad((floor(random() * 1000000))::int::text, 6, '0') check (checkin_code ~ '^[0-9]{6}$'),
  cert_template_id uuid references public.cert_templates (id) on delete set null,
  note             text,
  is_archived      boolean not null default false,
  legacy_id        text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index course_sessions_course_idx on public.course_sessions (course_id);
create index course_sessions_starts_idx on public.course_sessions (starts_on);

create table public.course_materials (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.courses (id) on delete cascade,
  session_id  uuid references public.course_sessions (id) on delete cascade,
  kind        text not null default 'link' check (kind in ('video', 'file', 'link')),
  title       text not null check (length(trim(title)) > 0),
  url         text not null,
  visibility  text not null default 'registered' check (visibility in ('public', 'registered', 'attended')),
  sort        int not null default 0,
  legacy_id   text unique,
  created_at  timestamptz not null default now(),
  check (course_id is not null or session_id is not null)
);

-- ---------------------------------------------------------------------------
-- cerssc accounts waiting to be claimed (email match on sign-up)
-- ---------------------------------------------------------------------------
create table public.legacy_cerssc_users (
  legacy_id   text primary key,
  email       text not null unique,
  full_name   text,
  phone       text,
  company     text,
  tax_id      text,
  position    text,
  legacy_role text,
  claimed_by  uuid references public.profiles (id) on delete set null,
  claimed_at  timestamptz,
  imported_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Registrations & strikes
-- ---------------------------------------------------------------------------
create table public.training_registrations (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,                  -- TR-69-0001 (เดิม R… จาก cerssc)
  user_id          uuid references public.profiles (id) on delete cascade,
  legacy_user_id   text,                                  -- รอผู้ใช้ cerssc สมัคร One App ด้วยอีเมลเดิม
  session_id       uuid not null references public.course_sessions (id) on delete cascade,
  status           text not null default 'registered'
                   check (status in ('registered', 'attended', 'cancelled', 'no_show', 'rescheduled')),
  registered_at    timestamptz not null default now(),
  checked_in_at    timestamptz,
  check_in_method  text check (check_in_method in ('code', 'qr', 'staff')),
  check_in_dist_m  numeric(10, 1),
  points_awarded   numeric(10, 2),
  evaluated_at     timestamptz,
  evaluation       jsonb,
  cert_no          text unique,
  cert_issued_at   timestamptz,
  cert_expires_on  date,
  rescheduled_from uuid references public.training_registrations (id) on delete set null,
  cancel_reason    text,
  cancelled_at     timestamptz,
  -- payment
  pay_status       text not null default 'free' check (pay_status in ('free', 'unpaid', 'pending', 'paid', 'refunded')),
  wants_quote      boolean not null default false,
  quote_file_path  text,
  subtotal         numeric(12, 2) not null default 0,
  discount         numeric(12, 2) not null default 0,
  vat_amount       numeric(12, 2) not null default 0,
  wht_amount       numeric(12, 2) not null default 0,
  total            numeric(12, 2) not null default 0,
  billing          jsonb,          -- {"type":"company|person|person_no_vat","name":"","tax_id":"","branch":"","address":""}
  coupon_code      text,
  slip_path        text,
  wht_cert_path    text,
  receipt_path     text,
  paid_at          timestamptz,
  sale_name        text,
  source           text,
  note             text,
  staff_note       text,
  legacy_id        text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (user_id is not null or legacy_user_id is not null)
);
create index training_regs_user_idx on public.training_registrations (user_id);
create index training_regs_session_idx on public.training_registrations (session_id);
create unique index training_regs_one_active_per_session
  on public.training_registrations (session_id, user_id)
  where status in ('registered', 'attended') and user_id is not null;

create table public.training_strikes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles (id) on delete cascade,
  legacy_user_id   text,
  registration_id  uuid references public.training_registrations (id) on delete set null,
  kind             text not null check (kind in ('reschedule', 'cancel', 'no_show')),
  reason           text,
  year             int not null default extract(year from (now() at time zone 'Asia/Bangkok'))::int,
  waived_at        timestamptz,
  waived_by        uuid references auth.users (id) on delete set null,
  legacy_id        text unique,
  created_at       timestamptz not null default now(),
  check (user_id is not null or legacy_user_id is not null)
);
create index training_strikes_user_idx on public.training_strikes (user_id, year);

-- ---------------------------------------------------------------------------
-- Points ledger (personal + company), rewards, redemptions/coupons
-- ---------------------------------------------------------------------------
create table public.rewards (
  id             uuid primary key default gen_random_uuid(),
  wallet         text not null default 'personal' check (wallet in ('personal', 'company')),
  kind           text not null default 'item' check (kind in ('item', 'prize')),  -- prize = รางวัลในการสุ่ม
  name           text not null check (length(trim(name)) > 0),
  description    text,
  image_url      text,
  points         numeric(10, 2) check (points is null or points >= 0),   -- แต้มที่ใช้แลก (item)
  stock          int check (stock is null or stock >= 0),                -- null = ไม่จำกัด
  weight         int check (weight is null or weight >= 0),              -- น้ำหนักการสุ่ม (prize)
  discount_baht  numeric(12, 2) check (discount_baht is null or discount_baht >= 0),  -- คูปองส่วนลดค่าอบรม
  bonus_points   numeric(10, 2) check (bonus_points is null or bonus_points >= 0),    -- รางวัลสุ่มที่เป็นแต้มคืน
  is_active      boolean not null default true,
  sort           int not null default 0,
  legacy_id      text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (wallet = 'personal' or kind = 'item')
);

create table public.redemptions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                 -- CP-69-0001 (คูปอง) / RD-69-0001 (ตัดแต้มบริษัท)
  wallet         text not null check (wallet in ('personal', 'company')),
  user_id        uuid references public.profiles (id) on delete set null,
  company_id     uuid references public.companies (id) on delete cascade,
  reward_id      uuid references public.rewards (id) on delete set null,
  reward_name    text not null,
  points         numeric(10, 2) not null check (points >= 0),
  method         text not null check (method in ('direct', 'lucky', 'staff')),
  status         text not null default 'issued' check (status in ('issued', 'used', 'cancelled')),
  ref_doc        text,                                 -- เลขเอกสารอ้างอิงตอนตัดแต้มบริษัท
  note           text,
  used_at        timestamptz,
  used_by        uuid references auth.users (id) on delete set null,
  used_ref       text,                                 -- เช่น เลขลงทะเบียนอบรมที่ใช้คูปองส่วนลด
  cancelled_at   timestamptz,
  cancelled_by   uuid references auth.users (id) on delete set null,
  cancel_reason  text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((wallet = 'personal' and user_id is not null) or (wallet = 'company' and company_id is not null))
);
create index redemptions_user_idx on public.redemptions (user_id);
create index redemptions_company_idx on public.redemptions (company_id);

create table public.point_ledger (
  id             bigint generated always as identity primary key,
  wallet         text not null check (wallet in ('personal', 'company')),
  user_id        uuid references public.profiles (id) on delete cascade,
  legacy_user_id text,
  company_id     uuid references public.companies (id) on delete cascade,
  points         numeric(12, 2) not null check (points <> 0),
  kind           text not null check (kind in ('earn', 'purchase', 'adjust', 'redeem', 'lucky', 'refund')),
  expires_on     date,                     -- null = ไม่หมดอายุ
  -- purchase details (company earn)
  invoice_no     text,
  doc_date       date,
  amount         numeric(14, 2),
  items          text,
  file_path      text,
  calc           jsonb,                    -- snapshot ของกติกาที่ใช้คำนวณ
  -- links
  registration_id uuid references public.training_registrations (id) on delete set null,
  redemption_id  uuid references public.redemptions (id) on delete set null,
  replaces_id    bigint references public.point_ledger (id) on delete set null,   -- แก้ไข = void ตัวเดิม + แถวใหม่
  ref_doc        text,
  note           text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,
  voided_by      uuid references auth.users (id) on delete set null,
  void_reason    text,
  legacy_id      text unique,
  check ((wallet = 'personal' and company_id is null and (user_id is not null or legacy_user_id is not null))
      or (wallet = 'company' and company_id is not null and user_id is null and legacy_user_id is null)),
  check (voided_at is null or void_reason is not null)
);
create index point_ledger_user_idx on public.point_ledger (user_id) where wallet = 'personal';
create index point_ledger_company_idx on public.point_ledger (company_id) where wallet = 'company';
create index point_ledger_redemption_idx on public.point_ledger (redemption_id);

-- ---------------------------------------------------------------------------
-- Triggers: touch + audit
-- ---------------------------------------------------------------------------
create trigger training_settings_touch before update on public.training_settings for each row execute function public.touch_updated_at();
create trigger points_config_touch before update on public.points_config for each row execute function public.touch_updated_at();
create trigger cert_templates_touch before update on public.cert_templates for each row execute function public.touch_updated_at();
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();
create trigger course_sessions_touch before update on public.course_sessions for each row execute function public.touch_updated_at();
create trigger training_regs_touch before update on public.training_registrations for each row execute function public.touch_updated_at();
create trigger rewards_touch before update on public.rewards for each row execute function public.touch_updated_at();
create trigger redemptions_touch before update on public.redemptions for each row execute function public.touch_updated_at();

create trigger audit_training_settings after update on public.training_settings for each row execute function public.audit_row();
create trigger audit_points_config after update on public.points_config for each row execute function public.audit_row();
create trigger audit_company_point_bonuses after insert or update or delete on public.company_point_bonuses for each row execute function public.audit_row();
create trigger audit_courses after insert or update or delete on public.courses for each row execute function public.audit_row();
create trigger audit_course_sessions after insert or update or delete on public.course_sessions for each row execute function public.audit_row();
create trigger audit_training_regs after update or delete on public.training_registrations for each row execute function public.audit_row();
create trigger audit_training_strikes after insert or update or delete on public.training_strikes for each row execute function public.audit_row();
create trigger audit_rewards after insert or update or delete on public.rewards for each row execute function public.audit_row();
create trigger audit_redemptions after insert or update on public.redemptions for each row execute function public.audit_row();
create trigger audit_point_ledger after insert or update or delete on public.point_ledger for each row execute function public.audit_row();

-- Ledger rows are append-only: only the void columns may change.
create or replace function public.point_ledger_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- only the service role / SQL editor (e.g. deleting a whole account) may remove rows
    if auth.uid() is null then return old; end if;
    raise exception 'ลบรายการแต้มไม่ได้ ใช้การยกเลิก (void) แทน';
  end if;
  if old.replaces_id is not null and new.replaces_id is distinct from old.replaces_id then
    raise exception 'แก้ไขรายการแต้มโดยตรงไม่ได้';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'รายการนี้ถูกยกเลิกไปแล้ว';
  end if;
  -- allowed changes: void columns, the replaces_id link (set once), legacy → account claim
  if (to_jsonb(new) - '{voided_at,voided_by,void_reason,user_id,legacy_user_id,replaces_id}'::text[])
     is distinct from (to_jsonb(old) - '{voided_at,voided_by,void_reason,user_id,legacy_user_id,replaces_id}'::text[]) then
    raise exception 'แก้ไขรายการแต้มโดยตรงไม่ได้';
  end if;
  return new;
end $$;
create trigger point_ledger_guard before update or delete on public.point_ledger
  for each row execute function public.point_ledger_guard();

-- ---------------------------------------------------------------------------
-- Points engine
-- ---------------------------------------------------------------------------
create or replace function public.point_balance(p_wallet text, p_owner uuid)
returns numeric language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_staff_or_admin()
     and not ((p_wallet = 'personal' and p_owner = auth.uid())
              or (p_wallet = 'company' and p_owner = public.my_company_id())) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  return (select coalesce(sum(l.points), 0)
            from public.point_ledger l
           where l.wallet = p_wallet
             and l.voided_at is null
             and (l.expires_on is null or l.expires_on >= public.bkk_today())
             and case when p_wallet = 'personal' then l.user_id = p_owner else l.company_id = p_owner end);
end $$;

-- Deduct p_points from the owner's unexpired buckets, earliest expiry first.
-- Writes one negative row per bucket touched (same expires_on) so every bucket stays >= 0.
create or replace function public._deduct_points(
  p_wallet text, p_owner uuid, p_points numeric, p_kind text,
  p_redemption_id uuid default null, p_ref_doc text default null, p_note text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_left numeric := p_points;
  v_bucket record;
  v_take numeric;
begin
  if p_points is null or p_points <= 0 then raise exception 'จำนวนแต้มต้องมากกว่า 0'; end if;
  perform pg_advisory_xact_lock(hashtext('onessc.points.' || p_wallet || '.' || p_owner::text));
  for v_bucket in
    select l.expires_on, sum(l.points) as net
      from public.point_ledger l
     where l.wallet = p_wallet and l.voided_at is null
       and (l.expires_on is null or l.expires_on >= public.bkk_today())
       and case when p_wallet = 'personal' then l.user_id = p_owner else l.company_id = p_owner end
     group by l.expires_on
    having sum(l.points) > 0
     order by l.expires_on asc nulls last
  loop
    exit when v_left <= 0;
    v_take := least(v_bucket.net, v_left);
    insert into public.point_ledger (wallet, user_id, company_id, points, kind, expires_on, redemption_id, ref_doc, note, created_by)
    values (p_wallet,
            case when p_wallet = 'personal' then p_owner end,
            case when p_wallet = 'company' then p_owner end,
            -v_take, p_kind, v_bucket.expires_on, p_redemption_id, p_ref_doc, p_note, auth.uid());
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then
    raise exception 'แต้มไม่พอ (คงเหลือ %)', public.point_balance(p_wallet, p_owner);
  end if;
end $$;

-- Void one ledger row. A positive row can be voided only if its bucket would not go negative.
create or replace function public._void_point_row(p_id bigint, p_reason text)
returns public.point_ledger language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.point_ledger;
  v_net numeric;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผล'; end if;
  select * into v_row from public.point_ledger where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการแต้ม'; end if;
  if v_row.voided_at is not null then raise exception 'รายการนี้ถูกยกเลิกไปแล้ว'; end if;
  perform pg_advisory_xact_lock(hashtext('onessc.points.' || v_row.wallet || '.' || coalesce(v_row.user_id, v_row.company_id)::text));
  if v_row.points > 0 then
    select coalesce(sum(l.points), 0) into v_net
      from public.point_ledger l
     where l.wallet = v_row.wallet and l.voided_at is null and l.id <> v_row.id
       and l.expires_on is not distinct from v_row.expires_on
       and l.user_id is not distinct from v_row.user_id
       and l.company_id is not distinct from v_row.company_id
       and l.legacy_user_id is not distinct from v_row.legacy_user_id;
    if v_net < 0 then
      raise exception 'ยกเลิกไม่ได้ เพราะแต้มก้อนนี้ถูกใช้ไปแล้ว % แต้ม (ยกเลิกการแลก/ตัดแต้มที่เกี่ยวข้องก่อน)', -v_net;
    end if;
  end if;
  update public.point_ledger
     set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
   where id = p_id
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.company_expiry_for(p_date date)
returns date language sql stable security definer set search_path = ''
as $$
  select case c.company_expiry
           when 'end_of_year' then make_date(extract(year from p_date)::int, 12, 31)
           when 'end_of_next_year' then make_date(extract(year from p_date)::int + 1, 12, 31)
           else null end
    from public.points_config c where c.id = 1
$$;

-- Preview: amount → points with the current rules
create or replace function public.calc_company_points(p_amount numeric, p_bonus_id uuid default null, p_doc_date date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg public.points_config;
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
  select coalesce((t ->> 'multiplier')::numeric, 1) into v_tier
    from jsonb_array_elements(v_cfg.company_tiers) t
   where coalesce((t ->> 'min')::numeric, 0) <= p_amount
   order by coalesce((t ->> 'min')::numeric, 0) desc
   limit 1;
  v_tier := coalesce(v_tier, 1);
  if p_bonus_id is not null then
    select * into v_bonus from public.company_point_bonuses
     where id = p_bonus_id and is_active
       and (starts_on is null or starts_on <= v_date) and (ends_on is null or ends_on >= v_date);
    if not found then raise exception 'โบนัสนี้ไม่อยู่ในช่วงเวลาที่ใช้ได้'; end if;
    v_bonus_mult := v_bonus.multiplier;
  end if;
  v_base := p_amount / v_cfg.company_baht_per_point;
  v_points := floor(v_base * v_tier * v_bonus_mult);
  return jsonb_build_object(
    'amount', p_amount, 'baht_per_point', v_cfg.company_baht_per_point,
    'base', round(v_base, 2), 'tier_multiplier', v_tier,
    'bonus_id', p_bonus_id, 'bonus_label', v_bonus.label, 'bonus_multiplier', v_bonus_mult,
    'points', v_points, 'expires_on', public.company_expiry_for(v_date));
end $$;

-- Staff/Admin: record a purchase → company points (no approval step)
create or replace function public.add_company_purchase(
  p_company_id uuid, p_invoice_no text, p_doc_date date, p_amount numeric,
  p_items text default null, p_file_path text default null, p_bonus_id uuid default null,
  p_note text default null, p_points_override numeric default null
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
  if coalesce(trim(p_invoice_no), '') = '' then raise exception 'กรุณากรอกเลขที่ใบกำกับ/PI'; end if;
  if p_doc_date is null then raise exception 'กรุณากรอกวันที่'; end if;
  if exists (select 1 from public.point_ledger where wallet = 'company' and company_id = p_company_id
               and kind = 'purchase' and voided_at is null and lower(invoice_no) = lower(trim(p_invoice_no))) then
    raise exception 'เลขที่เอกสาร % บันทึกแต้มให้บริษัทนี้แล้ว', trim(p_invoice_no);
  end if;
  v_calc := public.calc_company_points(p_amount, p_bonus_id, p_doc_date);
  v_points := coalesce(p_points_override, (v_calc ->> 'points')::numeric);
  if p_points_override is not null then
    if coalesce(trim(p_note), '') = '' then raise exception 'กรุณาระบุเหตุผลเมื่อแก้จำนวนแต้มเอง'; end if;
    v_calc := v_calc || jsonb_build_object('override', p_points_override);
  end if;
  if v_points <= 0 then raise exception 'ยอดซื้อนี้ยังไม่ถึงเกณฑ์ได้แต้ม (ได้ % แต้ม)', v_points; end if;
  insert into public.point_ledger (wallet, company_id, points, kind, expires_on, invoice_no, doc_date, amount, items, file_path, calc, note, created_by)
  values ('company', p_company_id, v_points, 'purchase', (v_calc ->> 'expires_on')::date, trim(p_invoice_no), p_doc_date, p_amount,
          nullif(trim(p_items), ''), nullif(p_file_path, ''), v_calc, nullif(trim(p_note), ''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

-- Staff/Admin: edit a purchase = void the old row and write a new one (both kept for audit)
create or replace function public.edit_company_purchase(
  p_id bigint, p_reason text, p_invoice_no text, p_doc_date date, p_amount numeric,
  p_items text default null, p_file_path text default null, p_bonus_id uuid default null,
  p_note text default null, p_points_override numeric default null
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
                                       coalesce(nullif(trim(p_note), ''), trim(p_reason)), p_points_override);
  update public.point_ledger set replaces_id = p_id where id = v_new.id;
  -- replaces_id is a link column, set once right after insert
  select * into v_new from public.point_ledger where id = v_new.id;
  return v_new;
end $$;

-- Void any ledger row (company: staff/admin · personal: admin). Redemption rows go through cancel_redemption.
create or replace function public.void_point_entry(p_id bigint, p_reason text)
returns public.point_ledger language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.point_ledger;
begin
  select * into v_row from public.point_ledger where id = p_id;
  if not found then raise exception 'ไม่พบรายการแต้ม'; end if;
  if v_row.wallet = 'company' and not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if v_row.wallet = 'personal' and not public.is_admin() then raise exception 'เฉพาะ Admin' using errcode = '42501'; end if;
  if v_row.redemption_id is not null then raise exception 'รายการนี้มาจากการแลก กรุณายกเลิกที่คูปอง/รายการตัดแต้ม'; end if;
  return public._void_point_row(p_id, p_reason);
end $$;

-- Admin (personal) or Staff/Admin (company): manual ± adjustment with a reason
create or replace function public.adjust_points(p_wallet text, p_owner uuid, p_points numeric, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_wallet = 'personal' and not public.is_admin() then raise exception 'เฉพาะ Admin ปรับแต้มส่วนตัวได้' using errcode = '42501'; end if;
  if p_wallet = 'company' and not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if p_wallet not in ('personal', 'company') then raise exception 'wallet ไม่ถูกต้อง'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'กรุณาระบุเหตุผล'; end if;
  if p_points is null or p_points = 0 then raise exception 'จำนวนแต้มต้องไม่เป็น 0'; end if;
  if p_wallet = 'personal' and not exists (select 1 from public.profiles where id = p_owner) then raise exception 'ไม่พบผู้ใช้'; end if;
  if p_wallet = 'company' and not exists (select 1 from public.companies where id = p_owner) then raise exception 'ไม่พบบริษัท'; end if;
  if p_points > 0 then
    insert into public.point_ledger (wallet, user_id, company_id, points, kind, expires_on, note, created_by)
    values (p_wallet,
            case when p_wallet = 'personal' then p_owner end,
            case when p_wallet = 'company' then p_owner end,
            p_points, 'adjust',
            case when p_wallet = 'personal' then make_date(extract(year from public.bkk_today())::int, 12, 31)
                 else public.company_expiry_for(public.bkk_today()) end,
            trim(p_note), auth.uid());
  else
    perform public._deduct_points(p_wallet, p_owner, -p_points, 'adjust', null, null, trim(p_note));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rewards: personal (customer redeems → coupon) and company (staff deducts)
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.rewards;
  v_red public.redemptions;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'กรุณาเข้าสู่ระบบ' using errcode = '42501';
  end if;
  if not (select rewards_enabled from public.points_config where id = 1) then raise exception 'ปิดการแลกของรางวัลชั่วคราว'; end if;
  select * into v_r from public.rewards where id = p_reward_id and is_active and wallet = 'personal' and kind = 'item' for update;
  if not found then raise exception 'ไม่พบของรางวัล'; end if;
  if v_r.points is null or v_r.points <= 0 then raise exception 'ของรางวัลนี้ยังไม่ได้กำหนดแต้ม'; end if;
  if v_r.stock is not null and v_r.stock <= 0 then raise exception 'ของรางวัลหมดแล้ว'; end if;
  insert into public.redemptions (code, wallet, user_id, reward_id, reward_name, points, method, created_by)
  values (public.next_doc_no('CP'), 'personal', auth.uid(), v_r.id, v_r.name, v_r.points, 'direct', auth.uid())
  returning * into v_red;
  perform public._deduct_points('personal', auth.uid(), v_r.points, 'redeem', v_red.id, null, v_r.name);
  if v_r.stock is not null then update public.rewards set stock = stock - 1 where id = v_r.id; end if;
  return v_red;
end $$;

create or replace function public.lucky_draw()
returns public.redemptions language plpgsql security definer set search_path = ''
as $$
declare
  v_cost numeric;
  v_total int;
  v_pick int;
  v_r public.rewards;
  v_red public.redemptions;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'กรุณาเข้าสู่ระบบ' using errcode = '42501';
  end if;
  select lucky_cost into v_cost from public.points_config where id = 1 and rewards_enabled;
  if coalesce(v_cost, 0) <= 0 then raise exception 'ยังไม่เปิดสุ่มรางวัล'; end if;
  perform pg_advisory_xact_lock(hashtext('onessc.lucky'));
  select coalesce(sum(weight), 0) into v_total from public.rewards
   where wallet = 'personal' and kind = 'prize' and is_active and coalesce(weight, 0) > 0 and (stock is null or stock > 0);
  if v_total <= 0 then raise exception 'ยังไม่มีรางวัลให้สุ่ม'; end if;
  v_pick := floor(random() * v_total)::int;
  for v_r in
    select * from public.rewards
     where wallet = 'personal' and kind = 'prize' and is_active and coalesce(weight, 0) > 0 and (stock is null or stock > 0)
     order by sort, id
  loop
    v_pick := v_pick - v_r.weight;
    exit when v_pick < 0;
  end loop;
  insert into public.redemptions (code, wallet, user_id, reward_id, reward_name, points, method, created_by)
  values (public.next_doc_no('CP'), 'personal', auth.uid(), v_r.id, v_r.name, v_cost, 'lucky', auth.uid())
  returning * into v_red;
  perform public._deduct_points('personal', auth.uid(), v_cost, 'lucky', v_red.id, null, 'สุ่มรางวัล: ' || v_r.name);
  if v_r.stock is not null then update public.rewards set stock = stock - 1 where id = v_r.id; end if;
  if coalesce(v_r.bonus_points, 0) > 0 then
    -- prize is points back: credit now and close the coupon
    insert into public.point_ledger (wallet, user_id, points, kind, expires_on, redemption_id, note, created_by)
    values ('personal', auth.uid(), v_r.bonus_points, 'lucky', make_date(extract(year from public.bkk_today())::int, 12, 31),
            v_red.id, 'รางวัลแต้มคืน', auth.uid());
    update public.redemptions set status = 'used', used_at = now() where id = v_red.id returning * into v_red;
  end if;
  return v_red;
end $$;

-- Staff/Admin: deduct company points as a discount / voucher / trip
create or replace function public.company_redeem(
  p_company_id uuid, p_points numeric, p_reward_id uuid default null, p_title text default null,
  p_ref_doc text default null, p_note text default null
)
returns public.redemptions language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.rewards;
  v_red public.redemptions;
  v_name text;
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'ไม่พบบริษัท'; end if;
  if p_reward_id is not null then
    select * into v_r from public.rewards where id = p_reward_id and wallet = 'company' for update;
    if not found then raise exception 'ไม่พบของรางวัล'; end if;
    if v_r.stock is not null and v_r.stock <= 0 then raise exception 'ของรางวัลหมดแล้ว'; end if;
  end if;
  v_name := coalesce(nullif(trim(p_title), ''), v_r.name);
  if v_name is null then raise exception 'กรุณาระบุรายการที่แลก'; end if;
  if coalesce(p_points, 0) <= 0 then raise exception 'จำนวนแต้มต้องมากกว่า 0'; end if;
  insert into public.redemptions (code, wallet, company_id, reward_id, reward_name, points, method, status,
                                  ref_doc, note, used_at, used_by, created_by)
  values (public.next_doc_no('RD'), 'company', p_company_id, p_reward_id, v_name, p_points, 'staff', 'used',
          nullif(trim(p_ref_doc), ''), nullif(trim(p_note), ''), now(), auth.uid(), auth.uid())
  returning * into v_red;
  perform public._deduct_points('company', p_company_id, p_points, 'redeem', v_red.id, nullif(trim(p_ref_doc), ''), v_name);
  if v_r.id is not null and v_r.stock is not null then update public.rewards set stock = stock - 1 where id = v_r.id; end if;
  return v_red;
end $$;

-- Staff: customer shows the coupon → mark used
create or replace function public.use_coupon(p_code text, p_note text default null)
returns public.redemptions language plpgsql security definer set search_path = ''
as $$
declare
  v_red public.redemptions;
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  update public.redemptions
     set status = 'used', used_at = now(), used_by = auth.uid(), note = coalesce(nullif(trim(p_note), ''), note)
   where upper(code) = upper(trim(p_code)) and wallet = 'personal' and status = 'issued'
  returning * into v_red;
  if not found then raise exception 'ไม่พบคูปองที่ยังไม่ได้ใช้ รหัส %', p_code; end if;
  return v_red;
end $$;

-- Cancel a coupon / company deduction → points come back. Customer may cancel their own unused coupon.
create or replace function public.cancel_redemption(p_id uuid, p_reason text)
returns public.redemptions language plpgsql security definer set search_path = ''
as $$
declare
  v_red public.redemptions;
  v_row record;
begin
  select * into v_red from public.redemptions where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if v_red.status = 'cancelled' then raise exception 'รายการนี้ถูกยกเลิกแล้ว'; end if;
  if not public.is_staff_or_admin() then
    if v_red.user_id is distinct from auth.uid() or v_red.status <> 'issued' or v_red.method <> 'direct' then
      raise exception 'ยกเลิกรายการนี้ไม่ได้' using errcode = '42501';
    end if;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผล'; end if;
  -- give the deducted points back first, then take back any lucky bonus
  for v_row in select id from public.point_ledger
                where redemption_id = v_red.id and voided_at is null order by points asc loop
    perform public._void_point_row(v_row.id, 'ยกเลิก ' || v_red.code || ': ' || trim(p_reason));
  end loop;
  if v_red.reward_id is not null then
    update public.rewards set stock = stock + 1 where id = v_red.reward_id and stock is not null;
  end if;
  update public.redemptions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = v_red.id
  returning * into v_red;
  return v_red;
end $$;

-- ---------------------------------------------------------------------------
-- Training engine
-- ---------------------------------------------------------------------------
create or replace function public.session_start_at(p_session public.course_sessions)
returns timestamptz language sql stable set search_path = ''
as $$ select (p_session.starts_on + p_session.start_time) at time zone 'Asia/Bangkok' $$;

create or replace function public.session_end_at(p_session public.course_sessions)
returns timestamptz language sql stable set search_path = ''
as $$ select (coalesce(p_session.ends_on, p_session.starts_on) + p_session.end_time) at time zone 'Asia/Bangkok' $$;

create or replace function public.strike_count(p_user uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.training_strikes s
   where s.user_id = p_user and s.waived_at is null
     and s.year = extract(year from public.bkk_today())::int
$$;

create or replace function public.is_training_banned(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.strike_count(p_user) > (select strike_limit from public.training_settings where id = 1)
$$;

-- What the signed-in user sees at the top of "การอบรมของฉัน"
create or replace function public.my_training_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'strikes', public.strike_count(auth.uid()),
    'strike_limit', t.strike_limit,
    'banned', public.is_training_banned(auth.uid()),
    'banned_until', case when public.is_training_banned(auth.uid()) then make_date(extract(year from public.bkk_today())::int, 12, 31) end,
    'active_bookings', (select count(*) from public.training_registrations r
                          join public.course_sessions s on s.id = r.session_id
                         where r.user_id = auth.uid() and r.status = 'registered' and s.starts_on >= public.bkk_today()),
    'max_active_bookings', t.max_active_bookings,
    'change_days_before', t.change_days_before,
    'personal_points', public.point_balance('personal', auth.uid()),
    'company_points', case when public.my_company_id() is not null then public.point_balance('company', public.my_company_id()) end)
  from public.training_settings t where t.id = 1
$$;

-- Seats taken per session (public, so the calendar can show "เหลือ N ที่")
create or replace function public.session_seats()
returns table (session_id uuid, booked int)
language sql stable security definer set search_path = ''
as $$
  select r.session_id, count(*)::int
    from public.training_registrations r
    join public.course_sessions s on s.id = r.session_id
   where r.status in ('registered', 'attended') and not s.is_archived
   group by r.session_id
$$;

-- strike + if over the limit: cancel every upcoming booking (ระงับสิทธิ์)
create or replace function public._add_strike(p_user uuid, p_reg uuid, p_kind text, p_reason text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.training_strikes (user_id, registration_id, kind, reason)
  values (p_user, p_reg, p_kind, nullif(trim(p_reason), ''));
  if public.is_training_banned(p_user) then
    update public.training_registrations r
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'ระบบยกเลิกอัตโนมัติ: เลื่อน/ยกเลิก/ไม่มาเกินกำหนด'
      from public.course_sessions s
     where s.id = r.session_id and r.user_id = p_user and r.status = 'registered'
       and s.starts_on >= public.bkk_today();
    return true;
  end if;
  return false;
end $$;

create or replace function public._session_price(p_session_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(s.price, c.price, 0) from public.course_sessions s join public.courses c on c.id = s.course_id where s.id = p_session_id
$$;

-- User: book a session (3-step form submits here)
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
  -- lock the session row: serializes seat counting
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
  if v_price > 0 then
    if v_type not in ('company', 'person', 'person_no_vat') then raise exception 'ประเภทใบเสร็จไม่ถูกต้อง'; end if;
    if v_type = 'person_no_vat' and not v_cfg.person_no_vat then raise exception 'ต้องออกใบกำกับภาษี'; end if;
    if coalesce(trim(p_billing ->> 'name'), '') = '' then raise exception 'กรุณากรอกชื่อสำหรับออกใบเสร็จ'; end if;
    if v_type = 'company' and coalesce(p_billing ->> 'tax_id', '') !~ '^[0-9]{13}$' then
      raise exception 'กรุณากรอกเลขผู้เสียภาษี 13 หลัก';
    end if;
    if coalesce(trim(p_coupon_code), '') <> '' then
      select * into v_coupon from public.redemptions red
       where upper(red.code) = upper(trim(p_coupon_code)) and red.user_id = auth.uid()
         and red.wallet = 'personal' and red.status = 'issued'
         and exists (select 1 from public.rewards rw where rw.id = red.reward_id and coalesce(rw.discount_baht, 0) > 0)
       for update;
      if not found then raise exception 'คูปองส่วนลดไม่ถูกต้องหรือถูกใช้แล้ว'; end if;
      select least(rw.discount_baht, v_price) into v_discount from public.rewards rw where rw.id = v_coupon.reward_id;
    end if;
    v_sub := v_price - v_discount;
    if v_s.vat and v_type <> 'person_no_vat' then v_vat := round(v_sub * v_cfg.vat_rate / 100, 2); end if;
    if v_type = 'company' and v_s.wht_allowed then v_wht := round(v_sub * v_cfg.wht_rate / 100, 2); end if;
  else
    v_sub := 0;
  end if;

  insert into public.training_registrations (
    code, user_id, session_id, pay_status, wants_quote, subtotal, discount, vat_amount, wht_amount, total,
    billing, coupon_code, sale_name, source, note)
  values (
    public.next_doc_no('TR'), auth.uid(), v_s.id,
    case when v_sub + v_vat - v_wht > 0 then 'unpaid' else 'free' end,
    coalesce(p_wants_quote, false) and v_price > 0,
    v_price, v_discount, v_vat, v_wht, v_sub + v_vat - v_wht,
    case when v_price > 0 then p_billing end, v_coupon.code,
    nullif(trim(p_sale_name), ''), nullif(trim(p_source), ''), nullif(trim(p_note), ''))
  returning * into v_reg;

  if v_coupon.id is not null then
    update public.redemptions set status = 'used', used_at = now(), used_ref = v_reg.code where id = v_coupon.id;
  end if;
  return v_reg;
end $$;

create or replace function public._release_coupon(p_reg public.training_registrations)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_reg.coupon_code is not null and p_reg.pay_status <> 'paid' then
    update public.redemptions set status = 'issued', used_at = null, used_ref = null
     where code = p_reg.coupon_code and status = 'used' and used_ref = p_reg.code;
  end if;
end $$;

-- User cancels own booking (≥ N days before) → strike. Staff with 'courses' may cancel without a strike.
create or replace function public.cancel_registration(p_id uuid, p_reason text, p_strike boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
  v_s public.course_sessions;
  v_days int;
  v_staff boolean := public.has_perm('courses');
  v_banned boolean := false;
begin
  select * into v_reg from public.training_registrations where id = p_id for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if not v_staff and v_reg.user_id is distinct from auth.uid() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if v_reg.status <> 'registered' then raise exception 'ยกเลิกรายการนี้ไม่ได้'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาระบุเหตุผล'; end if;
  select * into v_s from public.course_sessions where id = v_reg.session_id;
  select change_days_before into v_days from public.training_settings where id = 1;
  if not v_staff and v_s.starts_on - public.bkk_today() < v_days then
    raise exception 'ยกเลิกได้ถึง % วันก่อนวันอบรม กรุณาติดต่อทีมงาน', v_days;
  end if;
  update public.training_registrations
     set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason)
   where id = p_id;
  perform public._release_coupon(v_reg);
  if (not v_staff or p_strike) and v_reg.user_id is not null then
    v_banned := public._add_strike(v_reg.user_id, v_reg.id, 'cancel', p_reason);
  end if;
  return jsonb_build_object('banned', v_banned, 'strikes', public.strike_count(v_reg.user_id));
end $$;

-- User moves a booking to another open session of the same course → strike
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
    billing, coupon_code, slip_path, wht_cert_path, receipt_path, paid_at, sale_name, source, note, rescheduled_from)
  values (
    public.next_doc_no('TR'), v_reg.user_id, v_new.id, v_reg.pay_status, v_reg.wants_quote, v_reg.quote_file_path,
    v_reg.subtotal, v_reg.discount, v_reg.vat_amount, v_reg.wht_amount, v_reg.total, v_reg.billing, v_reg.coupon_code,
    v_reg.slip_path, v_reg.wht_cert_path, v_reg.receipt_path, v_reg.paid_at, v_reg.sale_name, v_reg.source, v_reg.note, v_reg.id)
  returning * into v_new_reg;
  update public.redemptions set used_ref = v_new_reg.code where code = v_reg.coupon_code and used_ref = v_reg.code;

  if not v_staff and v_reg.user_id is not null then
    v_banned := public._add_strike(v_reg.user_id, v_reg.id, 'reschedule', p_reason);
  end if;
  return jsonb_build_object('id', v_new_reg.id, 'code', v_new_reg.code, 'banned', v_banned,
                            'strikes', public.strike_count(v_reg.user_id));
end $$;

-- Personal points for attending: hours × points_per_hour, expire 31 Dec of the session year
create or replace function public._award_training_points(p_reg_id uuid)
returns numeric language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
  v_s public.course_sessions;
  v_hours numeric;
  v_points numeric;
begin
  select * into v_reg from public.training_registrations where id = p_reg_id;
  if v_reg.user_id is null or coalesce(v_reg.points_awarded, 0) > 0 then return coalesce(v_reg.points_awarded, 0); end if;
  select * into v_s from public.course_sessions where id = v_reg.session_id;
  select coalesce(v_s.hours, c.hours, 0) into v_hours from public.courses c where c.id = v_s.course_id;
  select round(v_hours * points_per_hour, 2) into v_points from public.points_config where id = 1;
  if coalesce(v_points, 0) > 0 then
    insert into public.point_ledger (wallet, user_id, points, kind, expires_on, registration_id, note, created_by)
    select 'personal', v_reg.user_id, v_points, 'earn', make_date(extract(year from v_s.starts_on)::int, 12, 31), v_reg.id,
           'อบรม ' || c.code || ' · ' || to_char(v_s.starts_on, 'DD/MM/YYYY'), auth.uid()
      from public.courses c where c.id = v_s.course_id;
  end if;
  update public.training_registrations set points_awarded = coalesce(v_points, 0) where id = p_reg_id;
  return coalesce(v_points, 0);
end $$;

create or replace function public._revoke_training_points(p_reg_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_take numeric;
begin
  for v_row in select id, user_id, points from public.point_ledger
                where registration_id = p_reg_id and kind = 'earn' and voided_at is null loop
    begin
      perform public._void_point_row(v_row.id, p_reason);
    exception when raise_exception then
      -- the points were already spent: take back what is left in the balance instead
      v_take := least(v_row.points, public.point_balance('personal', v_row.user_id));
      if v_take > 0 then
        perform public._deduct_points('personal', v_row.user_id, v_take, 'adjust', null, null, 'หักคืน: ' || p_reason);
      end if;
    end;
  end loop;
  update public.training_registrations set points_awarded = null where id = p_reg_id;
end $$;

-- haversine distance in metres
create or replace function public.geo_distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric language sql immutable set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2)
    + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2)))::numeric
$$;

-- User: self check-in with the 6-digit code (or the QR, which carries the same code)
create or replace function public.check_in(p_session_id uuid, p_code text, p_lat numeric default null, p_lng numeric default null, p_method text default 'code')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg public.training_settings;
  v_s public.course_sessions;
  v_reg public.training_registrations;
  v_dist numeric;
  v_points numeric;
begin
  select * into v_cfg from public.training_settings where id = 1;
  select * into v_s from public.course_sessions where id = p_session_id;
  if not found then raise exception 'ไม่พบรอบอบรม'; end if;
  if trim(coalesce(p_code, '')) <> v_s.checkin_code then raise exception 'รหัสเช็กอินไม่ถูกต้อง'; end if;
  select * into v_reg from public.training_registrations
   where session_id = v_s.id and user_id = auth.uid() and status in ('registered', 'attended') for update;
  if not found then raise exception 'คุณยังไม่ได้ลงทะเบียนรอบนี้ กรุณาติดต่อเจ้าหน้าที่'; end if;
  if v_reg.status = 'attended' then
    return jsonb_build_object('already', true, 'points', coalesce(v_reg.points_awarded, 0));
  end if;
  if now() < public.session_start_at(v_s) - make_interval(mins => v_cfg.checkin_open_minutes) then
    raise exception 'ยังไม่เปิดเช็กอิน (เปิดก่อนเริ่ม % นาที)', v_cfg.checkin_open_minutes;
  end if;
  if now() > public.session_end_at(v_s) then raise exception 'ปิดเช็กอินแล้ว กรุณาติดต่อเจ้าหน้าที่'; end if;
  if v_s.lat is not null and v_s.lng is not null and v_cfg.checkin_radius_m > 0 then
    if p_lat is null or p_lng is null then raise exception 'กรุณาอนุญาตการเข้าถึงตำแหน่ง (GPS) เพื่อเช็กอิน'; end if;
    v_dist := public.geo_distance_m(p_lat, p_lng, v_s.lat, v_s.lng);
    if v_dist > v_cfg.checkin_radius_m then
      raise exception 'คุณอยู่ห่างจากสถานที่อบรม % เมตร (ต้องไม่เกิน % เมตร)', round(v_dist), v_cfg.checkin_radius_m;
    end if;
  end if;
  update public.training_registrations
     set status = 'attended', checked_in_at = now(),
         check_in_method = case when p_method = 'qr' then 'qr' else 'code' end,
         check_in_dist_m = round(v_dist, 1)
   where id = v_reg.id;
  v_points := public._award_training_points(v_reg.id);
  return jsonb_build_object('already', false, 'points', v_points);
end $$;

-- Staff ('courses'): mark attendance by hand from the roster
create or replace function public.set_attendance(p_reg_id uuid, p_status text, p_reason text default null)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
begin
  if not public.has_perm('courses') then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if p_status not in ('attended', 'registered', 'no_show') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  select * into v_reg from public.training_registrations where id = p_reg_id for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if v_reg.status not in ('registered', 'attended', 'no_show') then raise exception 'รายการนี้ถูกยกเลิก/เลื่อนแล้ว'; end if;
  if p_status = v_reg.status then return v_reg; end if;
  if p_status = 'attended' then
    update public.training_registrations
       set status = 'attended', checked_in_at = coalesce(checked_in_at, now()), check_in_method = coalesce(check_in_method, 'staff')
     where id = p_reg_id;
    -- undo an earlier no-show strike for this booking
    update public.training_strikes set waived_at = now(), waived_by = auth.uid()
     where registration_id = p_reg_id and kind = 'no_show' and waived_at is null;
    perform public._award_training_points(p_reg_id);
  else
    if v_reg.status = 'attended' then
      perform public._revoke_training_points(p_reg_id, coalesce(nullif(trim(p_reason), ''), 'ปรับเป็นไม่ได้เข้าอบรม'));
    end if;
    update public.training_registrations
       set status = p_status, checked_in_at = null, check_in_method = null, check_in_dist_m = null
     where id = p_reg_id;
    if p_status = 'no_show' and v_reg.user_id is not null then
      perform public._add_strike(v_reg.user_id, p_reg_id, 'no_show', coalesce(nullif(trim(p_reason), ''), 'ไม่มาอบรม'));
    elsif p_status = 'registered' then
      update public.training_strikes set waived_at = now(), waived_by = auth.uid()
       where registration_id = p_reg_id and kind = 'no_show' and waived_at is null;
    end if;
  end if;
  select * into v_reg from public.training_registrations where id = p_reg_id;
  return v_reg;
end $$;

-- Sessions that have ended: bookings never checked in become no-shows (auto_no_show setting).
-- Called by staff from the back office and optionally by pg_cron.
create or replace function public.mark_no_shows()
returns int language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_n int := 0;
begin
  if auth.uid() is not null and not public.has_perm('courses') then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if not (select auto_no_show from public.training_settings where id = 1) then return 0; end if;
  for v_row in
    select r.id, r.user_id from public.training_registrations r
      join public.course_sessions s on s.id = r.session_id
     where r.status = 'registered' and s.status <> 'cancelled' and not s.is_archived
       and public.session_end_at(s) < now()
  loop
    update public.training_registrations set status = 'no_show' where id = v_row.id;
    if v_row.user_id is not null then
      perform public._add_strike(v_row.user_id, v_row.id, 'no_show', 'ไม่มาอบรม (ระบบบันทึกอัตโนมัติ)');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Certificate number: SSC-{CODE}-{YYYY}-{RUN}
create or replace function public._issue_certificate(p_reg_id uuid)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg public.training_settings;
  v_reg public.training_registrations;
  v_s public.course_sessions;
  v_c public.courses;
  v_run int;
  v_no text;
begin
  select * into v_cfg from public.training_settings where id = 1;
  select * into v_reg from public.training_registrations where id = p_reg_id for update;
  if v_reg.status <> 'attended' then raise exception 'ออกใบประกาศได้เฉพาะผู้ที่เข้าอบรมแล้ว'; end if;
  if v_reg.cert_no is not null then return v_reg; end if;
  select * into v_s from public.course_sessions where id = v_reg.session_id;
  select * into v_c from public.courses where id = v_s.course_id;
  insert into public.doc_counters (prefix, yy, last_no)
  values ('CERT-' || upper(v_c.code), extract(year from v_s.starts_on)::int, 1)
  on conflict (prefix, yy) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_run;
  v_no := v_cfg.cert_format;
  v_no := replace(v_no, '{CODE}', upper(v_c.code));
  v_no := replace(v_no, '{YYYY}', to_char(v_s.starts_on, 'YYYY'));
  v_no := replace(v_no, '{YY}', to_char(v_s.starts_on, 'YY'));
  v_no := replace(v_no, '{MM}', to_char(v_s.starts_on, 'MM'));
  v_no := replace(v_no, '{RUN}', lpad(v_run::text, v_cfg.cert_run_digits, '0'));
  update public.training_registrations
     set cert_no = v_no, cert_issued_at = now(),
         cert_expires_on = case when v_cfg.cert_valid_months > 0
                                then (v_s.starts_on + make_interval(months => v_cfg.cert_valid_months))::date end
   where id = p_reg_id
  returning * into v_reg;
  return v_reg;
end $$;

-- User: evaluation → certificate
create or replace function public.submit_evaluation(p_reg_id uuid, p_answers jsonb)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
begin
  select * into v_reg from public.training_registrations where id = p_reg_id and user_id = auth.uid() for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if v_reg.status <> 'attended' then raise exception 'ทำแบบประเมินได้หลังเช็กอินเข้าอบรม'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'กรุณาตอบแบบประเมิน'; end if;
  if length(p_answers::text) > 10000 then raise exception 'ข้อความยาวเกินไป'; end if;
  update public.training_registrations set evaluation = p_answers, evaluated_at = coalesce(evaluated_at, now()) where id = p_reg_id;
  return public._issue_certificate(p_reg_id);
end $$;

-- Staff ('courses'): issue without evaluation (e.g. paper form)
create or replace function public.issue_certificate(p_reg_id uuid)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_perm('courses') then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  return public._issue_certificate(p_reg_id);
end $$;

-- Public certificate check (QR on the certificate links here)
create or replace function public.verify_certificate(p_cert_no text)
returns table (cert_no text, full_name text, name_en text, course_code text, course_title text,
               session_date date, issued_at timestamptz, expires_on date, valid boolean)
language sql stable security definer set search_path = ''
as $$
  select r.cert_no, coalesce(p.full_name, lu.full_name), p.name_en, c.code, c.title, s.starts_on, r.cert_issued_at, r.cert_expires_on,
         (r.cert_expires_on is null or r.cert_expires_on >= public.bkk_today())
    from public.training_registrations r
    join public.course_sessions s on s.id = r.session_id
    join public.courses c on c.id = s.course_id
    left join public.profiles p on p.id = r.user_id
    left join public.legacy_cerssc_users lu on lu.legacy_id = r.legacy_user_id
   where r.cert_no is not null and upper(r.cert_no) = upper(trim(p_cert_no))
$$;

-- User attaches a payment slip / 50 ทวิ (file already uploaded to training-files/<reg_id>/…)
create or replace function public.attach_training_file(p_reg_id uuid, p_kind text, p_path text)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
begin
  select * into v_reg from public.training_registrations where id = p_reg_id and user_id = auth.uid() for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if split_part(p_path, '/', 1) <> p_reg_id::text then raise exception 'ไฟล์ไม่ถูกต้อง'; end if;
  if p_kind = 'slip' then
    update public.training_registrations
       set slip_path = p_path, pay_status = case when pay_status = 'unpaid' then 'pending' else pay_status end
     where id = p_reg_id returning * into v_reg;
  elsif p_kind = 'wht' then
    update public.training_registrations set wht_cert_path = p_path where id = p_reg_id returning * into v_reg;
  else
    raise exception 'ชนิดไฟล์ไม่ถูกต้อง';
  end if;
  return v_reg;
end $$;

-- Guard: staff edits registrations directly (payment, notes), but not identity / points / certificate fields.
create or replace function public.training_regs_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  -- Not security definer on purpose: current_user is the role running the UPDATE. Inside the
  -- security-definer RPCs above it is the function owner, so their writes go through; a direct
  -- table update from the API runs as authenticated (staff only, via RLS) and is limited here.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.id := old.id; new.code := old.code; new.user_id := old.user_id; new.session_id := old.session_id;
  new.legacy_user_id := old.legacy_user_id; new.status := old.status; new.points_awarded := old.points_awarded;
  new.cert_no := old.cert_no; new.cert_issued_at := old.cert_issued_at; new.cert_expires_on := old.cert_expires_on;
  new.checked_in_at := old.checked_in_at; new.check_in_method := old.check_in_method;
  new.evaluation := old.evaluation; new.evaluated_at := old.evaluated_at; new.created_at := old.created_at;
  new.rescheduled_from := old.rescheduled_from; new.coupon_code := old.coupon_code;
  if new.pay_status = 'paid' and old.pay_status <> 'paid' then new.paid_at := coalesce(new.paid_at, now()); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- cerssc migration: link legacy rows to a One App account with the same email
-- ---------------------------------------------------------------------------
create or replace function public.claim_legacy_cerssc(p_profile_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.profiles;
  v_l public.legacy_cerssc_users;
begin
  select * into v_p from public.profiles where id = p_profile_id;
  if not found then return null; end if;
  select * into v_l from public.legacy_cerssc_users where email = lower(v_p.email) and claimed_by is null for update;
  if not found then return null; end if;
  update public.legacy_cerssc_users set claimed_by = v_p.id, claimed_at = now() where legacy_id = v_l.legacy_id;
  update public.profiles
     set legacy_cerssc_id = v_l.legacy_id,
         full_name = coalesce(full_name, v_l.full_name),
         phone = coalesce(phone, v_l.phone),
         position = coalesce(position, v_l.position),
         company_name = case when tax_id is null and v_l.tax_id ~ '^[0-9]{13}$' then coalesce(company_name, v_l.company) else company_name end,
         company_status = case when tax_id is null and v_l.tax_id ~ '^[0-9]{13}$' then 'pending' else company_status end,
         tax_id = case when tax_id is null and v_l.tax_id ~ '^[0-9]{13}$' then v_l.tax_id else tax_id end
   where id = v_p.id;
  update public.training_registrations set user_id = v_p.id where legacy_user_id = v_l.legacy_id and user_id is null;
  update public.training_strikes set user_id = v_p.id where legacy_user_id = v_l.legacy_id and user_id is null;
  update public.point_ledger set user_id = v_p.id, legacy_user_id = null
   where legacy_user_id = v_l.legacy_id and user_id is null and wallet = 'personal';
  return v_l.legacy_id;
end $$;

create or replace function public.profiles_claim_legacy()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.claim_legacy_cerssc(new.id);
  return new;
end $$;
create trigger profiles_claim_legacy after insert on public.profiles
  for each row execute function public.profiles_claim_legacy();

create trigger training_regs_guard before update on public.training_registrations
  for each row execute function public.training_regs_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.training_settings enable row level security;
alter table public.points_config enable row level security;
alter table public.company_point_bonuses enable row level security;
alter table public.cert_templates enable row level security;
alter table public.courses enable row level security;
alter table public.course_sessions enable row level security;
alter table public.course_materials enable row level security;
alter table public.legacy_cerssc_users enable row level security;
alter table public.training_registrations enable row level security;
alter table public.training_strikes enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.point_ledger enable row level security;

-- settings: everyone reads (booking form needs pay info, sales list); Admin edits
create policy training_settings_select on public.training_settings for select to anon, authenticated using (true);
create policy training_settings_update on public.training_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy points_config_select on public.points_config for select to anon, authenticated using (true);
create policy points_config_update on public.points_config for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy bonuses_select on public.company_point_bonuses for select to authenticated using (public.is_staff_or_admin());
create policy bonuses_write on public.company_point_bonuses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- catalog of courses: public sees active courses / non-archived sessions; 'courses' permission edits
create policy cert_templates_select on public.cert_templates for select to anon, authenticated using (true);
create policy cert_templates_write on public.cert_templates for all to authenticated
  using (public.has_perm('courses')) with check (public.has_perm('courses'));
create policy courses_select on public.courses for select to anon, authenticated
  using (is_active or public.is_staff_or_admin());
create policy courses_write on public.courses for all to authenticated
  using (public.has_perm('courses')) with check (public.has_perm('courses'));
create policy sessions_select on public.course_sessions for select to anon, authenticated
  using ((not is_archived and exists (select 1 from public.courses c where c.id = course_id and c.is_active))
         or public.is_staff_or_admin());
create policy sessions_write on public.course_sessions for all to authenticated
  using (public.has_perm('courses')) with check (public.has_perm('courses'));

-- check-in codes are for staff only: hide the column from everyone else
revoke select on public.course_sessions from anon, authenticated;
grant select (id, course_id, title, starts_on, ends_on, start_time, end_time, hours, location, map_url, lat, lng,
              capacity, status, price, vat, wht_allowed, cert_template_id, note, is_archived, legacy_id, created_at, updated_at)
  on public.course_sessions to anon, authenticated;
create or replace function public.session_checkin_code(p_session_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  return (select checkin_code from public.course_sessions where id = p_session_id);
end $$;

create policy materials_select on public.course_materials for select to anon, authenticated
  using (
    visibility = 'public'
    or public.is_staff_or_admin()
    or exists (
      select 1 from public.training_registrations r join public.course_sessions s on s.id = r.session_id
       where r.user_id = auth.uid()
         and (r.session_id = course_materials.session_id or s.course_id = course_materials.course_id)
         and (case when course_materials.visibility = 'attended' then r.status = 'attended'
                   else r.status in ('registered', 'attended') end)));
create policy materials_write on public.course_materials for all to authenticated
  using (public.has_perm('courses')) with check (public.has_perm('courses'));

create policy legacy_users_select on public.legacy_cerssc_users for select to authenticated using (public.is_admin());

-- registrations: own rows; all staff view; 'courses' permission edits payment/notes (guarded columns)
create policy training_regs_select on public.training_registrations for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());
create policy training_regs_update on public.training_registrations for update to authenticated
  using (public.has_perm('courses')) with check (public.has_perm('courses'));

create policy strikes_select on public.training_strikes for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());
create policy strikes_update on public.training_strikes for update to authenticated
  using (public.has_perm('courses')) with check (public.has_perm('courses'));

-- rewards: active ones are public (so users can browse); Admin edits
create policy rewards_select on public.rewards for select to anon, authenticated
  using (is_active or public.is_staff_or_admin());
create policy rewards_write on public.rewards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- redemptions & ledger: own personal rows, own company's rows, staff all. Writes only via RPC.
create policy redemptions_select on public.redemptions for select to authenticated
  using (user_id = auth.uid()
         or (wallet = 'company' and company_id = public.my_company_id())
         or public.is_staff_or_admin());
create policy point_ledger_select on public.point_ledger for select to authenticated
  using ((wallet = 'personal' and user_id = auth.uid())
         or (wallet = 'company' and company_id = public.my_company_id())
         or public.is_staff_or_admin());

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
revoke execute on function public._deduct_points(text, uuid, numeric, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public._void_point_row(bigint, text) from public, anon, authenticated;
revoke execute on function public._add_strike(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public._session_price(uuid) from public, anon, authenticated;
revoke execute on function public._release_coupon(public.training_registrations) from public, anon, authenticated;
revoke execute on function public._award_training_points(uuid) from public, anon, authenticated;
revoke execute on function public._revoke_training_points(uuid, text) from public, anon, authenticated;
revoke execute on function public._issue_certificate(uuid) from public, anon, authenticated;
revoke execute on function public.point_ledger_guard() from public, anon, authenticated;
revoke execute on function public.training_regs_guard() from public, anon, authenticated;
revoke execute on function public.profiles_claim_legacy() from public, anon, authenticated;
revoke execute on function public.claim_legacy_cerssc(uuid) from public, anon, authenticated;

revoke execute on function public.point_balance(text, uuid) from public, anon;
revoke execute on function public.company_expiry_for(date) from public, anon;
revoke execute on function public.calc_company_points(numeric, uuid, date) from public, anon;
revoke execute on function public.add_company_purchase(uuid, text, date, numeric, text, text, uuid, text, numeric) from public, anon;
revoke execute on function public.edit_company_purchase(bigint, text, text, date, numeric, text, text, uuid, text, numeric) from public, anon;
revoke execute on function public.void_point_entry(bigint, text) from public, anon;
revoke execute on function public.adjust_points(text, uuid, numeric, text) from public, anon;
revoke execute on function public.redeem_reward(uuid) from public, anon;
revoke execute on function public.lucky_draw() from public, anon;
revoke execute on function public.company_redeem(uuid, numeric, uuid, text, text, text) from public, anon;
revoke execute on function public.use_coupon(text, text) from public, anon;
revoke execute on function public.cancel_redemption(uuid, text) from public, anon;
revoke execute on function public.strike_count(uuid) from public, anon, authenticated;
revoke execute on function public.is_training_banned(uuid) from public, anon, authenticated;
revoke execute on function public.my_training_status() from public, anon;
revoke execute on function public.book_session(uuid, text, text, jsonb, text, boolean, text) from public, anon;
revoke execute on function public.cancel_registration(uuid, text, boolean) from public, anon;
revoke execute on function public.reschedule_registration(uuid, uuid, text) from public, anon;
revoke execute on function public.check_in(uuid, text, numeric, numeric, text) from public, anon;
revoke execute on function public.set_attendance(uuid, text, text) from public, anon;
revoke execute on function public.mark_no_shows() from public, anon;
revoke execute on function public.submit_evaluation(uuid, jsonb) from public, anon;
revoke execute on function public.issue_certificate(uuid) from public, anon;
revoke execute on function public.attach_training_file(uuid, text, text) from public, anon;
revoke execute on function public.session_checkin_code(uuid) from public, anon;

grant execute on function public.point_balance(text, uuid) to authenticated;
grant execute on function public.calc_company_points(numeric, uuid, date) to authenticated;
grant execute on function public.add_company_purchase(uuid, text, date, numeric, text, text, uuid, text, numeric) to authenticated;
grant execute on function public.edit_company_purchase(bigint, text, text, date, numeric, text, text, uuid, text, numeric) to authenticated;
grant execute on function public.void_point_entry(bigint, text) to authenticated;
grant execute on function public.adjust_points(text, uuid, numeric, text) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.lucky_draw() to authenticated;
grant execute on function public.company_redeem(uuid, numeric, uuid, text, text, text) to authenticated;
grant execute on function public.use_coupon(text, text) to authenticated;
grant execute on function public.cancel_redemption(uuid, text) to authenticated;
grant execute on function public.my_training_status() to authenticated;
grant execute on function public.book_session(uuid, text, text, jsonb, text, boolean, text) to authenticated;
grant execute on function public.cancel_registration(uuid, text, boolean) to authenticated;
grant execute on function public.reschedule_registration(uuid, uuid, text) to authenticated;
grant execute on function public.check_in(uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.set_attendance(uuid, text, text) to authenticated;
grant execute on function public.mark_no_shows() to authenticated, service_role;
grant execute on function public.submit_evaluation(uuid, jsonb) to authenticated;
grant execute on function public.issue_certificate(uuid) to authenticated;
grant execute on function public.attach_training_file(uuid, text, text) to authenticated;
grant execute on function public.session_checkin_code(uuid) to authenticated;
grant execute on function public.session_seats() to anon, authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;
grant execute on function public.bkk_today() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: training-files/<registration_id>/… (slip, 50 ทวิ, receipt, quotation) — private
--          point-files/<company_id>/… (purchase documents) — staff only
--          training-media (course covers, certificate templates, reward images) — public
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('training-files', 'training-files', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('point-files', 'point-files', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('training-media', 'training-media', true) on conflict (id) do nothing;

create policy training_files_select on storage.objects for select to authenticated
  using (bucket_id = 'training-files' and (
    public.is_staff_or_admin()
    or exists (select 1 from public.training_registrations r
               where r.id::text = split_part(name, '/', 1) and r.user_id = auth.uid())));
create policy training_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'training-files' and (
    public.has_perm('courses')
    or exists (select 1 from public.training_registrations r
               where r.id::text = split_part(name, '/', 1) and r.user_id = auth.uid())));
create policy training_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'training-files' and public.has_perm('courses'));

create policy point_files_select on storage.objects for select to authenticated
  using (bucket_id = 'point-files' and public.is_staff_or_admin());
create policy point_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'point-files' and public.is_staff_or_admin());

create policy training_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'training-media' and (public.has_perm('courses') or public.is_admin()));
create policy training_media_update on storage.objects for update to authenticated
  using (bucket_id = 'training-media' and (public.has_perm('courses') or public.is_admin()));
create policy training_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'training-media' and (public.has_perm('courses') or public.is_admin()));
