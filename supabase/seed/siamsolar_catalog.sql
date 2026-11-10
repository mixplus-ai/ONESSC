-- Import of the old siamsolar.netlify.app catalog (Google Sheet 'Products' + 'Sales').
-- Generated from sheet 1Zm0QtxOVdjRYSuXKIJ9FLO1JMO_BI673LBMtk8DBfTo. Safe to run more than once:
-- products are matched by legacy_ref, SKUs by sku (a SKU created as a draft from the stock file is moved here).
begin;
insert into public.brands (name, slug, stock_groups, sort) values
  ('LONGi', 'longi', '{LONGI}', 55), ('Solar PPM', 'sppm', '{SPPM}', 65), ('TCL', 'tcl', '{}', 75)
on conflict (name) do nothing;
update public.brands set name = 'Leapton Solar' where slug = 'leapton' and name = 'LEAPTON';
update public.brands set name = 'Sunwoda' where slug = 'sunwoda' and name = 'SUNWODA';

-- INVERTER SE5000H ( On-Grid)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'INVERTER SE5000H ( On-Grid)', 'inverter-se5000h-on-grid', 'SolarEdge Home Short String Inverter', 'SolarEdge Home Short String Inverter

A special solution for small residential projects, the SolarEdge Home Short String Inverter offers design flexibility by supporting significantly shorter solar strings, ideal for low-power 1-phase solar power systems. This inverter is optimized for complex rooftop installations, such as multi-level or directional rooftops.

เอกสารเพิ่มเติม: https://drive.google.com/file/d/1d4IMasuyxr3m-kTL879h5QJro5U3d7SQ/view', array['1P','5kw','on-grid']::text[], 'https://lh3.googleusercontent.com/d/1heaWbhfpgsG0PA1iHEXyz_uJyUIG89G5', 'https://drive.google.com/file/d/1J-jxog561po73EqwNT-UK158MQvXJ4B8/view', null, 'https://www.youtube.com/watch?v=-60yoYIFgVw', true, 0, 'siamsolar:2026-07-25 18:51:36.191000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 18:51:36.191000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE5000H-RW000BNN4', 'SE5000H-RW000BNN4', 'อินเวอร์เตอร์ Solar Edge ขนาด 1PH 5KVA ROW,40C', 0 from public.products where legacy_ref = 'siamsolar:2026-07-25 18:51:36.191000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE5000H-TH000BNN4', 'SE5000H-TH000BNN4', 'อินเวอร์เตอร์ Solar Edge ขนาด 1PH 5KV', 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 18:51:36.191000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE5000H-THR00BNN4', 'SE5000H-THR00BNN4', 'อินเวอร์เตอร์ Solar Edge ขนาด 1PH 5KV RSD', 2 from public.products where legacy_ref = 'siamsolar:2026-07-25 18:51:36.191000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- SPPM-MG12-GG มอก. 580-600W 15Y
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'sppm'), (select id from public.product_categories where slug = 'pv-module'),
       'SPPM-MG12-GG มอก. 580-600W 15Y', 'sppm-mg12-gg-580-600w-15y', 'SPPM-MG12-GG มอก.', 'SPPM-MG12-GG มอก. 580-600W 15Y

เอกสารเพิ่มเติม: https://drive.google.com/file/d/1lUZxVzecotTp2mTry16dVIBaPj0qEGds/view', array['600W','มอก','SPPM']::text[], 'https://lh3.googleusercontent.com/d/1x-I5LVpxMgKvuBt1axj4jO6RLsu86iFG', 'https://drive.google.com/file/d/1UTDZSAZRVcueuM4RwGselqQbZwY8zUH4/view', 'https://drive.google.com/file/d/1pm5HdPMTGj2eJz0SrQRA7gs_J_fgQUsP/view', 'https://www.youtube.com/watch?v=biX82PmkUQ4', true, 10, 'siamsolar:2026-07-25 20:02:21.959000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 20:02:21.959000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SPPM-MG12-GG 600W', 'SPPM-MG12-GG 600W', 'แผงโซล่าร์ เซลล์ SPPM-MG12-GG 600 วัตต์ (มอก.) MONO-BIFACIAL (LV)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-25 20:02:21.959000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SPPM-MG12-GG 600W-1', 'SPPM-MG12-GG 600W-1', 'แผงโซล่าร์ เซลล์ SPPM-MG12-GG 600 วัตต์ (มอก.) MONO-BIFACIAL (LV) สลักกรมทรัพยากรน้ำ', 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 20:02:21.959000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SPPM-MG12-GG 600W-640', 'SPPM-MG12-GG 600W-640', 'แผงโซล่าร์ เซลล์ SPPM-MG12-GG 600 วัตต์ (มอก.) MONO-BIFACIAL (LV)', 2 from public.products where legacy_ref = 'siamsolar:2026-07-25 20:02:21.959000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SPPM-MG12-GG 600W-650', 'SPPM-MG12-GG 600W-650', 'แผงโซล่าร์ เซลล์ SPPM-MG12-GG 600 วัตต์ (มอก.) MONO-BIFACIAL (LV)', 3 from public.products where legacy_ref = 'siamsolar:2026-07-25 20:02:21.959000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- INVERTER SE10K ( On-Grid)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'INVERTER SE10K ( On-Grid)', 'inverter-se10k-on-grid', 'SolarEdge SE10K อินเวอร์เตอร์ออนกริด 3 เฟส เทคโนโลยี HOME-Wave ทำงานร่วมกับ Power Optimizer รองรับสตริงสั้น เพิ่มความยืดหยุ่นในการออกแบบ เหมาะกับหลังคาหลายระดับหรือหลายทิศทาง ติดตั้งง่าย ตั้งค่าผ่านแอ', 'SolarEdge SE10K อินเวอร์เตอร์ออนกริด 3 เฟส เทคโนโลยี HOME-Wave ทำงานร่วมกับ Power Optimizer รองรับสตริงสั้น เพิ่มความยืดหยุ่นในการออกแบบ เหมาะกับหลังคาหลายระดับหรือหลายทิศทาง ติดตั้งง่าย ตั้งค่าผ่านแอป SetApp และติดตั้งได้ทั้งภายในและภายนอกอาคาร', array['3P','10kw','on-grid']::text[], 'https://lh3.googleusercontent.com/d/1riCRNY5HP0TR1BWIzl1028ectAjGTCPu', 'https://drive.google.com/file/d/1GbXu0v7FTgCr1FbYdkI9Sj6HP9DELaqI/view', 'https://drive.google.com/file/d/1zk7tUKcvFYkQaof1NQja6jyZJeO2uycj/view', 'https://www.youtube.com/watch?v=-60yoYIFgVw', true, 20, 'siamsolar:2026-07-25 21:22:59.714000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 21:22:59.714000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE10K-TH0TEBNN4', 'SE10K-TH0TEBNN4', 'อินเวอร์เตอร์ Solaredge 3PH  ขนาด 10KVA', 0 from public.products where legacy_ref = 'siamsolar:2026-07-25 21:22:59.714000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- BlueArk X1
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'tcl'), (select id from public.product_categories where slug = 'battery'),
       'BlueArk X1', 'blueark-x1', 'BlueArk X1 ระบบกักเก็บพลังงานสำหรับที่อยู่อาศัยที่รวมอุปกรณ์สำคัญไว้ในชุดเดียว ได้แก่ ไฮบริดอินเวอร์เตอร์, แบตเตอรี่, ระบบสำรองไฟ (UPS) และระบบจัดการพลังงานอัจฉริยะ (EMS)', 'BlueArk X1 ระบบกักเก็บพลังงานสำหรับที่อยู่อาศัยที่รวมอุปกรณ์สำคัญไว้ในชุดเดียว ได้แก่ ไฮบริดอินเวอร์เตอร์, แบตเตอรี่, ระบบสำรองไฟ (UPS) และระบบจัดการพลังงานอัจฉริยะ (EMS)

เอกสารเพิ่มเติม: https://drive.google.com/file/d/1bANHsxtYwH386c58oYZOrzK3HdGIVzqm/view', array['1P','6kw','All in one','Hybrid','battery']::text[], 'https://lh3.googleusercontent.com/d/1DvS0MUwLVe-KMkvUYpLrqjbAdgMxmXPk', 'https://drive.google.com/file/d/1nsjwjMwPm7eUwi8M2TSofoB0ZEaD1AFW/view', null, 'https://www.youtube.com/watch?v=4uAg4ocCWlI', true, 30, 'siamsolar:2026-07-25 21:53:25.375000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 21:53:25.375000');
-- Atrix max-16l-p
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'sunwoda'), (select id from public.product_categories where slug = 'battery'),
       'Atrix max-16l-p', 'atrix-max-16l-p', 'Atrix Max+ แบตเตอรี่กักเก็บพลังงานความจุ 16 kWh ใช้เซลล์ 314Ah รองรับอุณหภูมิ -20°C ถึง 55°C พร้อมระบบตรวจสอบระยะไกลแบบเรียลไทม์ เชื่อมต่อขนานได้สูงสุด 32 เครื่อง รวมความจุ 512 kWh เหมาะสำหรับบ้าน ฟาร', 'Atrix Max+ แบตเตอรี่กักเก็บพลังงานความจุ 16 kWh ใช้เซลล์ 314Ah รองรับอุณหภูมิ -20°C ถึง 55°C พร้อมระบบตรวจสอบระยะไกลแบบเรียลไทม์ เชื่อมต่อขนานได้สูงสุด 32 เครื่อง รวมความจุ 512 kWh เหมาะสำหรับบ้าน ฟาร์ม ธุรกิจขนาดเล็ก และระบบออฟกริด', array['16kwh','Battery']::text[], 'https://lh3.googleusercontent.com/d/1zd5IzC0jUG8LtKaoIU16Sm1sjWtUbC5S', 'https://drive.google.com/file/d/1SqqfbIO6WdJRf3tp-tdSo2Jx_DSx6iWj/view', 'https://drive.google.com/file/d/1LMgpm6phGBDbdgl3U_oz3KcVLiYI6RtR/view', 'https://www.youtube.com/watch?v=jlMk88MshjU', true, 40, 'siamsolar:2026-07-25 22:21:10.305000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-25 22:21:10.305000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'ATRIX MAX-16L-P', 'ATRIX MAX-16L-P', 'SUNWODA ENERGY STORAGE BATTERY 16kWh,IP65,10,000 cycle ,Warranty 10 years.', 0 from public.products where legacy_ref = 'siamsolar:2026-07-25 22:21:10.305000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Home Hub SE5000H ( Hybrid )
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'Home Hub SE5000H ( Hybrid )', 'home-hub-se5000h-hybrid', 'SolarEdge Home Hub Single Phase SE5000H คืออินเวอร์เตอร์ไฮบริดอัจฉริยะขนาด 5kW ที่สุดแห่งเทคโนโลยีเพื่อการจัดการพลังงานในบ้านยุคใหม่ ทำหน้าที่เป็นศูนย์กลางเชื่อมต่อและควบคุมทั้งแผงโซลาร์เซลล์ แบตเตอรี', 'SolarEdge Home Hub Single Phase SE5000H คืออินเวอร์เตอร์ไฮบริดอัจฉริยะขนาด 5kW ที่สุดแห่งเทคโนโลยีเพื่อการจัดการพลังงานในบ้านยุคใหม่ ทำหน้าที่เป็นศูนย์กลางเชื่อมต่อและควบคุมทั้งแผงโซลาร์เซลล์ แบตเตอรี่สำรองไฟ และเครื่องชาร์จรถยนต์ไฟฟ้า (EV) ได้อย่างราบรื่นในเครื่องเดียว ด้วยเทคโนโลยี HD-Wave ที่ล้ำสมัย จึงให้ประสิทธิภาพการแปลงไฟสูงถึง 99.2% และรองรับการติดตั้งแผงโซลาร์เซลล์เกินพิกัดได้มากถึง 200% เพื่อกักเก็บพลังงานไว้ใช้ได้อย่างเต็มประสิทธิภาพ ที่สำคัญยังรองรับการจ่ายไฟสำรองอัตโนมัติ (Backup) ให้คุณมั่นใจว่าจะมีไฟฟ้าใช้ต่อเนื่องแม้เกิดเหตุไฟดับ ตัวเครื่องมีขนาดกะทัดรัด ติดตั้งและตั้งค่าได้ง่ายดายผ่านสมาร์ทโฟน ตอบโจทย์ผู้ที่อยากติดตั้งระบบโซลาร์เซลล์ที่เน้นความคุ้มค่า ความปลอดภัย และอิสรภาพทางพลังงานอย่างแท้จริง', array['1P','5kw','Hybrid']::text[], 'https://lh3.googleusercontent.com/d/1SQ9UPfDJhl1OTSaPVbr_oov1dLcNWyrF', 'https://drive.google.com/file/d/16B9xM_yYUDeRxSDMfmhDJvBuVroonE8W/view', null, null, true, 50, 'siamsolar:2026-07-26 11:21:08.502000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:21:08.502000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE5000H-THSNBBX14', 'SE5000H-THSNBBX14', 'อินเวอร์เตอร์ Solar Edge ขนาด 1PH 5KV ใช้กับแบตเตอรี่', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:21:08.502000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Home Hub SE10K ( Hybrid)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'Home Hub SE10K ( Hybrid)', 'home-hub-se10k-hybrid', 'SolarEdge Home Hub Three Phase SE10K คืออินเวอร์เตอร์ไฮบริดอัจฉริยะขนาด 10kW ที่สุดแห่งเทคโนโลยีเพื่อการจัดการพลังงานในบ้านยุคใหม่ ทำหน้าที่เป็นศูนย์กลางเชื่อมต่อและควบคุมทั้งแผงโซลาร์เซลล์ แบตเตอรี่ส', 'SolarEdge Home Hub Three Phase SE10K คืออินเวอร์เตอร์ไฮบริดอัจฉริยะขนาด 10kW ที่สุดแห่งเทคโนโลยีเพื่อการจัดการพลังงานในบ้านยุคใหม่ ทำหน้าที่เป็นศูนย์กลางเชื่อมต่อและควบคุมทั้งแผงโซลาร์เซลล์ แบตเตอรี่สำรองไฟ และเครื่องชาร์จรถยนต์ไฟฟ้า (EV) ได้อย่างราบรื่นในเครื่องเดียว ด้วยเทคโนโลยี HD-Wave ที่ล้ำสมัย จึงให้ประสิทธิภาพการแปลงไฟสูงถึง 99.2% และรองรับการติดตั้งแผงโซลาร์เซลล์เกินพิกัดได้มากถึง 200% เพื่อกักเก็บพลังงานไว้ใช้ได้อย่างเต็มประสิทธิภาพ ที่สำคัญยังรองรับการจ่ายไฟสำรองอัตโนมัติ (Backup) ให้คุณมั่นใจว่าจะมีไฟฟ้าใช้ต่อเนื่องแม้เกิดเหตุไฟดับ ตัวเครื่องมีขนาดกะทัดรัด ติดตั้งและตั้งค่าได้ง่ายดายผ่านสมาร์ทโฟน ตอบโจทย์ผู้ที่อยากติดตั้งระบบโซลาร์เซลล์ที่เน้นความคุ้มค่า ความปลอดภัย และอิสรภาพทางพลังงานอย่างแท้จริง', array['3P','10kw','Hybrid']::text[], 'https://lh3.googleusercontent.com/d/1ShIuVyRIxIYYRCZ0m2LKv0csK7RsLjZc', 'https://drive.google.com/file/d/1EnRLVUrLFDf6t9dtPDYNLyqu7geV6MPk/view', null, null, true, 60, 'siamsolar:2026-07-26 11:23:10.335000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:23:10.335000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE10K-RWB48BFN4', 'SE10K-RWB48BFN4', 'อินเวอร์เตอร์ Solaredge 3PH  ขนาด 10KVA Inverter with SetApp configuration ใช้กับแบต', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:23:10.335000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Backup Interface 1P
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'accessory'),
       'Backup Interface 1P', 'backup-interface-1p', 'SolarEdge Home Backup Interface หรือ Backup Interface 1P ทำหน้าที่เป็น ระบบสลับไฟอัตโนมัติ เพื่อให้บ้านของคุณยังมีไฟฟ้าใช้เมื่อเกิดเหตุการณ์ไฟดับจากโครงข่ายหลัก (การไฟฟ้า)', 'SolarEdge Home Backup Interface หรือ Backup Interface 1P ทำหน้าที่เป็น ระบบสลับไฟอัตโนมัติ เพื่อให้บ้านของคุณยังมีไฟฟ้าใช้เมื่อเกิดเหตุการณ์ไฟดับจากโครงข่ายหลัก (การไฟฟ้า)', '{}'::text[], 'https://lh3.googleusercontent.com/d/1iSvn-K2mx-RfygGdX-f71wscTFKLiTNz', 'https://drive.google.com/file/d/1DCYvrYUunON1fO2Ig9dggNCUrvqzutET/view', null, null, true, 70, 'siamsolar:2026-07-26 11:24:36.885000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:24:36.885000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BI-NAUGN-01', 'BI-NAUGN-01', 'SolarEdge Home Backup Interface (10K)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:24:36.885000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Backup Interface 3P
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'accessory'),
       'Backup Interface 3P', 'backup-interface-3p', 'SolarEdge Home Backup Interface หรือ Backup Interface 3P ทำหน้าที่เป็น ระบบสลับไฟอัตโนมัติ เพื่อให้บ้านของคุณยังมีไฟฟ้าใช้เมื่อเกิดเหตุการณ์ไฟดับจากโครงข่ายหลัก (การไฟฟ้า)', 'SolarEdge Home Backup Interface หรือ Backup Interface 3P ทำหน้าที่เป็น ระบบสลับไฟอัตโนมัติ เพื่อให้บ้านของคุณยังมีไฟฟ้าใช้เมื่อเกิดเหตุการณ์ไฟดับจากโครงข่ายหลัก (การไฟฟ้า)', array['3P']::text[], 'https://lh3.googleusercontent.com/d/1Fi57OCgN1mEa36IECG4-A7GWO5fhEwuF', 'https://drive.google.com/file/d/1vIsSNxUZEiHAongrl6r1skaANvC3ZByC/view', null, null, true, 80, 'siamsolar:2026-07-26 11:25:51.633000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:25:51.633000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BI-NEUNU-3P-01', 'BI-NEUNU-3P-01', '3 Phase Back Up Interface for Eu with Enet', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:25:51.633000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Battery 400V 10kWh 1P
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'battery'),
       'Battery 400V 10kWh 1P', 'battery-400v-10kwh-1p', 'แบตเตอรี่ SolarEdge Home Battery 400V 10kWh เป็นหัวใจสำคัญของระบบจัดเก็บพลังงานที่ทำงานผ่านระบบ DC-Coupled ทำให้ไม่สูญเสียพลังงานระหว่างชาร์จ และเชื่อมต่อแบบไร้สายได้อย่างสวยงาม', 'แบตเตอรี่ SolarEdge Home Battery 400V 10kWh เป็นหัวใจสำคัญของระบบจัดเก็บพลังงานที่ทำงานผ่านระบบ DC-Coupled ทำให้ไม่สูญเสียพลังงานระหว่างชาร์จ และเชื่อมต่อแบบไร้สายได้อย่างสวยงาม', array['1P','10kWh','Hybrid']::text[], 'https://lh3.googleusercontent.com/d/1sQx8GAzfAf9HQBLMEtS-NED62kAU6QQD', 'https://drive.google.com/file/d/1NCc-QQ_ts8wWOzneRGCAUYoCz84pNmgx/view', null, null, true, 90, 'siamsolar:2026-07-26 11:27:04.669000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:27:04.669000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BAT-10K1PSOB-12', 'BAT-10K1PSOB-12', 'SolarEdge Home-Battery - 10 years warranty', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:27:04.669000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Battery 48V 5kWh, 3P
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'battery'),
       'Battery 48V 5kWh, 3P', 'battery-48v-5kwh-3p', 'แบตเตอรี่ SolarEdge Home Backup Battery 48V (ความจุ 4.6kWh หรือ 4.85kWh ต่อโมดูล) ออกแบบมาเป็นระบบแรงดันต่ำ (Low Voltage) ที่ทำงานร่วมกับอินเวอร์เตอร์แบบ 3 เฟส (3P) อย่างรุ่น SolarEdge Home Hub Three ', 'แบตเตอรี่ SolarEdge Home Backup Battery 48V (ความจุ 4.6kWh หรือ 4.85kWh ต่อโมดูล) ออกแบบมาเป็นระบบแรงดันต่ำ (Low Voltage) ที่ทำงานร่วมกับอินเวอร์เตอร์แบบ 3 เฟส (3P) อย่างรุ่น SolarEdge Home Hub Three Phase โดยเฉพาะ', array['3P','10kWh','Hybrid']::text[], 'https://lh3.googleusercontent.com/d/1KkpwEt_RSftE8pbU18Yhg4TTrLFzhUr5', 'https://drive.google.com/file/d/1nQWAh_OQioygvBulw0C4U4wdH2WNSmJM/view', null, null, true, 100, 'siamsolar:2026-07-26 11:28:07.064000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:28:07.064000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BAT-05K48M0B-02', 'BAT-05K48M0B-02', 'SolarEdge Home-Battery - 48V', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:28:07.064000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- INVERTER SE33.3K ( On-Grid)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'INVERTER SE33.3K ( On-Grid)', 'inverter-se33-3k-on-grid', 'อินเวอร์เตอร์ SolarEdge 33.3kW on-grid SE33.3K เป็นอินเวอร์เตอร์ระบบ On-Grid แบบ 3 เฟส ขนาด 33.3kW ที่ออกแบบมาสำหรับระบบโซลาร์เซลล์ระดับพาณิชย์หรือโรงงานอุตสาหกรรม โดดเด่นด้วยการทำงานแบบแรงดันคงที่ (F', 'อินเวอร์เตอร์ SolarEdge 33.3kW on-grid SE33.3K เป็นอินเวอร์เตอร์ระบบ On-Grid แบบ 3 เฟส ขนาด 33.3kW ที่ออกแบบมาสำหรับระบบโซลาร์เซลล์ระดับพาณิชย์หรือโรงงานอุตสาหกรรม โดดเด่นด้วยการทำงานแบบแรงดันคงที่ (Fixed Voltage) ร่วมกับ Power Optimizer เพื่อให้ได้ประสิทธิภาพสูงสุด', '{}'::text[], 'https://lh3.googleusercontent.com/d/17yN_uPLgBgQ6ZWYU-GBymTYHE00s-0yd', 'https://drive.google.com/file/d/1bk7Ko2OaBeMuWPtgUW57qPteHbLdGmX7/view', null, null, true, 110, 'siamsolar:2026-07-26 11:33:51.586000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:33:51.586000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE33.3K-TH00IBND4', 'SE33.3K-TH00IBND4', 'อินเวอร์เตอร์ Solar Edge ขนาด 33.3KW', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:33:51.586000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE33.3K-THR0IBNA4', 'SE33.3K-THR0IBNA4', 'อินเวอร์เตอร์ Solar Edge ขนาด 33.3KW (RSD)', 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:33:51.586000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- SolarEdge SE66.6K (On-Grid)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'SolarEdge SE66.6K (On-Grid)', 'solaredge-se66-6k-on-grid', 'อินเวอร์เตอร์ SolarEdge SE66.6K (On-Grid) เป็นอินเวอร์เตอร์ 3 เฟส ขนาด 66.6kW ที่ใช้เทคโนโลยี Synergy ล้ำสมัย ออกแบบมาสำหรับโครงการโซลาร์เซลล์ระดับพาณิชย์และอุตสาหกรรม (C&I) ตัวเครื่องแบ่งเป็นหน่วยย่อ', 'อินเวอร์เตอร์ SolarEdge SE66.6K (On-Grid) เป็นอินเวอร์เตอร์ 3 เฟส ขนาด 66.6kW ที่ใช้เทคโนโลยี Synergy ล้ำสมัย ออกแบบมาสำหรับโครงการโซลาร์เซลล์ระดับพาณิชย์และอุตสาหกรรม (C&I) ตัวเครื่องแบ่งเป็นหน่วยย่อย (Synergy Unit) ที่ทำงานอิสระ ทำให้สามารถติดตั้งและบำรุงรักษาง่าย โดดเด่นด้วยประสิทธิภาพการแปลงไฟระดับท็อป 98.3% พร้อมมาตรฐานกันน้ำกันฝุ่น IP65 จุดเด่นคือมีฟังก์ชัน Pre-commissioning ช่วยตรวจสอบระบบล่วงหน้าก่อนขนานไฟ และปลอดภัยสูงสุดด้วยระบบป้องกันอาร์ก (AFCI) ในตัว ตอบโจทย์ทั้งด้านความปลอดภัยและการผลิตพลังงานสูงสุด', '{}'::text[], 'https://lh3.googleusercontent.com/d/1fSsaoHz3L_kZe3YvKQf7LxRGNkbH2OFt', 'https://drive.google.com/file/d/1GQxNyl8uu2Q73T8BcY9jKJMX_eWADoQz/view', null, null, true, 120, 'siamsolar:2026-07-26 11:35:21.464000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:35:21.464000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE66.6K-RW00IBNE4', 'SE66.6K-RW00IBNE4', 'อินเวอร์เตอร์ Solar Edge ขนาด 66.6KW', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:35:21.464000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- INVERTER SE100K ( On-Grid)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'INVERTER SE100K ( On-Grid)', 'inverter-se100k-on-grid', 'อินเวอร์เตอร์ SolarEdge SE100K (On-Grid) เป็นอินเวอร์เตอร์ 3 เฟสขนาด 100kW ที่ทรงพลัง ออกแบบมาเพื่อโครงการโซลาร์รูฟท็อประดับอุตสาหกรรม โดดเด่นด้วยเทคโนโลยี Synergy ซึ่งประกอบด้วยหน่วยย่อย 3 ชุดทำงานร่', 'อินเวอร์เตอร์ SolarEdge SE100K (On-Grid) เป็นอินเวอร์เตอร์ 3 เฟสขนาด 100kW ที่ทรงพลัง ออกแบบมาเพื่อโครงการโซลาร์รูฟท็อประดับอุตสาหกรรม โดดเด่นด้วยเทคโนโลยี Synergy ซึ่งประกอบด้วยหน่วยย่อย 3 ชุดทำงานร่วมกัน ทำให้ติดตั้งง่ายโดยใช้คนเพียง 2 คน และมีระบบสำรองการทำงานที่ดีเยี่ยม (หากหน่วยใดมีปัญหา หน่วยอื่นยังผลิตไฟต่อได้) ให้ประสิทธิภาพการแปลงพลังงานสูงถึง 98.3% มาพร้อมฟีเจอร์ Pre-commissioning สำหรับตรวจสอบการติดตั้งได้ล่วงหน้า ปลอดภัยสูงสุดด้วยระบบป้องกันการเกิดอาร์ก (AFCI) ในตัว ทนทานต่อทุกสภาพแวดล้อมด้วยมาตรฐาน IP65 ควบคุมและมอนิเตอร์ระดับแผงได้อย่างง่ายดายผ่านแอปพลิเคชัน', array['100KW','On-Grid']::text[], 'https://lh3.googleusercontent.com/d/14kU5rPTjqJjWI4QnNE7aL7Y5kJzPtpQK', 'https://drive.google.com/file/d/1PxKBWsihzVE9obcmTyDlx8gMIL4044ZJ/view', null, null, true, 130, 'siamsolar:2026-07-26 11:37:33.607000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:37:33.607000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE100K-RW0P0BNU4', 'SE100K-RW0P0BNU4', 'อินเวอร์เตอร์ Solar Edge ขนาด 100kw for 277/480V', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:37:33.607000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE100K-TH00IBNC4', 'SE100K-TH00IBNC4', 'อินเวอร์เตอร์ Solar Edge ขนาด 100kw for 277/480V ตัวนอน', 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:37:33.607000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE100K-TH0P0BNU4', 'SE100K-TH0P0BNU4', 'อินเวอร์เตอร์ Solar Edge ขนาด 100kw for 277/480V', 2 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:37:33.607000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- INVERTER TerraMax™ 330kW + OP H1300
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'inverter'),
       'INVERTER TerraMax™ 330kW + OP H1300', 'inverter-terramax-330kw-op-h1300', 'SolarEdge TerraMax™ 330kW และ Power Optimizer H1300 คือสุดยอดโซลูชัน DC-optimized สำหรับโครงการโซลาร์เซลล์ขนาดใหญ่ ไม่ว่าจะเป็นโซลาร์ฟาร์ม, โซลาร์ลอยน้ำ หรือโซลาร์เกษตร (Agri-PV) อินเวอร์เตอร์กำลังไฟส', 'SolarEdge TerraMax™ 330kW และ Power Optimizer H1300 คือสุดยอดโซลูชัน DC-optimized สำหรับโครงการโซลาร์เซลล์ขนาดใหญ่ ไม่ว่าจะเป็นโซลาร์ฟาร์ม, โซลาร์ลอยน้ำ หรือโซลาร์เกษตร (Agri-PV) อินเวอร์เตอร์กำลังไฟสูง 330kW ทำงานคู่กับออปติไมเซอร์ H1300 เพื่อดึงพลังงานสูงสุดจากทุกคู่แผง หมดปัญหาการสูญเสียพลังงานจากเงาบังหรือพื้นที่ไม่ราบเรียบ จุดเด่นคือรองรับการต่อสตริงยาวสูงสุดถึง 80 แผง ช่วยลดต้นทุนสายเคเบิล (BoS) ได้มหาศาล พร้อมเทคโนโลยี SafeDC™ ที่ตัดไฟอัตโนมัติเพื่อความปลอดภัยสูงสุด เป็นการลงทุนที่ตอบโจทย์ผู้ประกอบการและนักลงทุนที่ต้องการติดตั้งระบบขนาดใหญ่ เพื่อให้ได้ความคุ้มค่าและผลผลิตพลังงานในระดับสูงสุด', array['333kw','H1300','Solar Farm']::text[], 'https://lh3.googleusercontent.com/d/1O-YOYPmP3iX7oA2BwrSE67JnU670YqJ-', 'https://drive.google.com/file/d/1XTWGRTpiUWPYL0vrBn69NcgShLZRxxcU/view', null, null, true, 140, 'siamsolar:2026-07-26 11:39:13.524000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:39:13.524000');
-- SolarEdge CSS-OD ( 50kw/102.4kWh )
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'battery'),
       'SolarEdge CSS-OD ( 50kw/102.4kWh )', 'solaredge-css-od-50kw-102-4kwh', 'SolarEdge CSS – OD', 'SolarEdge CSS – OD
Battery Cabinet 102.4 kWh / Battery Inverter 50 kW
ติดตั้งสะดวกรวดเร็วด้วยตู้ประกอบสำเร็จรูป พร้อมรองรับการขยายความจุพลังงานได้สูงสุดถึง 1MWh
คุ้มค่าด้วยระบบบริหารจัดการพลังงานอัจฉริยะ SolarEdge ONE ที่ช่วยลดค่าไฟและใช้งานพลังงานได้อย่างเต็มประสิทธิภาพ
ปลอดภัยขั้นสุดด้วยระบบดับเพลิงในตัว พร้อมการดูแลและรับประกัน 10 ปีครบจบในแบรนด์เดียว', '{}'::text[], 'https://lh3.googleusercontent.com/d/1cuTk-I7B0h4Zzkc81cDAdFUSGSz9TBDy', 'https://drive.google.com/file/d/1C4NQol10xbrtJOCaH47NYpj1p2_prynx/view', null, null, true, 150, 'siamsolar:2026-07-26 11:42:51.226000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:42:51.226000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'CSS-OU-01-20-CA-B01-01', 'CSS-OU-01-20-CA-B01-01', 'Solar Edge CSS-OD:Batterry Cabinet 102.4 kWh', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:42:51.226000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- SolarEdge CSS-OD-197 ( 50kw/197kWh )
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'battery'),
       'SolarEdge CSS-OD-197 ( 50kw/197kWh )', 'solaredge-css-od-197-50kw-197kwh', 'ตู้แบตเตอรี่เชิงพาณิชย์ขนาด 197kWh ติดตั้งสะดวกรวดเร็วแบบสำเร็จรูป พร้อมรองรับการขยายความจุได้สูงสุด 1MWh', 'ตู้แบตเตอรี่เชิงพาณิชย์ขนาด 197kWh ติดตั้งสะดวกรวดเร็วแบบสำเร็จรูป พร้อมรองรับการขยายความจุได้สูงสุด 1MWh
จัดการพลังงานอย่างคุ้มค่าด้วยแพลตฟอร์ม SolarEdge ONE ที่ช่วยลดค่าไฟและรองรับการทำงานแบบ Microgrid
มั่นใจในความปลอดภัยด้วยระบบดับเพลิงและเซ็นเซอร์ตรวจจับในตัว พร้อมการรับประกัน 10 ปีดูแลครบจบจากแบรนด์เดียว', '{}'::text[], 'https://lh3.googleusercontent.com/d/17WIaZQ-u5su3cs6EKG5Fk72z4z8sIEYG', 'https://drive.google.com/file/d/1MRAog4QgelydMnwWAf7PDZtpeF2Dmgv_/view', null, null, true, 160, 'siamsolar:2026-07-26 11:44:47.585000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:44:47.585000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'CSS-OU-01-11-CA-197-01', 'CSS-OU-01-11-CA-197-01', 'Solar Edge CSS-OU-01-11-CA-197-01 197 kWh', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:44:47.585000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- POWER OPTIMIZER S650B
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'optimizer'),
       'POWER OPTIMIZER S650B', 'power-optimizer-s650b', 'ออปติไมเซอร์ S650B ออกแบบมาสำหรับการเชื่อมต่อแบบ 1:1 รองรับแผงโซลาร์เซลล์รุ่นใหม่กำลังสูงได้สูงสุดถึง 650Wช่วยเพิ่มประสิทธิภาพการผลิตไฟฟ้าสูงสุดแบบแผงต่อแผงอย่างอิสระ หมดปัญหาการสูญเสียพลังงานจากเงาบั', 'ออปติไมเซอร์ S650B ออกแบบมาสำหรับการเชื่อมต่อแบบ 1:1 รองรับแผงโซลาร์เซลล์รุ่นใหม่กำลังสูงได้สูงสุดถึง 650Wช่วยเพิ่มประสิทธิภาพการผลิตไฟฟ้าสูงสุดแบบแผงต่อแผงอย่างอิสระ หมดปัญหาการสูญเสียพลังงานจากเงาบังมั่นใจในความปลอดภัยด้วยเทคโนโลยี Sense Connect และ SafeDC ป้องกันความร้อนสะสม พร้อมมอนิเตอร์การทำงานได้รายแผง', array['Optimizer','S650B']::text[], 'https://lh3.googleusercontent.com/d/18I7OtCfyA6WFsoGYn6jQqoms7QGUr1dH', 'https://drive.google.com/file/d/13d92_W8teMELqA0Z5jVOGeuGSinm89jq/view', null, null, true, 170, 'siamsolar:2026-07-26 11:50:20.008000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:50:20.008000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'S650B-1GM4MBM', 'S650B-1GM4MBM', 'อปุกรณเพิ่มประสิทธิภาพในการผลิต ไฟฟ้า (Power optimizer รุ่น S650B)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:50:20.008000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- POWER OPTIMIZER P1100
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'optimizer'),
       'POWER OPTIMIZER P1100', 'power-optimizer-p1100', 'ออปติไมเซอร์ P1100 ออกแบบมาสำหรับโครงการเชิงพาณิชย์ รองรับการเชื่อมต่อแบบ 2 แผงโซลาร์เซลล์ กำลังไฟรวมสูงสุด 1,100W ช่วยเพิ่มประสิทธิภาพการผลิตไฟขั้นสุดด้วยการทำงานแยกอิสระเป็นคู่ หมดปัญหาการสูญเสียพลั', 'ออปติไมเซอร์ P1100 ออกแบบมาสำหรับโครงการเชิงพาณิชย์ รองรับการเชื่อมต่อแบบ 2 แผงโซลาร์เซลล์ กำลังไฟรวมสูงสุด 1,100W ช่วยเพิ่มประสิทธิภาพการผลิตไฟขั้นสุดด้วยการทำงานแยกอิสระเป็นคู่ หมดปัญหาการสูญเสียพลังงานจากเงาบังหรือฝุ่นเกาะ ปลอดภัยด้วยระบบ SafeDC ที่ช่วยลดแรงดันไฟอัตโนมัติเมื่อเกิดเหตุ พร้อมตรวจสอบการทำงานได้ละเอียดผ่านแอปพลิเคชัน', array['Optimizer','P1100']::text[], 'https://lh3.googleusercontent.com/d/1_HTL50KYdUIdZ6R-2DuAQvyht9i2D1X1', 'https://drive.google.com/file/d/1F97asQFsFlvKr-rep2XNjkf0RmZDlssG/view', null, null, true, 180, 'siamsolar:2026-07-26 11:51:34.990000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:51:34.990000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'P1100-4RM4MBT', 'P1100-4RM4MBT', 'อปุกรณเพิ่มประสิทธิภาพในการผลิต ไฟฟ้า (Power optimizer รุ่น P1100)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:51:34.990000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- POWER OPTIMIZER S1200
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'optimizer'),
       'POWER OPTIMIZER S1200', 'power-optimizer-s1200', 'ออปติไมเซอร์ S1200 สำหรับระบบเชิงพาณิชย์ รองรับการเชื่อมต่อโซลาร์เซลล์แบบ 2 แผง (2:1) กำลังไฟสูงสุด 650W จำนวน 2 แผงช่วยลดต้นทุนอุปกรณ์ติดตั้งพร้อมรีดประสิทธิภาพการผลิตไฟฟ้าสูงสุดแบบรายคู่ หมดปัญหาการ', 'ออปติไมเซอร์ S1200 สำหรับระบบเชิงพาณิชย์ รองรับการเชื่อมต่อโซลาร์เซลล์แบบ 2 แผง (2:1) กำลังไฟสูงสุด 650W จำนวน 2 แผงช่วยลดต้นทุนอุปกรณ์ติดตั้งพร้อมรีดประสิทธิภาพการผลิตไฟฟ้าสูงสุดแบบรายคู่ หมดปัญหาการสูญเสียพลังงานจากเงาบัง มั่นใจด้วยเทคโนโลยี Sense Connect และ SafeDC ป้องกันความร้อนสะสมและลดแรงดันไฟอัตโนมัติ พร้อมมอนิเตอร์การทำงานได้ผ่านแอป', array['Optimizer','S1200']::text[], 'https://lh3.googleusercontent.com/d/1Btg_cViT6bSSVT2EI4yrzIcSqTagUxtQ', 'https://drive.google.com/file/d/1Y-DOyozOITQrLS0uOAWSmSzN6hpJhvMS/view', null, null, true, 190, 'siamsolar:2026-07-26 11:53:10.175000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:53:10.175000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'S1200-1GM4MBV', 'S1200-1GM4MBV', 'อปุกรณเพิ่มประสิทธิภาพในการผลิต ไฟฟ้า (Power optimizer รุ่น S1200)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:53:10.175000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'S1200-1GM4MBV-1', 'S1200-1GM4MBV-1', 'อปุกรณเพิ่มประสิทธิภาพในการผลิต ไฟฟ้า (Power optimizer รุ่น S1200) สายยาว', 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:53:10.175000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- POWER OPTIMIZER S1400
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'optimizer'),
       'POWER OPTIMIZER S1400', 'power-optimizer-s1400', 'ออปติไมเซอร์ S1400 สำหรับโครงการขนาดใหญ่ รองรับการต่อแผงโซลาร์เซลล์แบบคู่ (2:1) กำลังไฟสูงสุดแผงละ 750W (750W x 2) ช่วยลดต้นทุนอุปกรณ์และดึงประสิทธิภาพการผลิตไฟสูงสุดในทุกสภาวะแสง หมดปัญหาการสูญเสียพล', 'ออปติไมเซอร์ S1400 สำหรับโครงการขนาดใหญ่ รองรับการต่อแผงโซลาร์เซลล์แบบคู่ (2:1) กำลังไฟสูงสุดแผงละ 750W (750W x 2) ช่วยลดต้นทุนอุปกรณ์และดึงประสิทธิภาพการผลิตไฟสูงสุดในทุกสภาวะแสง หมดปัญหาการสูญเสียพลังงานจากเงาบัง ยกระดับความปลอดภัยด้วยระบบ Sense Connect และ SafeDC ป้องกันอัคคีภัยและตัดไฟอัตโนมัติ พร้อมดูข้อมูลผ่านแอปได้ทันที', array['Optimizer','S1400']::text[], 'https://lh3.googleusercontent.com/d/14NgFRKKNurjpe_re5ECF5Mm4V1k_mdv_', 'https://drive.google.com/file/d/110Mse0uXszGSR4oiXCliZXT7kjv-jk5S/view', null, null, true, 200, 'siamsolar:2026-07-26 11:54:43.680000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:54:43.680000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'S1400-1GM4MBV', 'S1400-1GM4MBV', 'อปุกรณเพิ่มประสิทธิภาพในการผลิต ไฟฟ้า (Power optimizer รุ่น S1400)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:54:43.680000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- POWER OPTIMIZER S1500
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'optimizer'),
       'POWER OPTIMIZER S1500', 'power-optimizer-s1500', 'ออปติไมเซอร์ S1500 ออกแบบสำหรับแผงระดับ C&I รุ่นใหม่กำลังไฟสูงสุด 750W รองรับการต่อเข้า 2 แผงเพื่อการใช้พลังงานคุ้มค่าสูงสุด ประสิทธิภาพยอดเยี่ยม 99.5% พร้อมระบบติดตามแสงแดดแบบแยกจุดที่แก้ปัญหาเงาบัง ', 'ออปติไมเซอร์ S1500 ออกแบบสำหรับแผงระดับ C&I รุ่นใหม่กำลังไฟสูงสุด 750W รองรับการต่อเข้า 2 แผงเพื่อการใช้พลังงานคุ้มค่าสูงสุด ประสิทธิภาพยอดเยี่ยม 99.5% พร้อมระบบติดตามแสงแดดแบบแยกจุดที่แก้ปัญหาเงาบัง ช่วยประหยัดต้นทุนอุปกรณ์ต่อสตริงได้ดียิ่งขึ้น รับประกันการใช้งานถึง 25 ปี พร้อมระบบแจ้งเตือนและปิดแรงดันไฟฟ้าทันทีผ่านเซนเซอร์ล้ำสมัย เพิ่มระดับความปลอดภัยขั้นสุดให้กับพื้นที่ของคุณ', array['Optimizer','S1500']::text[], 'https://lh3.googleusercontent.com/d/1rlo8nMJUILLSIJ6xlrl0eLxatP2Hi25-', 'https://drive.google.com/file/d/1qdRyt-UoTQl3p0LOWqNO4Vwqdb7Lpc70/view', null, null, true, 210, 'siamsolar:2026-07-26 11:57:31.356000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:57:31.356000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'S1500-1GM4MBV', 'S1500-1GM4MBV', 'อปุกรณเพิ่มประสิทธิภาพในการผลิต ไฟฟ้า (Power optimizer รุ่น S1400)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 11:57:31.356000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- SolarEdge ONE Controller
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'accessory'),
       'SolarEdge ONE Controller', 'solaredge-one-controller', 'เกตเวย์อัจฉริยะศูนย์กลางเชื่อมต่อและบริหารจัดการอุปกรณ์ในระบบ ทั้งอินเวอร์เตอร์ แบตเตอรี่ และมิเตอร์ไว้ในที่เดียว ช่วยลดค่าไฟด้วยการปรับแต่งการใช้พลังงานให้มีประสิทธิภาพสูงสุด พร้อมแพลตฟอร์ม PPC ที่รอ', 'เกตเวย์อัจฉริยะศูนย์กลางเชื่อมต่อและบริหารจัดการอุปกรณ์ในระบบ ทั้งอินเวอร์เตอร์ แบตเตอรี่ และมิเตอร์ไว้ในที่เดียว ช่วยลดค่าไฟด้วยการปรับแต่งการใช้พลังงานให้มีประสิทธิภาพสูงสุด พร้อมแพลตฟอร์ม PPC ที่รองรับข้อกำหนดการเชื่อมต่อกริด มั่นใจด้วยระบบความปลอดภัยทางไซเบอร์ระดับสูง มีพื้นที่สำรองข้อมูลเมื่อเน็ตขัดข้อง และรองรับการอัปเดตเฟิร์มแวร์แบบไร้สาย', '{}'::text[], 'https://lh3.googleusercontent.com/d/1SqW5UE4vbmh4nNRpWgZh0b2wpEOL83JS', 'https://drive.google.com/file/d/1bZusQpNz_53aoLwsdQydtjjXAe_FkUsq/view', null, null, true, 220, 'siamsolar:2026-07-26 14:15:05.873000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 14:15:05.873000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'ONE-CLCI-RWWB0-P', 'ONE-CLCI-RWWB0-P', 'SolarEdge ONE Controller ตัวควบคุม', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 14:15:05.873000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- Firefighter Gateway
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'accessory'),
       'Firefighter Gateway', 'firefighter-gateway', 'อุปกรณ์ควบคุมความปลอดภัยฉุกเฉิน ออกแบบมาเพื่อให้เจ้าหน้าที่ดับเพลิงหรือกู้ภัยสามารถตัดการทำงานของระบบโซลาร์เซลล์ได้ทันทีเมื่อเกิดเหตุ ทำงานร่วมกับเทคโนโลยี SafeDC เพื่อลดแรงดันไฟฟ้าให้ถึงระดับปลอดภัยอ', 'อุปกรณ์ควบคุมความปลอดภัยฉุกเฉิน ออกแบบมาเพื่อให้เจ้าหน้าที่ดับเพลิงหรือกู้ภัยสามารถตัดการทำงานของระบบโซลาร์เซลล์ได้ทันทีเมื่อเกิดเหตุ ทำงานร่วมกับเทคโนโลยี SafeDC เพื่อลดแรงดันไฟฟ้าให้ถึงระดับปลอดภัยอัตโนมัติ ผ่านการกดปุ่มเพียงครั้งเดียวหรือเชื่อมโยงกับระบบ Fire Alarm ของอาคาร ช่วยลดความเสี่ยงจากอันตรายของไฟฟ้าแรงสูง ทำให้เจ้าหน้าที่สามารถเข้าปฏิบัติงานระงับเหตุในพื้นที่ได้อย่างมั่นใจและปลอดภัยขั้นสูงสุด', '{}'::text[], 'https://lh3.googleusercontent.com/d/14f6jBK9VavfF-Xr6ZmgZhuIlxOVVzzu2', null, null, null, true, 230, 'siamsolar:2026-07-26 14:21:23.465000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 14:21:23.465000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE1000-CCG-F-S1', 'SE1000-CCG-F-S1', 'SolarEdge Firefighter Gateway 5 years warranty included.', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 14:21:23.465000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- SolarEdge Control & Communication Gateway
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'solaredge'), (select id from public.product_categories where slug = 'accessory'),
       'SolarEdge Control & Communication Gateway', 'solaredge-control-communication-gateway', 'อุปกรณ์เกตเวย์ศูนย์กลางที่ช่วยขยายขีดความสามารถในการเชื่อมต่ออินเวอร์เตอร์ SolarEdge เข้ากับแพลตฟอร์มมอนิเตอร์ระดับองค์กร รองรับการเชื่อมต่ออุปกรณ์เสริมที่หลากหลาย ทั้งเซ็นเซอร์วัดสภาพแวดล้อม มิเตอร์พ', 'อุปกรณ์เกตเวย์ศูนย์กลางที่ช่วยขยายขีดความสามารถในการเชื่อมต่ออินเวอร์เตอร์ SolarEdge เข้ากับแพลตฟอร์มมอนิเตอร์ระดับองค์กร รองรับการเชื่อมต่ออุปกรณ์เสริมที่หลากหลาย ทั้งเซ็นเซอร์วัดสภาพแวดล้อม มิเตอร์พลังงาน และเครือข่ายอินเทอร์เน็ตหลายรูปแบบ เพิ่มความเสถียรและแม่นยำในการส่งข้อมูล เหมาะอย่างยิ่งสำหรับโครงการเชิงพาณิชย์ที่ต้องการตรวจสอบและวิเคราะห์ระบบอย่างใกล้ชิด', '{}'::text[], 'https://lh3.googleusercontent.com/d/1USNyi2sTaCvvndSkBeBXwm0PwDVCt7jn', 'https://drive.google.com/file/d/1rubIXwoJRLMbw63vW4Nkb8_Yvb5-Beiy/view', null, null, true, 240, 'siamsolar:2026-07-26 14:24:19.632000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 14:24:19.632000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'SE1000-CCG-G-S1', 'SE1000-CCG-G-S1', 'SolarEdge Control and Communication Gateway', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 14:24:19.632000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- BluE-S 5000D
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'inverter'),
       'BluE-S 5000D', 'blue-s-5000d', 'อินเวอร์เตอร์ไฮบริด 1 เฟส KSTAR BluE-S 5000D ขนาด 5kW ออกแบบมาเพื่อระบบกักเก็บพลังงานสำหรับบ้านพักอาศัยและธุรกิจขนาดเล็ก โดดเด่นด้วย 2 MPPT ประสิทธิภาพสูง 97.6% รองรับการใช้ร่วมกับแบตเตอรี่ Low Voltag', 'อินเวอร์เตอร์ไฮบริด 1 เฟส KSTAR BluE-S 5000D ขนาด 5kW ออกแบบมาเพื่อระบบกักเก็บพลังงานสำหรับบ้านพักอาศัยและธุรกิจขนาดเล็ก โดดเด่นด้วย 2 MPPT ประสิทธิภาพสูง 97.6% รองรับการใช้ร่วมกับแบตเตอรี่ Low Voltage 48V ช่วยประหยัดค่าไฟและจ่ายไฟสำรองอัตโนมัติเมื่อไฟดับ ดีไซน์แข็งแรงทนทานด้วยมาตรฐานกันน้ำกันฝุ่น IP65 พร้อมฟังก์ชันที่ติดตั้งและตั้งค่าได้ง่ายดาย สามารถตรวจสอบการทำงานผ่านแอปพลิเคชันได้แบบเรียลไทม์', '{}'::text[], 'https://lh3.googleusercontent.com/d/1ejqUMZ6IRp70liKkrWCXhmRo7Z23eDrM', 'https://drive.google.com/file/d/1_Q-g28hiaLIqJS_rqQcIO4jHojhZOflk/view', null, null, true, 250, 'siamsolar:2026-07-26 16:17:01.907000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:17:01.907000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BLUE-S-5000D', 'BLUE-S-5000D', 'Hydrid Inverter BluE-S 5000D 5kw/230V/2mppt', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:17:01.907000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- BluE-S 10KT
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'inverter'),
       'BluE-S 10KT', 'blue-s-10kt', 'อินเวอร์เตอร์ไฮบริดระบบ 3 เฟส ขนาด 10kW สำหรับบ้านขนาดใหญ่และธุรกิจ ออกแบบมาเพื่อระบบจัดเก็บพลังงานอัจฉริยะที่คุ้มค่าโดดเด่นด้วยการรองรับแผงโซลาร์เซลล์เกินพิกัดได้สูง พร้อมระบบจ่ายไฟสำรองอัตโนมัติ (EP', 'อินเวอร์เตอร์ไฮบริดระบบ 3 เฟส ขนาด 10kW สำหรับบ้านขนาดใหญ่และธุรกิจ ออกแบบมาเพื่อระบบจัดเก็บพลังงานอัจฉริยะที่คุ้มค่าโดดเด่นด้วยการรองรับแผงโซลาร์เซลล์เกินพิกัดได้สูง พร้อมระบบจ่ายไฟสำรองอัตโนมัติ (EPS) ป้องกันอุปกรณ์เสียหายเมื่อเกิดไฟดับดีไซน์สวยงาม ทันสมัย ทนทานด้วยมาตรฐาน IP65 และจัดการพลังงานอย่างแม่นยำผ่านแอปพลิเคชันได้แบบเรียลไทม์', '{}'::text[], 'https://lh3.googleusercontent.com/d/1M3AfivAdbioMx4O_8334RtDdHjURuuTf', 'https://drive.google.com/file/d/1B0kGa41hVzLNlsNNTu9j_4PbEBluwhQk/view', null, null, true, 260, 'siamsolar:2026-07-26 16:17:58.578000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:17:58.578000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BLUE-S 10KT', 'BLUE-S 10KT', 'Kstar Blue-S10kt Hybrid Inverter (10KW/400V/2MPTT)', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:17:58.578000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- BluePulse Series (50kW / 107kWh)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'battery'),
       'BluePulse Series (50kW / 107kWh)', 'bluepulse-series-50kw-107kwh', 'KSTAR BluePulse Series (50kW / 107kWh) คือระบบไฮบริด All-in-One สำหรับธุรกิจและอุตสาหกรรมที่ทรงพลัง ขับเคลื่อนด้วยเซลล์แบตเตอรี่คุณภาพระดับโลกจาก CATL (280Ah) พร้อมการรับประกันประสิทธิภาพยาวนานถึง 10 ', 'KSTAR BluePulse Series (50kW / 107kWh) คือระบบไฮบริด All-in-One สำหรับธุรกิจและอุตสาหกรรมที่ทรงพลัง ขับเคลื่อนด้วยเซลล์แบตเตอรี่คุณภาพระดับโลกจาก CATL (280Ah) พร้อมการรับประกันประสิทธิภาพยาวนานถึง 10 ปี มั่นใจในความปลอดภัยสูงสุดด้วยมาตรฐาน UL 9540A ที่มาพร้อมระบบดับเพลิง วาล์ว และเซ็นเซอร์ในตัว โดดเด่นด้วยอินเวอร์เตอร์ขนาด 50kW ที่รองรับแผงโซลาร์เซลล์ได้สูงสุดถึง 100kWp และสามารถสลับจ่ายไฟสำรองอัตโนมัติได้อย่างรวดเร็วระดับ UPS ภายในเวลาไม่ถึง 10 มิลลิวินาที เมื่อเกิดไฟดับ อีกทั้งยังรองรับการต่อขนานในระบบ On-Grid ได้สูงสุดถึง 20 เครื่อง เพื่อการขยายความจุพลังงานที่ตอบโจทย์ทุกการเติบโตของธุรกิจคุณได้อย่างไร้ขีดจำกัด', '{}'::text[], 'https://lh3.googleusercontent.com/d/1yANJF1RCMH2MnnFQm0srjBnqzDh3HFZ1', 'https://drive.google.com/file/d/1gKqWTZvDYI5_3CFOD03zie5u1e5eZwSD/view', null, null, true, 270, 'siamsolar:2026-07-26 16:20:06.393000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:20:06.393000');
-- BluePulse Series (50kW / 197kWh)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'battery'),
       'BluePulse Series (50kW / 197kWh)', 'bluepulse-series-50kw-197kwh', 'KSTAR BluePulse Series (ตู้ขนาด 197kWh) คือโซลูชันแบตเตอรี่กักเก็บพลังงานความจุสูงสำหรับอุตสาหกรรม ขับเคลื่อนด้วยเซลล์ LFP 280Ah ระดับท็อป 3 ของโลก ให้ความจุรวมมหาศาลถึง 197.12 kWh โดดเด่นด้วยระบบทำคว', 'KSTAR BluePulse Series (ตู้ขนาด 197kWh) คือโซลูชันแบตเตอรี่กักเก็บพลังงานความจุสูงสำหรับอุตสาหกรรม ขับเคลื่อนด้วยเซลล์ LFP 280Ah ระดับท็อป 3 ของโลก ให้ความจุรวมมหาศาลถึง 197.12 kWh โดดเด่นด้วยระบบทำความเย็น (Air Conditioner) ในตัวที่ช่วยยืดอายุการใช้งานของแบตเตอรี่ มั่นใจในความปลอดภัยขั้นสุดยอดด้วยระบบ Fire Protection 2.0 มาตรฐาน UL 9540A ที่จัดเต็มทั้งระบบดับเพลิงแบบละอองลอย วาล์วกันไฟ เซ็นเซอร์ตรวจจับควันและก๊าซ CO พร้อมแผงระบายแรงดันระเบิด ตัวตู้มีความแข็งแรงทนทาน ออกแบบมาเพื่อการติดตั้งกลางแจ้งด้วยมาตรฐาน IP54 และการเคลือบกันสนิมระดับ C4 รองรับการสลับระบบไฟสำรอง (On/Off-grid) ได้อย่างรวดเร็วไร้รอยต่อในเวลาไม่ถึง 10 มิลลิวินาที พร้อมให้คุณบริหารจัดการพลังงานอย่างชาญฉลาดด้วยระบบ BMS/EMS และสามารถตรวจสอบข้อมูลผ่านคลาวด์ได้ตลอด 24 ชั่วโมง', '{}'::text[], 'https://lh3.googleusercontent.com/d/1_5ISh21xPq3ANgoctIZNamXKFq7AipBS', 'https://drive.google.com/file/d/187cVF9myJNzVtX-O8m7KQ8aN0hexh2f2/view', null, null, true, 280, 'siamsolar:2026-07-26 16:22:01.574000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:22:01.574000');
-- BluePulse Series (50kW / 240kWh)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'battery'),
       'BluePulse Series (50kW / 240kWh)', 'bluepulse-series-50kw-240kwh', 'KSTAR BluePulse Series (50kW / 240kWh) คือระบบไฮบริด All-in-One ระดับอุตสาหกรรมที่มอบพลังงานสำรองขนาดมหึมาถึง 240kWh ผสานเข้ากับอินเวอร์เตอร์ 50kW ทรงพลัง เพื่อรองรับการใช้งานหนักของธุรกิจขนาดใหญ่ได้อ', 'KSTAR BluePulse Series (50kW / 240kWh) คือระบบไฮบริด All-in-One ระดับอุตสาหกรรมที่มอบพลังงานสำรองขนาดมหึมาถึง 240kWh ผสานเข้ากับอินเวอร์เตอร์ 50kW ทรงพลัง เพื่อรองรับการใช้งานหนักของธุรกิจขนาดใหญ่ได้อย่างต่อเนื่องไร้ขีดจำกัด ขับเคลื่อนด้วยแบตเตอรี่ LFP คุณภาพสูงระดับโลก มั่นใจในความปลอดภัยสูงสุดด้วยมาตรฐาน UL 9540A ที่จัดเต็มระบบป้องกันอัคคีภัยแบบครบวงจร ทั้งระบบดับเพลิงอัตโนมัติ วาล์วนิรภัย และเซ็นเซอร์ตรวจจับความผิดปกติรอบด้าน โดดเด่นด้วยความสามารถในการสลับจ่ายไฟสำรองได้อย่างรวดเร็วในเสี้ยววินาทีเมื่อเกิดเหตุไฟดับ (UPS Grade) พร้อมระบบทำความเย็นในตัวที่ช่วยยืดอายุการใช้งานให้ยาวนาน ตอบโจทย์การติดตั้งทั้งในและนอกอาคารด้วยดีไซน์ตู้ที่แข็งแกร่งทนทานต่อทุกสภาพอากาศ ให้คุณบริหารจัดการและตรวจสอบระบบได้อย่างอัจฉริยะผ่านคลาวด์ตลอด 24 ชั่วโมง', '{}'::text[], 'https://lh3.googleusercontent.com/d/1R9JTQ8kdS3Sj5x5h1NkD1yv748KRis58', 'https://drive.google.com/file/d/13iLjRKCF6o_xrNxQyakWuCA4_OeP6v3I/view', null, null, true, 290, 'siamsolar:2026-07-26 16:29:08.364000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:29:08.364000');
-- BluePulse Series (125kW / 260kWh)
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'battery'),
       'BluePulse Series (125kW / 260kWh)', 'bluepulse-series-125kw-260kwh', 'KSTAR รุ่น KAC50DP2 (125kW / 260kWh) คือสุดยอดโซลูชันระบบกักเก็บพลังงานแบบ All-in-One สำหรับโรงงานและอุตสาหกรรมขนาดใหญ่ ที่ผสานขุมพลังอินเวอร์เตอร์ 125kW เข้ากับความจุแบตเตอรี่มหาศาลถึง 260kWh เพื่อรอ', 'KSTAR รุ่น KAC50DP2 (125kW / 260kWh) คือสุดยอดโซลูชันระบบกักเก็บพลังงานแบบ All-in-One สำหรับโรงงานและอุตสาหกรรมขนาดใหญ่ ที่ผสานขุมพลังอินเวอร์เตอร์ 125kW เข้ากับความจุแบตเตอรี่มหาศาลถึง 260kWh เพื่อรองรับการใช้ไฟหนักของธุรกิจได้อย่างเต็มประสิทธิภาพ มั่นใจในความปลอดภัยสูงสุดด้วยเซลล์แบตเตอรี่ LFP คุณภาพสูงที่มาพร้อมระบบระบายความร้อนและระบบป้องกันอัคคีภัยแบบครบวงจรในตัวตู้ที่ออกแบบมาอย่างแข็งแกร่งทนทานต่อการติดตั้งกลางแจ้ง ช่วยยกระดับความคุ้มค่าด้วยการบริหารจัดการลดค่าไฟช่วงพีก (Peak Shaving) และเป็นแหล่งพลังงานสำรองฉุกเฉินที่เสถียรที่สุด พร้อมให้คุณตรวจสอบและควบคุมระบบทั้งหมดได้อย่างชาญฉลาดผ่านคลาวด์ตลอด 24 ชั่วโมง', '{}'::text[], 'https://lh3.googleusercontent.com/d/1QexboXJbUszUsrMkJOp6tLHSbrnKajmI', 'https://drive.google.com/file/d/1hDPC9uPL_N8qIoK0IBxOhmfpdq52oCLo/view', null, null, true, 300, 'siamsolar:2026-07-26 16:29:57.930000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 16:29:57.930000');
-- LP182x210-M-66Q-NB 650 W
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'leapton'), (select id from public.product_categories where slug = 'pv-module'),
       'LP182x210-M-66Q-NB 650 W', 'lp182x210-m-66q-nb-650-w', 'เทคโนโลยี L-TOPCon รุ่นใหม่ล่าสุด: เพิ่มประสิทธิภาพการผลิตไฟและเพิ่มกำลังวัตต์ขึ้น 30-40W พร้อมโครงสร้างด้านหลังที่ช่วยเพิ่มการรับแสงแบบ Bifacial ให้สูงขึ้น  ประสิทธิภาพสูงและทนทาน: ให้กำลังไฟสูงถึง 6', 'เทคโนโลยี L-TOPCon รุ่นใหม่ล่าสุด: เพิ่มประสิทธิภาพการผลิตไฟและเพิ่มกำลังวัตต์ขึ้น 30-40W พร้อมโครงสร้างด้านหลังที่ช่วยเพิ่มการรับแสงแบบ Bifacial ให้สูงขึ้น  ประสิทธิภาพสูงและทนทาน: ให้กำลังไฟสูงถึง 650-670W ประสิทธิภาพโมดูลสูงสุด 24.80% และทำงานได้ดีแม้ในสภาพแสงน้อย  รับประกันยาวนานคุ้มค่า: การันตีวัสดุ 25 ปี และรับประกันประสิทธิภาพการผลิตไฟฟ้ายาวนานถึง 30 ปี อัตราเสื่อมสภาพเพียง 0.35% ต่อปี

เอกสารเพิ่มเติม: https://drive.google.com/file/d/1OssGg8bCpt1xlHZ9WmmYrSOhpc_jYR_h/view', array['650W','IEC','Japan','Leap(L-TOPCon)']::text[], 'https://lh3.googleusercontent.com/d/13pZc7HBBvYGeeZ7ih15LJxtejmw0DQW8', 'https://drive.google.com/file/d/1kpIuJq3FXJAyGnFcbKSp0OkYvucPvyhv/view', null, null, true, 320, 'siamsolar:2026-07-26 22:28:39.441000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:28:39.441000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'LP182X210-M-66Q-NB-650W', 'LP182X210-M-66Q-NB-650W', 'แผงเซลล์แสงอาทิตย์ชนิด Monocrystalline ขนาดไม่น้อยกว่า 650 Wp/แผง', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:28:39.441000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- LP210-M-66-NB 700-725W
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'leapton'), (select id from public.product_categories where slug = 'pv-module'),
       'LP210-M-66-NB 700-725W', 'lp210-m-66-nb-700-725w', 'เทคโนโลยี L-TOPCon ล้ำสมัย: ขับเคลื่อนด้วยเทคโนโลยี Next-Generation TOPCon ช่วยเพิ่มประสิทธิภาพการผลิตพลังงานให้สูงขึ้น  กำลังไฟสูงเป็นพิเศษ: ให้ช่วงพลังงานสูงถึง 650-670W (อ้างอิงตามสเปคซีรีส์ใกล้เคี', 'เทคโนโลยี L-TOPCon ล้ำสมัย: ขับเคลื่อนด้วยเทคโนโลยี Next-Generation TOPCon ช่วยเพิ่มประสิทธิภาพการผลิตพลังงานให้สูงขึ้น  กำลังไฟสูงเป็นพิเศษ: ให้ช่วงพลังงานสูงถึง 650-670W (อ้างอิงตามสเปคซีรีส์ใกล้เคียง) พร้อมประสิทธิภาพโมดูลสูงสุดถึง 24.80%  การรับประกันระยะยาว: มั่นใจด้วยการรับประกันสินค้า 25 ปี และรับประกันประสิทธิภาพการทำงานยาวนานถึง 30 ปี', '{}'::text[], 'https://lh3.googleusercontent.com/d/18aUnilrztGEeYXC327xGpfOJQVG5NlXK', 'https://drive.google.com/file/d/1pDszSZt2551gi4kQAVb6o9NkoufJhkk0/view', null, null, true, 330, 'siamsolar:2026-07-26 22:30:37.246000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:30:37.246000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'LP210-210-M-66-NB-700W', 'LP210-210-M-66-NB-700W', 'แผงเซลล์แสงอาทิตย์ชนิด Monocrystalline ขนาดไม่น้อยกว่า 700 Wp/แผง', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:30:37.246000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'LP210-210-M-66-NB-710W', 'LP210-210-M-66-NB-710W', 'แผงเซลล์แสงอาทิตย์ชนิด Monocrystalline ขนาดไม่น้อยกว่า 700 Wp/แผง', 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:30:37.246000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'LP210-210-M-66-NB-715W', 'LP210-210-M-66-NB-715W', 'แผงเซลล์แสงอาทิตย์ชนิด Monocrystalline ขนาดไม่น้อยกว่า 715 Wp/แผง', 2 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:30:37.246000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- LP182x210-M-66-NB 620W
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'leapton'), (select id from public.product_categories where slug = 'pv-module'),
       'LP182x210-M-66-NB 620W', 'lp182x210-m-66-nb-620w', 'เทคโนโลยี N-Type TOPCon Dual Glass: ขับเคลื่อนด้วยเซลล์ขนาด 182x210 มม.', 'เทคโนโลยี N-Type TOPCon Dual Glass: ขับเคลื่อนด้วยเซลล์ขนาด 182x210 มม. แบบสองหน้า (Bifacial) ชนิดกระจกคู่ ช่วยเพิ่มประสิทธิภาพการผลิตพลังงานและรับแสงด้านหลังได้ดียิ่งขึ้น

ประสิทธิภาพสูง 620W: ให้กำลังไฟพิกัด 620 วัตต์ พร้อมประสิทธิภาพของโมดูลสูงถึง 22.95% และตอบสนองต่อสภาวะแสงน้อยได้อย่างยอดเยี่ยม ความทนทานและรับประกันยาวนาน: โครงสร้างแข็งแกร่งทนทานต่อสภาพแวดล้อม พร้อมการรับประกันประสิทธิภาพการผลิตไฟฟ้ายาวนานถึง 30 ปี', '{}'::text[], 'https://lh3.googleusercontent.com/d/1FMaADp0vTSoaUWMxCFVSkQzJ9B8hBHbh', 'https://drive.google.com/file/d/1wLO7kvRdppVyn_AIOv94h-ILMcTrRB96/view', null, null, true, 340, 'siamsolar:2026-07-26 22:31:53.334000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:31:53.334000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'LP182-210-M-66-NB 620W', 'LP182-210-M-66-NB 620W', 'แผงเซลล์แสงอาทิตย์ชนิด Monocrystalline ขนาดไม่น้อยกว่า 620 Wp/แผง', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:31:53.334000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- LR8-66HVD  640~665M
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'longi'), (select id from public.product_categories where slug = 'pv-module'),
       'LR8-66HVD  640~665M', 'lr8-66hvd-640-665m', 'Advanced: N-TaiRay + HPBC 2.0 + 0BB', 'Advanced: N-TaiRay + HPBC 2.0 + 0BB
Value-Added: Power Leads by 30W+, A+ Anti-Shading
Aesthetic: No Frontal Gridlines, Scenario Integration
Safe: Prevent Localized Overheating, Less Micro-Crack', '{}'::text[], 'https://lh3.googleusercontent.com/d/1UX06jZHekAxh1Zr1KD9GYD1iJIQjaXiW', 'https://drive.google.com/file/d/1ke43HQfPs0Njuv0KrE6WqcAKNPD26Uqc/view', null, null, true, 350, 'siamsolar:2026-07-26 22:34:28.914000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:34:28.914000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'LR8-66HVD-650M', 'LR8-66HVD-650M', 'LONGI Hi-MO X10/650W/HPBC 2.0 (BC-Cell)/Dual Glass 2.0+2.0mm Bifacial/15 ปี Product 30 ปี Power.', 0 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:34:28.914000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- LR7-60HVHL  535~560M
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'longi'), (select id from public.product_categories where slug = 'pv-module'),
       'LR7-60HVHL  535~560M', 'lr7-60hvhl-535-560m', '- Adapted for Low Load-Bearing Capacity Scenarios.', '- Adapted for Low Load-Bearing Capacity Scenarios.
-  Lighter Weight: Up to 42% weight reduction compared to conventionalmodules.
-  Higher Power Generation: HPBC 2.0 high-efficiencytechnology.
- Enhanced Reliability: High mechanical loading,
" Faster Installation: No roof reinforcementrequired.', '{}'::text[], null, 'https://drive.google.com/file/d/1onk62MJOKH2Uv-_LWWVMsuPb9_-idP4U/view', null, null, true, 360, 'siamsolar:2026-07-26 22:36:23.671000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:36:23.671000');
-- LR7-72HVH  640~670M
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'longi'), (select id from public.product_categories where slug = 'pv-module'),
       'LR7-72HVH  640~670M', 'lr7-72hvh-640-670m', 'Suitable for Distribution Market', 'Suitable for Distribution Market
Highest efficiency with the best energy generation performance
TaiRay wafer & BC technology enhances high product reliability
Smart manufacturing & LONGi product lifecycle standards deliver exceptional product quality', '{}'::text[], 'https://lh3.googleusercontent.com/d/1hb1MoxAuDtvjtfS2DY7GO9SZwNt2q9us', 'https://drive.google.com/file/d/1h0GO-zNOYCrAWv_URIWqjVhf6p3DYcAd/view', null, null, true, 370, 'siamsolar:2026-07-26 22:38:32.401000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-07-26 22:38:32.401000');
-- BluE-G 5000D ( 5kW )
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'inverter'),
       'BluE-G 5000D ( 5kW )', 'blue-g-5000d-5kw', 'ข้อมูลสินค้า: อินเวอร์เตอร์ BluE-G Series (5 kW)', 'ข้อมูลสินค้า: อินเวอร์เตอร์ BluE-G Series (5 kW)
- ประเภทระบบ: Single Phase / On-grid / 5 kW
- แรงดันและสัดส่วนพลังงาน: Max. PV Voltage สูงถึง 600 V และ DC / AC Ratio สูงสุด 1.5
- ประสิทธิภาพ: High Efficiency สูงถึง 98.3% ดีไซน์เล็กลงและเบาลง
- ความปลอดภัยและการป้องกัน: Type III DC SPD / Type III AC SPD พร้อมมาตรฐานกันน้ำกันฝุ่น IP65
- ฟังก์ชันเสริม: Anti-PID function และ AFCI optional
- การเชื่อมต่อและการใช้งาน: รองรับแผงโซล่าเซลล์ความจุสูง (Compatible for Big Capacity PV Panel) พร้อมช่องเสียบ WiFi / 4G Plug เสริม (Optional)

เอกสารเพิ่มเติม: https://drive.google.com/file/d/1n9Qdms-fiSAIDPi1_Pv0Zxb2P6P8Wuvo/view', array['5kw','ongrid']::text[], 'https://lh3.googleusercontent.com/d/1LakQHGnL-G5EzadLNG5kr2ccoD7C_SeP', 'https://drive.google.com/file/d/1ecRK9iF-N0tA5ThTENg-dpuGfjJHuGlx/view', 'https://drive.google.com/file/d/1l2p09NeaQu7opqFzKGgVaaDVD_uOEXUp/view', null, true, 380, 'siamsolar:2026-09-11 14:01:27.767000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-09-11 14:01:27.767000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BLUE-G 5000D', 'BLUE-G 5000D', 'PV INVERTER (1021G2647)', 0 from public.products where legacy_ref = 'siamsolar:2026-09-11 14:01:27.767000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- BluE-10KT-M1 ( 10kW )
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'inverter'),
       'BluE-10KT-M1 ( 10kW )', 'blue-10kt-m1-10kw', 'ข้อมูลสินค้า: อินเวอร์เตอร์ KSTAR BluE Series (10 kW)', 'ข้อมูลสินค้า: อินเวอร์เตอร์ KSTAR BluE Series (10 kW)
- ประเภทระบบ: Three Phase / On-grid / 10 kW
- แรงดันและสัดส่วนพลังงาน: Max. PV Voltage สูงถึง 1100 V และ DC / AC Ratio สูงสุด 2
- ประสิทธิภาพ: High Efficiency สูงถึง 98.6% ขนาดกะทัดรัดและน้ำหนักเบากว่าเดิม (Smaller and Lighter)
- ความปลอดภัยและการป้องกัน: Type II DC / AC SPD พร้อมมาตรฐานกันน้ำกันฝุ่นระดับ IP66
- ฟังก์ชันเสริม: Anti-PID function และ AFCI optional
- การเชื่อมต่อและการใช้งาน: รองรับแผงโซล่าเซลล์กำลังผลิตสูง (Compatible for Big Capacity PV Panel) พร้อมช่องเสียบ WiFi / 4G Plug เสริม (Optional)

เอกสารเพิ่มเติม: https://drive.google.com/file/d/15xpDLyENJf7cgGf6yVjv7KDfGjbrll_N/view', array['10kW','ongrid']::text[], 'https://lh3.googleusercontent.com/d/15ckgYtPW6afGX5023Z5D6o91Wz1DVaS2', 'https://drive.google.com/file/d/1xEarmM6vXgruX84xZu2SAqZHGAJywCic/view', null, null, true, 390, 'siamsolar:2026-09-11 14:05:50.512000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-09-11 14:05:50.512000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BLUE-10KT-M1', 'BLUE-10KT-M1', 'PV INVERTER (1021G2937)', 0 from public.products where legacy_ref = 'siamsolar:2026-09-11 14:05:50.512000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- BluE-20KT-M1 ( 20kW )
insert into public.products (brand_id, category_id, name, slug, summary, description, tags, cover_url, datasheet_url, manual_url, video_url, is_published, sort, legacy_ref)
select (select id from public.brands where slug = 'kstar'), (select id from public.product_categories where slug = 'inverter'),
       'BluE-20KT-M1 ( 20kW )', 'blue-20kt-m1-20kw', 'ข้อมูลสินค้า: อินเวอร์เตอร์ KSTAR BluE Series (20 kW)', 'ข้อมูลสินค้า: อินเวอร์เตอร์ KSTAR BluE Series (20 kW)
- ประเภทระบบ: Three Phase / On-grid / 20 kW
- แรงดันและสัดส่วนพลังงาน: Max. PV Voltage สูงถึง 1100 V และ DC / AC Ratio สูงสุด 2
- ประสิทธิภาพ: High Efficiency สูงถึง 98.6% ตัวเครื่องเล็กลงและน้ำหนักเบากว่าเดิม (Smaller and Lighter)
- ความปลอดภัยและการป้องกัน: Type II DC / AC SPD พร้อมมาตรฐานป้องกันน้ำและฝุ่น IP66
- ฟังก์ชันเสริม: Anti-PID function และรองรับ AFCI (Optional)
- การเชื่อมต่อและการใช้งาน: รองรับแผงโซล่าเซลล์ขนาดใหญ่/กำลังวัตต์สูง (Compatible for Big Capacity PV Panel) พร้อมช่องเสียบ WiFi / 4G Plug เสริม (Optional)

เอกสารเพิ่มเติม: https://drive.google.com/file/d/1PA1ZTkJ2pinMkKNPDnGn5Kou6at9J2rc/view', array['20kW','ongrid']::text[], 'https://lh3.googleusercontent.com/d/1a34-PMTmF4yZEr3lrnkySW_i7b2OZEz4', 'https://drive.google.com/file/d/1Q-ov5Wd6RliirqPxWTNVwFNK1QqDng6E/view', null, null, true, 400, 'siamsolar:2026-09-11 14:08:16.701000'
where not exists (select 1 from public.products where legacy_ref = 'siamsolar:2026-09-11 14:08:16.701000');
insert into public.product_variants (product_id, sku, name, detail, sort)
select id, 'BLUE-20KT-M1', 'BLUE-20KT-M1', 'PV INVERTER (1021G2942)', 0 from public.products where legacy_ref = 'siamsolar:2026-09-11 14:08:16.701000'
on conflict (sku) do update set product_id = excluded.product_id, detail = coalesce(public.product_variants.detail, excluded.detail);
-- drafts left empty after their SKU moved into a catalog product
delete from public.products p where p.legacy_ref is null and not p.is_published and not exists (select 1 from public.product_variants v where v.product_id = p.id);

insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณอัฐสมาภรณ์ โพธิ์ทิม', 'VP, Sales Relationship and Marketing  Manager · ผู้เชี่ยวชาญ SoalrEdge', 'sales', '08-3456-5639', 'nous5568', 'asamaporn@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/1UFYKRW5UQMwKrTBad-aiLtBM-SU5GBwz', true, 1
where not exists (select 1 from public.team_members where lower(email) = 'asamaporn@siamsolar.co.th' or full_name = 'คุณอัฐสมาภรณ์ โพธิ์ทิม');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณธีรวัฒน์ ฉัตรพรมราช', 'Sales and Relationship Manager · ผู้เชี่ยวชาญ SolarEdge', 'sales', '084 825 5036', null, 'teerawat@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/12mG7jldj80_D9Ama-NZF5KNbZ4Xs767X', true, 2
where not exists (select 1 from public.team_members where lower(email) = 'teerawat@siamsolar.co.th' or full_name = 'คุณธีรวัฒน์ ฉัตรพรมราช');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณกิตติศักดิ์ จรัสภัทรณิชย์', 'Sales and Relationship Manager', 'sales', '087-498-2888', null, 'kittisak@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/16R0ofdKC5Vj-4N4_b4E5IshQb6252epr', true, 6
where not exists (select 1 from public.team_members where lower(email) = 'kittisak@siamsolar.co.th' or full_name = 'คุณกิตติศักดิ์ จรัสภัทรณิชย์');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณจิรวดี คำภูษา', 'Sales and Relationship Manager · ผู้เชี่ยวชาญ แผงโซล่า SPPM', 'sales', '083 945 6942', null, 'jirawadee@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/11LDn_u8Q5jzs-I3XCm-oMiLLtYa_zg8C', true, 3
where not exists (select 1 from public.team_members where lower(email) = 'jirawadee@siamsolar.co.th' or full_name = 'คุณจิรวดี คำภูษา');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณเฉลิมชัย โพธิ์วงศ์', 'Sales and Relationship Manager · ซัพพอร์ท ให้ความรู้เกี่ยวกับ SolarPPM', 'sales', '090 262 9989', null, 'chaleomchai@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/1nY_vBupXXIo0nR9a6ABr1a_MSQ1F2aXT', true, 5
where not exists (select 1 from public.team_members where lower(email) = 'chaleomchai@siamsolar.co.th' or full_name = 'คุณเฉลิมชัย โพธิ์วงศ์');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณวิชัย คำเพ็ง', 'Technical Engineer', 'service', '092 494 9928', null, 'wichai@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/12HvG-8JJ_HCcknnbdpOtlPNhhjcX5tGO', true, 6
where not exists (select 1 from public.team_members where lower(email) = 'wichai@siamsolar.co.th' or full_name = 'คุณวิชัย คำเพ็ง');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณวศิน เครือจันต๊ะ', 'Technical Engineer', 'service', '088 224 6427', null, 'wasin@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/1oVz9mhiOTgbh-rrkHVMyGZVHrBx5ZqKm', true, 7
where not exists (select 1 from public.team_members where lower(email) = 'wasin@siamsolar.co.th' or full_name = 'คุณวศิน เครือจันต๊ะ');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณ ทิชากร นามอนุ', 'Technical Engineer', 'service', '092 352 4650', null, 'thichakorn@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/1UAb2WAv3LdwJ1QESLfhH4XDJz1XohYvx', true, 8
where not exists (select 1 from public.team_members where lower(email) = 'thichakorn@siamsolar.co.th' or full_name = 'คุณ ทิชากร นามอนุ');
insert into public.team_members (full_name, position, department, phone, line_id, email, photo_url, is_published, sort)
select 'คุณประทานพร พุทธา', 'Technical Engineer', 'service', '098 305 0478', null, 'pratanporn@siamsolar.co.th', 'https://lh3.googleusercontent.com/d/15JAbB9myZCU3J1I3QchDSKLhWL7br-09', true, 9
where not exists (select 1 from public.team_members where lower(email) = 'pratanporn@siamsolar.co.th' or full_name = 'คุณประทานพร พุทธา');
commit;
