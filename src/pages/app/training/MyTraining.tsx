import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Field, Loading, PageTitle, Select, Spinner, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import {
  daysUntil,
  formatMoney,
  formatPoints,
  formatThaiDate,
  loadTrainingSettings,
  openPrivateFile,
  PAY_STATUS,
  REG_STATUS,
  cols,
  SESSION_COLS,
  sessionDateText,
  sessionEnd,
  sessionStart,
  todayBkk,
  uploadTrainingFile,
  type CertTemplate,
  type Course,
  type Registration,
  type Session,
  type TrainingSettings,
  type TrainingStatus,
} from "../../../lib/training";
import { Tabs } from "../MyRequests";
import { CertificateView } from "./Certificate";

const REG_SELECT = `*, course_sessions(${SESSION_COLS}, courses(*))`;

function useMaterials(regs: Registration[]) {
  const ids = regs.map((r) => r.course_sessions?.course_id).filter(Boolean).join(",");
  return useRows<{ id: string; course_id: string | null; session_id: string | null; kind: string; title: string; url: string; visibility: string }>(
    () => supabase.from("course_materials").select("*").order("sort"),
    [ids],
  );
}

function FileButton({ label, onFile, busy }: { label: string; onFile: (f: File) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => ref.current?.click()} disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{label}</Button>
      <input ref={ref} type="file" hidden accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </>
  );
}

function Evaluation({ reg, questions, onDone }: { reg: Registration; questions: string[]; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit() {
    if (questions.some((q) => !answers[q])) return setErr("กรุณาให้คะแนนทุกข้อ");
    setBusy(true);
    const { error } = await supabase.rpc("submit_evaluation", { p_reg_id: reg.id, p_answers: { ...answers, comment } });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }
  return (
    <div className="mt-3 rounded-xl bg-sun-500/10 p-4">
      <p className="font-semibold text-navy-900">แบบประเมินหลังอบรม</p>
      <p className="text-xs text-slate-600">ทำแบบประเมินเพื่อรับใบประกาศ (1 = น้อยที่สุด · 5 = มากที่สุด)</p>
      <div className="mt-3 space-y-2">
        {questions.map((q) => (
          <div key={q} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{q}</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setAnswers({ ...answers, [q]: n })}
                  className={`h-8 w-8 rounded-full text-sm font-semibold ring-1 ${answers[q] === n ? "bg-navy-800 text-white ring-navy-800" : "bg-white ring-slate-300"}`}>{n}</button>
              ))}
            </span>
          </div>
        ))}
        <Field label="ข้อเสนอแนะ"><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </div>
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
      <Button className="mt-3" onClick={submit} loading={busy}>ส่งแบบประเมินและรับใบประกาศ</Button>
    </div>
  );
}

function RegCard({ r, cfg, status, templates, materials, onChange }: {
  r: Registration;
  cfg: TrainingSettings | null;
  status: TrainingStatus | null;
  templates: CertTemplate[];
  materials: ReturnType<typeof useMaterials>["rows"];
  onChange: () => void;
}) {
  const { profile } = useAuth();
  const s = r.course_sessions!;
  const c = s.courses as Course;
  const [mode, setMode] = useState<"" | "cancel" | "move" | "cert" | "eval">("");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [others, setOthers] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const days = daysUntil(s.starts_on);
  const canChange = r.status === "registered" && days >= (cfg?.change_days_before ?? 3);
  const now = Date.now();
  const checkinOpen = r.status === "registered" && now >= sessionStart(s).getTime() - (cfg?.checkin_open_minutes ?? 120) * 60000 && now <= sessionEnd(s).getTime();
  const mats = materials.filter((m) => (m.session_id === s.id || m.course_id === s.course_id) && (m.visibility !== "attended" || r.status === "attended"));
  const tpl = templates.find((t) => t.id === (s.cert_template_id ?? c.cert_template_id)) ?? null;

  useEffect(() => {
    if (mode !== "move") return;
    supabase.from("course_sessions").select(cols(SESSION_COLS)).eq("course_id", s.course_id).eq("status", "open").eq("is_archived", false).gte("starts_on", todayBkk()).neq("id", s.id).order("starts_on")
      .then(({ data }) => setOthers((data ?? []) as unknown as Session[]));
  }, [mode, s.course_id, s.id]);

  async function run(fn: () => PromiseLike<{ data: unknown; error: unknown }>, done?: (d: unknown) => void) {
    setBusy(true);
    setErr("");
    const { data, error } = await fn();
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    done?.(data);
    setMode("");
    onChange();
  }
  const banMsg = (d: unknown) => {
    const v = d as { banned?: boolean; strikes?: number };
    if (v?.banned) alert("คุณเลื่อน/ยกเลิก/ไม่มาเกินกำหนด ระบบยกเลิกการจองทั้งหมดและระงับสิทธิ์ถึงสิ้นปี");
  };

  async function upload(kind: "slip" | "wht", f: File) {
    if (f.size > 10 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 10 MB");
    setUploading(kind);
    setErr("");
    try {
      const path = await uploadTrainingFile(r.id, f, kind);
      const { error } = await supabase.rpc("attach_training_file", { p_reg_id: r.id, p_kind: kind, p_path: path });
      if (error) throw error;
      setInfo(kind === "slip" ? "ส่งสลิปแล้ว ทีมงานจะตรวจสอบและออกใบเสร็จ" : "ส่งหนังสือรับรองหัก ณ ที่จ่ายแล้ว");
      onChange();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setUploading("");
    }
  }

  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-sun-600">{c.code} · {r.code}</p>
          <h3 className="font-semibold text-navy-900">{c.title}</h3>
          <p className="text-sm text-slate-600">{sessionDateText(s)}</p>
          {s.location && <p className="text-sm text-slate-500">{s.map_url ? <a href={s.map_url} target="_blank" rel="noreferrer" className="hover:underline">{s.location}</a> : s.location}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={REG_STATUS[r.status].tone}>{REG_STATUS[r.status].label}</Badge>
          {r.total > 0 && <Badge tone={PAY_STATUS[r.pay_status].tone}>{PAY_STATUS[r.pay_status].label} · {formatMoney(r.total)}</Badge>}
          {r.total <= 0 && r.discount > 0 && r.coupon_code && <Badge tone="green">ฟรีด้วยโค้ด {r.coupon_code}</Badge>}
          {Number(r.points_awarded ?? 0) > 0 && <span className="text-xs font-semibold text-emerald-700">+{formatPoints(r.points_awarded)} แต้ม</span>}
        </div>
      </div>

      {r.status === "registered" && r.pay_status === "unpaid" && r.total > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">ชำระค่าอบรม {formatMoney(r.total)}</p>
          {cfg?.pay_info && <p className="mt-1 whitespace-pre-line">{cfg.pay_info}</p>}
          {r.wht_amount > 0 && cfg?.wht_payee_info && <p className="mt-1 text-xs">ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ในนาม: {cfg.wht_payee_info}</p>}
          {r.wants_quote && !r.quote_file_path && <p className="mt-1 text-xs">ทีมงานกำลังจัดทำใบเสนอราคาให้</p>}
        </div>
      )}
      {r.status !== "cancelled" && r.status !== "rescheduled" && r.total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {r.pay_status !== "paid" && r.pay_status !== "refunded" && <FileButton label={r.slip_path ? "ส่งสลิปใหม่" : "แนบสลิปโอนเงิน"} busy={uploading === "slip"} onFile={(f) => upload("slip", f)} />}
          {r.wht_amount > 0 && <FileButton label={r.wht_cert_path ? "ส่ง 50 ทวิ ใหม่" : "แนบ 50 ทวิ"} busy={uploading === "wht"} onFile={(f) => upload("wht", f)} />}
          {r.quote_file_path && <button className="font-semibold text-navy-700 underline" onClick={() => openPrivateFile("training-files", r.quote_file_path!)}>ใบเสนอราคา</button>}
          {r.receipt_path && <button className="font-semibold text-navy-700 underline" onClick={() => openPrivateFile("training-files", r.receipt_path!)}>ใบเสร็จ/ใบกำกับภาษี</button>}
        </div>
      )}
      {r.staff_note && <p className="mt-3 rounded-lg bg-navy-50 p-3 text-sm text-navy-800">{r.staff_note}</p>}
      {r.cancel_reason && (r.status === "cancelled" || r.status === "rescheduled") && <p className="mt-2 text-xs text-slate-500">เหตุผล: {r.cancel_reason}</p>}

      {mats.length > 0 && r.status !== "cancelled" && r.status !== "rescheduled" && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-slate-700">เอกสารประกอบ</p>
          <ul className="mt-1 list-disc pl-5">
            {mats.map((m) => <li key={m.id}><a href={m.url} target="_blank" rel="noreferrer" className="text-navy-700 hover:underline">{m.title}</a></li>)}
          </ul>
        </div>
      )}

      {info && <div className="mt-3"><Alert tone="green">{info}</Alert></div>}
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {checkinOpen && <ButtonLink to={`/app/training/checkin?s=${s.id}`} variant="sun">เช็กอิน</ButtonLink>}
        {r.status === "attended" && !r.cert_no && (cfg?.cert_requires_evaluation ?? true) && <Button onClick={() => setMode(mode === "eval" ? "" : "eval")}>ทำแบบประเมิน</Button>}
        {r.cert_no && <Button onClick={() => setMode(mode === "cert" ? "" : "cert")}>ใบประกาศ</Button>}
        {canChange && !status?.banned && <Button variant="secondary" onClick={() => setMode(mode === "move" ? "" : "move")}>เลื่อนรอบ</Button>}
        {canChange && <Button variant="ghost" className="text-red-600" onClick={() => setMode(mode === "cancel" ? "" : "cancel")}>ยกเลิก</Button>}
        {r.status === "registered" && !canChange && days >= 0 && <span className="self-center text-xs text-slate-500">เลื่อน/ยกเลิกได้ถึง {cfg?.change_days_before} วันก่อนวันอบรม หากติดธุระกรุณาติดต่อทีมงาน</span>}
      </div>

      {mode === "eval" && <Evaluation reg={r} questions={cfg?.evaluation_questions ?? []} onDone={() => { setMode("cert"); onChange(); }} />}
      {mode === "cert" && r.cert_no && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-600">เลขที่ <b className="font-mono">{r.cert_no}</b>{r.cert_expires_on ? ` · ใช้ได้ถึง ${formatThaiDate(r.cert_expires_on)}` : ""}</p>
          <CertificateView template={tpl} data={{ name: profile?.full_name || profile?.email || "", nameEn: profile?.name_en, course: c.title, certNo: r.cert_no, date: s.starts_on, expires: r.cert_expires_on }} />
        </div>
      )}
      {(mode === "cancel" || mode === "move") && (
        <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-amber-800">
            การ{mode === "cancel" ? "ยกเลิก" : "เลื่อน"}นับเป็น 1 ครั้ง (ปีนี้ใช้ไป {status?.strikes ?? 0}/{status?.strike_limit ?? 2} ครั้ง) ถ้าเกินกำหนด ระบบจะยกเลิกทุกการจองและระงับสิทธิ์ถึงสิ้นปี
          </p>
          {mode === "move" && (
            <Field label="รอบใหม่">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">— เลือกรอบ —</option>
                {others.map((o) => <option key={o.id} value={o.id}>{sessionDateText(o)}{o.title ? ` · ${o.title}` : ""}</option>)}
              </Select>
            </Field>
          )}
          <Field label="เหตุผล"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex gap-2">
            {mode === "cancel" ? (
              <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => run(() => supabase.rpc("cancel_registration", { p_id: r.id, p_reason: reason }), banMsg)}>ยืนยันยกเลิก</Button>
            ) : (
              <Button loading={busy} disabled={!target} onClick={() => run(() => supabase.rpc("reschedule_registration", { p_id: r.id, p_new_session_id: target, p_reason: reason || null }), banMsg)}>ยืนยันเลื่อนรอบ</Button>
            )}
            <Button variant="ghost" onClick={() => setMode("")}>ปิด</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function MyTraining() {
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const loc = useLocation();
  const booked = (loc.state as { booked?: string } | null)?.booked;
  const regs = useRows<Registration>(() => supabase.from("training_registrations").select(cols(REG_SELECT)).eq("user_id", uid).order("registered_at", { ascending: false }), [uid]);
  const templates = useRows<CertTemplate>(() => supabase.from("cert_templates").select("id, name, image_url, config"));
  const materials = useMaterials(regs.rows);
  const [cfg, setCfg] = useState<TrainingSettings | null>(null);
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const reload = () => {
    regs.reload();
    supabase.rpc("my_training_status").then(({ data }) => setStatus(data as TrainingStatus));
  };
  useEffect(() => {
    loadTrainingSettings().then(setCfg);
    supabase.rpc("my_training_status").then(({ data }) => setStatus(data as TrainingStatus));
  }, []);

  const today = todayBkk();
  const { upcoming, history } = useMemo(() => {
    const up: Registration[] = [];
    const hist: Registration[] = [];
    for (const r of regs.rows) {
      const s = r.course_sessions;
      if (!s) continue;
      if (r.status === "registered" && (s.ends_on ?? s.starts_on) >= today) up.push(r);
      else hist.push(r);
    }
    up.sort((a, b) => a.course_sessions!.starts_on.localeCompare(b.course_sessions!.starts_on));
    return { upcoming: up, history: hist };
  }, [regs.rows, today]);
  const certs = regs.rows.filter((r) => r.cert_no).length;
  const list = tab === "upcoming" ? upcoming : history;

  return (
    <>
      <PageTitle title="การอบรมของฉัน" subtitle="รอบที่จอง ประวัติอบรม ใบประกาศ" actions={<ButtonLink to="/training" variant="sun">จองอบรม</ButtonLink>} />
      {booked && <div className="mb-4"><Alert tone="green">จองเรียบร้อย เลขที่ {booked} ดูรายละเอียดการชำระเงินและเช็กอินได้ด้านล่าง</Alert></div>}
      {status?.banned && <div className="mb-4"><Alert>บัญชีถูกระงับสิทธิ์การจองถึง {formatThaiDate(status.banned_until)} เนื่องจากเลื่อน/ยกเลิก/ไม่มาเกิน {status.strike_limit} ครั้ง</Alert></div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="!p-4"><p className="text-xs text-slate-500">จองล่วงหน้า</p><p className="text-2xl font-bold text-navy-900">{status?.active_bookings ?? 0}<span className="text-sm font-normal text-slate-500">/{status?.max_active_bookings ?? 5}</span></p></Card>
        <Card className="!p-4"><p className="text-xs text-slate-500">เลื่อน/ยกเลิก/ไม่มา ปีนี้</p><p className="text-2xl font-bold text-navy-900">{status?.strikes ?? 0}<span className="text-sm font-normal text-slate-500">/{status?.strike_limit ?? 2}</span></p></Card>
        <Card className="!p-4"><p className="text-xs text-slate-500">ใบประกาศ</p><p className="text-2xl font-bold text-navy-900">{certs}</p></Card>
        <Link to="/app/points"><Card className="!p-4 transition hover:ring-navy-200"><p className="text-xs text-slate-500">แต้มส่วนตัว</p><p className="text-2xl font-bold text-emerald-700">{formatPoints(status?.personal_points)}</p></Card></Link>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "upcoming", label: "รอบที่จะถึง", count: upcoming.length }, { key: "history", label: "ประวัติ" }]} />
      {regs.loading ? (
        <Loading />
      ) : list.length ? (
        <div className="space-y-3">
          {list.map((r) => <RegCard key={r.id} r={r} cfg={cfg} status={status} templates={templates.rows} materials={materials.rows} onChange={reload} />)}
        </div>
      ) : (
        <Empty>{tab === "upcoming" ? <>ยังไม่มีรอบที่จอง <Link to="/training" className="underline">ดูปฏิทินอบรม</Link></> : "ยังไม่มีประวัติการอบรม"}</Empty>
      )}
    </>
  );
}
