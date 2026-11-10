-- One App SSC · ตารางส่งสินค้า (delivery schedule)
-- Staff/Admin upload a delivery note (ใบส่งสินค้า / PI) PDF; the browser reads it into the fields
-- below, a person checks them, and the delivery shows on a calendar by delivery date.
-- Only Staff and Admin can see or change anything here.

create table public.deliveries (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text,                         -- PI NO. e.g. PI-SSC2026091004-R3
  doc_date         date,                         -- PI DATE
  delivery_date    date not null,                -- วันที่รับสินค้า (calendar day)
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'waiting', 'shipped', 'delivered', 'cancelled')),
  customer_name    text not null,
  customer_tax_id  text,
  company_id       uuid references public.companies (id) on delete set null,
  customer_address text,
  contact_name     text,
  contact_phone    text,
  contact_email    text,
  site             text,                         -- โครงการ/สถานที่ติดตั้ง
  warehouse        text,                         -- e.g. คลัง BGL 4
  notes            text,                         -- หมายเหตุ lines from the document, one per line
  internal_note    text,                         -- staff-only note, not from the document
  sales_name       text,                         -- seller contact on the document
  file_path        text,                         -- delivery-files/<id>/<file>.pdf
  file_name        text,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index deliveries_doc_no_key on public.deliveries (doc_no) where doc_no is not null;
create index deliveries_date_idx on public.deliveries (delivery_date);
create index deliveries_company_idx on public.deliveries (company_id);
create index deliveries_created_by_idx on public.deliveries (created_by);

create table public.delivery_items (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid not null references public.deliveries (id) on delete cascade,
  sort         int not null default 0,
  model        text not null,
  description  text,
  unit_watt    numeric(12, 2),                  -- Peak Power (Wps/PC)
  qty          numeric(12, 2) not null default 0,
  total_watt   numeric(14, 2)
);
create index delivery_items_delivery_idx on public.delivery_items (delivery_id, sort);

create trigger deliveries_touch before update on public.deliveries
  for each row execute function public.touch_updated_at();
create trigger audit_deliveries after insert or update or delete on public.deliveries
  for each row execute function public.audit_row();

-- link to a customer company by tax ID when the document carries one
create or replace function public.deliveries_link_company()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.customer_tax_id is not null and (tg_op = 'INSERT' or new.customer_tax_id is distinct from old.customer_tax_id) then
    new.company_id := (select c.id from public.companies c where c.tax_id = new.customer_tax_id);
  end if;
  return new;
end $$;
create trigger deliveries_link_company before insert or update on public.deliveries
  for each row execute function public.deliveries_link_company();

alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;

create policy deliveries_select on public.deliveries for select to authenticated using (public.is_staff_or_admin());
create policy deliveries_insert on public.deliveries for insert to authenticated with check (public.is_staff_or_admin());
create policy deliveries_update on public.deliveries for update to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy deliveries_delete on public.deliveries for delete to authenticated using (public.is_admin());

create policy delivery_items_select on public.delivery_items for select to authenticated using (public.is_staff_or_admin());
create policy delivery_items_insert on public.delivery_items for insert to authenticated with check (public.is_staff_or_admin());
create policy delivery_items_update on public.delivery_items for update to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy delivery_items_delete on public.delivery_items for delete to authenticated using (public.is_staff_or_admin());

revoke all on public.deliveries, public.delivery_items from anon;
revoke execute on function public.deliveries_link_company() from public, anon, authenticated;

-- Storage: delivery-files (private) · <delivery_id>/<file>
insert into storage.buckets (id, name, public) values ('delivery-files', 'delivery-files', false)
on conflict (id) do nothing;

create policy delivery_files_select on storage.objects for select to authenticated
  using (bucket_id = 'delivery-files' and public.is_staff_or_admin());
create policy delivery_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-files' and public.is_staff_or_admin());
create policy delivery_files_update on storage.objects for update to authenticated
  using (bucket_id = 'delivery-files' and public.is_staff_or_admin());
create policy delivery_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'delivery-files' and public.is_admin());
