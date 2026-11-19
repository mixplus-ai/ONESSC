import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false when the site is built without Supabase keys: public pages fall back to default content. */
export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url ?? "http://localhost:54321", key ?? "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export function errorMessage(e: unknown): string {
  if (!e) return "เกิดข้อผิดพลาด";
  if (typeof e === "string") return e;
  const msg = (e as { message?: string }).message ?? "เกิดข้อผิดพลาด";
  const map: Record<string, string> = {
    "Invalid login credentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "Email not confirmed": "กรุณายืนยันอีเมลจากลิงก์ที่ส่งไปก่อนเข้าสู่ระบบ",
    "User already registered": "อีเมลนี้สมัครสมาชิกแล้ว",
    "Password should be at least 6 characters.": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
    "Failed to fetch": "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่",
  };
  if (map[msg]) return map[msg];
  return constraintMessage(msg) ?? msg;
}

/** Database constraint errors → plain Thai, so staff know what to fix. */
function constraintMessage(msg: string): string | null {
  const name = /constraint "([^"]+)"/.exec(msg)?.[1] ?? "";
  const named: Record<string, string> = {
    brands_name_key: "มีแบรนด์ชื่อนี้อยู่แล้ว",
    brands_slug_key: "slug นี้ถูกใช้กับแบรนด์อื่นแล้ว",
    brands_slug_check: "slug ใช้ได้เฉพาะภาษาอังกฤษตัวเล็ก ตัวเลข และ - (เว้นว่างให้ระบบสร้างได้)",
    brands_name_check: "กรุณาใส่ชื่อแบรนด์",
    products_slug_key: "slug นี้ถูกใช้กับสินค้าอื่นแล้ว เปลี่ยน slug หรือเว้นว่าง",
    products_slug_check: "slug ใช้ได้เฉพาะภาษาอังกฤษตัวเล็ก ตัวเลข และ -",
    products_name_check: "กรุณาใส่ชื่อสินค้า",
    product_variants_sku_key: "รหัสสินค้า (SKU) นี้มีอยู่แล้วในสินค้าอื่น ใช้ปุ่ม “ดึงเข้า” เพื่อย้ายมาที่สินค้านี้",
    product_variants_sku_check: "กรุณาใส่รหัสสินค้า",
    product_variants_name_check: "กรุณาใส่ชื่อรุ่นย่อย",
    product_categories_name_key: "มีหมวดหมู่ชื่อนี้อยู่แล้ว",
    product_categories_slug_key: "มีหมวดหมู่ slug นี้อยู่แล้ว ลองเปลี่ยนชื่อ",
    packages_slug_key: "slug นี้ถูกใช้กับแพ็กเกจอื่นแล้ว",
    packages_code_key: "รหัสแพ็กเกจนี้มีอยู่แล้ว",
    reservation_items_variant_id_fkey: "รหัสสินค้านี้เคยถูกจองแล้ว ลบไม่ได้ ให้ปิดการขาย / ซ่อนแทน",
    point_ledger_brand_id_fkey: "แบรนด์นี้มีประวัติแต้มแล้ว ลบไม่ได้ ให้ซ่อนแทน",
  };
  if (named[name]) return named[name];
  if (msg.includes("duplicate key value")) return "ข้อมูลนี้ซ้ำกับที่มีอยู่แล้ว";
  if (msg.includes("violates foreign key constraint")) return "ข้อมูลนี้ถูกใช้อยู่ในเอกสารอื่น ลบไม่ได้ ให้ซ่อนแทน";
  if (msg.includes("violates check constraint")) return `ข้อมูลไม่ถูกต้อง (${name})`;
  return null;
}
