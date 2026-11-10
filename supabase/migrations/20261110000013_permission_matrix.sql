-- One App SSC · per-page / per-function permissions for Staff (owner's request 2026-11-10:
-- ผู้ใช้และสิทธิ์ → กำหนดให้แต่ละคน แต่ละหัวข้อ เลือกฟังก์ชันได้ · เฉพาะ Admin เห็นรายละเอียดที่เลือก).
--   * permission_keys gets a group (grp) so the Users page shows a matrix: page → functions.
--   * New keys for pages that every Staff could open before. Every existing Staff is granted all new keys,
--     so nothing changes for anyone until an Admin unticks something.
--   * Admin always has every permission (has_perm). Staff read only their own rows; Admin reads all
--     (staff_permissions_select policy from phase 1 — unchanged).
--   * Enforced in the database here: deliveries (view / manage), stock (view), taking a claim (claims.handle).
--     Other new keys hide the page and its buttons in the app.

alter table public.permission_keys add column grp text not null default 'other';

update public.permission_keys set grp = 'service',  sort = 12, label = 'งานเคลม: แก้ผัง 5 ขั้น นำเข้า ตั้งค่า' where key = 'claims';
update public.permission_keys set grp = 'training', sort = 21, label = 'อบรม: สร้าง/แก้รอบอบรม เช็กอิน ใบประกาศ' where key = 'courses';
update public.permission_keys set grp = 'sales',    sort = 36, label = 'สินค้า โปรโมชั่น แพ็กเกจ' where key = 'products';
update public.permission_keys set grp = 'customers', sort = 41 where key = 'contact_messages';
update public.permission_keys set grp = 'web',      sort = 50 where key = 'site_content';
update public.permission_keys set grp = 'reports',  sort = 60 where key = 'reports';

insert into public.permission_keys (key, label, description, sort, grp) values
  ('claims.view',      'งานเคลม: ดูคิวงานเคลมทั้งหมด', 'เปิดหน้า งานบริการและเคลม ดูรายละเอียดเคลม', 10, 'service'),
  ('claims.handle',    'งานเคลม: รับเรื่อง เปลี่ยนสถานะ อัปโหลดใบเคลม', 'กดรับเรื่องและดูแลเคลมที่ตัวเองรับผิดชอบ (ปิดงานได้เฉพาะเคลมของตัวเอง)', 11, 'service'),
  ('training.view',    'อบรม: ดูหน้าอบรมและกิจกรรม', 'ดูรอบอบรมและรายชื่อผู้ลงทะเบียน', 20, 'training'),
  ('company_points',   'แต้มบริษัท: ดูและปรับแต้ม', 'เปิดหน้า แต้มบริษัท', 22, 'training'),
  ('rewards',          'คูปองและของรางวัล', 'เปิดหน้า คูปองและของรางวัล', 23, 'training'),
  ('requests',         'คำขอจากลูกค้า: ตอบใบเสนอราคาและการจอง', 'เปิดหน้า คำขอจากลูกค้า', 30, 'sales'),
  ('stock.view',       'สต๊อกสินค้า: ดูสต๊อก', 'เปิดหน้า สต๊อกสินค้า', 31, 'sales'),
  ('deliveries.view',  'ตารางส่งสินค้า: ดูปฏิทินและเอกสาร', 'เปิดหน้า ตารางส่งสินค้า', 32, 'sales'),
  ('deliveries.manage','ตารางส่งสินค้า: อัปโหลด แก้ไข เปลี่ยนสถานะ', 'ลบรายการได้เฉพาะ Admin', 33, 'sales'),
  ('pricing',          'ราคาเฉพาะบริษัท', 'เปิดหน้า ราคาเฉพาะบริษัท', 34, 'sales'),
  ('companies',        'บริษัทลูกค้า: ดูและอนุมัติผูกบริษัท', 'เปิดหน้า บริษัทลูกค้า', 40, 'customers')
on conflict (key) do nothing;

-- keep today's access: every current Staff gets the new keys
insert into public.staff_permissions (user_id, perm)
select p.id, k.key
  from public.profiles p
 cross join (values ('claims.view'), ('claims.handle'), ('training.view'), ('company_points'), ('rewards'), ('requests'),
                    ('stock.view'), ('deliveries.view'), ('deliveries.manage'), ('pricing'), ('companies')) k(key)
 where p.role = 'staff'
on conflict do nothing;

-- deliveries
drop policy deliveries_select on public.deliveries;
drop policy deliveries_insert on public.deliveries;
drop policy deliveries_update on public.deliveries;
drop policy delivery_items_select on public.delivery_items;
drop policy delivery_items_insert on public.delivery_items;
drop policy delivery_items_update on public.delivery_items;
drop policy delivery_items_delete on public.delivery_items;
create policy deliveries_select on public.deliveries for select to authenticated
  using (public.has_perm('deliveries.view') or public.has_perm('deliveries.manage'));
create policy deliveries_insert on public.deliveries for insert to authenticated with check (public.has_perm('deliveries.manage'));
create policy deliveries_update on public.deliveries for update to authenticated
  using (public.has_perm('deliveries.manage')) with check (public.has_perm('deliveries.manage'));
create policy delivery_items_select on public.delivery_items for select to authenticated
  using (public.has_perm('deliveries.view') or public.has_perm('deliveries.manage'));
create policy delivery_items_insert on public.delivery_items for insert to authenticated with check (public.has_perm('deliveries.manage'));
create policy delivery_items_update on public.delivery_items for update to authenticated
  using (public.has_perm('deliveries.manage')) with check (public.has_perm('deliveries.manage'));
create policy delivery_items_delete on public.delivery_items for delete to authenticated using (public.has_perm('deliveries.manage'));

drop policy delivery_files_select on storage.objects;
drop policy delivery_files_insert on storage.objects;
drop policy delivery_files_update on storage.objects;
create policy delivery_files_select on storage.objects for select to authenticated
  using (bucket_id = 'delivery-files' and (public.has_perm('deliveries.view') or public.has_perm('deliveries.manage')));
create policy delivery_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-files' and public.has_perm('deliveries.manage'));
create policy delivery_files_update on storage.objects for update to authenticated
  using (bucket_id = 'delivery-files' and public.has_perm('deliveries.manage'));

-- stock (staff read)
drop policy stock_config_select on public.stock_config;
drop policy stock_syncs_select on public.stock_syncs;
drop policy stock_levels_select on public.stock_levels;
drop policy stock_backorders_select on public.stock_backorders;
create policy stock_config_select on public.stock_config for select to authenticated using (public.has_perm('stock.view'));
create policy stock_syncs_select on public.stock_syncs for select to authenticated using (public.has_perm('stock.view'));
create policy stock_levels_select on public.stock_levels for select to authenticated using (public.has_perm('stock.view'));
create policy stock_backorders_select on public.stock_backorders for select to authenticated using (public.has_perm('stock.view'));

-- taking a claim needs claims.handle (or the board permission)
create or replace function public.take_claim(p_claim uuid)
returns public.claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.claims;
begin
  if not (public.has_perm('claims.handle') or public.has_perm('claims')) then
    raise exception 'ไม่มีสิทธิ์รับเรื่องเคลม กรุณาขอสิทธิ์จาก Admin' using errcode = '42501';
  end if;
  select * into v_c from public.claims c where c.id = p_claim for update;
  if v_c.id is null then raise exception 'ไม่พบเคลมนี้'; end if;
  if v_c.assigned_to is not null and v_c.assigned_to <> auth.uid() and not public.has_perm('claims') then
    raise exception 'เคลมนี้มีผู้รับผิดชอบแล้ว';
  end if;
  update public.claims c set assigned_to = auth.uid() where c.id = p_claim returning * into v_c;
  return v_c;
end $$;
