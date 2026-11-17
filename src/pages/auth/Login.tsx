import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import AuthShell from "./AuthShell";
import { DEMO, DEMO_ACCOUNTS, DEMO_PASSWORD, demoEmail } from "../../lib/demo";

export default function Login() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/app";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (session) return <Navigate to={from} replace />;

  async function signIn(email: string, password: string) {
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    nav(from, { replace: true });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void signIn(String(f.get("email")), String(f.get("password")));
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
      {DEMO && (
        <div className="mt-8 border-t border-slate-200 pt-6">
          <p className="text-sm font-semibold text-slate-800">บัญชีทดลอง (ระบบสาธิต)</p>
          <p className="mt-1 text-xs text-slate-500">กดชื่อเพื่อเข้าสู่ระบบทันที · รหัสผ่านทุกบัญชี {DEMO_PASSWORD}</p>
          {DEMO_ACCOUNTS.map((g) => (
            <div key={g.group} className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{g.group}</p>
              <div className="mt-2 grid gap-2">
                {g.items.map((a) => (
                  <button key={a.login} type="button" disabled={busy}
                    onClick={() => void signIn(demoEmail(a.login), DEMO_PASSWORD)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-navy-200 hover:bg-navy-50 disabled:opacity-50">
                    <span className="text-sm font-semibold text-slate-800">{a.name}</span>
                    <span className="ml-2 text-xs text-navy-700">{a.role}</span>
                    <span className="block text-xs text-slate-500">{a.shows}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AuthShell>
  );
}
