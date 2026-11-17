-- One App SSC · shop meeting #1 (2026-11-17), section 1 งานขายหน้าร้าน
--   1. Price ranks (Silver / Gold / Platinum / Diamond). A company sits in one rank; staff price the rank
--      (per SKU, or a % off the normal price) and every company in that rank follows. A company can still get its
--      own price per SKU (company_prices): it then shows as "Gold+".
--      Customer price order: promotion / special price → company's own price → rank price → rank % → normal price.
--   2. Rank badge next to the member's name (my_price_rank()).
--   3. Customers see a stock status, never the number: stock_config.show_qty_to_users off, and stock_fit() tells the
--      cart whether the asked quantity is in stock, partly in stock, or not in stock.
--   4. Reservation lines keep the price the customer saw (for the reservation PDF).
--   5. Quotes and reservations go to the company's sales: a sales login (team_members.user_id) sees and approves only
--      the requests of companies they look after. New key requests.all = see every company's requests.

-- ---------------------------------------------------------------------------
-- 1. Ranks
-- ---------------------------------------------------------------------------
create table if not exists public.price_ranks (
  code          text primary key check (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name          text not null check (length(trim(name)) > 0),
  color         text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url      text,
  discount_pct  numeric(5, 2) check (discount_pct is null or (discount_pct >= 0 and discount_pct < 100)),
  sort          int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.price_ranks is 'ระดับราคา (Rank) ของบริษัทลูกค้า';
comment on column public.price_ranks.discount_pct is 'ส่วนลด % จากราคาปกติ ใช้กับรหัสที่ยังไม่ได้ตั้งราคา Rank ไว้ (ว่าง = ใช้ราคาปกติ)';

insert into public.price_ranks (code, name, color, sort) values
  ('silver',   'Silver',   '#94a3b8', 1),
  ('gold',     'Gold',     '#d4a017', 2),
  ('platinum', 'Platinum', '#5b7083', 3),
  ('diamond',  'Diamond',  '#2563eb', 4)
on conflict (code) do nothing;

create table if not exists public.rank_prices (
  rank_code   text not null references public.price_ranks (code) on update cascade on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  price       numeric(12, 2) not null check (price >= 0),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (rank_code, variant_id)
);
create index if not exists rank_prices_variant_idx on public.rank_prices (variant_id);

alter table public.companies
  add column if not exists price_rank text references public.price_ranks (code) on update cascade on delete set null;
comment on column public.companies.price_rank is 'Rank ราคาของบริษัท (ว่าง = ราคาปกติ)';

drop trigger if exists price_ranks_touch on public.price_ranks;
create trigger price_ranks_touch before update on public.price_ranks for each row execute function public.touch_updated_at();
drop trigger if exists audit_price_ranks on public.price_ranks;
create trigger audit_price_ranks after insert or update or delete on public.price_ranks for each row execute function public.audit_row();

create or replace function public.rank_prices_stamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists rank_prices_stamp on public.rank_prices;
create trigger rank_prices_stamp before insert or update on public.rank_prices
  for each row execute function public.rank_prices_stamp();

create or replace function public.audit_rank_price()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_row public.rank_prices := coalesce(new, old);
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.audit_logs (actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), v_email, lower(tg_op), 'rank_prices', v_row.rank_code || ':' || v_row.variant_id,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return v_row;
end $$;
drop trigger if exists audit_rank_prices on public.rank_prices;
create trigger audit_rank_prices after insert or update or delete on public.rank_prices
  for each row execute function public.audit_rank_price();
revoke execute on function public.audit_rank_price() from public, anon, authenticated;
revoke execute on function public.rank_prices_stamp() from public, anon, authenticated;

alter table public.price_ranks enable row level security;
alter table public.rank_prices enable row level security;

drop policy if exists price_ranks_select on public.price_ranks;
create policy price_ranks_select on public.price_ranks for select to anon, authenticated using (true);
drop policy if exists price_ranks_insert on public.price_ranks;
create policy price_ranks_insert on public.price_ranks for insert to authenticated with check ((select public.has_perm('pricing')));
drop policy if exists price_ranks_update on public.price_ranks;
create policy price_ranks_update on public.price_ranks for update to authenticated
  using ((select public.has_perm('pricing'))) with check ((select public.has_perm('pricing')));
drop policy if exists price_ranks_delete on public.price_ranks;
create policy price_ranks_delete on public.price_ranks for delete to authenticated using ((select public.has_perm('pricing')));

-- customers read their own prices through my_prices(); staff read all to quote
drop policy if exists rank_prices_select on public.rank_prices;
create policy rank_prices_select on public.rank_prices for select to authenticated using ((select public.is_staff_or_admin()));
drop policy if exists rank_prices_insert on public.rank_prices;
create policy rank_prices_insert on public.rank_prices for insert to authenticated with check ((select public.has_perm('pricing')));
drop policy if exists rank_prices_update on public.rank_prices;
create policy rank_prices_update on public.rank_prices for update to authenticated
  using ((select public.has_perm('pricing'))) with check ((select public.has_perm('pricing')));
drop policy if exists rank_prices_delete on public.rank_prices;
create policy rank_prices_delete on public.rank_prices for delete to authenticated using ((select public.has_perm('pricing')));

grant select on public.price_ranks to anon, authenticated;
grant insert, update, delete on public.price_ranks to authenticated;
grant select, insert, update, delete on public.rank_prices to authenticated;

-- Set a company's rank: "ราคาเฉพาะบริษัท" or "บริษัทลูกค้า" permission
create or replace function public.set_company_rank(p_company_id uuid, p_rank text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_perm('pricing') or public.has_perm('companies')) then
    raise exception 'ไม่มีสิทธิ์ตั้ง Rank ราคา' using errcode = '42501';
  end if;
  update public.companies set price_rank = nullif(trim(p_rank), '') where id = p_company_id;
  if not found then raise exception 'ไม่พบบริษัท'; end if;
end $$;
revoke execute on function public.set_company_rank(uuid, text) from public, anon;
grant execute on function public.set_company_rank(uuid, text) to authenticated;

-- Rank of any company: code, name, colour, logo and plus (= the company has its own prices too)
create or replace function public.company_rank_info(p_company_id uuid)
returns table (code text, name text, color text, logo_url text, plus boolean)
language sql stable security definer set search_path = ''
as $$
  select r.code, r.name, r.color, r.logo_url,
         exists (select 1 from public.company_prices cp where cp.company_id = c.id)
  from public.companies c
  join public.price_ranks r on r.code = c.price_rank and r.is_active
  where c.id = p_company_id
    and (c.id = public.my_company_id() or public.is_staff_or_admin())
$$;
revoke execute on function public.company_rank_info(uuid) from public, anon;
grant execute on function public.company_rank_info(uuid) to authenticated;

create or replace function public.my_price_rank()
returns table (code text, name text, color text, logo_url text, plus boolean)
language sql stable security definer set search_path = ''
as $$
  select * from public.company_rank_info(public.my_company_id())
$$;
revoke execute on function public.my_price_rank() from public, anon;
grant execute on function public.my_price_rank() to authenticated;

-- Company / rank price of SKUs for a company (null company → none). kind: company | rank
create or replace function public.company_price_list(p_company_id uuid, p_variant_ids uuid[])
returns table (variant_id uuid, price numeric, kind text)
language sql stable security definer set search_path = ''
as $$
  with c as (
    select co.id, r.code as rank, r.discount_pct
    from public.companies co
    left join public.price_ranks r on r.code = co.price_rank and r.is_active
    where co.id = p_company_id
  )
  select v.id,
         coalesce(cp.price, rp.price, case when c.discount_pct is not null and v.base_price is not null
                                           then round(v.base_price * (100 - c.discount_pct) / 100, 2) end),
         case when cp.price is not null then 'company' else 'rank' end
  from c
  join public.product_variants v on v.id = any (p_variant_ids)
  left join public.company_prices cp on cp.company_id = c.id and cp.variant_id = v.id
  left join public.rank_prices rp on rp.rank_code = c.rank and rp.variant_id = v.id
  where coalesce(cp.price, rp.price, case when c.discount_pct is not null and v.base_price is not null then 0 end) is not null
$$;
revoke execute on function public.company_price_list(uuid, uuid[]) from public, anon, authenticated;

-- The signed-in customer's own prices (approved company only)
create or replace function public.my_prices(p_variant_ids uuid[])
returns table (variant_id uuid, price numeric, kind text)
language sql stable security definer set search_path = ''
as $$
  select * from public.company_price_list(public.my_company_id(), p_variant_ids)
$$;
revoke execute on function public.my_prices(uuid[]) from public, anon;
grant execute on function public.my_prices(uuid[]) to authenticated;

-- Price snapshot for quotes / reservations
create or replace function public.effective_price(p_variant_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select case when coalesce((select v.show_price from public.product_variants v where v.id = p_variant_id), true) then
    coalesce(
      (select min(x) from (
         select pi.promo_price as x from public.promotion_items pi
           join public.promotions pr on pr.id = pi.promotion_id
          where pi.variant_id = p_variant_id and pr.is_published
            and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now())
         union all
         select v.special_price from public.product_variants v
          where v.id = p_variant_id and v.special_price is not null and (v.special_ends_at is null or v.special_ends_at > now())
       ) s),
      (select l.price from public.company_price_list(public.my_company_id(), array[p_variant_id]) l),
      (select v.base_price from public.product_variants v where v.id = p_variant_id)
    ) end
$$;
revoke execute on function public.effective_price(uuid) from public, anon;
grant execute on function public.effective_price(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Stock: status only for customers
-- ---------------------------------------------------------------------------
alter table public.stock_config alter column show_qty_to_users set default false;
update public.stock_config set show_qty_to_users = false where id = 1;

-- p_items: [{"sku": "...", "qty": n}] → full | partial | none | unknown, plus the stock date
create or replace function public.stock_fit(p_items jsonb)
returns table (sku text, fit text, synced_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with i as (
    select x ->> 'sku' as sku, greatest(coalesce((x ->> 'qty')::numeric, 1), 0) as qty
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    limit 200
  )
  select i.sku,
         case when sl.sku is null then 'unknown'
              when sl.available - coalesce(h.held, 0) >= i.qty then 'full'
              when sl.available - coalesce(h.held, 0) > 0 then 'partial'
              else 'none' end,
         sl.synced_at
  from i
  left join public.stock_levels sl on sl.sku = i.sku
  left join public.app_holds() h on h.sku = i.sku
$$;
revoke execute on function public.stock_fit(jsonb) from public;
grant execute on function public.stock_fit(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reservation lines keep the price the customer saw
-- ---------------------------------------------------------------------------
alter table public.reservation_items add column if not exists unit_price numeric(12, 2);

create or replace function public.reservation_item_price()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.unit_price is null and new.variant_id is not null then
    new.unit_price := public.effective_price(new.variant_id);
  end if;
  return new;
end $$;
drop trigger if exists reservation_item_price on public.reservation_items;
create trigger reservation_item_price before insert on public.reservation_items
  for each row execute function public.reservation_item_price();
revoke execute on function public.reservation_item_price() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Requests go to the company's sales
-- ---------------------------------------------------------------------------
alter table public.team_members
  add column if not exists user_id uuid references public.profiles (id) on delete set null;
comment on column public.team_members.user_id is 'บัญชีผู้ใช้ (Staff) ของพนักงานคนนี้ ใช้ส่งคำขอของลูกค้าให้เซลล์ที่ดูแล';
create unique index if not exists team_members_user_uidx on public.team_members (user_id) where user_id is not null;

-- link existing team members to staff logins with the same email
update public.team_members t set user_id = p.id
  from public.profiles p
 where t.user_id is null and t.email is not null and lower(p.email) = lower(trim(t.email))
   and p.role in ('staff', 'admin')
   and not exists (select 1 from public.team_members t2 where t2.user_id = p.id);

insert into public.permission_keys (key, label, description, sort, grp) values
  ('requests.all', 'คำขอจากลูกค้า: เห็นของลูกค้าทุกบริษัท', 'ไม่ติ๊ก = เห็นและอนุมัติเฉพาะลูกค้าของบริษัทที่ตัวเองเป็นเซลล์ดูแล', 30, 'sales')
on conflict (key) do nothing;
update public.permission_keys
   set label = 'คำขอจากลูกค้า: ตอบใบเสนอราคาและการจอง (ลูกค้าของตัวเอง)'
 where key = 'requests';

-- the signed-in staff is the sales of this company
create or replace function public.is_my_customer(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_company_id is not null and exists (
    select 1 from public.companies c
      join public.team_members t on t.id = c.sales_member_id
     where c.id = p_company_id and t.user_id = auth.uid())
$$;
revoke execute on function public.is_my_customer(uuid) from public, anon;
grant execute on function public.is_my_customer(uuid) to authenticated;

-- may answer (approve / quote / confirm) a request of this company
create or replace function public.can_handle_request(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.has_perm('requests.all') or (public.has_perm('requests') and public.is_my_customer(p_company_id))
$$;
revoke execute on function public.can_handle_request(uuid) from public, anon;
grant execute on function public.can_handle_request(uuid) to authenticated;

-- may see it: the above, plus warehouse staff who turn reservations into stock documents
create or replace function public.can_see_request(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_handle_request(p_company_id) or public.has_perm('stock.docs') or public.has_perm('stock.post')
$$;
revoke execute on function public.can_see_request(uuid) from public, anon;
grant execute on function public.can_see_request(uuid) to authenticated;

drop policy if exists quote_requests_select on public.quote_requests;
create policy quote_requests_select on public.quote_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.can_see_request(company_id));
drop policy if exists quote_items_select on public.quote_request_items;
create policy quote_items_select on public.quote_request_items for select to authenticated
  using (exists (select 1 from public.quote_requests q where q.id = quote_request_items.quote_id
                 and (q.user_id = (select auth.uid()) or public.can_see_request(q.company_id))));
drop policy if exists quote_requests_update on public.quote_requests;
create policy quote_requests_update on public.quote_requests for update to authenticated
  using (public.can_handle_request(company_id)) with check (public.can_handle_request(company_id));

drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using (user_id = (select auth.uid()) or public.can_see_request(company_id));
drop policy if exists reservation_items_select on public.reservation_items;
create policy reservation_items_select on public.reservation_items for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_items.reservation_id
                 and (r.user_id = (select auth.uid()) or public.can_see_request(r.company_id))));
drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations for update to authenticated
  using (public.can_handle_request(company_id)) with check (public.can_handle_request(company_id));
