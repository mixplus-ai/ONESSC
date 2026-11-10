import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert, Button, Field, Input } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import AuthShell from "./AuthShell";

export default function Register() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentTo, setSentTo] = useState("");

  if (session) return <Navigate to="/app" replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 8) return setErr("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    if (password !== String(f.get("password2"))) return setErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    if (!f.get("consent")) return setErr("กรุณายอมรับนโยบายความเป็นส่วนตัว");
    const email = String(f.get("email")).trim().toLowerCase();
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/profile`,
        data: { full_name: String(f.get("full_name")).trim(), phone: String(f.get("phone")).trim(), pdpa_consent: "true" },
      },
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    // Supabase returns a user with no identities when the email already exists
    if (data.user && data.user.identities?.length === 0) return setErr("อีเมลนี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ");
    if (!data.session) setSentTo(email);
  }

  if (sentTo)
    return (
      <AuthShell title="ตรวจสอบอีเมลของคุณ">
        <Alert tone="green">
          เราส่งลิงก์ยืนยันไปที่ <b>{sentTo}</b> แล้ว กดลิงก์ในอีเมลเพื่อเปิดใช้บัญชี จากนั้นกรอกเลขผู้เสียภาษีบริษัทในหน้าโปรไฟล์
        </Alert>
        <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-navy-700 hover:underline">ไปหน้าเข้าสู่ระบบ</Link></p>
      </AuthShell>
    );

  return (
    <AuthShell
      title="สมัครสมาชิก"
      subtitle="ใช้อีเมลเป็นชื่อผู้ใช้ หลังสมัครแล้วกรอกเลขผู้เสียภาษีเพื่อผูกกับบริษัท"
      footer={<>มีบัญชีแล้ว? <Link to="/login" className="font-semibold text-navy-700 hover:underline">เข้าสู่ระบบ</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ชื่อ-นามสกุล" required><Input name="full_name" required autoComplete="name" /></Field>
        <Field label="เบอร์โทร"><Input name="phone" type="tel" autoComplete="tel" /></Field>
        <Field label="อีเมล" required><Input name="email" type="email" required autoComplete="email" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="รหัสผ่าน" required hint="อย่างน้อย 8 ตัวอักษร"><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
          <Field label="ยืนยันรหัสผ่าน" required><Input name="password2" type="password" required autoComplete="new-password" /></Field>
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-600">
          <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700" />
          <span>ข้าพเจ้ายินยอมให้เก็บและใช้ข้อมูลส่วนบุคคลตาม <Link to="/privacy" target="_blank" className="font-medium text-navy-700 underline">นโยบายความเป็นส่วนตัว</Link></span>
        </label>
        {err && <Alert>{err}</Alert>}
        <Button type="submit" loading={busy} className="w-full">สมัครสมาชิก</Button>
      </form>
    </AuthShell>
  );
}
