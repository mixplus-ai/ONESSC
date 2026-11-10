-- One App SSC · Phase 1: identity, roles, companies, site content, audit log
-- อีเมล = ล็อกอิน · เลขผู้เสียภาษี (13 หลัก) = ตัวเชื่อมบริษัท · บทบาท admin / staff / user

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'staff', 'user');
create type public.company_link_status as enum ('none', 'pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Companies (บริษัทลูกค้า) — keyed by tax ID
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  tax_id      text not null unique check (tax_id ~ '^[0-9]{13}$'),
  name        text not null check (length(trim(name)) > 0),
  branch      text,
  address     text,
  phone       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  phone             text,
  line_id           text,
  position          text,
  role              public.app_role not null default 'user',
  department        text check (department in ('sales', 'service', 'coordination', 'other')),
  -- what the user typed in their profile; staff/admin approves the link
  tax_id            text check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  company_name      text,
  company_id        uuid references public.companies (id) on delete set null,
  company_status    public.company_link_status not null default 'none',
  company_reviewed_by uuid references auth.users (id) on delete set null,
  company_reviewed_at timestamptz,
  pdpa_consent_at   timestamptz,
  legacy_cerssc_id  text,          -- for the phase-3 cerssc migration
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_company_id_idx on public.profiles (company_id);
create index profiles_tax_id_idx on public.profiles (tax_id);
create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Staff permissions (Admin ticks menus per staff member)
-- ---------------------------------------------------------------------------
create table public.permission_keys (
  key         text primary key,
  label       text not null,
  description text,
  sort        int not null default 0
);

insert into public.permission_keys (key, label, description, sort) values
  ('site_content', 'เนื้อหาหน้าเว็บ ผลงาน ทีมงาน', 'แก้ไขหน้าเว็บสาธารณะ ผลงาน และรายชื่อทีมงาน', 10),
  ('contact_messages', 'ข้อความติดต่อจากหน้าเว็บ', 'ดูและปิดข้อความจากแบบฟอร์มติดต่อ', 20),
  ('courses', 'หลักสูตรอบรม / กิจกรรม', 'ใช้ในเฟส 3', 30),
  ('reports', 'รายงาน / ส่งออก', 'ใช้ในเฟสถัดไป', 40);

create table public.staff_permissions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  perm        text not null references public.permission_keys (key) on delete cascade,
  granted_by  uuid references auth.users (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, perm)
);

-- ---------------------------------------------------------------------------
-- Site content (CMS)
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create table public.portfolio_projects (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  project_type  text not null default 'residential' check (project_type in ('residential', 'factory', 'commercial', 'other')),
  size_kwp      numeric(10, 2),
  province      text,
  year          int check (year between 2000 and 2100),
  equipment     text,
  description   text,
  cover_url     text,
  images        text[] not null default '{}',
  is_published  boolean not null default false,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.team_members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  position      text,
  department    text not null default 'sales' check (department in ('sales', 'service', 'coordination', 'management', 'other')),
  phone         text,
  line_id       text,
  email         text,
  photo_url     text,
  is_published  boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  company     text check (length(company) <= 200),
  phone       text check (length(phone) <= 50),
  email       text check (length(email) <= 200),
  topic       text check (length(topic) <= 100),
  message     text not null check (length(message) between 1 and 5000),
  user_id     uuid references auth.users (id) on delete set null,
  status      text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  handled_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_email text,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies can call them safely)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'staff'), false)
$$;

-- admin always passes; staff passes only if the menu was ticked
create or replace function public.has_perm(p_perm text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or (public.current_app_role() = 'staff'
          and exists (select 1 from public.staff_permissions sp
                      where sp.user_id = auth.uid() and sp.perm = p_perm))
$$;

create or replace function public.my_company_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.company_id from public.profiles p
  where p.id = auth.uid() and p.company_status = 'approved'
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger portfolio_touch before update on public.portfolio_projects
  for each row execute function public.touch_updated_at();
create trigger team_touch before update on public.team_members
  for each row execute function public.touch_updated_at();
create trigger contact_touch before update on public.contact_messages
  for each row execute function public.touch_updated_at();

-- New auth user → profile row (role always 'user'; admin promotes later)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, pdpa_consent_at)
  values (
    new.id,
    lower(new.email),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when (new.raw_user_meta_data ->> 'pdpa_consent') = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when the auth email changes
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Column guard: users can edit their own contact info and request a company link,
-- but only staff/admin decide the link and only admin changes role / active flag.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_staff boolean := public.is_staff_or_admin();
begin
  -- service role / SQL editor (no auth.uid()) may change anything
  if auth.uid() is null then
    return new;
  end if;

  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;

  if not v_admin then
    new.role := old.role;
    new.is_active := old.is_active;
    new.department := old.department;
    new.legacy_cerssc_id := old.legacy_cerssc_id;
  end if;

  if not v_staff then
    new.company_id := old.company_id;
    new.company_reviewed_by := old.company_reviewed_by;
    new.company_reviewed_at := old.company_reviewed_at;
    if new.tax_id is distinct from old.tax_id
       or new.company_name is distinct from old.company_name then
      -- changed company details → back to review
      new.company_id := null;
      new.company_status := case when new.tax_id is null then 'none' else 'pending' end;
      new.company_reviewed_by := null;
      new.company_reviewed_at := null;
    else
      new.company_status := old.company_status;
    end if;
    -- consent can be given but not withdrawn silently
    if old.pdpa_consent_at is not null then
      new.pdpa_consent_at := old.pdpa_consent_at;
    end if;
  end if;

  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Generic audit trigger
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_id text;
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  v_id := case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end;
  if v_id is null then
    v_id := case when tg_op = 'DELETE' then to_jsonb(old) ->> 'key' else to_jsonb(new) ->> 'key' end;
  end if;
  if v_id is null and tg_table_name = 'staff_permissions' then
    v_id := case when tg_op = 'DELETE' then to_jsonb(old) ->> 'user_id' else to_jsonb(new) ->> 'user_id' end;
  end if;
  insert into public.audit_logs (actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), v_email, lower(tg_op), tg_table_name, v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.audit_row();
create trigger audit_staff_permissions after insert or delete on public.staff_permissions
  for each row execute function public.audit_row();
create trigger audit_site_settings after insert or update or delete on public.site_settings
  for each row execute function public.audit_row();
create trigger audit_portfolio after insert or update or delete on public.portfolio_projects
  for each row execute function public.audit_row();
create trigger audit_team after insert or update or delete on public.team_members
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- RPC: approve / reject a user's company link (staff or admin)
-- Creates the company on first approval of a tax ID.
-- ---------------------------------------------------------------------------
create or replace function public.review_company_link(p_user_id uuid, p_approve boolean, p_company_name text default null)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_company_id uuid;
begin
  if not public.is_staff_or_admin() then
    raise exception 'ไม่มีสิทธิ์อนุมัติบริษัท' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'ไม่พบผู้ใช้';
  end if;
  if v_profile.tax_id is null then
    raise exception 'ผู้ใช้ยังไม่ได้กรอกเลขผู้เสียภาษี';
  end if;

  if p_approve then
    insert into public.companies (tax_id, name)
    values (v_profile.tax_id, coalesce(nullif(trim(p_company_name), ''), nullif(trim(v_profile.company_name), ''), v_profile.tax_id))
    on conflict (tax_id) do nothing;
    select id into v_company_id from public.companies where tax_id = v_profile.tax_id;

    update public.profiles
       set company_id = v_company_id, company_status = 'approved',
           company_reviewed_by = auth.uid(), company_reviewed_at = now()
     where id = p_user_id
    returning * into v_profile;
  else
    update public.profiles
       set company_id = null, company_status = 'rejected',
           company_reviewed_by = auth.uid(), company_reviewed_at = now()
     where id = p_user_id
    returning * into v_profile;
  end if;

  return v_profile;
end $$;

-- Admin: set role / department / active flag and replace a staff member's permissions
create or replace function public.admin_set_user_access(
  p_user_id uuid,
  p_role public.app_role,
  p_department text,
  p_is_active boolean,
  p_perms text[]
)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้น' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_is_active) then
    raise exception 'ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้';
  end if;

  update public.profiles
     set role = p_role, department = nullif(p_department, ''), is_active = p_is_active
   where id = p_user_id
  returning * into v_profile;
  if not found then
    raise exception 'ไม่พบผู้ใช้';
  end if;

  delete from public.staff_permissions
   where user_id = p_user_id
     and (p_role <> 'staff' or perm <> all (coalesce(p_perms, '{}')));
  if p_role = 'staff' then
    insert into public.staff_permissions (user_id, perm, granted_by)
    select p_user_id, k, auth.uid() from unnest(coalesce(p_perms, '{}')) as k
    on conflict do nothing;
  end if;

  return v_profile;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.permission_keys enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.site_settings enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.team_members enable row level security;
alter table public.contact_messages enable row level security;
alter table public.audit_logs enable row level security;

-- companies: staff/admin see all; a user sees only their approved company
create policy companies_select on public.companies for select to authenticated
  using (public.is_staff_or_admin() or id = public.my_company_id());
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_staff_or_admin());
create policy companies_update on public.companies for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_admin());

-- profiles: own row, or staff/admin see everyone; edits guarded by profiles_guard
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff_or_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- permissions catalogue: any signed-in user may read it
create policy permission_keys_select on public.permission_keys for select to authenticated using (true);

-- staff_permissions: own rows or admin; writes only via admin_set_user_access (admin)
create policy staff_permissions_select on public.staff_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy staff_permissions_write on public.staff_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- site content: everyone reads published content; site_content permission edits
create policy site_settings_select on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_write on public.site_settings for all to authenticated
  using (public.has_perm('site_content')) with check (public.has_perm('site_content'));

create policy portfolio_select on public.portfolio_projects for select to anon, authenticated
  using (is_published or public.has_perm('site_content'));
create policy portfolio_write on public.portfolio_projects for all to authenticated
  using (public.has_perm('site_content')) with check (public.has_perm('site_content'));

create policy team_select on public.team_members for select to anon, authenticated
  using (is_published or public.has_perm('site_content'));
create policy team_write on public.team_members for all to authenticated
  using (public.has_perm('site_content')) with check (public.has_perm('site_content'));

-- contact messages: anyone may send; only permitted staff read/handle
create policy contact_insert on public.contact_messages for insert to anon, authenticated
  with check (status = 'new' and handled_by is null and (user_id is null or user_id = auth.uid()));
create policy contact_select on public.contact_messages for select to authenticated
  using (public.has_perm('contact_messages'));
create policy contact_update on public.contact_messages for update to authenticated
  using (public.has_perm('contact_messages')) with check (public.has_perm('contact_messages'));

-- audit log: admin read-only (rows are written by the security-definer trigger)
create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());

-- Function execute grants: keep helpers callable by signed-in users only
revoke execute on function public.review_company_link(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_set_user_access(uuid, public.app_role, text, boolean, text[]) from public, anon;
grant execute on function public.review_company_link(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_user_access(uuid, public.app_role, text, boolean, text[]) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for website images (public read, site_content write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;

create policy site_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.has_perm('site_content'));
create policy site_media_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.has_perm('site_content'));
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.has_perm('site_content'));

-- ---------------------------------------------------------------------------
-- Default site settings (Admin edits these from the back office)
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('company', jsonb_build_object(
     'name_th', 'SSC',
     'name_en', 'SSC',
     'tagline', 'พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ',
     'address', '',
     'phone', '',
     'email', '',
     'line_oa_url', 'https://lin.ee/w8rXmRU',
     'facebook_url', '',
     'map_embed_url', '',
     'office_hours', 'จันทร์–ศุกร์ 08:30–17:30'
  )),
  ('hero', jsonb_build_object(
     'title', 'อุปกรณ์โซลาร์ของแท้ จากตัวแทนจำหน่ายโดยตรง',
     'subtitle', 'สินค้า งานอบรม และงานบริการหลังการขาย รวมไว้ในที่เดียว',
     'image_url', '',
     'cta_primary_label', 'ดูสินค้า',
     'cta_primary_href', '/products',
     'cta_secondary_label', 'ขอใบเสนอราคา',
     'cta_secondary_href', '/contact?topic=quotation'
  )),
  ('about', jsonb_build_object(
     'history', 'SSC เป็นผู้นำเข้าและตัวแทนจำหน่ายอุปกรณ์ระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ พร้อมทีมวิศวกรที่ให้คำปรึกษา อบรม และดูแลงานเคลมหลังการขาย',
     'vision', 'ทำให้พลังงานสะอาดเข้าถึงง่าย ด้วยอุปกรณ์คุณภาพและบริการที่ไว้ใจได้',
     'brands', jsonb_build_array('SolarEdge', 'KSTAR'),
     'certificates', jsonb_build_array()
  ))
on conflict (key) do nothing;
