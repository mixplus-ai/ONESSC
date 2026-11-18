-- One App SSC · Migration 44: each salesperson sees and edits only the customers they look after (owner, 17 Nov 2026).
--
-- A Staff login linked to a team member in department "sales" (หน้า ทีมงาน → บัญชีผู้ใช้ในระบบ) is scoped:
--   * companies: sees / edits only companies whose sales_member_id is that team member
--   * profiles:  sees only customer profiles of those companies (staff/admin profiles stay visible)
--   * set_company_rank / review_company_link: only for those companies
-- New permission customers.all lifts the scope (sales heads). Admin is never scoped.
-- Staff who are not linked to a sales team member are not affected (same as before).

insert into public.permission_keys (key, label, description, sort, grp) values
  ('customers.all', 'ลูกค้า: เห็นลูกค้าทุกบริษัท',
   'ไม่ติ๊ก + ผูกบัญชีกับเซลล์ในหน้าทีมงาน = เห็นและแก้เฉพาะบริษัทที่ตัวเองเป็นเซลล์ดูแล', 31, 'sales')
on conflict (key) do nothing;

-- team member id of the signed-in salesperson when they are scoped, else null
create or replace function public.my_sales_scope()
returns uuid language sql stable security definer set search_path = ''
as $$
  select t.id from public.team_members t
   where t.user_id = auth.uid() and t.department = 'sales'
     and not public.has_perm('customers.all')
   limit 1
$$;
revoke execute on function public.my_sales_scope() from public, anon;
grant execute on function public.my_sales_scope() to authenticated;

-- may the signed-in user see / work on this company (customer side handled by the policies)
create or replace function public.can_see_company(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_staff_or_admin() and (
    public.my_sales_scope() is null
    or exists (select 1 from public.companies c where c.id = p_company_id and c.sales_member_id = public.my_sales_scope()))
$$;
revoke execute on function public.can_see_company(uuid) from public, anon;
grant execute on function public.can_see_company(uuid) to authenticated;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (id = (select public.my_company_id())
         or ((select public.is_staff_or_admin())
             and ((select public.my_sales_scope()) is null or sales_member_id = (select public.my_sales_scope()))));

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (((select public.has_perm('companies')) or (select public.has_perm('company_points')))
         and ((select public.my_sales_scope()) is null or sales_member_id = (select public.my_sales_scope())))
  with check (((select public.has_perm('companies')) or (select public.has_perm('company_points')))
              and ((select public.my_sales_scope()) is null or sales_member_id = (select public.my_sales_scope())));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or ((select public.is_staff_or_admin())
             and ((select public.my_sales_scope()) is null
                  or role <> 'user'
                  or company_id in (select c.id from public.companies c where c.sales_member_id = (select public.my_sales_scope())))));

create or replace function public.set_company_rank(p_company_id uuid, p_rank text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_perm('pricing') or public.has_perm('companies')) or not public.can_see_company(p_company_id) then
    raise exception 'ไม่มีสิทธิ์ตั้ง Rank ราคา' using errcode = '42501';
  end if;
  update public.companies set price_rank = nullif(trim(p_rank), '') where id = p_company_id;
  if not found then raise exception 'ไม่พบบริษัท'; end if;
end $$;
revoke execute on function public.set_company_rank(uuid, text) from public, anon;
grant execute on function public.set_company_rank(uuid, text) to authenticated;

-- same as phase 1, plus: a scoped salesperson may only link users to a company they already look after
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

  if public.my_sales_scope() is not null and not exists (
       select 1 from public.companies c where c.tax_id = v_profile.tax_id and c.sales_member_id = public.my_sales_scope()) then
    raise exception 'บริษัทนี้ไม่ใช่ลูกค้าที่คุณดูแล ให้หัวหน้าเซลล์หรือ Admin อนุมัติ' using errcode = '42501';
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
revoke execute on function public.review_company_link(uuid, boolean, text) from public, anon;
grant execute on function public.review_company_link(uuid, boolean, text) to authenticated;
