-- Product lines on a stock document (code, name, quantity wanted), kept even before any SN is entered,
-- so a document can be prepared from a quotation / reservation and the SNs filled in later.
alter table public.stock_docs add column if not exists lines jsonb not null default '[]'::jsonb;

create or replace function public.save_stock_doc_lines(p_id uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_perm('stock.docs') or public.has_perm('stock.post')) then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  update public.stock_docs d set lines = coalesce((
    select jsonb_agg(jsonb_build_object('sku', upper(trim(l ->> 'sku')), 'description', nullif(trim(l ->> 'description'), ''),
                                        'qty', greatest(0, least(100000, coalesce((l ->> 'qty')::int, 0)))) order by o)
      from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) with ordinality t(l, o)
     where nullif(trim(l ->> 'sku'), '') is not null), '[]'::jsonb)
   where d.id = p_id and d.status = 'draft';
end $$;
revoke execute on function public.save_stock_doc_lines(uuid, jsonb) from public, anon;
grant execute on function public.save_stock_doc_lines(uuid, jsonb) to authenticated;
