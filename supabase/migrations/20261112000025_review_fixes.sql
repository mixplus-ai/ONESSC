-- Fixes from the Nov 12 system review.
--  1. Claim RPCs: no longer callable by anonymous visitors (only signed-in users; each RPC still checks rights inside).
--  2. Drop the import_tmp staging schema (raw ssccare copy, already imported into claims / claim_units).
--  3. Indexes on foreign keys used in joins and deletes.
--  4. Staff rights enforced in the database, matching the permission matrix (was screen-only for these tables).
--  5. Staff link imported (old) claims to a customer account, so the customer sees them in "งานเคลมของฉัน".
--  6. Customers can ask to close their account (PDPA); Admin handles the request.

-- ---------------------------------------------------------------------------
-- 1. claim RPCs: signed-in only
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.add_claim_file(uuid,text,text,text,bigint,text)', 'public.assign_claim(uuid,uuid)', 'public.claim_brands()',
    'public.import_claims(jsonb,text)', 'public.my_claims()', 'public.return_claim(uuid,text[])',
    'public.save_claim_units(jsonb,bigint[])', 'public.set_claim_status(uuid,text,text,text[])',
    'public.submit_claim(jsonb)', 'public.take_claim(uuid)']
  loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
  -- trigger functions are never called directly
  foreach f in array array['public.claims_after_write()', 'public.claims_before_write()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. staging data from the one-off ssccare import
-- ---------------------------------------------------------------------------
drop schema if exists import_tmp cascade;

-- ---------------------------------------------------------------------------
-- 3. foreign-key indexes (joins, company/staff lookups, cascades)
-- ---------------------------------------------------------------------------
create index if not exists claims_brand_id_idx on public.claims (brand_id);
create index if not exists claims_source_user_idx on public.claims (source, user_id);
create index if not exists claim_models_brand_id_idx on public.claim_models (brand_id);
create index if not exists claim_sn_changes_user_id_idx on public.claim_sn_changes (user_id);
create index if not exists companies_sales_member_idx on public.companies (sales_member_id);
create index if not exists companies_support_member_idx on public.companies (support_member_id);
create index if not exists contact_messages_user_id_idx on public.contact_messages (user_id);
create index if not exists course_materials_course_id_idx on public.course_materials (course_id);
create index if not exists course_materials_session_id_idx on public.course_materials (session_id);
create index if not exists package_items_variant_id_idx on public.package_items (variant_id);
create index if not exists quote_request_items_variant_idx on public.quote_request_items (variant_id);
create index if not exists quote_request_items_package_idx on public.quote_request_items (package_id);
create index if not exists quote_requests_company_id_idx on public.quote_requests (company_id);
create index if not exists reservations_company_id_idx on public.reservations (company_id);
create index if not exists reservation_items_variant_idx on public.reservation_items (variant_id);
create index if not exists redemptions_reward_id_idx on public.redemptions (reward_id);
create index if not exists point_ledger_registration_idx on public.point_ledger (registration_id);
create index if not exists training_strikes_registration_idx on public.training_strikes (registration_id);
create index if not exists training_regs_rescheduled_from_idx on public.training_registrations (rescheduled_from);
create index if not exists company_point_bonuses_brand_idx on public.company_point_bonuses (brand_id);
create index if not exists product_categories_parent_idx on public.product_categories (parent_id);
create index if not exists staff_permissions_perm_idx on public.staff_permissions (perm);

-- ---------------------------------------------------------------------------
-- 4. staff rights in the database
-- ---------------------------------------------------------------------------
create or replace function public.can_view_claims()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.has_perm('claims.view') or public.has_perm('claims') or public.has_perm('claims.handle')
$$;
revoke execute on function public.can_view_claims() from public, anon;
grant execute on function public.can_view_claims() to authenticated, service_role;

-- claims and everything hanging off them: staff with a claims permission (customers keep using their RPCs)
drop policy if exists claims_select on public.claims;
create policy claims_select on public.claims for select to authenticated using ((select public.can_view_claims()));
drop policy if exists claim_units_select on public.claim_units;
create policy claim_units_select on public.claim_units for select to authenticated using ((select public.can_view_claims()));
drop policy if exists claim_events_select on public.claim_events;
create policy claim_events_select on public.claim_events for select to authenticated using ((select public.can_view_claims()));
drop policy if exists claim_files_select on public.claim_files;
create policy claim_files_select on public.claim_files for select to authenticated using ((select public.can_view_claims()));
drop policy if exists claim_sn_changes_select on public.claim_sn_changes;
create policy claim_sn_changes_select on public.claim_sn_changes for select to authenticated using ((select public.can_view_claims()));
drop policy if exists claim_email_log_select on public.claim_email_log;
create policy claim_email_log_select on public.claim_email_log for select to authenticated using ((select public.can_view_claims()));

-- quotes and reservations: the customer's own, or staff with "คำขอจากลูกค้า" (stock-doc staff link reservations to RV/SO docs)
create or replace function public.can_view_requests()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.has_perm('requests') or public.has_perm('stock.docs') or public.has_perm('stock.post')
$$;
revoke execute on function public.can_view_requests() from public, anon;
grant execute on function public.can_view_requests() to authenticated, service_role;

drop policy if exists quote_requests_select on public.quote_requests;
create policy quote_requests_select on public.quote_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_requests()));
drop policy if exists quote_items_select on public.quote_request_items;
create policy quote_items_select on public.quote_request_items for select to authenticated
  using (exists (select 1 from public.quote_requests q where q.id = quote_request_items.quote_id
                 and (q.user_id = (select auth.uid()) or (select public.can_view_requests()))));
drop policy if exists quote_requests_update on public.quote_requests;
create policy quote_requests_update on public.quote_requests for update to authenticated
  using ((select public.has_perm('requests'))) with check ((select public.has_perm('requests')));
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_requests()));
drop policy if exists reservation_items_select on public.reservation_items;
create policy reservation_items_select on public.reservation_items for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_items.reservation_id
                 and (r.user_id = (select auth.uid()) or (select public.can_view_requests()))));
drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations for update to authenticated
  using ((select public.has_perm('requests'))) with check ((select public.has_perm('requests')));

-- companies: add / edit by "บริษัทลูกค้า" or "แต้มบริษัท" (that page can add a company by tax ID)
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check ((select public.has_perm('companies')) or (select public.has_perm('company_points')));
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using ((select public.has_perm('companies')) or (select public.has_perm('company_points')))
  with check ((select public.has_perm('companies')) or (select public.has_perm('company_points')));

-- company prices: edit by "ราคาเฉพาะบริษัท" only (staff still read them to quote)
drop policy if exists company_prices_write on public.company_prices;
create policy company_prices_insert on public.company_prices for insert to authenticated with check ((select public.has_perm('pricing')));
create policy company_prices_update on public.company_prices for update to authenticated
  using ((select public.has_perm('pricing'))) with check ((select public.has_perm('pricing')));
create policy company_prices_delete on public.company_prices for delete to authenticated using ((select public.has_perm('pricing')));

-- training promo codes and email log: training staff only
drop policy if exists promo_codes_select on public.training_promo_codes;
create policy promo_codes_select on public.training_promo_codes for select to authenticated
  using ((select public.has_perm('courses')) or (select public.has_perm('training.view')));
drop policy if exists promo_codes_write on public.training_promo_codes;
create policy promo_codes_insert on public.training_promo_codes for insert to authenticated with check ((select public.has_perm('courses')));
create policy promo_codes_update on public.training_promo_codes for update to authenticated
  using ((select public.has_perm('courses'))) with check ((select public.has_perm('courses')));
create policy promo_codes_delete on public.training_promo_codes for delete to authenticated using ((select public.has_perm('courses')));
drop policy if exists training_email_log_select on public.training_email_log;
create policy training_email_log_select on public.training_email_log for select to authenticated
  using ((select public.has_perm('courses')) or (select public.has_perm('training.view')));

-- ---------------------------------------------------------------------------
-- 5. link imported claims to a customer account
-- ---------------------------------------------------------------------------
-- company names compare without spaces, punctuation and the usual company words
create or replace function public.norm_company(p text)
returns text language sql immutable set search_path = ''
as $$
  select nullif(regexp_replace(
    regexp_replace(lower(coalesce(p, '')), 'บริษัท|บจก|หจก|ห้างหุ้นส่วนจำกัด|จำกัด|มหาชน|สำนักงานใหญ่|company|limited|co\.?|ltd\.?|public|plc|inc\.?', '', 'g'),
    '[^a-z0-9ก-๙]', '', 'g'), '')
$$;

-- imported claims not yet linked; with no search text, the ones whose company name matches the customer's company
create or replace function public.legacy_claim_search(p_user uuid, p_query text default null)
returns table (id uuid, claim_no text, company_name text, model text, product_type text, status text, created_at timestamptz,
               qty integer, reported_sns text[], user_id uuid, exact boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_names text[];
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.has_perm('claims') then
    raise exception 'ต้องมีสิทธิ์จัดการงานเคลม' using errcode = '42501';
  end if;
  select array_remove(array[public.norm_company(p.company_name), public.norm_company(c.name)], null) into v_names
  from public.profiles p left join public.companies c on c.id = p.company_id
  where p.id = p_user;
  return query
    select c.id, c.claim_no, c.company_name, c.model, c.product_type, c.status, c.created_at, c.qty, c.reported_sns, c.user_id,
           public.norm_company(c.company_name) = any (coalesce(v_names, '{}'))
    from public.claims c
    where c.source = 'import'
      and (c.user_id is null or c.user_id = p_user)
      and case
            when v_q is not null then
              c.company_name ilike '%' || v_q || '%' or c.claim_no ilike '%' || v_q || '%'
              or c.site_name ilike '%' || v_q || '%'
              or public.norm_company(c.company_name) like '%' || coalesce(public.norm_company(v_q), '') || '%'
            else
              cardinality(coalesce(v_names, '{}')) > 0 and (
                public.norm_company(c.company_name) = any (v_names)
                or exists (select 1 from unnest(v_names) n where length(n) >= 4
                           and (public.norm_company(c.company_name) like '%' || n || '%' or n like '%' || public.norm_company(c.company_name) || '%')))
          end
    order by c.user_id is null, c.created_at desc
    limit 500;
end $$;

create or replace function public.link_legacy_claims(p_user uuid, p_claims uuid[], p_link boolean default true)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
  v_n integer;
begin
  if not public.has_perm('claims') then
    raise exception 'ต้องมีสิทธิ์จัดการงานเคลม' using errcode = '42501';
  end if;
  select case when p.company_status = 'approved' then p.company_id end into v_company
  from public.profiles p where p.id = p_user and p.role = 'user';
  if not found then
    raise exception 'ต้องเลือกบัญชีลูกค้า';
  end if;
  if p_link then
    update public.claims c set user_id = p_user, company_id = coalesce(v_company, c.company_id)
    where c.id = any (p_claims) and c.source = 'import' and c.user_id is null;
  else
    update public.claims c set user_id = null, company_id = null
    where c.id = any (p_claims) and c.source = 'import' and c.user_id = p_user;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.legacy_claim_search(uuid, text) from public, anon;
revoke execute on function public.link_legacy_claims(uuid, uuid[], boolean) from public, anon;
grant execute on function public.legacy_claim_search(uuid, text) to authenticated;
grant execute on function public.link_legacy_claims(uuid, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. account close requests (PDPA)
-- ---------------------------------------------------------------------------
create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'delete' check (kind in ('delete')),
  reason text check (char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  admin_note text,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists account_requests_one_pending on public.account_requests (user_id, kind) where status = 'pending';
create index if not exists account_requests_handled_by_idx on public.account_requests (handled_by);
alter table public.account_requests enable row level security;
create policy account_requests_select on public.account_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy account_requests_insert on public.account_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and handled_by is null and handled_at is null and admin_note is null);
create policy account_requests_delete on public.account_requests for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');
create policy account_requests_update on public.account_requests for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, delete, update on public.account_requests to authenticated;

-- Admin closes the account: deactivate login, mark the request done
create or replace function public.close_account_request(p_request uuid, p_done boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v record;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin' using errcode = '42501';
  end if;
  select * into v from public.account_requests where id = p_request and status = 'pending' for update;
  if not found then
    raise exception 'ไม่พบคำขอที่รอดำเนินการ';
  end if;
  if p_done then
    update public.profiles set is_active = false where id = v.user_id;
  end if;
  update public.account_requests
     set status = case when p_done then 'done' else 'rejected' end,
         admin_note = nullif(trim(coalesce(p_note, '')), ''), handled_by = auth.uid(), handled_at = now()
   where id = p_request;
end $$;
revoke execute on function public.close_account_request(uuid, boolean, text) from public, anon;
grant execute on function public.close_account_request(uuid, boolean, text) to authenticated;
