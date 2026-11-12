-- One App SSC · stock documents phase 2 (owner 2026-11-12):
--  * a web reservation (RS-…) is turned into a reservation/sale document once (like a delivery)
--  * photos / files attached to a document as evidence (bucket stock-files, <doc_id>/<file>)
--  * SN facts for claims: was it sold by us, when, to whom (warranty age)

alter table public.stock_docs add column reservation_id uuid references public.reservations (id) on delete set null;
create unique index stock_docs_one_per_reservation on public.stock_docs (reservation_id, doc_type)
  where reservation_id is not null and status <> 'cancelled';

-- link a draft to its web reservation (save_stock_doc from migration 22 does not carry it)
create or replace function public.save_stock_doc_reservation(p_id uuid, p_reservation uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_perm('stock.docs') or public.has_perm('stock.post')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  update public.stock_docs d set reservation_id = p_reservation where d.id = p_id and d.status = 'draft';
end $$;

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
create table public.stock_doc_files (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.stock_docs (id) on delete cascade,
  path        text not null unique,          -- stock-files/<doc_id>/<name>
  name        text not null,
  size        int,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index stock_doc_files_doc_idx on public.stock_doc_files (doc_id);
alter table public.stock_doc_files enable row level security;

create policy stock_doc_files_select on public.stock_doc_files for select to authenticated
  using ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')));
create policy stock_doc_files_insert on public.stock_doc_files for insert to authenticated
  with check (((select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')))
              and path like doc_id::text || '/%');
-- evidence stays once the document is posted; a draft's files can be removed
create policy stock_doc_files_delete on public.stock_doc_files for delete to authenticated
  using ((select public.is_admin())
         or (((select public.has_perm('stock.docs')) or (select public.has_perm('stock.post')))
             and exists (select 1 from public.stock_docs d where d.id = doc_id and d.status = 'draft')));
create trigger audit_stock_doc_files after insert or update or delete on public.stock_doc_files
  for each row execute function public.audit_row();

insert into storage.buckets (id, name, public) values ('stock-files', 'stock-files', false)
on conflict (id) do nothing;
create policy stock_files_select on storage.objects for select to authenticated
  using (bucket_id = 'stock-files' and ((select public.has_perm('stock.view')) or (select public.has_perm('stock.docs')) or (select public.has_perm('stock.post'))));
create policy stock_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'stock-files' and ((select public.has_perm('stock.docs')) or (select public.has_perm('stock.post'))));
create policy stock_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'stock-files' and ((select public.has_perm('stock.docs')) or (select public.has_perm('stock.post'))));

-- ---------------------------------------------------------------------------
-- SN facts for a list of SNs (claims page): current state + the sale that sent it out
-- ---------------------------------------------------------------------------
create or replace function public.sns_info(p_sns text[])
returns table (sn text, sn_key text, sku text, description text, status text, condition text,
               sold_at date, sold_doc_id uuid, sold_doc_no text, sold_to text, sold_company_id uuid, ref_no text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_perm('stock.view') or public.has_perm('stock.docs') or public.has_perm('stock.post')
          or public.has_perm('claims.view') or public.has_perm('claims')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  return query
  select q.sn, k.key, s.sku, s.description, s.status, s.condition,
         so.doc_date, so.id, so.doc_no, coalesce(c.name, so.partner_name), so.company_id, so.ref_no
    from unnest(p_sns) q(sn)
    cross join lateral (select public.sn_key(q.sn) key) k
    left join public.serials s on s.sn_key = k.key
    left join lateral (
      select d.* from public.stock_doc_items i join public.stock_docs d on d.id = i.doc_id
       where i.sn_key = k.key and d.doc_type = 'SO' and d.status = 'posted'
       order by d.doc_date desc, d.posted_at desc limit 1) so on true
    left join public.companies c on c.id = so.company_id
   where k.key is not null;
end $$;

revoke execute on function public.save_stock_doc_reservation(uuid, uuid) from public, anon;
revoke execute on function public.sns_info(text[]) from public, anon;
grant execute on function public.save_stock_doc_reservation(uuid, uuid) to authenticated;
grant execute on function public.sns_info(text[]) to authenticated;
