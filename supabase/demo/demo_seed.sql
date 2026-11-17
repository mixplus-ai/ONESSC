-- ============================================================================
-- One App SSC · ข้อมูลสาธิต (DEMO ONLY)
-- ใช้กับโปรเจกต์ Supabase สาธิตที่สร้างใหม่เท่านั้น ห้ามรันบนระบบจริง
-- สคริปต์จะหยุดเองถ้าพบบัญชีผู้ใช้ที่ไม่ใช่บัญชีสาธิต (@ssc-demo.test)
-- ทุกบัญชีสาธิตใช้รหัสผ่าน: Demo1234
-- วันที่ทั้งหมดอิงจาก "วันนี้" ตอนที่รันสคริปต์ จึงดูสดใหม่เสมอ
-- ============================================================================
set search_path = public, extensions;

do $guard$
begin
  if exists (select 1 from auth.users where email not like '%@ssc-demo.test') then
    raise exception 'หยุด: ฐานข้อมูลนี้มีบัญชีผู้ใช้จริงอยู่ สคริปต์สาธิตใช้ได้กับโปรเจกต์สาธิตที่สร้างใหม่เท่านั้น';
  end if;
  if exists (select 1 from auth.users where email like '%@ssc-demo.test') then
    raise exception 'หยุด: มีข้อมูลสาธิตอยู่แล้ว ถ้าต้องการเริ่มใหม่ ให้สร้างโปรเจกต์สาธิตใหม่แล้วรันอีกครั้ง';
  end if;
end $guard$;

-- ---------------------------------------------------------------------------
-- helpers (temporary, disappear when the session ends)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.uid(p_email text) returns uuid language sql stable as
$$ select id from auth.users where email = p_email || '@ssc-demo.test' $$;

create or replace function pg_temp.act(p_email text) returns void language plpgsql as $$
declare v uuid := pg_temp.uid(p_email);
begin
  if p_email is not null and v is null then raise exception 'no demo user %', p_email; end if;
  perform set_config('request.jwt.claim.sub', coalesce(v::text, ''), false);
  perform set_config('request.jwt.claims', case when v is null then '' else json_build_object('sub', v, 'role', 'authenticated')::text end, false);
end $$;

create or replace function pg_temp.co(p_tax text) returns uuid language sql stable as
$$ select id from public.companies where tax_id = p_tax $$;

create or replace function pg_temp.vid(p_sku text) returns uuid language sql stable as
$$ select id from public.product_variants where sku = p_sku $$;

create or replace function pg_temp.wh(p_code text) returns uuid language sql stable as
$$ select id from public.warehouses where code = p_code $$;

create or replace function pg_temp.brand(p_slug text) returns uuid language sql stable as
$$ select id from public.brands where slug = p_slug $$;

-- n serials of a SKU currently in stock in a warehouse, as document items
create or replace function pg_temp.pick(p_sku text, p_n int, p_wh text default 'BGL4', p_extra jsonb default '{}') returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('sku', s.sku, 'sn', s.sn, 'description', s.description) || p_extra), '[]'::jsonb)
    from (select * from public.serials
           where sku = p_sku and status = 'in_stock' and condition = 'good' and warehouse_id = pg_temp.wh(p_wh)
           order by first_in_at, sn limit p_n) s
$$;

-- new serials for receiving documents
create or replace function pg_temp.gen(p_sku text, p_prefix text, p_from int, p_n int, p_desc text default null) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('sku', p_sku, 'description', p_desc,
                   'sn', p_prefix || lpad(g::text, 6, '0') || '-' || upper(substr(md5(p_prefix || g), 1, 2))) order by g)
    from generate_series(p_from, p_from + p_n - 1) g
$$;

-- save + (optionally) post a stock document as the given users
create or replace function pg_temp.doc(p_clerk text, p_approver text, p_doc jsonb, p_items jsonb, p_post boolean default true) returns uuid language plpgsql as $$
declare d public.stock_docs;
begin
  perform pg_temp.act(p_clerk);
  d := public.save_stock_doc(null, p_doc || jsonb_build_object('warehouse_id', coalesce(p_doc ->> 'warehouse_id', pg_temp.wh('BGL4')::text)), p_items);
  if p_post then
    perform pg_temp.act(p_approver);
    d := public.post_stock_doc(d.id);
    update public.stock_docs set posted_at = (d.doc_date + time '15:30') at time zone 'Asia/Bangkok',
                                 created_at = (d.doc_date + time '10:15') at time zone 'Asia/Bangkok'
     where id = d.id;
  end if;
  return d.id;
end $$;

-- ---------------------------------------------------------------------------
-- 1. ผู้ใช้สาธิต (Admin / Staff / ลูกค้า)  รหัสผ่านทุกบัญชี: Demo1234
-- ---------------------------------------------------------------------------
create temp table demo_users (login text primary key, full_name text, phone text, role text, dept text, perms text[], position text, tax_id text);
insert into demo_users values
  ('admin',      'คุณอรวรรณ ผู้ดูแลระบบ',    '081-000-0001', 'admin', 'other',        '{}', 'ผู้จัดการระบบ', null),
  ('sales',      'คุณธนพล ขายเก่ง',           '081-000-0002', 'staff', 'sales',        '{requests,pricing,company_points,companies,stock.view,deliveries.view,reports,rewards,products}', 'Sales Manager', null),
  ('service',    'คุณวิศรุต ช่างเทคนิค',       '081-000-0003', 'staff', 'service',      '{claims.view,claims.handle,claims,stock.view,reports}', 'Service Engineer', null),
  ('service2',   'คุณกมลชนก ดูแลเคลม',        '081-000-0004', 'staff', 'service',      '{claims.view,claims.handle}', 'Service Coordinator', null),
  ('stock',      'คุณสมศักดิ์ คลังสินค้า',     '081-000-0005', 'staff', 'coordination', '{stock.view,stock.docs,stock.count,deliveries.view,deliveries.manage}', 'เจ้าหน้าที่คลัง', null),
  ('approver',   'คุณนภาพร อนุมัติคลัง',       '081-000-0006', 'staff', 'coordination', '{stock.view,stock.docs,stock.post,stock.check,stock.count,deliveries.view}', 'หัวหน้าคลัง', null),
  ('training',   'คุณปิยะนุช ฝ่ายอบรม',        '081-000-0007', 'staff', 'other',        '{training.view,courses,rewards,contact_messages,site_content}', 'Training Coordinator', null),
  -- ลูกค้า
  ('somchai',    'สมชาย ใจดี',               '089-111-2001', 'user', 'other', '{}', 'วิศวกรโครงการ',  '0105561000011'),
  ('wanida',     'วนิดา ศรีสุข',              '089-111-2002', 'user', 'other', '{}', 'ฝ่ายจัดซื้อ',     '0105561000011'),
  ('prasert',    'ประเสริฐ มั่นคง',           '089-111-2003', 'user', 'other', '{}', 'กรรมการผู้จัดการ', '0105559000022'),
  ('kanokwan',   'กนกวรรณ แสงทอง',           '089-111-2004', 'user', 'other', '{}', 'วิศวกรไฟฟ้า',     '0105559000022'),
  ('anan',       'อนันต์ พลังงาน',            '089-111-2005', 'user', 'other', '{}', 'หัวหน้าช่าง',     '0103562000033'),
  ('jirapat',    'จิรภัทร รุ่งเรือง',          '089-111-2006', 'user', 'other', '{}', 'เจ้าของกิจการ',   '0105564000044'),
  ('thitima',    'ฐิติมา บุญมา',              '089-111-2007', 'user', 'other', '{}', 'ฝ่ายบัญชี',       '0105564000044'),
  ('nattapong',  'ณัฐพงศ์ วงศ์สว่าง',          '089-111-2008', 'user', 'other', '{}', 'ผู้จัดการโครงการ', '0105565000055'),
  ('suda',       'สุดา ทองดี',                '089-111-2009', 'user', 'other', '{}', 'ช่างติดตั้ง',     '0105565000055'),
  ('chaiwat',    'ชัยวัฒน์ เพิ่มพูน',          '089-111-2010', 'user', 'other', '{}', 'วิศวกร',          '0105566000066'),  -- รออนุมัติผูกบริษัท
  ('mali',       'มาลี ดวงดี',                '089-111-2011', 'user', 'other', '{}', 'นักศึกษาฝึกงาน',  null),             -- ไม่มีบริษัท
  ('kittisak',   'กิตติศักดิ์ ชำนาญ',          '089-111-2012', 'user', 'other', '{}', 'ช่างอิสระ',       null);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       u.login || '@ssc-demo.test', crypt('Demo1234', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name, 'phone', u.phone, 'pdpa_consent', 'true'),
       now() - interval '150 days', now(), '', '', '', ''
  from demo_users u;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), au.id, au.id::text, jsonb_build_object('sub', au.id::text, 'email', au.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users au where au.email like '%@ssc-demo.test';

update public.profiles p set position = u.position, line_id = '@' || u.login, created_at = now() - interval '150 days'
  from demo_users u where p.email = u.login || '@ssc-demo.test';

-- ---------------------------------------------------------------------------
-- 2. ตั้งค่าระบบ เนื้อหาหน้าเว็บ
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value) values
('company', $j${"email":"info@ssc-demo.test","phone":"02-000-0000","address":"บริษัท สยาม โซล่าร์ เซลล์ จำกัด ( สำนักงานใหญ่ )\n1999/24 หมู่บ้าน ดิสทริคศรีวรา ปัญจมิตร ถ. อินทราภรณ์ แขวงพลับพลา เขตวังทองหลาง กรุงเทพมหานคร 10310","name_en":"SSC","name_th":"SSC","tagline":"พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ","logo_url":"","locations":[{"id":"main","map":"https://maps.app.goo.gl/Lnei3VLWySst1v1b9","name":"บริษัท สยาม โซล่าร์ เซลล์ จำกัด (สำนักงานใหญ่)","note":"","email":"","hours":"จันทร์–ศุกร์ 09:00–17:00","phone":"02-000-0000","address":"1999/24 หมู่บ้าน ดิสทริคศรีวรา ปัญจมิตร ถ. อินทราภรณ์ แขวงพลับพลา เขตวังทองหลาง กรุงเทพมหานคร 10310","contact_name":""},{"id":"dc","map":"https://maps.app.goo.gl/B58zZx1AXKV8zWEM6","name":"บริษัท สยาม โซล่าร์ เซลล์ จำกัด (ศูนย์กระจายสินค้า)","note":"","email":"","hours":"จันทร์–เสาร์ 08:30–17:00","phone":"02-000-0001","address":"เลขที่ 48/2 หมู่ที่ 4 ถ. ลำลูกกา ตำบล ลำลูกกา อำเภอลำลูกกา ปทุมธานี 12150","contact_name":""}],"line_oa_url":"https://lin.ee/w8rXmRU","facebook_url":"https://www.facebook.com/SiamSolarCellShop","office_hours":"จันทร์–ศุกร์ 09:00–17:00","map_embed_url":"https://maps.app.goo.gl/Lnei3VLWySst1v1b9"}$j$),
('hero', $j${"title":"อุปกรณ์โซลาร์ของแท้ จากตัวแทนจำหน่ายโดยตรง","subtitle":"สินค้า งานอบรม และงานบริการหลังการขาย รวมไว้ในที่เดียว","image_url":"","cta_primary_href":"/products","cta_primary_label":"ดูสินค้า","cta_secondary_href":"/contact?topic=quotation","cta_secondary_label":"ขอใบเสนอราคา"}$j$),
('about', $j${"brands":["SolarEdge","KSTAR","Sunwoda","TCL","SolarPPM","LeaptonSolar","Longi"],"vision":"ทำให้พลังงานสะอาดเข้าถึงง่าย ด้วยอุปกรณ์คุณภาพและบริการที่ไว้ใจได้","history":"SSC เป็นผู้นำเข้าและตัวแทนจำหน่ายอุปกรณ์ระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ พร้อมทีมวิศวกรที่ให้คำปรึกษา อบรม และดูแลงานเคลมหลังการขาย","certificates":[]}$j$),
('ads', $j${"banners":[],"announcement":{"href":"/login","text":"ระบบสาธิต · ข้อมูลทั้งหมดเป็นข้อมูลตัวอย่าง เข้าสู่ระบบด้วยบัญชี @ssc-demo.test รหัสผ่าน Demo1234","active":true}}$j$),
('home', $j${"badge":"ตัวแทนจำหน่ายอุปกรณ์โซลาร์","sections":[{"id":"hero","anim":"fade-up","type":"hero","align":"left","badge":"ตัวแทนจำหน่ายอุปกรณ์โซลาร์","title":"อุปกรณ์โซลาร์ของแท้ จากตัวแทนจำหน่ายโดยตรง","height":"large","slides":[{"image_url":"","video_url":""}],"buttons":[{"href":"/products","label":"ดูสินค้า"},{"href":"/contact?topic=quotation","label":"ขอใบเสนอราคา"}],"overlay":60,"subtitle":"สินค้า งานอบรม และงานบริการหลังการขาย รวมไว้ในที่เดียว","show_brands":true},{"id":"modules","anim":"fade-up","type":"modules","items":[{"href":"/products","icon":"box","text":"แคตตาล็อกอุปกรณ์ ราคา แพคเกจ และขอใบเสนอราคาออนไลน์","title":"สินค้าและโปรโมชั่น"},{"href":"/training","icon":"academic","text":"จองรอบอบรม รับใบประกาศ และสะสมแต้มแลกของรางวัล","title":"อบรมและกิจกรรม"},{"href":"/claims","icon":"wrench","text":"แจ้งเคลมสินค้าและติดตามสถานะได้จากบัญชีของคุณ","title":"งานบริการและเคลม"},{"href":"/register","icon":"shield","text":"ล็อกอินครั้งเดียว เห็นการจอง แต้ม และเคลมของคุณและบริษัท","title":"บัญชีเดียวใช้ได้ทุกส่วน"}]},{"id":"ad-top","type":"ad","placement":"home_top"},{"bg":"light","id":"video","anim":"zoom","type":"video","title":"วิดีโอแนะนำบริษัท","eyebrow":"SolarEdge","autoplay":true,"subtitle":"","video_url":"https://www.youtube.com/watch?v=-Bsq7umcffg&t=5s","poster_url":""},{"id":"about","anim":"fade-up","type":"about","limit":0,"title":"พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ","eyebrow":"เกี่ยวกับเรา","subtitle":""},{"bg":"white","id":"products","anim":"fade-up","type":"products","limit":3,"title":"สินค้าแนะนำและโปรโมชั่น","eyebrow":"","subtitle":"ดูสินค้า ราคา สต๊อก และโปรโมชั่นล่าสุด พร้อมขอใบเสนอราคาออนไลน์"},{"id":"ad-middle","type":"ad","placement":"home_middle"},{"id":"portfolio","anim":"fade-up","type":"portfolio","limit":6,"title":"โครงการที่เราติดตั้ง","eyebrow":"ผลงาน","subtitle":"ตัวอย่างงานบ้านพักอาศัย โรงงาน และอาคารพาณิชย์"},{"bg":"white","id":"team","anim":"fade-up","type":"team","limit":6,"title":"ติดต่อพนักงานได้โดยตรง","eyebrow":"ทีมงาน","subtitle":"ฝ่ายขาย ฝ่ายบริการ และฝ่ายประสานงาน พร้อมช่วยเหลือคุณ"},{"id":"contact","anim":"fade-up","type":"contact","limit":0,"title":"","eyebrow":"ติดต่อเรา","subtitle":""}]}$j$),
('pages', $j${"team":{"title":"ติดต่อพนักงาน","eyebrow":"ทีมงาน","subtitle":"เลือกติดต่อทีมที่ตรงกับเรื่องของคุณได้โดยตรง","image_url":""},"about":{"title":"","eyebrow":"เกี่ยวกับเรา","subtitle":"","image_url":""},"claims":{"title":"แจ้งเคลมสินค้า","eyebrow":"","subtitle":"แจ้งเคลมสินค้าทุกแบรนด์ของบริษัทออนไลน์ แล้วติดตามสถานะได้จากแดชบอร์ดของคุณ ไม่ต้องโทรถาม","image_url":""},"contact":{"title":"ติดต่อบริษัท","eyebrow":"ติดต่อเรา","subtitle":"ส่งข้อความถึงทีมงาน หรือติดต่อผ่านช่องทางด้านล่าง","image_url":""},"products":{"title":"สินค้า","eyebrow":"","subtitle":"ราคาและสต๊อกอัปเดตจากระบบคลังสินค้า เข้าสู่ระบบเพื่อดูราคาเฉพาะบริษัทของคุณ","image_url":""},"training":{"title":"ปฏิทินอบรม","eyebrow":"อบรมและกิจกรรม","subtitle":"เลือกหลักสูตรและรอบที่สะดวก จองได้ทันทีด้วยบัญชี One App เข้าอบรมรับแต้มสะสมชั่วโมงละ 1 แต้ม และรับใบประกาศหลังทำแบบประเมิน","image_url":""},"portfolio":{"title":"โครงการที่เราติดตั้ง","eyebrow":"ผลงาน","subtitle":"","image_url":""},"promotions":{"title":"โปรโมชั่นและแพ็กเกจ","eyebrow":"","subtitle":"ราคาโปรโมชั่นเป็นราคาเดียวกันสำหรับลูกค้าทุกคน","image_url":""}}$j$)
on conflict (key) do update set value = excluded.value, updated_at = now();

update public.training_settings set
  pay_info = 'ธนาคารตัวอย่าง เลขที่ 000-0-00000-0 ชื่อบัญชี บจก. ตัวอย่าง (บัญชีสาธิต)',
  wht_payee_info = 'บริษัท ตัวอย่าง จำกัด (สำนักงานใหญ่) เลขประจำตัวผู้เสียภาษี 0000000000000 (ข้อมูลสาธิต)',
  sales_list = '{"คุณธนพล","คุณอรอุมา","คุณภาคิน"}', source_list = '{"Facebook","LINE OA","เพื่อนแนะนำ","Sales"}',
  email_enabled = false
 where id = 1;
update public.claim_settings set email_enabled = false,
  ship_bank_info = 'ธนาคารตัวอย่าง สาขาลำลูกกา เลขที่ 000-0-00000-0 ชื่อบัญชี บจก. ตัวอย่าง (บัญชีสาธิต)',
  form_note = 'ระบบสาธิต: ลองแจ้งเคลมได้ตามสบาย ข้อมูลไม่ถูกส่งไปที่ใด'
 where id = 1;
update public.points_config set points_per_hour = 1, rewards_enabled = true, lucky_cost = 10,
  company_baht_per_point = 1000, company_tiers = '[{"min":0,"multiplier":1},{"min":500000,"multiplier":1.2},{"min":2000000,"multiplier":1.5}]'
 where id = 1;

-- รุ่นสินค้าสำหรับฟอร์มเคลม
insert into public.claim_models (product_type, brand_id, model, sort)
select t, pg_temp.brand('solaredge'), m, o from (values
 ('optimizer','P370'),('accessory','SE1000-SEN-IRR-S1'),('inverter','SE5000H-THR00BNN4'),('accessory','SE1000-SEN-TAMB-S2'),
 ('optimizer','P500'),('inverter','SE10K-TH0TEBNN4'),('optimizer','P601'),('inverter','SE27.6K-TH000BND4'),
 ('optimizer','P730'),('inverter','SE30K-THR0IBNZ4'),('inverter','SE33.3K-TH00IBND4'),('optimizer','P850'),
 ('inverter','SE82.8K-TH0P0BNU4'),('optimizer','P950'),('optimizer','P1100'),('optimizer','S1200'),
 ('inverter','SE100K-TH00IBNC4'),('optimizer','S1400'),('optimizer','S1500'),('optimizer','S650B'),
 ('inverter','SE10K-RWB48BFN4'),('battery','BAT-10K1PSOB-12'),('accessory','SE1000-CCG-G-S1'),('accessory','SE-MTR-3Y-400V-A')
) v(t, m) cross join lateral (select row_number() over () as o) x
on conflict do nothing;
insert into public.claim_models (product_type, brand_id, model, sort) values
 ('inverter', pg_temp.brand('kstar'), 'BLUE-10KT-M1', 100), ('inverter', pg_temp.brand('kstar'), 'BLUE-G 5000D', 101),
 ('panel', pg_temp.brand('leapton'), 'LP210-210-M-66-NB-710W', 110), ('battery', pg_temp.brand('sunwoda'), 'ATRIX MAX-16L-P', 120)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. ราคา การรับประกัน โปรโมชั่น แพ็กเกจ
-- ---------------------------------------------------------------------------
update public.product_variants v set base_price = x.price, warranty_months = x.wm, perf_warranty_months = x.pm
  from (values
   ('SE5000H-THR00BNN4', 38900, 144, null), ('SE5000H-TH000BNN4', 37900, 144, null), ('SE5000H-RW000BNN4', 36900, 144, null),
   ('SE5000H-THSNBBX14', 52900, 144, null), ('SE10K-TH0TEBNN4', 62500, 144, null), ('SE10K-RWB48BFN4', 89000, 144, null),
   ('SE33.3K-TH00IBND4', 118000, 144, null), ('SE33.3K-THR0IBNA4', 121000, 144, null), ('SE66.6K-RW00IBNE4', 215000, 144, null),
   ('SE100K-TH00IBNC4', 289000, 144, null), ('SE100K-RW0P0BNU4', 279000, 144, null), ('SE100K-TH0P0BNU4', 285000, 144, null),
   ('S650B-1GM4MBM', 2350, 300, null), ('S1200-1GM4MBV', 2890, 300, null), ('S1200-1GM4MBV-1', 2890, 300, null),
   ('S1400-1GM4MBV', 3150, 300, null), ('S1500-1GM4MBV', 3390, 300, null), ('P1100-4RM4MBT', 3250, 300, null),
   ('BAT-05K48M0B-02', 98000, 120, null), ('BAT-10K1PSOB-12', 189000, 120, null),
   ('BI-NAUGN-01', 24500, 120, null), ('BI-NEUNU-3P-01', 39800, 120, null), ('ONE-CLCI-RWWB0-P', 12900, 60, null),
   ('SE1000-CCG-G-S1', 15900, 60, null), ('SE1000-CCG-F-S1', 18900, 60, null),
   ('BLUE-10KT-M1', 42000, 120, null), ('BLUE-20KT-M1', 69000, 120, null), ('BLUE-G 5000D', 21900, 120, null),
   ('BLUE-S 10KT', 45500, 120, null), ('BLUE-S-5000D', 24900, 120, null),
   ('LP182-210-M-66-NB 620W', 3590, 180, 360), ('LP182X210-M-66Q-NB-650W', 3790, 180, 360),
   ('LP210-210-M-66-NB-700W', 3990, 180, 360), ('LP210-210-M-66-NB-710W', 4050, 180, 360), ('LP210-210-M-66-NB-715W', 4090, 180, 360),
   ('LR8-66HVD-650M', 3890, 180, 360),
   ('SPPM-MG12-GG 600W', 3290, 144, 300), ('SPPM-MG12-GG 600W-1', 3290, 144, 300), ('SPPM-MG12-GG 600W-640', 3490, 144, 300), ('SPPM-MG12-GG 600W-650', 3550, 144, 300),
   ('ATRIX MAX-16L-P', 165000, 120, null)
  ) x(sku, price, wm, pm)
 where v.sku = x.sku;
update public.product_variants set special_price = round(base_price * 0.92), special_ends_at = now() + interval '20 days'
 where sku in ('SE10K-TH0TEBNN4', 'S1200-1GM4MBV');
update public.products set is_published = true where is_published = false;
update public.products set is_featured = true
 where id in (select product_id from public.product_variants where sku in ('SE5000H-THR00BNN4', 'SE10K-RWB48BFN4', 'BAT-10K1PSOB-12', 'LP210-210-M-66-NB-710W'));

insert into public.promotions (title, description, starts_at, ends_at, is_published, sort) values
 ('โปรปลายปี SolarEdge Home', 'อินเวอร์เตอร์ SolarEdge Home ราคาพิเศษ พร้อม Optimizer ถึงสิ้นเดือนหน้า', now() - interval '5 days', now() + interval '40 days', true, 1),
 ('แผง Leapton 710W ราคาส่ง', 'ซื้อแผงตั้งแต่ 1 พาเลทขึ้นไป รับราคาโปรโมชั่นทันที', now() - interval '2 days', now() + interval '25 days', true, 2);
insert into public.promotion_items (promotion_id, variant_id, promo_price)
select (select id from public.promotions where sort = 1), pg_temp.vid(s), p from (values ('SE5000H-THR00BNN4', 35500), ('SE10K-RWB48BFN4', 82900), ('S1200-1GM4MBV', 2650)) x(s, p)
union all
select (select id from public.promotions where sort = 2), pg_temp.vid('LP210-210-M-66-NB-710W'), 3790;

insert into public.packages (name, slug, code, summary, description, price, is_published, sort, starts_at, ends_at) values
 ('ชุดบ้าน 5 kW SolarEdge', 'home-5kw-solaredge', 'PKG-5K', 'อินเวอร์เตอร์ 5kW + Optimizer 9 ตัว + แผง 710W 9 แผง',
  'ชุดพร้อมติดตั้งสำหรับบ้านพักอาศัย ระบบ 1 เฟส ผลิตไฟได้ประมาณ 600–650 หน่วย/เดือน', 139000, true, 1, now() - interval '10 days', now() + interval '60 days'),
 ('ชุดโรงงาน 33 kW', 'factory-33kw', 'PKG-33K', 'อินเวอร์เตอร์ 33.3kW + Optimizer 24 ตัว + แผง 710W 48 แผง',
  'ชุดสำหรับโรงงานขนาดเล็ก/อาคารพาณิชย์ ระบบ 3 เฟส', 489000, true, 2, now() - interval '10 days', now() + interval '60 days'),
 ('ชุด Home Hub + แบตเตอรี่ 10 kWh', 'hybrid-10kwh', 'PKG-HYB10', 'Home Hub SE10K + แบตเตอรี่ 10kWh + Backup Interface',
  'เก็บไฟใช้กลางคืน และสำรองไฟเมื่อไฟดับ', 289000, true, 3, null, null);
insert into public.package_items (package_id, variant_id, qty, sort)
select (select id from public.packages where code = c), pg_temp.vid(s), q, o from (values
 ('PKG-5K', 'SE5000H-THR00BNN4', 1, 1), ('PKG-5K', 'S1200-1GM4MBV', 5, 2), ('PKG-5K', 'LP210-210-M-66-NB-710W', 9, 3),
 ('PKG-33K', 'SE33.3K-TH00IBND4', 1, 1), ('PKG-33K', 'S1200-1GM4MBV', 24, 2), ('PKG-33K', 'LP210-210-M-66-NB-710W', 48, 3),
 ('PKG-HYB10', 'SE10K-RWB48BFN4', 1, 1), ('PKG-HYB10', 'BAT-10K1PSOB-12', 1, 2), ('PKG-HYB10', 'BI-NAUGN-01', 1, 3)) x(c, s, q, o);

-- ---------------------------------------------------------------------------
-- 4. บริษัทลูกค้า การผูกบัญชี สิทธิ์พนักงาน
-- ---------------------------------------------------------------------------
insert into public.companies (tax_id, name, branch, address, phone, note, created_at) values
 ('0105561000011', 'บริษัท สมาร์ท โซลาร์ เอ็นจิเนียริ่ง จำกัด', 'สำนักงานใหญ่', '88/9 ถ.พหลโยธิน แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900', '02-111-1001', 'ลูกค้า EPC รายใหญ่ (ข้อมูลสาธิต)', now() - interval '140 days'),
 ('0105559000022', 'บริษัท กรีนเพาเวอร์ ซิสเต็ม จำกัด', 'สำนักงานใหญ่', '12 ถ.บางนา-ตราด กม.5 อ.บางพลี จ.สมุทรปราการ 10540', '02-111-1002', 'เน้นงานโรงงาน', now() - interval '130 days'),
 ('0103562000033', 'ห้างหุ้นส่วนจำกัด ซันไรส์ อินสตอลเลชั่น', 'สำนักงานใหญ่', '45 ม.3 ต.หนองปลาไหล อ.บางละมุง จ.ชลบุรี 20150', '038-111-003', 'ช่างติดตั้งภาคตะวันออก', now() - interval '120 days'),
 ('0105564000044', 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', 'สาขาเชียงใหม่', '199 ถ.ซุปเปอร์ไฮเวย์ ต.ฟ้าฮ่าม อ.เมือง จ.เชียงใหม่ 50000', '053-111-004', null, now() - interval '100 days'),
 ('0105565000055', 'บริษัท บ้านแดด จำกัด', 'สำนักงานใหญ่', '7/7 ถ.ราชพฤกษ์ อ.เมือง จ.นนทบุรี 11000', '02-111-1005', 'งานบ้านพักอาศัย', now() - interval '80 days');
update public.companies c set sales_member_id = (select id from public.team_members where department = 'sales' order by sort limit 1 offset (abs(hashtext(c.tax_id)) % 3)),
                              support_member_id = (select id from public.team_members where department in ('service', 'coordination') order by sort limit 1);

-- ลูกค้ากรอกเลขผู้เสียภาษีในโปรไฟล์ (ยกเว้นคนที่ไม่มีบริษัท)
update public.profiles p set tax_id = u.tax_id, company_name = (select name from public.companies c where c.tax_id = u.tax_id),
       company_status = 'pending',
       billing = jsonb_build_object('type', 'company', 'name', (select name from public.companies c where c.tax_id = u.tax_id), 'tax_id', u.tax_id,
                                    'branch', 'สำนักงานใหญ่', 'address', (select address from public.companies c where c.tax_id = u.tax_id))
  from demo_users u where p.email = u.login || '@ssc-demo.test' and u.tax_id is not null;
update public.profiles set company_name = 'บริษัท เอส.พี. โซลาร์เทค จำกัด' where email = 'chaiwat@ssc-demo.test';

update public.profiles set role = 'admin' where email = 'admin@ssc-demo.test';
do $$
declare r record;
begin
  perform pg_temp.act('admin');
  for r in select * from demo_users where role <> 'user' loop
    perform public.admin_set_user_access(pg_temp.uid(r.login), r.role::public.app_role, r.dept, true, r.perms);
  end loop;
  perform pg_temp.act('sales');
  for r in select * from demo_users where role = 'user' and tax_id is not null and login <> 'chaiwat' loop
    perform public.review_company_link(pg_temp.uid(r.login), true, null);
  end loop;
end $$;
update public.profiles set company_reviewed_at = now() - interval '120 days' where company_status = 'approved';

-- ราคาเฉพาะบริษัท
insert into public.company_prices (company_id, variant_id, price, note)
select pg_temp.co('0105561000011'), pg_temp.vid(s), p, 'ราคาโครงการ Q4' from (values
 ('SE5000H-THR00BNN4', 34900), ('SE10K-TH0TEBNN4', 56900), ('SE33.3K-TH00IBND4', 106000), ('S1200-1GM4MBV', 2490), ('LP210-210-M-66-NB-710W', 3690)) x(s, p)
union all
select pg_temp.co('0105559000022'), pg_temp.vid(s), p, 'ราคาลูกค้าโรงงาน' from (values
 ('SE100K-TH00IBNC4', 262000), ('SE33.3K-TH00IBND4', 108500), ('S1400-1GM4MBV', 2790)) x(s, p);

-- ---------------------------------------------------------------------------
-- 5. คลังสินค้า: เอกสารรับเข้า/จ่ายออกตาม SN
-- ---------------------------------------------------------------------------
insert into public.warehouses (code, name, sort) values ('BKK', 'คลังสำนักงานใหญ่ วังทองหลาง', 2) on conflict do nothing;
update public.stock_config set low_threshold = 5, show_qty_to_users = true, reservation_days = 7 where id = 1;
do $$ begin
  perform pg_temp.act('admin');
  perform public.set_stock_source('docs', current_date - 120);
  perform public.set_stock_check_types('{WO}');
end $$;

do $$
declare
  d0 date := current_date;
  ob jsonb;
  so uuid; br uuid; v uuid;
begin
  -- ใบยอดยกมา (OB) วันเริ่มใช้ระบบ
  ob := pg_temp.gen('SE5000H-THR00BNN4', '7E1', 1, 14, 'SolarEdge SE5000H Inverter')
     || pg_temp.gen('SE10K-TH0TEBNN4', '7E2', 1, 10, 'SolarEdge SE10K Inverter')
     || pg_temp.gen('SE10K-RWB48BFN4', '7E3', 1, 6, 'SolarEdge Home Hub SE10K')
     || pg_temp.gen('SE33.3K-TH00IBND4', '7E4', 1, 6, 'SolarEdge SE33.3K Inverter')
     || pg_temp.gen('SE100K-TH00IBNC4', '7E5', 1, 3, 'SolarEdge SE100K Inverter')
     || pg_temp.gen('S1200-1GM4MBV', '2A1', 1, 60, 'Power Optimizer S1200')
     || pg_temp.gen('S650B-1GM4MBM', '2A2', 1, 40, 'Power Optimizer S650B')
     || pg_temp.gen('P1100-4RM4MBT', '2A3', 1, 30, 'Power Optimizer P1100')
     || pg_temp.gen('BAT-10K1PSOB-12', '8B1', 1, 6, 'SolarEdge Home Battery 10kWh')
     || pg_temp.gen('BI-NAUGN-01', '8C1', 1, 5, 'Backup Interface 1P')
     || pg_temp.gen('SE1000-CCG-G-S1', '8D1', 1, 8, 'Control & Communication Gateway')
     || pg_temp.gen('BLUE-10KT-M1', 'KS1', 1, 8, 'KSTAR BluE-10KT-M1')
     || pg_temp.gen('BLUE-G 5000D', 'KS2', 1, 8, 'KSTAR BluE-G 5000D')
     || pg_temp.gen('ATRIX MAX-16L-P', 'SW1', 1, 4, 'Sunwoda Atrix max 16L')
     || pg_temp.gen('LP210-210-M-66-NB-710W', 'LP7', 1, 60, 'Leapton 710W');
  perform pg_temp.doc('admin', 'admin', jsonb_build_object('doc_type', 'OB', 'doc_date', d0 - 120, 'note', 'ยอดยกมาจากไฟล์สต๊อกเดิม'), ob);

  -- รับสินค้าจาก PO (GR) และใบส่งของผู้ขาย (GN)
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'GR', 'doc_date', d0 - 75, 'partner_name', 'SolarEdge Technologies (Thailand)', 'ref_no', 'PO-6910-021'),
          pg_temp.gen('SE5000H-THR00BNN4', '7E1', 101, 10, 'SolarEdge SE5000H Inverter') || pg_temp.gen('S1200-1GM4MBV', '2A1', 101, 40, 'Power Optimizer S1200'));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'GR', 'doc_date', d0 - 40, 'partner_name', 'Leapton Solar Co., Ltd.', 'ref_no', 'PO-6911-007'),
          pg_temp.gen('LP210-210-M-66-NB-710W', 'LP7', 101, 36, 'Leapton 710W'));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'GN', 'doc_date', d0 - 18, 'partner_name', 'KSTAR New Energy', 'ref_no', 'DN-KS-55821'),
          pg_temp.gen('BLUE-10KT-M1', 'KS1', 101, 6, 'KSTAR BluE-10KT-M1')
          || jsonb_build_array(jsonb_build_object('sku', 'BLUE-G 5000D', 'sn', 'KS2000901-DF', 'description', 'KSTAR BluE-G 5000D', 'condition', 'defective', 'note', 'กล่องบุบ เครื่องเปิดไม่ติด')));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'GR', 'doc_date', d0 - 6, 'partner_name', 'SolarEdge Technologies (Thailand)', 'ref_no', 'PO-6911-030'),
          pg_temp.gen('SE10K-TH0TEBNN4', '7E2', 101, 8, 'SolarEdge SE10K Inverter') || pg_temp.gen('S1400-1GM4MBV', '2A4', 1, 30, 'Power Optimizer S1400'));

  -- ขาย (SO) ให้บริษัทลูกค้า
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 100, 'partner_name', 'บริษัท สมาร์ท โซลาร์ เอ็นจิเนียริ่ง จำกัด', 'partner_tax_id', '0105561000011', 'ref_no', 'PI-6908-114', 'customer_po', 'SSE-PO-2208', 'site_name', 'โรงงานอาหารแปรรูป นวนคร'),
          pg_temp.pick('SE33.3K-TH00IBND4', 2) || pg_temp.pick('S1200-1GM4MBV', 24));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 90, 'partner_name', 'บริษัท บ้านแดด จำกัด', 'partner_tax_id', '0105565000055', 'ref_no', 'PI-6908-131', 'site_name', 'บ้านคุณวีระ ราชพฤกษ์'),
          pg_temp.pick('SE5000H-THR00BNN4', 3) || pg_temp.pick('S650B-1GM4MBM', 16) || pg_temp.pick('LP210-210-M-66-NB-710W', 18));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 70, 'partner_name', 'บริษัท กรีนเพาเวอร์ ซิสเต็ม จำกัด', 'partner_tax_id', '0105559000022', 'ref_no', 'PI-6909-040', 'customer_po', 'GPS-6909-11', 'site_name', 'โรงงานพลาสติก บางพลี'),
          pg_temp.pick('SE100K-TH00IBNC4', 1) || pg_temp.pick('P1100-4RM4MBT', 20) || pg_temp.pick('SE1000-CCG-G-S1', 1));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 55, 'partner_name', 'ห้างหุ้นส่วนจำกัด ซันไรส์ อินสตอลเลชั่น', 'partner_tax_id', '0103562000033', 'ref_no', 'PI-6909-077', 'site_name', 'รีสอร์ทพัทยา'),
          pg_temp.pick('SE10K-TH0TEBNN4', 2) || pg_temp.pick('S1200-1GM4MBV', 16) || pg_temp.pick('BLUE-10KT-M1', 2));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 45, 'partner_name', 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', 'partner_tax_id', '0105564000044', 'ref_no', 'PI-6910-012', 'site_name', 'โรงแรมนิมมาน เชียงใหม่'),
          pg_temp.pick('SE10K-RWB48BFN4', 2) || pg_temp.pick('BAT-10K1PSOB-12', 2) || pg_temp.pick('BI-NAUGN-01', 2));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 30, 'partner_name', 'บริษัท สมาร์ท โซลาร์ เอ็นจิเนียริ่ง จำกัด', 'partner_tax_id', '0105561000011', 'ref_no', 'PI-6910-088', 'customer_po', 'SSE-PO-2291', 'site_name', 'ห้างสรรพสินค้า รังสิต'),
          pg_temp.pick('SE33.3K-TH00IBND4', 2) || pg_temp.pick('S1200-1GM4MBV', 30) || pg_temp.pick('LP210-210-M-66-NB-710W', 40));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 14, 'partner_name', 'บริษัท บ้านแดด จำกัด', 'partner_tax_id', '0105565000055', 'ref_no', 'PI-6911-019', 'site_name', 'หมู่บ้านชัยพฤกษ์ 3 หลัง'),
          pg_temp.pick('SE5000H-THR00BNN4', 3) || pg_temp.pick('S650B-1GM4MBM', 18) || pg_temp.pick('BLUE-G 5000D', 2));
  so := pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'SO', 'doc_date', d0 - 4, 'partner_name', 'บริษัท กรีนเพาเวอร์ ซิสเต็ม จำกัด', 'partner_tax_id', '0105559000022', 'ref_no', 'PI-6911-052', 'site_name', 'คลังสินค้า บางนา'),
          pg_temp.pick('SE33.3K-TH00IBND4', 1) || pg_temp.pick('S1400-1GM4MBV', 12));

  -- รับคืน (RT) 2 ตัวจากใบขายล่าสุด
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'RT', 'doc_date', d0 - 2, 'partner_name', 'บริษัท กรีนเพาเวอร์ ซิสเต็ม จำกัด', 'return_of', so, 'note', 'ลูกค้าสั่งเกิน คืน 2 ตัว'),
          (select jsonb_agg(jsonb_build_object('sku', i.sku, 'sn', i.sn)) from (select * from public.stock_doc_items where doc_id = so and sku = 'S1400-1GM4MBV' order by sort limit 2) i));

  -- ยืม (BR) — หนึ่งใบเกินกำหนดคืน
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'BR', 'doc_date', d0 - 20, 'partner_name', 'ห้างหุ้นส่วนจำกัด ซันไรส์ อินสตอลเลชั่น', 'partner_tax_id', '0103562000033', 'due_date', d0 - 3, 'note', 'ยืมไปทดสอบหน้างาน'),
          pg_temp.pick('SE10K-TH0TEBNN4', 1));
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'BR', 'doc_date', d0 - 5, 'partner_name', 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', 'partner_tax_id', '0105564000044', 'due_date', d0 + 9, 'note', 'ตัวโชว์งานแสดงสินค้า'),
          pg_temp.pick('SE5000H-THR00BNN4', 1) || pg_temp.pick('BAT-10K1PSOB-12', 1));
  -- เบิกใช้ภายใน (WD)
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'WD', 'doc_date', d0 - 25, 'partner_name', 'ศูนย์อบรม SSC', 'note', 'เครื่องสำหรับห้องอบรม'),
          pg_temp.pick('SE5000H-THR00BNN4', 1) || pg_temp.pick('S1200-1GM4MBV', 4));
  -- โอนคลัง (TR)
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'TR', 'doc_date', d0 - 35, 'to_warehouse_id', pg_temp.wh('BKK'), 'note', 'เติมสต๊อกหน้าร้าน'),
          pg_temp.pick('SE5000H-THR00BNN4', 3) || pg_temp.pick('S1200-1GM4MBV', 10));
  -- จองสินค้าตาม SN (RV)
  perform pg_temp.doc('stock', 'approver', jsonb_build_object('doc_type', 'RV', 'doc_date', d0 - 1, 'partner_name', 'บริษัท สมาร์ท โซลาร์ เอ็นจิเนียริ่ง จำกัด', 'partner_tax_id', '0105561000011', 'due_date', d0 + 6, 'note', 'กันของให้โครงการรังสิตเฟส 2'),
          pg_temp.pick('SE33.3K-TH00IBND4', 1));

  -- จำหน่ายออก (WO) ต้องผ่านผู้ตรวจก่อน: ผู้ตรวจ = หัวหน้าคลัง, ผู้อนุมัติ = admin
  perform pg_temp.act('stock');
  v := (public.save_stock_doc(null, jsonb_build_object('doc_type', 'WO', 'doc_date', d0 - 8, 'warehouse_id', pg_temp.wh('BGL4'), 'reason', 'สินค้าเสียจากการขนส่ง เคลมผู้ขายไม่ได้'),
        jsonb_build_array(jsonb_build_object('sku', 'BLUE-G 5000D', 'sn', 'KS2000901-DF')))).id;
  perform pg_temp.act('approver'); perform public.check_stock_doc(v, true);
  perform pg_temp.act('admin');    perform public.post_stock_doc(v);

  -- ร่างเอกสารที่รออนุมัติ (ให้ลองกดยืนยันตอนสาธิต)
  perform pg_temp.doc('stock', null, jsonb_build_object('doc_type', 'SO', 'doc_date', d0, 'partner_name', 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', 'partner_tax_id', '0105564000044', 'ref_no', 'PI-6911-071', 'site_name', 'คอนโดสันติธรรม'),
          pg_temp.pick('SE10K-TH0TEBNN4', 2) || pg_temp.pick('S1400-1GM4MBV', 8), false);
  perform pg_temp.doc('stock', null, jsonb_build_object('doc_type', 'GR', 'doc_date', d0, 'partner_name', 'Sunwoda Energy', 'ref_no', 'PO-6911-041'),
          pg_temp.gen('ATRIX MAX-16L-P', 'SW1', 101, 3, 'Sunwoda Atrix max 16L'), false);
  perform pg_temp.doc('stock', null, jsonb_build_object('doc_type', 'WO', 'doc_date', d0, 'reason', 'ตัวโชว์ชำรุด'),
          pg_temp.pick('SE1000-CCG-G-S1', 1), false);
end $$;

-- ใบตรวจนับ: ปิดแล้ว 1 ใบ และกำลังนับ 1 ใบ
do $$
declare c uuid; sns text[];
begin
  perform pg_temp.act('stock');
  c := (public.start_stock_count(pg_temp.wh('BKK'), null, 'ตรวจนับประจำเดือน')).id;
  sns := (select array_agg(sn) from public.serials where warehouse_id = pg_temp.wh('BKK') and status = 'in_stock');
  perform public.stock_count_scan(c, sns);
  perform public.close_stock_count(c, false);
  update public.stock_counts set started_at = now() - interval '9 days', closed_at = now() - interval '9 days' + interval '2 hours' where id = c;

  c := (public.start_stock_count(pg_temp.wh('BGL4'), array['SE5000H-THR00BNN4', 'S1200-1GM4MBV'], 'นับเฉพาะ SE5000H และ S1200')).id;
  sns := (select array_agg(sn) from (select sn from public.serials where warehouse_id = pg_temp.wh('BGL4') and status = 'in_stock'
                                       and sku in ('SE5000H-THR00BNN4', 'S1200-1GM4MBV') order by sn limit 40) s);
  perform public.stock_count_scan(c, sns || array['2A1999999-ZZ']);  -- SN แปลกปลอม 1 ตัว
end $$;

-- ---------------------------------------------------------------------------
-- 6. ตารางส่งสินค้า
-- ---------------------------------------------------------------------------
insert into public.deliveries (doc_no, doc_date, delivery_date, status, customer_name, customer_tax_id, customer_address, contact_name, contact_phone, site, warehouse, sales_name, notes, created_by)
values
 ('DO-6911-001', current_date - 15, current_date - 14, 'delivered', 'บริษัท บ้านแดด จำกัด', '0105565000055', '7/7 ถ.ราชพฤกษ์ นนทบุรี', 'สุดา ทองดี', '089-111-2009', 'หมู่บ้านชัยพฤกษ์', 'BGL4', 'คุณธนพล', 'ส่งก่อน 10 โมง', pg_temp.uid('stock')),
 ('DO-6911-002', current_date - 5, current_date - 4, 'delivered', 'บริษัท กรีนเพาเวอร์ ซิสเต็ม จำกัด', '0105559000022', '12 ถ.บางนา-ตราด กม.5', 'กนกวรรณ แสงทอง', '089-111-2004', 'คลังสินค้า บางนา', 'BGL4', 'คุณธนพล', null, pg_temp.uid('stock')),
 ('DO-6911-003', current_date - 1, current_date, 'shipped', 'บริษัท สมาร์ท โซลาร์ เอ็นจิเนียริ่ง จำกัด', '0105561000011', '88/9 ถ.พหลโยธิน จตุจักร', 'สมชาย ใจดี', '089-111-2001', 'ห้างสรรพสินค้า รังสิต', 'BGL4', 'คุณธนพล', 'รถ 6 ล้อ มีลิฟต์ท้าย', pg_temp.uid('stock')),
 ('DO-6911-004', current_date, current_date + 1, 'scheduled', 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', '0105564000044', '199 ถ.ซุปเปอร์ไฮเวย์ เชียงใหม่', 'จิรภัทร รุ่งเรือง', '089-111-2006', 'คอนโดสันติธรรม', 'BGL4', 'คุณอรอุมา', 'ส่งผ่านขนส่ง Kerry Express', pg_temp.uid('stock')),
 ('DO-6911-005', current_date, current_date + 2, 'waiting', 'ห้างหุ้นส่วนจำกัด ซันไรส์ อินสตอลเลชั่น', '0103562000033', '45 ม.3 บางละมุง ชลบุรี', 'อนันต์ พลังงาน', '089-111-2005', 'รีสอร์ทพัทยา เฟส 2', 'BGL4', 'คุณภาคิน', 'รอลูกค้าโอนมัดจำ', pg_temp.uid('stock')),
 ('DO-6911-006', current_date + 1, current_date + 3, 'scheduled', 'บริษัท บ้านแดด จำกัด', '0105565000055', '7/7 ถ.ราชพฤกษ์ นนทบุรี', 'ณัฐพงศ์ วงศ์สว่าง', '089-111-2008', 'บ้านคุณมานพ บางใหญ่', 'BKK', 'คุณธนพล', null, pg_temp.uid('stock')),
 ('DO-6911-007', current_date + 2, current_date + 6, 'scheduled', 'บริษัท กรีนเพาเวอร์ ซิสเต็ม จำกัด', '0105559000022', '12 ถ.บางนา-ตราด กม.5', 'ประเสริฐ มั่นคง', '089-111-2003', 'โรงงานพลาสติก บางพลี เฟส 2', 'BGL4', 'คุณธนพล', 'ต้องใช้รถเครน', pg_temp.uid('stock')),
 ('DO-6911-008', current_date - 3, current_date - 2, 'cancelled', 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', '0105564000044', 'เชียงใหม่', 'ฐิติมา บุญมา', '089-111-2007', 'โรงแรมนิมมาน', 'BGL4', 'คุณอรอุมา', 'ลูกค้าเลื่อนงาน', pg_temp.uid('stock'));
insert into public.delivery_items (delivery_id, sort, model, description, unit_watt, qty, total_watt)
select d.id, x.o, x.m, x.dsc, x.w, x.q, x.w * x.q
  from public.deliveries d
  join (values
   ('DO-6911-001', 1, 'SE5000H-THR00BNN4', 'Inverter 5kW', 5000, 3), ('DO-6911-001', 2, 'S650B-1GM4MBM', 'Optimizer', 650, 18),
   ('DO-6911-002', 1, 'SE33.3K-TH00IBND4', 'Inverter 33.3kW', 33300, 1), ('DO-6911-002', 2, 'S1400-1GM4MBV', 'Optimizer', 1400, 12),
   ('DO-6911-003', 1, 'LP210-210-M-66-NB-710W', 'แผง 710W', 710, 40), ('DO-6911-003', 2, 'S1200-1GM4MBV', 'Optimizer', 1200, 30),
   ('DO-6911-004', 1, 'SE10K-TH0TEBNN4', 'Inverter 10kW', 10000, 2), ('DO-6911-004', 2, 'S1400-1GM4MBV', 'Optimizer', 1400, 8),
   ('DO-6911-005', 1, 'SE10K-TH0TEBNN4', 'Inverter 10kW', 10000, 1), ('DO-6911-005', 2, 'LP210-210-M-66-NB-710W', 'แผง 710W', 710, 28),
   ('DO-6911-006', 1, 'SE5000H-THR00BNN4', 'Inverter 5kW', 5000, 1), ('DO-6911-006', 2, 'LP210-210-M-66-NB-710W', 'แผง 710W', 710, 9),
   ('DO-6911-007', 1, 'SE100K-TH00IBNC4', 'Inverter 100kW', 100000, 1), ('DO-6911-007', 2, 'P1100-4RM4MBT', 'Optimizer', 1100, 80),
   ('DO-6911-008', 1, 'SE10K-RWB48BFN4', 'Home Hub 10kW', 10000, 1)
  ) x(doc, o, m, dsc, w, q) on x.doc = d.doc_no;

-- ---------------------------------------------------------------------------
-- 7. คำขอใบเสนอราคา และการจองสินค้า จากลูกค้า
-- ---------------------------------------------------------------------------
do $$
declare q uuid; r uuid;
begin
  perform pg_temp.act('somchai');
  q := (public.create_quote_request(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('SE33.3K-TH00IBND4'), 'qty', 2),
        jsonb_build_object('variant_id', pg_temp.vid('S1200-1GM4MBV'), 'qty', 48), jsonb_build_object('variant_id', pg_temp.vid('LP210-210-M-66-NB-710W'), 'qty', 96)),
        'โครงการหลังคาโรงงาน 66 kWp ที่อยุธยา ต้องการราคารวมขนส่ง', 'สมชาย ใจดี', '089-111-2001')).id;
  update public.quote_requests set status = 'quoted', quoted_total = 742000, staff_note = 'ส่งใบเสนอราคา QT-6911-015 ทางอีเมลแล้ว', handled_by = pg_temp.uid('sales'), created_at = now() - interval '6 days' where id = q;

  perform pg_temp.act('prasert');
  q := (public.create_quote_request(jsonb_build_array(jsonb_build_object('package_id', (select id from public.packages where code = 'PKG-33K'), 'qty', 3)),
        'สนใจชุดโรงงาน 3 ชุด สำหรับ 3 อาคาร', 'ประเสริฐ มั่นคง', '089-111-2003')).id;
  update public.quote_requests set status = 'won', quoted_total = 1398000, staff_note = 'ลูกค้ายืนยันสั่งซื้อ PO GPS-6911-03', handled_by = pg_temp.uid('sales'), created_at = now() - interval '20 days' where id = q;

  perform pg_temp.act('jirapat');
  q := (public.create_quote_request(jsonb_build_array(jsonb_build_object('package_id', (select id from public.packages where code = 'PKG-HYB10'), 'qty', 1)),
        'บ้านพักที่เชียงใหม่ ไฟดับบ่อย อยากได้ระบบแบตเตอรี่', 'จิรภัทร รุ่งเรือง', '089-111-2006')).id;
  update public.quote_requests set status = 'in_progress', staff_note = 'นัดสำรวจหน้างานวันศุกร์', handled_by = pg_temp.uid('sales'), created_at = now() - interval '2 days' where id = q;

  perform pg_temp.act('mali');
  q := (public.create_quote_request(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('SE5000H-THR00BNN4'), 'qty', 1),
        jsonb_build_object('variant_id', pg_temp.vid('LP210-210-M-66-NB-710W'), 'qty', 8)), 'ติดบ้านตัวเอง 5 kW', 'มาลี ดวงดี', '089-111-2011')).id;
  update public.quote_requests set created_at = now() - interval '3 hours' where id = q;

  perform pg_temp.act('nattapong');
  q := (public.create_quote_request(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('BLUE-10KT-M1'), 'qty', 4)), 'ขอราคาส่ง KSTAR 4 ตัว', 'ณัฐพงศ์ วงศ์สว่าง', '089-111-2008')).id;
  update public.quote_requests set status = 'lost', staff_note = 'ลูกค้าได้ราคาที่อื่นถูกกว่า', handled_by = pg_temp.uid('sales'), created_at = now() - interval '30 days' where id = q;

  -- การจองสินค้า
  perform pg_temp.act('wanida');
  r := (public.create_reservation(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('SE10K-TH0TEBNN4'), 'qty', 2),
        jsonb_build_object('variant_id', pg_temp.vid('S1400-1GM4MBV'), 'qty', 10)), 'จองไว้ก่อน รอลูกค้าเซ็นสัญญา')).id;
  update public.reservations set status = 'confirmed', staff_note = 'กันของในคลัง BGL4 แล้ว', handled_by = pg_temp.uid('sales'), created_at = now() - interval '2 days' where id = r;

  perform pg_temp.act('anan');
  r := (public.create_reservation(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('SE5000H-THR00BNN4'), 'qty', 2)), 'มารับเองวันเสาร์')).id;
  update public.reservations set created_at = now() - interval '5 hours' where id = r;

  perform pg_temp.act('suda');
  r := (public.create_reservation(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('LP210-210-M-66-NB-710W'), 'qty', 18)), null)).id;
  update public.reservations set status = 'closed', staff_note = 'ออกใบขาย PI-6911-019 แล้ว', handled_by = pg_temp.uid('sales'), created_at = now() - interval '16 days' where id = r;
end $$;

-- ---------------------------------------------------------------------------
-- 8. แต้มบริษัท (จากยอดซื้อ ตามแบรนด์) และการใช้แต้ม
-- ---------------------------------------------------------------------------
insert into public.brand_point_rules (brand_id, baht_per_point, tiers, terms, is_active) values
 (pg_temp.brand('solaredge'), 1000, '[{"min":0,"multiplier":1},{"min":1000000,"multiplier":1.5}]', 'ทุก 1,000 บาท = 1 แต้ม ยอดซื้อสะสม 1 ล้านบาทขึ้นไปรับ 1.5 เท่า', true),
 (pg_temp.brand('kstar'), 2000, '[{"min":0,"multiplier":1}]', 'ทุก 2,000 บาท = 1 แต้ม', true),
 (pg_temp.brand('leapton'), 1500, '[{"min":0,"multiplier":1}]', 'ทุก 1,500 บาท = 1 แต้ม', true)
on conflict (brand_id) do update set baht_per_point = excluded.baht_per_point, tiers = excluded.tiers, terms = excluded.terms;
insert into public.company_point_bonuses (label, multiplier, starts_on, ends_on, is_active, brand_id) values
 ('โปรแต้ม x2 ปลายปี SolarEdge', 2, current_date - 10, current_date + 45, true, pg_temp.brand('solaredge'));

do $$
declare x record;
begin
  perform pg_temp.act('sales');
  for x in select * from (values
    ('0105561000011', 'IV6908-0114', current_date - 100, 291960::numeric, 'SE33.3K x2, S1200 x24', 'solaredge'),
    ('0105565000055', 'IV6908-0131', current_date - 90, 191550, 'SE5000H x3, S650B x16, แผง 710W x18', 'solaredge'),
    ('0105559000022', 'IV6909-0040', current_date - 70, 357900, 'SE100K x1, P1100 x20, Gateway x1', 'solaredge'),
    ('0103562000033', 'IV6909-0077', current_date - 55, 255240, 'SE10K x2, S1200 x16', 'solaredge'),
    ('0103562000033', 'IV6909-0078', current_date - 55, 84000, 'KSTAR BluE-10KT x2', 'kstar'),
    ('0105564000044', 'IV6910-0012', current_date - 45, 627000, 'Home Hub x2, Battery x2, BI x2', 'solaredge'),
    ('0105561000011', 'IV6910-0088', current_date - 30, 322700, 'SE33.3K x2, S1200 x30', 'solaredge'),
    ('0105561000011', 'IV6910-0089', current_date - 30, 162000, 'แผง Leapton 710W x40', 'leapton'),
    ('0105565000055', 'IV6911-0019', current_date - 14, 158000, 'SE5000H x3, S650B x18', 'solaredge'),
    ('0105559000022', 'IV6911-0052', current_date - 4, 155800, 'SE33.3K x1, S1400 x12', 'solaredge')) v(tax, inv, dt, amt, items, brand)
  loop
    perform public.add_company_purchase(pg_temp.co(x.tax), x.inv, x.dt, x.amt, x.items, null, null, null, null, pg_temp.brand(x.brand));
  end loop;
  perform public.company_redeem(pg_temp.co('0105564000044'), 200, null, 'ส่วนลดค่าสินค้า 2,000 บาท', 'PI-6911-071', 'หักเป็นส่วนลดในบิลถัดไป');
  perform public.company_redeem(pg_temp.co('0105561000011'), 300, null, 'ทริปดูงานโรงงาน SolarEdge (1 ที่นั่ง)', null, 'ทริปเดือนมกราคม');
  perform public.adjust_points('company', pg_temp.co('0103562000033'), 50, 'โบนัสลูกค้าใหม่ (ข้อมูลสาธิต)');
end $$;
alter table public.point_ledger disable trigger point_ledger_guard;
update public.point_ledger set created_at = (doc_date + time '14:00') at time zone 'Asia/Bangkok' where wallet = 'company' and doc_date is not null;
alter table public.point_ledger enable trigger point_ledger_guard;

-- ---------------------------------------------------------------------------
-- 9. อบรม: รอบที่ผ่านมา วันนี้ และรอบถัดไป
-- ---------------------------------------------------------------------------
update public.course_sessions set is_archived = true, status = 'closed' where legacy_id is not null or created_at < now() - interval '1 minute';
update public.courses set is_active = true;

insert into public.course_sessions (course_id, title, starts_on, start_time, end_time, hours, location, map_url, lat, lng, capacity, status, price, note)
select (select id from public.courses where code = c), t, current_date + 10, st::time, et::time, h, loc, map, lat, lng, cap, 'open', pr, n
  from (values
   ('OM',  'รุ่นที่ 9/2569 (ผ่านมาแล้ว)',  '09:00', '16:00', 6, 'SSC Training Center บางนา', 'https://maps.app.goo.gl/Lnei3VLWySst1v1b9', 13.6689, 100.6347, 20, null::numeric, 'past1'),
   ('BSD', 'รุ่นที่ 10/2569 (ผ่านมาแล้ว)', '09:00', '16:00', 6, 'ศูนย์กระจายสินค้า ลำลูกกา', 'https://maps.app.goo.gl/B58zZx1AXKV8zWEM6', 13.9325, 100.7480, 20, null, 'past2'),
   ('CDI', 'รุ่นที่ 11/2569 (วันนี้)',      '09:00', '16:00', 6, 'SSC Training Center บางนา', 'https://maps.app.goo.gl/Lnei3VLWySst1v1b9', 13.6689, 100.6347, 25, null, 'today'),
   ('ASL261101', 'รอบที่ 3 · มีค่าใช้จ่าย', '09:00', '16:00', 6, 'ศูนย์กระจายสินค้า ลำลูกกา', 'https://maps.app.goo.gl/B58zZx1AXKV8zWEM6', 13.9325, 100.7480, 30, 3990, 'paid'),
   ('OM',  'รุ่นที่ 12/2569',               '09:00', '16:00', 6, 'SSC Training Center บางนา', 'https://maps.app.goo.gl/Lnei3VLWySst1v1b9', 13.6689, 100.6347, 20, null, 'next1'),
   ('BSD', 'รุ่นที่ 1/2570',                '09:00', '16:00', 6, 'ศูนย์กระจายสินค้า ลำลูกกา', 'https://maps.app.goo.gl/B58zZx1AXKV8zWEM6', 13.9325, 100.7480, 20, null, 'next2')
  ) v(c, t, st, et, h, loc, map, lat, lng, cap, pr, n);

insert into public.training_promo_codes (code, session_id, kind, value, max_uses, expires_on, is_active, note, created_by) values
 ('EARLYBIRD', (select id from public.course_sessions where note = 'paid'), 'percent', 20, 10, current_date + 5, true, 'ส่วนลด 20% จองก่อน', pg_temp.uid('training')),
 ('PARTNER1000', null, 'amount', 1000, null, current_date + 60, true, 'ส่วนลดลูกค้าคู่ค้า', pg_temp.uid('training')),
 ('VIPFREE', null, 'free', 0, 3, current_date + 30, true, 'เรียนฟรีสำหรับลูกค้า VIP', pg_temp.uid('training'));

do $$
declare
  s_past1 uuid := (select id from public.course_sessions where note = 'past1');
  s_past2 uuid := (select id from public.course_sessions where note = 'past2');
  s_today uuid := (select id from public.course_sessions where note = 'today');
  s_paid  uuid := (select id from public.course_sessions where note = 'paid');
  s_next1 uuid := (select id from public.course_sessions where note = 'next1');
  u text; rg public.training_registrations; i int := 0;
  bill jsonb;
begin
  -- จองล่วงหน้าทุกรอบ (ระบบไม่ให้จองรอบที่ผ่านไปแล้ว จึงจองก่อนแล้วค่อยเลื่อนวันที่ภายหลัง)
  foreach u in array array['somchai','wanida','prasert','kanokwan','anan','jirapat','thitima','nattapong','suda','kittisak'] loop
    perform pg_temp.act(u); perform public.book_session(s_past1, 'คุณธนพล', 'Sales');
  end loop;
  foreach u in array array['somchai','kanokwan','anan','nattapong','suda','mali','chaiwat','kittisak'] loop
    perform pg_temp.act(u); perform public.book_session(s_past2, null, 'Facebook');
  end loop;
  foreach u in array array['wanida','prasert','jirapat','thitima','suda','mali','chaiwat','kittisak','anan'] loop
    perform pg_temp.act(u); perform public.book_session(s_today, null, 'LINE OA');
  end loop;
  foreach u in array array['somchai','prasert','anan','jirapat','nattapong','mali'] loop
    perform pg_temp.act(u);
    bill := case when u = 'mali' then jsonb_build_object('type', 'person', 'name', 'มาลี ดวงดี', 'address', 'กรุงเทพฯ')
                 else (select billing from public.profiles where id = pg_temp.uid(u)) end;
    perform public.book_session(s_paid, 'คุณธนพล', 'Sales', bill, case u when 'somchai' then 'EARLYBIRD' when 'anan' then 'PARTNER1000' when 'jirapat' then 'VIPFREE' end, u = 'prasert');
  end loop;
  foreach u in array array['wanida','kanokwan','thitima'] loop
    perform pg_temp.act(u); perform public.book_session(s_next1, null, 'เพื่อนแนะนำ');
  end loop;
  -- ยกเลิก 1 รายการ
  perform pg_temp.act('thitima');
  perform public.cancel_registration((select id from public.training_registrations where session_id = s_past1 and user_id = pg_temp.uid('thitima')), 'ติดประชุมลูกค้า', false);

  -- เลื่อนวันที่รอบอบรมให้เป็นอดีต / วันนี้ / อนาคต
  update public.course_sessions set starts_on = current_date - 30 where id = s_past1;
  update public.course_sessions set starts_on = current_date - 12 where id = s_past2;
  update public.course_sessions set starts_on = current_date where id = s_today;
  update public.course_sessions set starts_on = current_date + 8 where id = s_paid;
  update public.course_sessions set starts_on = current_date + 15 where id = s_next1;
  update public.course_sessions set starts_on = current_date + 36 where note = 'next2';

  -- ฝ่ายอบรมเช็กชื่อ เช็กเอาต์ ลูกค้าทำแบบประเมิน → ได้ใบประกาศ + แต้ม
  perform pg_temp.act('training');
  for rg in select * from public.training_registrations where session_id in (s_past1, s_past2) and status = 'registered' order by registered_at loop
    i := i + 1;
    if rg.user_id = pg_temp.uid('kittisak') and rg.session_id = s_past1 then
      perform public.set_attendance(rg.id, 'no_show', 'ไม่มาและไม่แจ้งล่วงหน้า');
      continue;
    end if;
    perform public.set_attendance(rg.id, 'attended');
    perform public.staff_check_out(rg.id);
    if not (rg.user_id = pg_temp.uid('mali')) then
      perform pg_temp.act((select split_part(email, '@', 1) from public.profiles where id = rg.user_id));
      perform public.submit_evaluation(rg.id, jsonb_build_object('q1', 5, 'q2', 4 + (i % 2), 'q3', 5, 'comment',
              (array['เนื้อหาดีมาก ได้ลงมือจริง', 'วิทยากรอธิบายเข้าใจง่าย', 'อยากให้มีภาคปฏิบัติมากขึ้น', 'ประทับใจครับ'])[1 + i % 4]));
      perform pg_temp.act('training');
    end if;
  end loop;
  update public.training_registrations r set
     checked_in_at = (s.starts_on + time '08:45' + (random() * interval '25 minutes')) at time zone 'Asia/Bangkok',
     checked_out_at = case when r.checked_out_at is not null then (s.starts_on + time '16:05' + (random() * interval '20 minutes')) at time zone 'Asia/Bangkok' end,
     evaluated_at = case when r.evaluated_at is not null then (s.starts_on + time '16:30') at time zone 'Asia/Bangkok' end,
     cert_issued_at = case when r.cert_issued_at is not null then (s.starts_on + time '16:30') at time zone 'Asia/Bangkok' end,
     check_in_method = (array['qr', 'code', 'qr'])[1 + (abs(hashtext(r.id::text)) % 3)],
     check_out_method = case when r.checked_out_at is not null then 'qr' end
    from public.course_sessions s where s.id = r.session_id and r.status = 'attended';
  update public.training_registrations r set registered_at = (s.starts_on - 10) + time '10:00' + (abs(hashtext(r.id::text)) % 300) * interval '1 minute'
    from public.course_sessions s where s.id = r.session_id;

  -- วันนี้: เช็กอินแล้ว 5 คน
  for rg in select * from public.training_registrations where session_id = s_today and status = 'registered' order by registered_at limit 5 loop
    perform public.set_attendance(rg.id, 'attended');
  end loop;
  update public.training_registrations set checked_in_at = (current_date + time '08:40' + (random() * interval '30 minutes')) at time zone 'Asia/Bangkok', check_in_method = 'qr'
   where session_id = s_today and status = 'attended';

  -- รอบมีค่าใช้จ่าย: ชำระแล้ว / แนบสลิปรอตรวจ / ยังไม่ชำระ
  update public.training_registrations set pay_status = 'paid', paid_at = now() - interval '2 days', slip_path = 'demo/slip-sample.jpg'
   where session_id = s_paid and user_id in (pg_temp.uid('somchai'), pg_temp.uid('anan'));
  update public.training_registrations set pay_status = 'pending', slip_path = 'demo/slip-sample.jpg'
   where session_id = s_paid and user_id = pg_temp.uid('nattapong');
end $$;
alter table public.point_ledger disable trigger point_ledger_guard;
update public.point_ledger l set created_at = r.cert_issued_at
  from public.training_registrations r where l.registration_id = r.id and r.cert_issued_at is not null;
alter table public.point_ledger enable trigger point_ledger_guard;

-- ของรางวัลและการแลกแต้มส่วนตัว
update public.rewards set name = replace(name, ' (ตัวอย่าง)', ''), stock = coalesce(stock, 50);
insert into public.rewards (wallet, kind, name, description, points, stock, sort) values
 ('company', 'item', 'ส่วนลดค่าสินค้า 2,000 บาท', 'ใช้หักในบิลถัดไป', 200, null, 20),
 ('company', 'item', 'ทริปดูงานโรงงาน SolarEdge', '1 ที่นั่ง', 300, 10, 21);
do $$
begin
  perform pg_temp.act('somchai');  perform public.redeem_reward((select id from public.rewards where name like 'แก้วเก็บความเย็น%'));
  perform pg_temp.act('kanokwan'); perform public.redeem_reward((select id from public.rewards where name like 'แก้วเก็บความเย็น%'));
  perform pg_temp.act('nattapong'); perform public.redeem_reward((select id from public.rewards where name like 'แก้วเก็บความเย็น%'));
  perform pg_temp.act('training');
  perform public.use_coupon((select code from public.redemptions where user_id = pg_temp.uid('somchai') limit 1), 'รับของที่เคาน์เตอร์');
  perform pg_temp.act('admin');
  perform public.adjust_points('personal', pg_temp.uid('anan'), 5, 'แต้มพิเศษ ตอบคำถามในห้องอบรม');
end $$;

-- ---------------------------------------------------------------------------
-- 10. งานเคลม: ทุกสถานะ ทั้งลูกค้าแจ้งเองและเจ้าหน้าที่บันทึก
-- ---------------------------------------------------------------------------
create temp table demo_claims (n int primary key, login text, ptype text, model text, sold_sku text, qty int, symptom text,
                               status text, days int, handler text, ship boolean default false, extra text);
insert into demo_claims values
 ( 1, 'somchai',  'inverter',  'SE33.3K-TH00IBND4', 'SE33.3K-TH00IBND4', 1, 'Error 3x9A Isolation fault ช่วงเช้า', 'closed', 58, 'service', false, 'rma'),
 ( 2, 'somchai',  'optimizer', 'S1200',             'S1200-1GM4MBV', 3, 'Optimizer ไม่รายงานผล 3 ตัว (0.0V)', 'closed', 45, 'service', false, 'rma'),
 ( 3, 'suda',     'inverter',  'SE5000H-THR00BNN4', 'SE5000H-THR00BNN4', 1, 'หน้าจอดับ เปิดไม่ติด', 'returned', 21, 'service2', true, 'rma'),
 ( 4, 'kanokwan', 'optimizer', 'P1100',             'P1100-4RM4MBT', 2, 'Optimizer ร้อนผิดปกติ ผลิตไฟต่ำ', 'done', 12, 'service', false, 'rma'),
 ( 5, 'anan',     'inverter',  'SE10K-TH0TEBNN4',   'SE10K-TH0TEBNN4', 1, 'Error 18xB Ground current RCD', 'in_progress', 7, 'service', false, 'rma'),
 ( 6, 'jirapat',  'battery',   'BAT-10K1PSOB-12',   'BAT-10K1PSOB-12', 1, 'แบตไม่ชาร์จ ค้างที่ 12%', 'in_progress', 5, 'service2', true, null),
 ( 7, 'wanida',   'optimizer', 'S1200',             'S1200-1GM4MBV', 1, 'Optimizer ไม่ Pairing', 'in_progress', 3, 'service2', false, null),
 ( 8, 'nattapong','inverter',  'SE5000H-THR00BNN4', 'SE5000H-THR00BNN4', 1, 'เสียงดังจากพัดลม', 'submitted', 1, null, false, null),
 ( 9, 'suda',     'optimizer', 'S650B',             'S650B-1GM4MBM', 4, 'Optimizer ไม่มีไฟออก 4 ตัวในสตริงเดียว', 'submitted', 0, null, false, null),
 (10, 'anan',     'inverter',  'BLUE-10KT-M1',      'BLUE-10KT-M1', 1, 'อินเวอร์เตอร์ตัดบ่อยตอนเที่ยง (Grid over voltage)', 'submitted', 0, null, true, null),
 (11, 'prasert',  'accessory', 'SE1000-CCG-G-S1',   'SE1000-CCG-G-S1', 1, 'Gateway ออนไลน์ไม่ได้', 'rejected', 25, 'service', false, null),
 (12, 'thitima',  'battery',   'BAT-10K1PSOB-12',   'BAT-10K1PSOB-12', 1, 'แจ้งเตือน Battery comm error', 'done', 9, 'service', false, null),
 (13, 'somchai',  'panel',     'LP210-210-M-66-NB-710W', 'LP210-210-M-66-NB-710W', 2, 'แผงมีรอย Hot spot 2 แผง', 'in_progress', 10, 'service', false, null),
 (14, 'kanokwan', 'inverter',  'SE100K-TH00IBNC4',  'SE100K-TH00IBNC4', 1, 'Fan error และเครื่องลด Power', 'closed', 33, 'service', false, 'rma');

do $$
declare
  c record; v_id uuid; v_no text; sns text[]; v_brand uuid; v_co uuid; v_details jsonb; v_case text;
begin
  for c in select * from demo_claims order by n loop
    v_co := (select company_id from public.profiles where id = pg_temp.uid(c.login));
    sns := (select array_agg(sn) from (select s.sn from public.serials s where s.sku = c.sold_sku and s.status = 'sold' and s.company_id is not distinct from v_co
                                         and not exists (select 1 from public.claims x where s.sn = any (x.reported_sns))
                                       order by s.sn limit c.qty) z);
    if coalesce(cardinality(sns), 0) < c.qty then
      sns := coalesce(sns, '{}') || (select array_agg(sn) from (select s.sn from public.serials s where s.sku = c.sold_sku and s.status = 'sold'
                                       and not exists (select 1 from public.claims x where s.sn = any (x.reported_sns)) and not s.sn = any (coalesce(sns, '{}'))
                                     order by s.sn limit c.qty - coalesce(cardinality(sns), 0)) z);
    end if;
    v_brand := (select p.brand_id from public.product_variants v join public.products p on p.id = v.product_id where v.sku = c.sold_sku);
    v_case := case when c.ptype = 'inverter' and v_brand = pg_temp.brand('solaredge') then '0' || (5000000 + c.n * 7919)::text end;
    v_details := case c.ptype
      when 'optimizer' then jsonb_build_object('items', jsonb_build_array(jsonb_build_object('model', c.model, 'qty', c.qty, 'bad_sn', array_to_string(sns, ' '))))
      else jsonb_build_object('sn', array_to_string(sns, ' '), 'qty', c.qty, 'case_no', v_case,
                              'issue', case when v_case is not null then split_part(c.symptom, ' ', 1) end,
                              'description', case when v_case is not null then c.symptom end,
                              'manager_sn', case when c.ptype = 'inverter' then sns[1] end) end;
    perform pg_temp.act(c.login);
    select id, claim_no into v_id, v_no from public.submit_claim(jsonb_build_object(
      'product_type', c.ptype, 'brand_id', v_brand, 'model', c.model, 'contact_name', (select full_name from public.profiles where id = pg_temp.uid(c.login)),
      'contact_phone', (select phone from public.profiles where id = pg_temp.uid(c.login)), 'site_id', 'SITE-' || (24000 + c.n * 37),
      'site_name', (array['โรงงานอาหารแปรรูป นวนคร', 'ห้างสรรพสินค้า รังสิต', 'บ้านคุณวีระ ราชพฤกษ์', 'โรงงานพลาสติก บางพลี', 'รีสอร์ทพัทยา', 'โรงแรมนิมมาน เชียงใหม่'])[1 + c.n % 6],
      'installer_name', (select company_name from public.profiles where id = pg_temp.uid(c.login)),
      'symptom', c.symptom, 'details', v_details,
      'delivery_type', case when c.ship then 'shipping' else 'pickup' end,
      'delivery_address', case when c.ship then (select address from public.companies where id = v_co) end));

    update public.claims set created_at = now() - make_interval(days => c.days, hours => 3) where id = v_id;
    update public.claim_events set created_at = now() - make_interval(days => c.days, hours => 3) where claim_id = v_id;

    if c.handler is not null then
      perform pg_temp.act(c.handler);
      perform public.take_claim(v_id);
      if c.status = 'rejected' then
        perform public.set_claim_status(v_id, 'rejected', 'ตรวจสอบแล้วเกิดจากการตั้งค่าเครือข่ายของลูกค้า ไม่ใช่ความเสียหายของสินค้า แนะนำวิธีตั้งค่าทางอีเมลแล้ว');
      else
        perform public.set_claim_status(v_id, 'in_progress', 'รับเรื่องแล้ว กำลังตรวจสอบกับแบรนด์');
        update public.claim_events set created_at = now() - make_interval(days => greatest(c.days - 1, 0)) where claim_id = v_id and status = 'in_progress';
      end if;

      -- ผัง 5 ขั้นภายใน: SN ที่เสีย → RMA → รับของใหม่ → ส่งของให้ลูกค้า
      -- ผัง 5 ขั้นภายใน: 2 เบิกของใหม่ให้ลูกค้า → 3 ลูกค้าคืนของเสีย → 4 รับของเคลมจากผู้ผลิต (RMA) → 5 ส่งของเสียคืนผู้ผลิต
      update public.claims set voucher_no = 'JV' || (6911000 + c.n), voucher_date = current_date - c.days, sales_code = 'S0' || (1 + c.n % 3),
                               pickup_on = case when c.status in ('done', 'returned', 'closed') then to_char(current_date - greatest(c.days - 6, 0), 'DD/MM/YYYY') end
       where id = v_id;
      update public.claim_units u set
        iss_sn  = case when c.status in ('done', 'returned', 'closed') or (c.status = 'in_progress' and c.n % 2 = 1) then 'N' || sns[u.seq] end,
        iss_doc = case when c.status in ('done', 'returned', 'closed') or (c.status = 'in_progress' and c.n % 2 = 1) then 'MAC5-WD' || (69110 + c.n * 3 + u.seq) end,
        iss_date = case when c.status in ('done', 'returned', 'closed') or (c.status = 'in_progress' and c.n % 2 = 1) then current_date - greatest(c.days - 5, 0) end,
        rma_no = case when c.extra = 'rma' then 'RMA' || (77100000 + c.n * 131 + u.seq)::text end,
        rma_date = case when c.extra = 'rma' then current_date - greatest(c.days - 2, 0) end,
        rcv_pcode = case when c.status = 'closed' then u.pcode end,
        rcv_doc = case when c.status = 'closed' then 'GN-AWOT-' || (500 + c.n) end,
        rcv_date = case when c.status = 'closed' then current_date - greatest(c.days - 9, 0) end,
        rcv_sn = case when c.status = 'closed' then 'R' || sns[u.seq] end,
        ok_pcode = case when c.status = 'closed' then u.pcode end,
        ok_doc = case when c.status = 'closed' then 'RT-AWOT-' || (300 + c.n) end,
        ok_date = case when c.status = 'closed' then current_date - greatest(c.days - 10, 0) end,
        ok_sn = case when c.status = 'closed' then sns[u.seq] end
       where u.claim_id = v_id;

      if c.status in ('done', 'returned', 'closed') then
        update public.claims set claim_doc_path = 'demo/' || v_id || '/claim-doc.pdf' where id = v_id;
        perform public.set_claim_status(v_id, 'done', 'ของใหม่มาถึงแล้ว ลูกค้ารับของได้ที่คลังปทุมธานี กรุณานำของเสียมาคืน');
        update public.claim_events set created_at = now() - make_interval(days => greatest(c.days - 6, 0)) where claim_id = v_id and status = 'done';
      end if;
      if c.status in ('returned', 'closed') then
        perform pg_temp.act(c.login);
        perform public.return_claim(v_id, sns);
        update public.claims set returned_at = now() - make_interval(days => greatest(c.days - 8, 0)) where id = v_id;
        update public.claim_events set created_at = now() - make_interval(days => greatest(c.days - 8, 0)) where claim_id = v_id and status = 'returned';
        perform pg_temp.act(c.handler);
      end if;
      if c.status = 'closed' then
        perform public.set_claim_status(v_id, 'closed', null);
        update public.claims set closed_at = now() - make_interval(days => greatest(c.days - 10, 0)) where id = v_id;
        update public.claim_events set created_at = now() - make_interval(days => greatest(c.days - 10, 0)) where claim_id = v_id and status = 'closed';
      end if;
      if c.ship and c.status <> 'rejected' then
        perform public.set_claim_shipping(v_id, 350, 'Kerry Express', case when c.status in ('returned', 'closed', 'done') then 'KEX' || (880000000 + c.n) end);
        if c.status in ('returned', 'closed') then
          update public.claims set ship_status = 'paid', ship_slip_path = 'demo/slip-sample.jpg', ship_slip_at = now() - interval '15 days', ship_paid_at = now() - interval '14 days', ship_checked_by = pg_temp.uid(c.handler) where id = v_id;
        elsif c.n = 6 then
          update public.claims set ship_status = 'slip', ship_slip_path = 'demo/slip-sample.jpg', ship_slip_at = now() - interval '1 day' where id = v_id;
        end if;
      end if;
    end if;
  end loop;

  -- คำขอแก้ไข SN (รอเจ้าหน้าที่ตรวจ)
  perform pg_temp.act('wanida');
  perform public.request_sn_change((select id from public.claims where symptom like 'Optimizer ไม่ Pairing%'),
          (select reported_sns[1] from public.claims where symptom like 'Optimizer ไม่ Pairing%'),
          (select reported_sns[1] from public.claims where symptom like 'Optimizer ไม่ Pairing%') || 'X', 'typo', 'พิมพ์ตัวท้ายผิด');
end $$;

-- เคลมที่เจ้าหน้าที่บันทึกแทนลูกค้า (โทรมาแจ้ง)
insert into public.claims (source, company_id, company_name, brand_id, product_type, model, contact_name, contact_phone, site_name, site_id,
                           symptom, reported_sns, qty, status, assigned_to, created_by, internal_note, created_at)
values ('staff', pg_temp.co('0105564000044'), 'บริษัท ไทยเอนเนอร์ยี่ โซลูชั่น จำกัด', pg_temp.brand('solaredge'), 'inverter', 'SE10K-RWB48BFN4',
        'จิรภัทร รุ่งเรือง', '089-111-2006', 'โรงแรมนิมมาน เชียงใหม่', 'SITE-30881', 'ลูกค้าโทรแจ้ง: Home Hub ไม่สลับไปโหมด Backup ตอนไฟดับ',
        array[(select sn from public.serials where sku = 'SE10K-RWB48BFN4' and status = 'sold' order by sn limit 1)], 1, 'in_progress',
        pg_temp.uid('service'), pg_temp.uid('service'), 'นัดช่างเข้าหน้างานพร้อม Engineer SolarEdge', now() - interval '4 days');
insert into public.claim_units (claim_id, seq, pcode, iss_sn, iss_date)
select id, 1, model, reported_sns[1], current_date - 4 from public.claims where source = 'staff';

-- ---------------------------------------------------------------------------
-- 11. ข้อความติดต่อ ผลงาน คำขอลบบัญชี
-- ---------------------------------------------------------------------------
insert into public.contact_messages (name, company, phone, email, topic, message, status, created_at) values
 ('คุณวีระ', 'บ้านพักส่วนตัว', '086-222-3001', 'weera@example.com', 'quotation', 'สนใจติดตั้งโซลาร์ 10 kW ที่บ้าน นนทบุรี ขอใบเสนอราคาครับ', 'new', now() - interval '2 hours'),
 ('คุณปวีณา', 'บจก. ฟู้ดแลนด์ แฟคตอรี่', '086-222-3002', 'paweena@example.com', 'quotation', 'โรงงานใช้ไฟเดือนละ 80,000 หน่วย อยากทราบขนาดระบบที่เหมาะสม', 'in_progress', now() - interval '1 day'),
 ('คุณเอกชัย', 'ช่างอิสระ', '086-222-3003', null, 'training', 'คอร์ส O&M รอบหน้าเปิดเมื่อไหร่ครับ', 'closed', now() - interval '6 days'),
 ('คุณศิริพร', 'บจก. พีวี เทรดดิ้ง', '086-222-3004', 'siriporn@example.com', 'dealer', 'ต้องการเป็นตัวแทนจำหน่ายในภาคอีสาน', 'new', now() - interval '3 days'),
 ('คุณสมพงษ์', null, '086-222-3005', null, 'claim', 'อินเวอร์เตอร์ขึ้น Error ต้องทำอย่างไรครับ', 'closed', now() - interval '10 days');

insert into public.portfolio_projects (title, project_type, size_kwp, province, year, equipment, description, is_published, sort) values
 ('โรงงานอาหารแปรรูป นวนคร', 'factory', 499.8, 'ปทุมธานี', 2026, 'SolarEdge SE100K x5, S1200 x700, Leapton 710W', 'ลดค่าไฟได้ราว 35% ต่อเดือน', true, 1),
 ('ห้างสรรพสินค้า รังสิต', 'commercial', 66.6, 'ปทุมธานี', 2026, 'SolarEdge SE33.3K x2, S1200 x54', 'ติดตั้งบนหลังคาลานจอดรถ', true, 2),
 ('บ้านคุณวีระ ราชพฤกษ์', 'residential', 12.8, 'นนทบุรี', 2026, 'SolarEdge Home Hub SE10K + Battery 10kWh', 'ระบบไฮบริดพร้อมสำรองไฟ', true, 3),
 ('โรงแรมนิมมาน เชียงใหม่', 'commercial', 30.2, 'เชียงใหม่', 2025, 'SolarEdge SE33.3K, S1400', 'โรงแรมบูติก 40 ห้อง', true, 4),
 ('รีสอร์ทพัทยา', 'commercial', 20.0, 'ชลบุรี', 2025, 'SolarEdge SE10K x2', 'ใช้ไฟกลางวันสำหรับสระและห้องอาหาร', true, 5),
 ('โรงงานพลาสติก บางพลี', 'factory', 100.0, 'สมุทรปราการ', 2025, 'SolarEdge SE100K, P1100', 'ระบบ 3 เฟส บนหลังคาเมทัลชีท', true, 6);

insert into public.account_requests (user_id, reason, created_at) values
 (pg_temp.uid('kittisak'), 'เปลี่ยนไปใช้อีเมลบริษัทใหม่ ขอลบบัญชีเดิม', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- 12. เก็บกวาด
-- ---------------------------------------------------------------------------
do $$ begin perform pg_temp.act(null); end $$;
delete from public.audit_logs where actor_id is null;
analyze;

select 'เสร็จแล้ว: ' || (select count(*) from public.profiles) || ' บัญชี, ' || (select count(*) from public.companies) || ' บริษัท, '
       || (select count(*) from public.stock_docs) || ' เอกสารคลัง, ' || (select count(*) from public.serials) || ' SN, '
       || (select count(*) from public.claims) || ' เคลม, ' || (select count(*) from public.training_registrations) || ' การลงทะเบียนอบรม, '
       || (select count(*) from public.point_ledger) || ' รายการแต้ม' as result;
