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
  return map[msg] ?? msg;
}
