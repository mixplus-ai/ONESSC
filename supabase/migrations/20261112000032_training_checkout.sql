-- Training post-course flow (as on cerssc):
--   register → e-mail reminder → QR check-in at the venue (unlocks the course files)
--   → QR check-out at the venue → evaluation → certificate → training points.
-- No check-out = no certificate and no points. Check-in and check-out both must be within
-- training_settings.checkin_radius_m (default 100 m) of the session's map pin (lat/lng).
-- Staff ('courses') upload course files to the private bucket training-materials.

-- ---------------------------------------------------------------------------
-- Columns & settings
-- ---------------------------------------------------------------------------
alter table public.training_registrations
  add column if not exists checked_out_at   timestamptz,
  add column if not exists check_out_method text check (check_out_method in ('code', 'qr', 'staff')),
  add column if not exists check_out_dist_m numeric(10, 1);

alter table public.course_sessions
  add column if not exists checkout_code text not null
    default lpad((floor(random() * 1000000))::int::text, 6, '0') check (checkout_code ~ '^[0-9]{6}$');
-- check-out codes are for staff only (table-level select is already revoked; the column is not granted)
revoke select (checkout_code) on public.course_sessions from anon, authenticated;

alter table public.training_settings
  add column if not exists checkout_open_minutes  int not null default 60  check (checkout_open_minutes between 0 and 1440),  -- เปิดก่อนเวลาเลิก
  add column if not exists checkout_close_minutes int not null default 240 check (checkout_close_minutes between 0 and 2880); -- ปิดหลังเวลาเลิก

-- course files uploaded by staff (private storage) instead of a link
alter table public.course_materials alter column url drop not null;
alter table public.course_materials add column if not exists file_path text unique;
alter table public.course_materials drop constraint if exists course_materials_url_or_file;
alter table public.course_materials add constraint course_materials_url_or_file
  check (nullif(trim(coalesce(url, '')), '') is not null or file_path is not null);

-- ---------------------------------------------------------------------------
-- Points now come with the certificate, and only after check-out
-- ---------------------------------------------------------------------------
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
  if v_reg.checked_out_at is null then raise exception 'ต้องเช็กเอาต์หลังอบรมก่อน จึงจะได้รับใบประกาศและแต้ม'; end if;
  if v_reg.cert_no is null then
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
     where id = p_reg_id;
  end if;
  -- certificate → points (idempotent: skips when already awarded)
  perform public._award_training_points(p_reg_id);
  select * into v_reg from public.training_registrations where id = p_reg_id;
  return v_reg;
end $$;

-- After check-out: certificate right away when no evaluation is required.
create or replace function public._after_check_out(p_reg_id uuid)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
begin
  select * into v_reg from public.training_registrations where id = p_reg_id;
  if not (select cert_requires_evaluation from public.training_settings where id = 1) or v_reg.evaluated_at is not null then
    v_reg := public._issue_certificate(p_reg_id);
  end if;
  return v_reg;
end $$;

-- distance check shared by check-in and check-out (null when the session has no pin / radius 0)
create or replace function public._venue_distance(p_s public.course_sessions, p_lat numeric, p_lng numeric, p_what text)
returns numeric language plpgsql stable security definer set search_path = ''
as $$
declare
  v_radius int := (select checkin_radius_m from public.training_settings where id = 1);
  v_dist numeric;
begin
  if p_s.lat is null or p_s.lng is null or v_radius <= 0 then return null; end if;
  if p_lat is null or p_lng is null then raise exception 'กรุณาอนุญาตการเข้าถึงตำแหน่ง (GPS) เพื่อ%', p_what; end if;
  v_dist := public.geo_distance_m(p_lat, p_lng, p_s.lat, p_s.lng);
  if v_dist > v_radius then
    raise exception 'คุณอยู่ห่างจากสถานที่อบรม % เมตร (ต้องไม่เกิน % เมตร)', round(v_dist), v_radius;
  end if;
  return v_dist;
end $$;

-- User: self check-in (no points any more: they come after check-out → evaluation → certificate)
create or replace function public.check_in(p_session_id uuid, p_code text, p_lat numeric default null, p_lng numeric default null, p_method text default 'code')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg public.training_settings;
  v_s public.course_sessions;
  v_reg public.training_registrations;
  v_dist numeric;
begin
  select * into v_cfg from public.training_settings where id = 1;
  select * into v_s from public.course_sessions where id = p_session_id;
  if not found then raise exception 'ไม่พบรอบอบรม'; end if;
  if trim(coalesce(p_code, '')) = v_s.checkout_code and v_s.checkout_code <> v_s.checkin_code then
    raise exception 'นี่คือรหัสเช็กเอาต์ กรุณาสแกน QR เช็กอินก่อน';
  end if;
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
  v_dist := public._venue_distance(v_s, p_lat, p_lng, 'เช็กอิน');
  update public.training_registrations
     set status = 'attended', checked_in_at = now(),
         check_in_method = case when p_method = 'qr' then 'qr' else 'code' end,
         check_in_dist_m = round(v_dist, 1)
   where id = v_reg.id;
  -- strike from an automatic no-show is not possible here (status was 'registered'), nothing to undo
  return jsonb_build_object('already', false, 'points', 0);
end $$;

-- User: self check-out with the check-out QR / code at the end of the training
create or replace function public.check_out(p_session_id uuid, p_code text, p_lat numeric default null, p_lng numeric default null, p_method text default 'code')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg public.training_settings;
  v_s public.course_sessions;
  v_reg public.training_registrations;
  v_dist numeric;
begin
  select * into v_cfg from public.training_settings where id = 1;
  select * into v_s from public.course_sessions where id = p_session_id;
  if not found then raise exception 'ไม่พบรอบอบรม'; end if;
  if trim(coalesce(p_code, '')) <> v_s.checkout_code then raise exception 'รหัสเช็กเอาต์ไม่ถูกต้อง'; end if;
  select * into v_reg from public.training_registrations
   where session_id = v_s.id and user_id = auth.uid() and status in ('registered', 'attended') for update;
  if not found then raise exception 'คุณยังไม่ได้ลงทะเบียนรอบนี้ กรุณาติดต่อเจ้าหน้าที่'; end if;
  if v_reg.status <> 'attended' then raise exception 'คุณยังไม่ได้เช็กอิน กรุณาติดต่อเจ้าหน้าที่'; end if;
  if v_reg.checked_out_at is not null then
    return jsonb_build_object('already', true, 'cert_no', v_reg.cert_no, 'points', coalesce(v_reg.points_awarded, 0));
  end if;
  if now() < public.session_end_at(v_s) - make_interval(mins => v_cfg.checkout_open_minutes) then
    raise exception 'ยังไม่เปิดเช็กเอาต์ (เปิดก่อนเลิกอบรม % นาที)', v_cfg.checkout_open_minutes;
  end if;
  if now() > public.session_end_at(v_s) + make_interval(mins => v_cfg.checkout_close_minutes) then
    raise exception 'ปิดเช็กเอาต์แล้ว กรุณาติดต่อเจ้าหน้าที่';
  end if;
  v_dist := public._venue_distance(v_s, p_lat, p_lng, 'เช็กเอาต์');
  update public.training_registrations
     set checked_out_at = now(), check_out_method = case when p_method = 'qr' then 'qr' else 'code' end,
         check_out_dist_m = round(v_dist, 1)
   where id = v_reg.id;
  v_reg := public._after_check_out(v_reg.id);
  return jsonb_build_object('already', false, 'cert_no', v_reg.cert_no, 'points', coalesce(v_reg.points_awarded, 0),
                            'needs_evaluation', v_reg.cert_no is null);
end $$;

-- Staff ('courses'): check out on someone's behalf (phone flat, forgot to scan…), or undo it
create or replace function public.staff_check_out(p_reg_id uuid, p_undo boolean default false, p_reason text default null)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
begin
  if not public.has_perm('courses') then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  select * into v_reg from public.training_registrations where id = p_reg_id for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if v_reg.status <> 'attended' then raise exception 'ต้องเช็กอินเข้าอบรมก่อน'; end if;
  if p_undo then
    if coalesce(v_reg.points_awarded, 0) > 0 then
      perform public._revoke_training_points(p_reg_id, coalesce(nullif(trim(p_reason), ''), 'ยกเลิกเช็กเอาต์'));
    end if;
    update public.training_registrations set checked_out_at = null, check_out_method = null, check_out_dist_m = null where id = p_reg_id;
  elsif v_reg.checked_out_at is null then
    update public.training_registrations set checked_out_at = now(), check_out_method = 'staff' where id = p_reg_id;
    perform public._after_check_out(p_reg_id);
  end if;
  select * into v_reg from public.training_registrations where id = p_reg_id;
  return v_reg;
end $$;

-- Staff attendance by hand: marking "attended" no longer gives points (check-out does)
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
    update public.training_strikes set waived_at = now(), waived_by = auth.uid()
     where registration_id = p_reg_id and kind = 'no_show' and waived_at is null;
  else
    if v_reg.status = 'attended' and coalesce(v_reg.points_awarded, 0) > 0 then
      perform public._revoke_training_points(p_reg_id, coalesce(nullif(trim(p_reason), ''), 'ปรับเป็นไม่ได้เข้าอบรม'));
    end if;
    update public.training_registrations
       set status = p_status, checked_in_at = null, check_in_method = null, check_in_dist_m = null,
           checked_out_at = null, check_out_method = null, check_out_dist_m = null
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

-- User: evaluation (after check-out) → certificate → points
create or replace function public.submit_evaluation(p_reg_id uuid, p_answers jsonb)
returns public.training_registrations language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.training_registrations;
begin
  select * into v_reg from public.training_registrations where id = p_reg_id and user_id = auth.uid() for update;
  if not found then raise exception 'ไม่พบการลงทะเบียน'; end if;
  if v_reg.status <> 'attended' then raise exception 'ทำแบบประเมินได้หลังเช็กอินเข้าอบรม'; end if;
  if v_reg.checked_out_at is null then raise exception 'กรุณาสแกน QR เช็กเอาต์ก่อนทำแบบประเมิน'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'กรุณาตอบแบบประเมิน'; end if;
  if length(p_answers::text) > 10000 then raise exception 'ข้อความยาวเกินไป'; end if;
  update public.training_registrations set evaluation = p_answers, evaluated_at = coalesce(evaluated_at, now()) where id = p_reg_id;
  return public._issue_certificate(p_reg_id);
end $$;

create or replace function public.session_checkout_code(p_session_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_or_admin() then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  return (select checkout_code from public.course_sessions where id = p_session_id);
end $$;

-- Guard: direct staff edits cannot touch check-out either
create or replace function public.training_regs_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.id := old.id; new.code := old.code; new.user_id := old.user_id; new.session_id := old.session_id;
  new.legacy_user_id := old.legacy_user_id; new.status := old.status; new.points_awarded := old.points_awarded;
  new.cert_no := old.cert_no; new.cert_issued_at := old.cert_issued_at; new.cert_expires_on := old.cert_expires_on;
  new.checked_in_at := old.checked_in_at; new.check_in_method := old.check_in_method;
  new.checked_out_at := old.checked_out_at; new.check_out_method := old.check_out_method; new.check_out_dist_m := old.check_out_dist_m;
  new.evaluation := old.evaluation; new.evaluated_at := old.evaluated_at; new.created_at := old.created_at;
  new.rescheduled_from := old.rescheduled_from; new.coupon_code := old.coupon_code; new.promo_code_id := old.promo_code_id;
  if new.pay_status = 'paid' and old.pay_status <> 'paid' then new.paid_at := coalesce(new.paid_at, now()); end if;
  return new;
end $$;

revoke execute on function public._after_check_out(uuid) from public, anon, authenticated;
revoke execute on function public._venue_distance(public.course_sessions, numeric, numeric, text) from public, anon, authenticated;
revoke execute on function public.check_out(uuid, text, numeric, numeric, text) from public, anon;
revoke execute on function public.staff_check_out(uuid, boolean, text) from public, anon;
revoke execute on function public.session_checkout_code(uuid) from public, anon;
grant execute on function public.check_out(uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.staff_check_out(uuid, boolean, text) to authenticated;
grant execute on function public.session_checkout_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: training-materials/<course_id>/<file> — private. Readable by whoever can read the
-- matching course_materials row (its RLS: public / registered / checked-in), staff writes.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('training-materials', 'training-materials', false) on conflict (id) do nothing;

drop policy if exists training_materials_select on storage.objects;
drop policy if exists training_materials_insert on storage.objects;
drop policy if exists training_materials_update on storage.objects;
drop policy if exists training_materials_delete on storage.objects;
create policy training_materials_select on storage.objects for select to authenticated
  using (bucket_id = 'training-materials' and (
    (select public.is_staff_or_admin())
    or exists (select 1 from public.course_materials m where m.file_path = storage.objects.name)));
create policy training_materials_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'training-materials' and (select public.has_perm('courses')));
create policy training_materials_update on storage.objects for update to authenticated
  using (bucket_id = 'training-materials' and (select public.has_perm('courses')));
create policy training_materials_delete on storage.objects for delete to authenticated
  using (bucket_id = 'training-materials' and (select public.has_perm('courses')));
