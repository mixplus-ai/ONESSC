# One App SSC

เว็บแอปศูนย์กลางของ SSC: เว็บบริษัท ระบบสินค้า งานอบรม/แต้ม และงานเคลม ภายใต้ล็อกอินเดียว
สเปกเต็ม: เอกสารความต้องการระบบ One App SSC (Claude Doc)

## เฟส 1 (ฐานระบบ + หน้าเว็บ) มีอะไรบ้าง

| ส่วน | รายละเอียด |
|---|---|
| หน้าเว็บสาธารณะ | หน้าแรก (Hero, แบรนด์, เกี่ยวกับเรา, ผลงาน, ทีมงาน, ติดต่อ), เกี่ยวกับเรา, ผลงาน + หน้ารายละเอียด, ทีมงาน, ติดต่อเรา (แบบฟอร์มบันทึกลงฐานข้อมูล), นโยบายความเป็นส่วนตัว (PDPA), ปุ่มลอย “คุยกับเซลล์” ไป LINE OA |
| เมนูโมดูลถัดไป | สินค้า / โปรโมชั่น / อบรม / แจ้งเคลม แสดงหน้า “กำลังย้ายเข้า One App” พร้อมลิงก์ไประบบเดิม (siamsolar, cerssc) |
| ล็อกอินรวม | อีเมล + รหัสผ่าน (Supabase Auth), สมัครพร้อมยินยอม PDPA, ลืม/ตั้งรหัสผ่านใหม่ |
| บทบาท | Admin / Staff / User · Staff มีสิทธิ์รายเมนูที่ Admin ติ๊กให้ (`permission_keys`) |
| บริษัทลูกค้า | User กรอกเลขผู้เสียภาษี 13 หลัก (ตรวจ checksum) + ชื่อบริษัท → Staff/Admin อนุมัติ → ผูกบริษัท (บริษัทสร้างอัตโนมัติจากเลขผู้เสียภาษีครั้งแรก) |
| หลังบ้าน | แดชบอร์ดตามบทบาท, ผู้ใช้และสิทธิ์ (Admin), เชิญ Staff ทางอีเมล, บริษัทลูกค้า + คิวอนุมัติ, ข้อความติดต่อ, เนื้อหาหน้าเว็บ/ผลงาน/ทีมงาน (อัปโหลดรูป), Log การใช้งาน (ค่าเดิม → ค่าใหม่) |

ความปลอดภัยบังคับที่ฐานข้อมูลด้วย Row Level Security ทั้งหมด (หน้าเว็บซ่อนเมนูเพื่อความสะดวกเท่านั้น):
User เห็นเฉพาะข้อมูลตนเองและบริษัทที่อนุมัติแล้ว, แก้ role / บริษัทที่อนุมัติของตัวเองไม่ได้ (trigger `profiles_guard`), แก้เลขผู้เสียภาษีแล้วกลับไปรออนุมัติ, Log เขียนโดย trigger และอ่านได้เฉพาะ Admin

## โครงสร้าง

```
src/                 React + TypeScript + Tailwind (Vite)
  pages/public/      หน้าเว็บสาธารณะ
  pages/auth/        ล็อกอิน สมัคร ลืมรหัสผ่าน
  pages/app/         แดชบอร์ด โปรไฟล์ และหลังบ้าน (admin/)
supabase/migrations/ ตาราง ฟังก์ชัน RLS storage bucket
supabase/functions/  Edge Function admin-create-user (เชิญ Staff)
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

- เฟส 2 สินค้าและสต๊อก (ซิงก์ Google Sheet สต๊อก, ราคาเฉพาะบริษัท, โปรโมชั่น, แพคเกจ, ใบเสนอราคา, การจอง)
- เฟส 3 อบรมและแต้ม (ย้าย cerssc ผ่าน `profiles.legacy_cerssc_id`, แต้มบริษัทตามเลขผู้เสียภาษี, กติกาแต้มที่ Admin ตั้งเอง, แต้มหมดอายุ 31 ธ.ค., ระงับสิทธิ์เมื่อเลื่อน/ยกเลิกเกิน 2 ครั้ง)
- เฟส 4 งานบริการและเคลม (เลขเคลมหลัก `YY-NNNN`, เก็บ `CLM-…` เดิมเป็นเลขอ้างอิง, LINE login/แจ้งเตือน)
