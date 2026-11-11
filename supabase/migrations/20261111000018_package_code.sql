-- One App SSC · a package (ชุดแพ็กเกจ) gets its own product code, used like a SKU: one code, one price.
-- The code shows on the website, in the cart, and at the front of the quote line ("PKG-001 · แพ็กเกจ · …").

alter table public.packages
  add column if not exists code text check (code is null or code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$');
create unique index if not exists packages_code_key on public.packages (upper(code)) where code is not null;
comment on column public.packages.code is 'รหัสแพ็กเกจ ใช้เหมือนรหัสสินค้า (ไม่ซ้ำ ไม่สนตัวพิมพ์)';

-- Quote lines for a package start with its code. Kept as a trigger so create_quote_request stays unchanged.
create or replace function public.quote_item_package_code()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_code text;
begin
  if new.package_id is not null then
    select code into v_code from public.packages where id = new.package_id;
    if v_code is not null and position(v_code in new.label) = 0 then
      new.label := v_code || ' · ' || new.label;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.quote_item_package_code() from public, anon, authenticated;

drop trigger if exists quote_item_package_code on public.quote_request_items;
create trigger quote_item_package_code before insert on public.quote_request_items
  for each row execute function public.quote_item_package_code();
