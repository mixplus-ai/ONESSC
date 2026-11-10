-- One App SSC · Phase 3 seed: training catalogue + settings from cerssc (SSC Training Portal)
-- Source: cerssc Supabase project (tp_sheets: Settings, Templates, Courses, Sessions, Materials, Rewards), read 10 Nov 2026.
-- Safe to run more than once (matches rows by legacy_id). Member accounts/registrations are in a separate file
-- kept outside the repo (personal data): cerssc_members.sql in the project files.

begin;

-- ---- settings (cerssc Settings sheet)
update public.training_settings set
  max_active_bookings = 5,
  change_days_before = 3,
  strike_limit = 2,
  auto_no_show = true,
  checkin_open_minutes = 120,
  checkin_radius_m = 100,
  cert_format = 'SSC-{CODE}-{YYYY}-{RUN}',
  cert_run_digits = 4,
  cert_valid_months = 12,
  vat_rate = 7,
  wht_rate = 3,
  person_no_vat = true,
  pay_info = 'ธนาคารกสิกรไทย เลขที่ 081-8-89054-0 ชื่อบัญชี บจก. อรุโณทัย เซอร์วิส แอนด์ โลจิสติคส์',
  wht_payee_info = 'บริษัท อรุโณทัย เซอร์วิส แอนด์ โลจิสติคส์ จำกัด (สำนักงานใหญ่) เลขผู้เสียภาษี 0105560210012 568/8 ซอยวชิรธรรมสาธิต 57 แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร 10260',
  sales_list = array['Ms Asamaporn Photim (Nous)', 'Mr Teerawat Chatpomarat (Boy)', 'Ms Jirawadee Khumphusa (Aoom)',
                     'Ms Jirapreeya Sornkaew (Parry)', 'Mr Kittisak Jaratpattaranit (Tree)', 'Mr Chaleomchai Phowong (O)'],
  source_list = array['เฟซบุ๊ก (Facebook) ของสยามโซล่าเซลล์', 'ไลน์แอด (LINE OA) ของสยามโซล่าเซลล์',
                      'คำแนะนำจากเพื่อน / คนรู้จัก', 'คำแนะนำจากฝ่ายขาย / ทีมงาน']
where id = 1;

update public.points_config set points_per_hour = 1, rewards_enabled = true, lucky_cost = 10 where id = 1;

-- ---- certificate templates (images still on cerssc.netlify.app: re-upload them in the back office
--      so customers can download certificates — browsers block saving images from another site)
insert into public.cert_templates (legacy_id, name, image_url, config) values
  ('T261104DEMOR', 'SolarEdge O&M – แดง', 'https://cerssc.netlify.app/templates/tpl-om-red.jpg',
   '{"dateLang":"en","fields":{"name":{"show":true,"x":0.5,"y":0.388,"size":0.052,"color":"#7a0f1c","weight":500,"font":"Kanit","align":"center","maxWidth":0.62},"certNo":{"show":true,"x":0.1445,"y":0.9045,"size":0.0205,"color":"#8f2230","weight":400,"font":"Kanit","align":"left"},"date":{"show":true,"x":0.179,"y":0.9265,"size":0.0205,"color":"#8f2230","weight":400,"font":"Kanit","align":"left"},"expires":{"show":false,"x":0.179,"y":0.948,"size":0.0185,"color":"#8f2230","weight":400,"font":"Kanit","align":"left","prefix":"VALID UNTIL: "},"qr":{"show":true,"x":0.093,"y":0.782,"size":0.0965,"color":"#111111"},"course":{"show":false,"x":0.5,"y":0.47,"size":0.035,"color":"#7a0f1c","weight":600,"font":"Kanit","align":"center","maxWidth":0.7},"nameEn":{"show":false,"x":0.5,"y":0.44,"size":0.03,"color":"#555555","weight":400,"font":"Kanit","align":"center","maxWidth":0.62}}}'),
  ('T261104DEMOG', 'Basics Solar Design – เขียว', 'https://cerssc.netlify.app/templates/tpl-basic-green.jpg',
   '{"dateLang":"en","fields":{"name":{"show":true,"x":0.5,"y":0.388,"size":0.052,"color":"#2f7d47","weight":500,"font":"Kanit","align":"center","maxWidth":0.62},"certNo":{"show":true,"x":0.1445,"y":0.9045,"size":0.0205,"color":"#3c8d5c","weight":400,"font":"Kanit","align":"left"},"date":{"show":true,"x":0.179,"y":0.9265,"size":0.0205,"color":"#3c8d5c","weight":400,"font":"Kanit","align":"left"},"expires":{"show":false,"x":0.179,"y":0.948,"size":0.0185,"color":"#3c8d5c","weight":400,"font":"Kanit","align":"left","prefix":"VALID UNTIL: "},"qr":{"show":true,"x":0.2,"y":0.735,"size":0.115,"color":"#111111"},"course":{"show":false,"x":0.5,"y":0.47,"size":0.035,"color":"#2f7d47","weight":600,"font":"Kanit","align":"center","maxWidth":0.7}}}'),
  ('T261104DEMOB', 'Commercial Designer – น้ำเงิน', 'https://cerssc.netlify.app/templates/tpl-commercial-blue.jpg',
   '{"dateLang":"en","fields":{"name":{"show":true,"x":0.5,"y":0.388,"size":0.052,"color":"#16235a","weight":500,"font":"Kanit","align":"center","maxWidth":0.62},"certNo":{"show":true,"x":0.1445,"y":0.9045,"size":0.0205,"color":"#2c3a6e","weight":400,"font":"Kanit","align":"left"},"date":{"show":true,"x":0.179,"y":0.9265,"size":0.0205,"color":"#2c3a6e","weight":400,"font":"Kanit","align":"left"},"expires":{"show":false,"x":0.179,"y":0.948,"size":0.0185,"color":"#2c3a6e","weight":400,"font":"Kanit","align":"left","prefix":"VALID UNTIL: "},"qr":{"show":true,"x":0.2,"y":0.735,"size":0.115,"color":"#111111"},"course":{"show":false,"x":0.5,"y":0.47,"size":0.035,"color":"#16235a","weight":600,"font":"Kanit","align":"center","maxWidth":0.7}}}')
on conflict (legacy_id) do update set name = excluded.name, config = excluded.config;

-- ---- courses
insert into public.courses (legacy_id, code, title, subtitle, description, hours, price, color, cert_template_id, sort, is_active)
select v.legacy_id, v.code, v.title, v.subtitle, v.description, v.hours, v.price, v.color,
       (select id from public.cert_templates t where t.legacy_id = v.tpl), v.sort, v.active
from (values
  ('C261104YMQPK', 'OM', 'SolarEdge O&M (Operation & Maintenance)', 'หลักสูตรการบำรุงรักษาระบบโซล่าเซลล์ SolarEdge',
   'การตรวจสอบ บำรุงรักษา และแก้ไขปัญหาระบบ SolarEdge ภาคปฏิบัติ', 6::numeric, null::numeric, '#8f1424', 'T261104DEMOR', 1, false),
  ('C261104LIZG1', 'BSD', 'Basics Solar System Design', 'พื้นฐานการออกแบบระบบโซล่าร์เซลล์ SolarEdge',
   'หลักการออกแบบระบบโซล่าร์เซลล์เบื้องต้น การเลือกอุปกรณ์ และการคำนวณ', 6, null, '#1f6b3a', 'T261104DEMOG', 2, false),
  ('C261104KCR2P', 'CDI', 'SolarEdge Commercial Designer and Installation System', 'การออกแบบระบบโซล่าร์เซลล์ขนาดโรงงานและการติดตั้ง',
   'ออกแบบระบบขนาดเชิงพาณิชย์/โรงงาน การติดตั้งระบบรวมถึงการตั้งค่าขั้นสูง', 6, null, '#16235a', 'T261104DEMOB', 3, false),
  ('C261104CNWKF', 'ASL261101', 'การขอขนานระบบโซลาร์เซลล์กับการไฟฟ้า MEA & PEA',
   'เจาะลึกขั้นตอนการขอขนานระบบกับการไฟฟ้า เรียนรู้กระบวนการยื่นคำขอ การเตรียมเอกสาร และขั้นตอนที่เกี่ยวข้อง เพื่อเพิ่มความมั่นใจในการดำเนินงานติดตั้งโซลาร์เซลล์',
   null, 6, 3990, '#cb6c6c', null, 1, true)
) as v(legacy_id, code, title, subtitle, description, hours, price, color, tpl, sort, active)
on conflict (legacy_id) do update set title = excluded.title, subtitle = excluded.subtitle, description = excluded.description,
  hours = excluded.hours, price = excluded.price, color = excluded.color, cert_template_id = excluded.cert_template_id,
  sort = excluded.sort, is_active = excluded.is_active;

-- ---- sessions (check-in codes kept so printed QR/codes still work)
insert into public.course_sessions (legacy_id, course_id, title, starts_on, start_time, end_time, hours, location, map_url,
                                    capacity, status, price, vat, wht_allowed, checkin_code, note, is_archived)
select v.legacy_id, (select id from public.courses c where c.legacy_id = v.course), v.title, v.d::date, v.st::time, v.et::time, v.hours,
       v.location, v.map_url, v.cap, v.status, v.price, v.vat, v.wht, v.code, v.note, v.archived
from (values
  ('S261104DEMO1', 'C261104YMQPK', 'รุ่นตัวอย่าง 1/2569', '2026-11-20', '09:00', '16:00', 6::numeric, 'SSC Training Center บางนา',
   'https://maps.google.com/?q=Bangna', 30, 'cancelled', null::numeric, false, false, '246810', 'ข้อมูลตัวอย่าง', true),
  ('S261104PB9XV', 'C261104CNWKF', 'รอบที่ 1 - 19 พฤศจิกายน 2569 (วันพฤหัสบดี)', '2026-11-19', '09:00', '16:00', 6,
   'บริษัท สยาม โซล่าร์ เซลล์ จำกัด (ศูนย์กระจายสินค้า)', 'https://maps.app.goo.gl/kwf9vekyvLPQ9sUw9', 20, 'open', 3900, true, true, '924874', null, false),
  ('S261104YZQ1I', 'C261104CNWKF', 'รอบที่ 2 - 26 พฤศจิกายน 2569 (วันพฤหัสบดี)', '2026-11-26', '09:00', '16:00', 6,
   'บริษัท สยาม โซล่าร์ เซลล์ จำกัด (ศูนย์กระจายสินค้า)', 'https://maps.app.goo.gl/kwf9vekyvLPQ9sUw9', 20, 'open', 3900, true, true, '467729', null, false)
) as v(legacy_id, course, title, d, st, et, hours, location, map_url, cap, status, price, vat, wht, code, note, archived)
on conflict (legacy_id) do update set title = excluded.title, starts_on = excluded.starts_on, location = excluded.location,
  map_url = excluded.map_url, capacity = excluded.capacity, status = excluded.status, price = excluded.price,
  is_archived = excluded.is_archived;

-- ---- materials
insert into public.course_materials (legacy_id, course_id, kind, title, url, visibility)
select v.legacy_id, (select id from public.courses c where c.legacy_id = v.course), 'video', v.title, v.url, 'registered'
from (values
  ('M261104DEMO1', 'C261104YMQPK', 'วิดีโอตัวอย่าง: ขั้นตอนตรวจ Optimizer (YouTube)', 'https://www.youtube.com/'),
  ('M261104DEMO2', 'C261104LIZG1', 'วิดีโอตัวอย่าง: หลักการออกแบบระบบ (YouTube)', 'https://www.youtube.com/')
) as v(legacy_id, course, title, url)
on conflict (legacy_id) do nothing;

-- ---- rewards (personal points). The cerssc rows are marked "(ตัวอย่าง)" — edit or hide them in the back office.
insert into public.rewards (legacy_id, wallet, kind, name, description, points, stock, weight, discount_baht, bonus_points, sort, is_active)
values
  ('W261104DEMO1', 'personal', 'item', 'แก้วเก็บความเย็น SSC (ตัวอย่าง)', 'ขนาด 30 oz', 6, 20, null, null, null, 1, true),
  ('W261104DEMO2', 'personal', 'item', 'เสื้อโปโล SolarEdge (ตัวอย่าง)', 'เลือกไซซ์ได้', 12, 15, null, null, null, 2, true),
  ('W261104DEMO3', 'personal', 'item', 'คูปองส่วนลดอบรม 1,000 บาท (ตัวอย่าง)', 'ใช้กับหลักสูตรที่มีค่าใช้จ่าย', 18, null, null, 1000, null, 3, true),
  ('W261104DEMO4', 'personal', 'prize', 'Power Bank 10,000 mAh (ตัวอย่าง)', null, null, 10, 10, null, null, 4, true),
  ('W261104DEMO5', 'personal', 'prize', 'ร่มพับ SSC (ตัวอย่าง)', null, null, null, 30, null, null, 5, true),
  ('W261104DEMO6', 'personal', 'prize', 'แต้มคืน 5 แต้ม (ตัวอย่าง)', null, null, null, 40, null, 5, 6, true)
on conflict (legacy_id) do nothing;

commit;
