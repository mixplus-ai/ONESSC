# One App SSC

เว็บแอปศูนย์กลางของ SSC: เว็บบริษัท ระบบสินค้า งานอบรม/แต้ม และงานเคลม ภายใต้ล็อกอินเดียว
สเปกเต็ม: เอกสารความต้องการระบบ One App SSC (Claude Doc)

## เฟส 1 (ฐานระบบ + หน้าเว็บ) มีอะไรบ้าง

| ส่วน | รายละเอียด |
|---|---|
| หน้าเว็บสาธารณะ | หน้าแรก (Hero, แบรนด์, เกี่ยวกับเรา, ผลงาน, ทีมงาน, ติดต่อ), เกี่ยวกับเรา, ผลงาน + หน้ารายละเอียด, ทีมงาน, ติดต่อเรา (แบบฟอร์มบันทึกลงฐานข้อมูล), นโยบายความเป็นส่วนตัว (PDPA), ปุ่มลอย “คุยกับเซลล์” ไป LINE OA |
| เมนูโมดูลถัดไป | อบรม / แจ้งเคลม แสดงหน้า “กำลังย้ายเข้า One App” พร้อมลิงก์ไประบบเดิม (siamsolar, cerssc) |
| ล็อกอินรวม | อีเมล + รหัสผ่าน (Supabase Auth), สมัครพร้อมยินยอม PDPA, ลืม/ตั้งรหัสผ่านใหม่ |
| บทบาท | Admin / Staff / User · Staff มีสิทธิ์รายเมนูที่ Admin ติ๊กให้ (`permission_keys`) |
| บริษัทลูกค้า | User กรอกเลขผู้เสียภาษี 13 หลัก (ตรวจ checksum) + ชื่อบริษัท → Staff/Admin อนุมัติ → ผูกบริษัท (บริษัทสร้างอัตโนมัติจากเลขผู้เสียภาษีครั้งแรก) |
| หลังบ้าน | แดชบอร์ดตามบทบาท, ผู้ใช้และสิทธิ์ (Admin), เชิญ Staff ทางอีเมล, บริษัทลูกค้า + คิวอนุมัติ, ข้อความติดต่อ, เนื้อหาหน้าเว็บ/ผลงาน/ทีมงาน (อัปโหลดรูป), Log การใช้งาน (ค่าเดิม → ค่าใหม่) |

ความปลอดภัยบังคับที่ฐานข้อมูลด้วย Row Level Security ทั้งหมด (หน้าเว็บซ่อนเมนูเพื่อความสะดวกเท่านั้น):
User เห็นเฉพาะข้อมูลตนเองและบริษัทที่อนุมัติแล้ว, แก้ role / บริษัทที่อนุมัติของตัวเองไม่ได้ (trigger `profiles_guard`), แก้เลขผู้เสียภาษีแล้วกลับไปรออนุมัติ, Log เขียนโดย trigger และอ่านได้เฉพาะ Admin

## เฟส 2 (สินค้า ราคา สต๊อก ใบเสนอราคา การจอง)

| ส่วน | รายละเอียด |
|---|---|
| แคตตาล็อก | `/products` ค้นหา/กรองแบรนด์และหมวด, `/products/:slug` รูปชุดเดียวใช้ร่วมกันหลายรหัส (SKU) แต่ละรหัสมีรายละเอียด ราคา และสต๊อกของตัวเอง, สเปก, Datasheet/คู่มือ/วิดีโอ |
| ราคา | สาธารณะเห็นราคาปกติ · ลูกค้าที่ล็อกอินและผูกบริษัทแล้วเห็นราคาเฉพาะบริษัทที่ Staff ตั้ง (`/app/admin/pricing`) · ราคาโปรโมชั่นเห็นเหมือนกันทุกคนและมาก่อนราคาอื่น |
| โปรโมชั่น / แพ็กเกจ | `/promotions` และ `/packages/:slug` มีวันเริ่ม-สิ้นสุด ซ่อนอัตโนมัติเมื่อหมดเวลา |
| สต๊อก | Edge Function `stock-sync` ดึงไฟล์ Google Sheet/Drive (แท็บ “รวม” + “ค้างส่ง”) หรือ Admin อัปโหลด .xlsx/.csv · บุคคลทั่วไปเห็นสถานะ (มี/เหลือน้อย/รอของเข้า/หมด) · ลูกค้าที่ล็อกอินเห็นจำนวน (ปิดได้) · Staff เห็นตารางเต็ม + ค้างส่ง (ชื่อลูกค้า) |
| รายการสินค้า → ขอใบเสนอราคา | ลูกค้าเพิ่มสินค้า/แพ็กเกจลงรายการ แล้วส่งคำขอ `QT-69-0001` · Staff เปลี่ยนสถานะ ใส่ยอด อัปโหลดใบเสนอราคา PDF ให้ลูกค้าดาวน์โหลด |
| จองสินค้า | `RS-69-0001` กันสต๊อกในแอปตามจำนวนวันที่ตั้ง (ค่าเริ่มต้น 7 วัน) ห้ามจองเกินคงเหลือ · Staff ยืนยัน / ต่ออายุ / ยกเลิก / กด “บันทึกเข้าสต๊อกแล้ว” เมื่อบันทึกในไฟล์สต๊อกเพื่อไม่ให้หักซ้ำ |
| สิทธิ์ | สิทธิ์ใหม่ `products` (แก้สินค้า โปรโมชั่น แพ็กเกจ) · Staff ทุกคนตั้งราคาบริษัท ดูสต๊อก และจัดการคำขอได้ · ซิงก์สต๊อกเฉพาะ Admin |

### ติดตั้งเฟส 2

1. รัน `supabase/migrations/20261110000002_phase2_products_stock.sql` (SQL Editor หรือ `supabase db push`)
2. Deploy `supabase functions deploy stock-sync`
3. Google Sheet สต๊อก: แชร์ “ทุกคนที่มีลิงก์ดูได้” แล้ววางลิงก์ใน `/app/admin/stock` → ซิงก์และตั้งค่า → กด “ซิงก์จาก Google Sheet ตอนนี้”
4. (ถ้าต้องการดึงอัตโนมัติ) deploy function แบบปิด verify JWT (function ตรวจสิทธิ์เอง) แล้วรัน `supabase/cron/stock_sync_schedule.sql` ซึ่งสร้าง secret ใน Vault และตั้งเวลาดึงวันละครั้ง 07:00 ให้เอง
5. รัน `supabase/seed/siamsolar_catalog.sql` เพื่อย้ายแคตตาล็อกเดิมจาก siamsolar (40 สินค้า รูป Datasheet วิดีโอ ผูกรหัสสต๊อกแล้ว 43 รหัส และทีมขาย 9 คน) รันซ้ำได้ไม่ซ้ำข้อมูล
6. `/app/admin/products` กด “สร้างจากไฟล์สต๊อก” ได้สินค้าแบบร่าง 1 รหัสต่อ 1 สินค้า แล้วจัดกลุ่มรหัสที่เป็นรุ่นเดียวกันด้วยปุ่ม “ดึงเข้า” ใส่รูป สเปก ราคา และเปิดแสดง

## โครงสร้าง

```
src/                 React + TypeScript + Tailwind (Vite)
  pages/public/      หน้าเว็บสาธารณะ
  pages/auth/        ล็อกอิน สมัคร ลืมรหัสผ่าน
  pages/app/         แดชบอร์ด โปรไฟล์ และหลังบ้าน (admin/)
supabase/migrations/ ตาราง ฟังก์ชัน RLS storage bucket
supabase/functions/  Edge Functions admin-create-user (เชิญ Staff), stock-sync (ดึงสต๊อก) และ _shared/stock_parser.ts
supabase/cron/       SQL ตั้งเวลาดึงสต๊อกอัตโนมัติ (pg_cron)
supabase/seed/       ข้อมูลย้ายจากระบบเดิม (แคตตาล็อก siamsolar + ทีมขาย)
supabase/tests/      ทดสอบ RLS บน Postgres ธรรมดา (npm run test:db)
netlify.toml         build + SPA redirect
```

## ติดตั้งครั้งแรก

1. **Supabase**: เปิดโปรเจกต์ (แนะนำโปรเจกต์ใหม่ที่ว่าง เช่น “mixplus-ai's Project” ภูมิภาค Seoul) แล้วรัน migration
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   supabase functions deploy admin-create-user
   ```
   หรือคัดลอกไฟล์ใน `supabase/migrations/` ไปวางใน SQL Editor แล้วกด Run
2. **Auth settings** (Authentication → URL Configuration): ตั้ง Site URL เป็นโดเมน Netlify และเพิ่ม `https://<site>.netlify.app/**` ใน Redirect URLs
3. **Admin คนแรก**: สมัครผ่านหน้า `/register` แล้วรันใน SQL Editor
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
4. **Netlify**: New site from GitHub → repo นี้ (build อ่านจาก `netlify.toml`) แล้วตั้ง Environment variables
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Project Settings → API) แล้ว Deploy ใหม่
5. เข้า `/app/admin/content` กรอกชื่อบริษัท ที่อยู่ เบอร์ อีเมล แผนที่ และเพิ่มผลงาน/ทีมงาน

## พัฒนาในเครื่อง

```bash
cp .env.example .env.local   # ใส่ URL และ anon key
npm install
npm run dev
npm run build                # typecheck + build
PGURL=postgres://postgres@localhost/postgres npm run test:db   # ทดสอบ migration + RLS
```

ถ้าไม่ใส่ค่า Supabase หน้าเว็บสาธารณะยังเปิดได้ด้วยเนื้อหาเริ่มต้น แต่ล็อกอินไม่ได้

## เฟสถัดไป

- เฟส 3 อบรมและแต้ม (ย้าย cerssc ผ่าน `profiles.legacy_cerssc_id`, แต้มบริษัทตามเลขผู้เสียภาษี, กติกาแต้มที่ Admin ตั้งเอง, แต้มหมดอายุ 31 ธ.ค., ระงับสิทธิ์เมื่อเลื่อน/ยกเลิกเกิน 2 ครั้ง)
- เฟส 4 งานบริการและเคลม (เลขเคลมหลัก `YY-NNNN`, เก็บ `CLM-…` เดิมเป็นเลขอ้างอิง, LINE login/แจ้งเตือน)
