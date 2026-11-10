import type { ReactNode } from "react";
import { Logo } from "../../components/PublicLayout";
import { Alert } from "../../components/ui";
import { supabaseConfigured } from "../../lib/supabase";

export default function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-sun-500/20 blur-3xl" aria-hidden />
        <Logo light />
        <div className="relative">
          <h2 className="text-3xl font-bold">บัญชีเดียว ใช้ได้ทุกบริการ</h2>
          <p className="mt-3 max-w-md text-navy-100">ดูราคาเฉพาะบริษัท ใบเสนอราคา การอบรม แต้มสะสม และสถานะเคลม ได้จากที่เดียว</p>
        </div>
        <p className="relative text-xs text-navy-200">One App SSC</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          {!supabaseConfigured && (
            <div className="mt-4"><Alert tone="amber">ยังไม่ได้ตั้งค่า Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) จึงยังเข้าสู่ระบบไม่ได้</Alert></div>
          )}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
