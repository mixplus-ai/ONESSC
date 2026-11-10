import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Field, Input, Loading, PageTitle, Select } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { errorMessage, supabase } from "../../../lib/supabase";
import { formatPoints, getPosition, cols,
  SESSION_COLS, sessionDateText, todayBkk, type Course, type Registration, type Session } from "../../../lib/training";

/** Self check-in: QR at the venue opens /app/training/checkin?s=<session>&c=<code>; or type the 6-digit code. */
export default function CheckIn() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [regs, setRegs] = useState<(Registration & { course_sessions: Session & { courses: Course } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [sid, setSid] = useState(params.get("s") ?? "");
  const [code, setCode] = useState(params.get("c") ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ points: number; already: boolean } | null>(null);
  const fromQr = Boolean(params.get("c"));

  useEffect(() => {
    if (!session) return;
    const d = new Date(`${todayBkk()}T00:00:00Z`);
    const from = new Date(d.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const to = new Date(d.getTime() + 1 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("training_registrations")
      .select(cols(`*, course_sessions!inner(${SESSION_COLS}, courses(*))`))
      .eq("user_id", session.user.id)
      .in("status", ["registered", "attended"])
      .gte("course_sessions.starts_on", from)
      .lte("course_sessions.starts_on", to)
      .then(({ data }) => {
        const rows = (data ?? []) as typeof regs;
        setRegs(rows);
        if (!params.get("s") && rows.length === 1) setSid(rows[0].session_id);
        setLoading(false);
      });
  }, [session, params]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!sid) return setErr("กรุณาเลือกรอบอบรม");
    if (!/^\d{6}$/.test(code)) return setErr("รหัสเช็กอินมี 6 หลัก");
    setBusy(true);
    setErr("");
    const pos = await getPosition();
    const { data, error } = await supabase.rpc("check_in", { p_session_id: sid, p_code: code, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_method: fromQr ? "qr" : "code" });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setDone(data as { points: number; already: boolean });
  }

  if (loading) return <Loading />;
  const reg = regs.find((r) => r.session_id === sid);

  return (
    <>
      <PageTitle title="เช็กอินเข้าอบรม" subtitle="สแกน QR ที่จุดลงทะเบียน หรือกรอกรหัส 6 หลักจากเจ้าหน้าที่" />
      <Card className="max-w-lg">
        {done ? (
          <div className="text-center">
            <p className="text-4xl">✓</p>
            <p className="mt-2 text-lg font-semibold text-navy-900">{done.already ? "คุณเช็กอินไว้แล้ว" : "เช็กอินสำเร็จ"}</p>
            {Number(done.points) > 0 && <p className="mt-1 text-emerald-700">ได้รับ {formatPoints(done.points)} แต้มส่วนตัว</p>}
            <p className="mt-3 text-sm text-slate-500">หลังอบรม ทำแบบประเมินที่ <Link to="/app/training" className="underline">การอบรมของฉัน</Link> เพื่อรับใบประกาศ</p>
          </div>
        ) : regs.length === 0 ? (
          <Alert tone="amber">ไม่พบรอบอบรมที่คุณลงทะเบียนในช่วงนี้ กรุณาติดต่อเจ้าหน้าที่ที่จุดลงทะเบียน</Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="รอบอบรม">
              <Select value={sid} onChange={(e) => setSid(e.target.value)}>
                <option value="">— เลือก —</option>
                {regs.map((r) => <option key={r.id} value={r.session_id}>{r.course_sessions.courses.title} · {sessionDateText(r.course_sessions)}</option>)}
              </Select>
            </Field>
            {reg?.status === "attended" && <Alert tone="green">รอบนี้เช็กอินแล้ว</Alert>}
            <Field label="รหัสเช็กอิน 6 หลัก">
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-2xl tracking-[0.5em]" />
            </Field>
            <p className="text-xs text-slate-500">ระบบจะขอตำแหน่ง (GPS) เพื่อยืนยันว่าคุณอยู่ที่สถานที่อบรม</p>
            {err && <Alert>{err}</Alert>}
            <Button type="submit" loading={busy} className="w-full">เช็กอิน</Button>
          </form>
        )}
      </Card>
    </>
  );
}
