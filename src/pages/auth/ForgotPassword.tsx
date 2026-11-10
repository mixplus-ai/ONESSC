import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input } from "../../components/ui";
import { errorMessage, supabase } from "../../lib/supabase";
import AuthShell from "./AuthShell";

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim().toLowerCase();
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setSent(true);
  }

  return (
    <AuthShell title="ลืมรหัสผ่าน" subtitle="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้" footer={<Link to="/login" className="font-semibold text-navy-700 hover:underline">กลับไปหน้าเข้าสู่ระบบ</Link>}>
      {sent ? (
        <Alert tone="green">ถ้าอีเมลนี้มีบัญชีอยู่ คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่ภายในไม่กี่นาที</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="อีเมล"><Input name="email" type="email" required autoComplete="email" /></Field>
          {err && <Alert>{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full">ส่งลิงก์</Button>
        </form>
      )}
    </AuthShell>
  );
}
