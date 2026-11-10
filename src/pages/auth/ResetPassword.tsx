import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import AuthShell from "./AuthShell";

/** Landing page for password-reset and staff-invite links: the link signs the user in, then they pick a password. */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 8) return setErr("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    if (password !== String(f.get("password2"))) return setErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    nav("/app", { replace: true });
  }

  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่">
      {!loading && !session ? (
        <Alert tone="amber">ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากหน้า “ลืมรหัสผ่าน”</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร"><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
          <Field label="ยืนยันรหัสผ่านใหม่"><Input name="password2" type="password" required autoComplete="new-password" /></Field>
          {err && <Alert>{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full">บันทึกรหัสผ่าน</Button>
        </form>
      )}
    </AuthShell>
  );
}
