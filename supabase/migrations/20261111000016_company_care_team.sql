-- One App SSC · care team per customer company (sales + support), shown to the company's customers.
-- Staff/Admin pick people from team_members (หน้า ทีมงาน); customers read them via my_care_team().

alter table public.companies
  add column if not exists sales_member_id   uuid references public.team_members (id) on delete set null,
  add column if not exists support_member_id uuid references public.team_members (id) on delete set null;

comment on column public.companies.sales_member_id   is 'เซลล์ที่ดูแลบริษัทนี้ (team_members)';
comment on column public.companies.support_member_id is 'ซัพพอร์ตที่ดูแลบริษัทนี้ (team_members)';

-- Customer side: the care team of my approved company, readable even when the person is not on the public team page.
create or replace function public.my_care_team()
returns table (role text, full_name text, job_title text, phone text, line_id text, email text, photo_url text)
language sql stable security definer set search_path = ''
as $$
  select r.role, t.full_name, t.position, t.phone, t.line_id, t.email, t.photo_url
  from public.companies c
  cross join lateral (values ('sales', c.sales_member_id, 1), ('support', c.support_member_id, 2)) as r(role, member_id, ord)
  join public.team_members t on t.id = r.member_id
  where c.id = public.my_company_id()
  order by r.ord
$$;

revoke all on function public.my_care_team() from public, anon;
grant execute on function public.my_care_team() to authenticated;
