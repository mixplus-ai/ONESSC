-- Migration 41: what each warehouse is for (owner's existing warehouses got role 'main' in migration 40).
--   main         sellable stock (counted for the shop / stock page)
--   other        kept in the system but not for sale (samples, premiums, loans, sales reservations ...)
--   claim_hold   คลังจองเคลม · claim_check คลังรับเคลมรอตรวจ · defect คลังของเสีย (one warehouse each)
alter table public.warehouses drop constraint if exists warehouses_role_check;
alter table public.warehouses add constraint warehouses_role_check
  check (role in ('main', 'other', 'claim_hold', 'claim_check', 'defect'));
drop index if exists public.warehouses_one_system_role;
create unique index warehouses_one_system_role on public.warehouses (role) where role in ('claim_hold', 'claim_check', 'defect');

-- Admin: set every warehouse's role in one go. p_roles: {"<warehouse id>": "main" | "other" | "claim_hold" | ...}
create or replace function public.set_warehouse_roles(p_roles jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare r text;
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin' using errcode = '42501'; end if;
  foreach r in array array['claim_hold', 'claim_check', 'defect'] loop
    if (select count(*) from jsonb_each_text(p_roles) e where e.value = r) <> 1 then
      raise exception 'เลือก % ให้ครบ 1 คลัง', case r when 'claim_hold' then 'คลังจองเคลม' when 'claim_check' then 'คลังรับเคลมรอตรวจ' else 'คลังของเสีย' end;
    end if;
  end loop;
  -- clear the one-per-role slots first, then write
  update public.warehouses w set role = 'other' where w.id::text in (select key from jsonb_each_text(p_roles)) and w.role <> 'main';
  update public.warehouses w set role = e.value from jsonb_each_text(p_roles) e
   where w.id::text = e.key and e.value in ('main', 'other', 'claim_hold', 'claim_check', 'defect');
  if (select c.stock_source from public.stock_config c where c.id = 1) = 'docs' then
    perform public.refresh_stock_from_serials();
  end if;
end $$;
revoke execute on function public.set_warehouse_roles(jsonb) from public, anon;
grant execute on function public.set_warehouse_roles(jsonb) to authenticated;
