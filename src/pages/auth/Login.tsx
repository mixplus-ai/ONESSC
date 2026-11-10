import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import AuthShell from "./AuthShell";

export default function Login() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/app";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (session) return <Navigate to={from} replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")).trim().toLowerCase(),
      password: String(f.get("password")),
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    nav(from, { replace: true });
  }

  return (
    <AuthShell
      title="เข้าสู่ระบบ"
      subtitle="ใช้อีเมลที่สมัครไว้ (ผู้ใช้ SSC Training Portal เดิมใช้อีเมลเดิมได้)"
      footer={<>ยังไม่มีบัญชี? <Link to="/register" className="font-semibold text-navy-700 hover:underline">สมัครสมาชิก</Link></>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="อีเมล"><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="รหัสผ่าน"><Input name="password" type="password" required autoComplete="current-password" /></Field>
        <div className="flex justify-end text-sm">
          <Link to="/forgot-password" className="font-medium text-navy-700 hover:underline">ลืมรหัสผ่าน?</Link>
        </div>
        {err && <Alert>{err}</Alert>}
        <Button type="submit" loading={busy} className="w-full">เข้าสู่ระบบ</Button>
      </form>
    </AuthShell>
  );
}
