import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Select, Spinner, Textarea } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import {
  BILLING_TYPE,
  checkinUrl,
  formatMoney,
  formatThaiDate,
  loadSeats,
  openPrivateFile,
  PAY_STATUS,
  qrDataUrl,
  REG_STATUS,
  cols,
  SESSION_COLS,
  SESSION_STATUS,
  sessionDateText,
  sessionPrice,
  todayBkk,
  uploadTrainingFile,
  type CertTemplate,
  type Course,
  type PayStatus,
  type Registration,
  type Session,
} from "../../../../lib/training";

type S = Session & { courses: Course };

const blank = (courseId = ""): Partial<Session> => ({
  course_id: courseId, title: "", starts_on: todayBkk(), ends_on: null, start_time: "09:00", end_time: "16:00", hours: null,
  location: "", map_url: "", lat: null, lng: null, capacity: 30, status: "open", price: null, vat: true, wht_allowed: true, note: "", cert_template_id: null,
});

function SessionForm({ value, courses, templates, onSaved, onClose }: { value: Partial<Session>; courses: Course[]; templates: CertTemplate[]; onSaved: () => void; onClose: () => void }) {
  const [f, setF] = useState<Partial<Session>>(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Session>(k: K, v: Session[K] | null) => setF((x) => ({ ...x, [k]: v }));
  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  async function save() {
    if (!f.course_id) return setErr("กรุณาเลือกหลักสูตร");
    if (!f.starts_on) return setErr("กรุณาเลือกวันที่");
    setBusy(true);
    setErr("");
    const row = {
      course_id: f.course_id, title: f.title || null, starts_on: f.starts_on, ends_on: f.ends_on || null,
      start_time: f.start_time, end_time: f.end_time, hours: f.hours, location: f.location || null, map_url: f.map_url || null,
      lat: f.lat, lng: f.lng, capacity: f.capacity, status: f.status, price: f.price, vat: f.vat, wht_allowed: f.wht_allowed,
      note: f.note || null, cert_template_id: f.cert_template_id || null,
    };
    // never ask for the row back: the check-in code column is not selectable
    const { error } = f.id ? await supabase.from("course_sessions").update(row).eq("id", f.id) : await supabase.from("course_sessions").insert(row);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }

  return (
    <Card className="mb-4">
      <h3 className="mb-4 font-semibold text-navy-900">{f.id ? "แก้ไขรอบอบรม" : "เพิ่มรอบอบรม"}</h3>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="หลักสูตร" required>
            <Select value={f.course_id ?? ""} onChange={(e) => set("course_id", e.target.value)}>
              <option value="">— เลือก —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-2"><Field label="ชื่อรอบ" hint="เช่น รอบที่ 1 - 19 พ.ย. 2569"><Input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field></div>
        <Field label="วันที่เริ่ม" required><Input type="date" value={f.starts_on ?? ""} onChange={(e) => set("starts_on", e.target.value)} /></Field>
        <Field label="ถึงวันที่ (ถ้าหลายวัน)"><Input type="date" value={f.ends_on ?? ""} onChange={(e) => set("ends_on", e.target.value || null)} /></Field>
        <Field label="เวลาเริ่ม"><Input type="time" value={f.start_time?.slice(0, 5) ?? ""} onChange={(e) => set("start_time", e.target.value)} /></Field>
        <Field label="เวลาสิ้นสุด"><Input type="time" value={f.end_time?.slice(0, 5) ?? ""} onChange={(e) => set("end_time", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="สถานที่"><Input value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="ลิงก์แผนที่"><Input value={f.map_url ?? ""} onChange={(e) => set("map_url", e.target.value)} /></Field></div>
        <Field label="ละติจูด (GPS เช็กอิน)" hint="เว้นว่าง = ไม่ตรวจระยะ"><Input type="number" step="any" value={f.lat ?? ""} onChange={(e) => set("lat", numOrNull(e.target.value))} /></Field>
        <Field label="ลองจิจูด"><Input type="number" step="any" value={f.lng ?? ""} onChange={(e) => set("lng", numOrNull(e.target.value))} /></Field>
        <Field label="จำนวนที่นั่ง"><Input type="number" min={1} value={f.capacity ?? 30} onChange={(e) => set("capacity", Number(e.target.value))} /></Field>
        <Field label="ชั่วโมง (แต้ม)" hint="ว่าง = ตามหลักสูตร"><Input type="number" min={0} step="0.5" value={f.hours ?? ""} onChange={(e) => set("hours", numOrNull(e.target.value))} /></Field>
        <Field label="ราคา (บาท ก่อน VAT)" hint="ว่าง = ตามหลักสูตร · 0 = ฟรี"><Input type="number" min={0} value={f.price ?? ""} onChange={(e) => set("price", numOrNull(e.target.value))} /></Field>
        <Field label="สถานะ">
          <Select value={f.status} onChange={(e) => set("status", e.target.value as Session["status"])}>
            {Object.entries(SESSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="แม่แบบใบประกาศ" hint="ว่าง = ตามหลักสูตร">
          <Select value={f.cert_template_id ?? ""} onChange={(e) => set("cert_template_id", e.target.value || null)}>
            <option value="">—</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.vat ?? true} onChange={(e) => set("vat", e.target.checked)} /> คิด VAT</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.wht_allowed ?? true} onChange={(e) => set("wht_allowed", e.target.checked)} /> นิติบุคคลหัก ณ ที่จ่ายได้</label>
        </div>
        <div className="sm:col-span-4"><Field label="หมายเหตุ"><Textarea rows={2} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></Field></div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy}>บันทึก</Button><Button variant="ghost" onClick={onClose}>ปิด</Button></div>
    </Card>
  );
}

function CheckinPanel({ s }: { s: S }) {
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  useEffect(() => {
    supabase.rpc("session_checkin_code", { p_session_id: s.id }).then(async ({ data }) => {
      if (!data) return;
      setCode(data as string);
      setQr(await qrDataUrl(checkinUrl(s.id, data as string), 360));
    });
  }, [s.id]);
  async function regenerate() {
    if (!confirm("สร้างรหัสเช็กอินใหม่? QR เดิมจะใช้ไม่ได้")) return;
    const c = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    await supabase.from("course_sessions").update({ checkin_code: c }).eq("id", s.id);
    setCode(c);
    setQr(await qrDataUrl(checkinUrl(s.id, c), 360));
  }
  function show() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><title>เช็กอิน ${s.courses.code}</title><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>${s.courses.title}</h1><p>${sessionDateText(s)}</p><img src="${qr}" style="width:60vmin"><p style="font-size:64px;letter-spacing:12px;font-weight:bold">${code}</p><p>สแกน QR หรือเข้า One App → การอบรมของฉัน → เช็กอิน แล้วกรอกรหัส</p></body>`);
    w.document.close();
  }
  if (!code) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-navy-50 p-4">
      {qr && <img src={qr} alt="QR เช็กอิน" className="h-28 w-28 rounded-lg bg-white" />}
      <div>
        <p className="text-xs text-slate-500">รหัสเช็กอิน</p>
        <p className="font-mono text-3xl font-bold tracking-widest text-navy-900">{code}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" className="!px-3 !py-1.5" onClick={show}>เปิดจอแสดง QR</Button>
          <Button variant="ghost" className="!px-3 !py-1.5" onClick={regenerate}>สร้างรหัสใหม่</Button>
        </div>
      </div>
    </div>
  );
}

function RosterRow({ r, edit, onChange }: { r: Registration; edit: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<PayStatus>(r.pay_status);
  const [note, setNote] = useState(r.staff_note ?? "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const receiptRef = useRef<HTMLInputElement>(null);
  const quoteRef = useRef<HTMLInputElement>(null);

  async function rpc(key: string, fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(key);
    setErr("");
    const { error } = await fn();
    setBusy("");
    if (error) return setErr(errorMessage(error));
    onChange();
  }
  async function attendance(status: string) {
    let reason: string | null = null;
    if (status !== "attended") {
      reason = prompt(status === "no_show" ? "เหตุผล (ไม่มาอบรม นับเป็น 1 ครั้ง)" : "เหตุผลที่ยกเลิกการเช็กอิน") ?? null;
      if (reason === null) return;
    }
    await rpc("att", () => supabase.rpc("set_attendance", { p_reg_id: r.id, p_status: status, p_reason: reason }));
  }
  async function upload(kind: "receipt" | "quote", f: File) {
    setBusy(kind);
    try {
      const path = await uploadTrainingFile(r.id, f, kind);
      const patch = kind === "receipt" ? { receipt_path: path } : { quote_file_path: path };
      const { error } = await supabase.from("training_registrations").update(patch).eq("id", r.id);
      if (error) throw error;
      onChange();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const p = r.profiles;
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-navy-900">{p?.full_name || p?.email || "(ผู้ใช้เดิม cerssc ยังไม่สมัคร)"}</p>
          <p className="text-xs text-slate-500">{r.code} · {[p?.email, p?.phone].filter(Boolean).join(" · ")}{r.sale_name ? ` · Sale: ${r.sale_name}` : ""}</p>
        </div>
        <Badge tone={REG_STATUS[r.status].tone}>{REG_STATUS[r.status].label}</Badge>
        {r.total > 0 && <Badge tone={PAY_STATUS[r.pay_status].tone}>{PAY_STATUS[r.pay_status].label}</Badge>}
        {r.cert_no && <span className="font-mono text-xs text-slate-500">{r.cert_no}</span>}
        {edit && ["registered", "attended", "no_show"].includes(r.status) && (
          <Select value={r.status} disabled={busy === "att"} onChange={(e) => attendance(e.target.value)} className="!w-auto !py-1.5">
            <option value="registered">ยังไม่เช็กอิน</option>
            <option value="attended">เข้าอบรม</option>
            <option value="no_show">ไม่มา</option>
          </Select>
        )}
        <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-navy-700 hover:underline">{open ? "ปิด" : "รายละเอียด"}</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            {r.total > 0 ? (
              <>
                <p>ค่าอบรม {formatMoney(r.subtotal)}{r.discount > 0 && ` · ส่วนลด ${formatMoney(r.discount)} (${r.coupon_code})`} · VAT {formatMoney(r.vat_amount)} · หัก ณ ที่จ่าย {formatMoney(r.wht_amount)}</p>
                <p className="font-semibold">ยอดชำระ {formatMoney(r.total)}</p>
                {r.billing && <p className="mt-1 text-slate-600">{BILLING_TYPE[r.billing.type]}: {r.billing.name} {r.billing.tax_id} {r.billing.branch}<br />{r.billing.address}</p>}
                {r.wants_quote && <p className="mt-1 text-amber-700">ลูกค้าขอใบเสนอราคา</p>}
              </>
            ) : <p>ไม่มีค่าใช้จ่าย</p>}
            {r.source && <p className="mt-1 text-slate-500">รู้จักจาก: {r.source}</p>}
            {r.note && <p className="mt-1 text-slate-500">หมายเหตุลูกค้า: {r.note}</p>}
            {r.checked_in_at && <p className="mt-1 text-slate-500">เช็กอิน {formatThaiDate(r.checked_in_at, { dateStyle: "medium", timeStyle: "short" } as Intl.DateTimeFormatOptions)} ({r.check_in_method})</p>}
            {r.evaluation && <p className="mt-1 text-slate-500">ประเมิน: {Object.entries(r.evaluation).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}
            <div className="mt-2 flex flex-wrap gap-3">
              {r.slip_path && <button className="text-navy-700 underline" onClick={() => openPrivateFile("training-files", r.slip_path!)}>สลิป</button>}
              {r.wht_cert_path && <button className="text-navy-700 underline" onClick={() => openPrivateFile("training-files", r.wht_cert_path!)}>50 ทวิ</button>}
              {r.receipt_path && <button className="text-navy-700 underline" onClick={() => openPrivateFile("training-files", r.receipt_path!)}>ใบเสร็จ</button>}
              {r.quote_file_path && <button className="text-navy-700 underline" onClick={() => openPrivateFile("training-files", r.quote_file_path!)}>ใบเสนอราคา</button>}
            </div>
          </div>
          {edit && (
            <div className="space-y-3">
              {r.total > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="สถานะชำระเงิน">
                    <Select value={pay} onChange={(e) => setPay(e.target.value as PayStatus)}>
                      {(["unpaid", "pending", "paid", "refunded"] as PayStatus[]).map((k) => <option key={k} value={k}>{PAY_STATUS[k].label}</option>)}
                    </Select>
                  </Field>
                  <Button variant="secondary" className="!py-2" onClick={() => receiptRef.current?.click()} disabled={busy === "receipt"}>{busy === "receipt" && <Spinner className="h-4 w-4" />}แนบใบเสร็จ</Button>
                  <Button variant="secondary" className="!py-2" onClick={() => quoteRef.current?.click()} disabled={busy === "quote"}>{busy === "quote" && <Spinner className="h-4 w-4" />}แนบใบเสนอราคา</Button>
                  <input ref={receiptRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload("receipt", f); }} />
                  <input ref={quoteRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload("quote", f); }} />
                </div>
              )}
              <Field label="ข้อความถึงลูกค้า"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-2">
                <Button loading={busy === "save"} onClick={() => rpc("save", () => supabase.from("training_registrations").update({ pay_status: pay, staff_note: note || null }).eq("id", r.id))}>บันทึก</Button>
                {r.status === "attended" && !r.cert_no && <Button variant="secondary" loading={busy === "cert"} onClick={() => rpc("cert", () => supabase.rpc("issue_certificate", { p_reg_id: r.id }))}>ออกใบประกาศ</Button>}
                {r.status === "registered" && (
                  <Button variant="ghost" className="text-red-600" loading={busy === "cancel"} onClick={() => {
                    const reason = prompt("เหตุผลที่ยกเลิก");
                    if (!reason) return;
                    const strike = confirm("นับเป็นการยกเลิก 1 ครั้งของลูกค้าหรือไม่? (ตกลง = นับ, ยกเลิก = ไม่นับ)");
                    rpc("cancel", () => supabase.rpc("cancel_registration", { p_id: r.id, p_reason: reason, p_strike: strike }));
                  }}>ยกเลิกการจอง</Button>
                )}
              </div>
            </div>
          )}
          {err && <div className="sm:col-span-2"><Alert>{err}</Alert></div>}
        </div>
      )}
    </div>
  );
}

function Roster({ s, edit }: { s: S; edit: boolean }) {
  const regs = useRows<Registration>(
    () => supabase.from("training_registrations").select("*, profiles(full_name, email, phone, name_en)").eq("session_id", s.id).order("registered_at"),
    [s.id],
  );
  const [showAll, setShowAll] = useState(false);
  const active = regs.rows.filter((r) => ["registered", "attended", "no_show"].includes(r.status));
  const shown = showAll ? regs.rows : active;

  function exportCsv() {
    const head = ["เลขที่", "ชื่อ", "อีเมล", "โทร", "สถานะ", "ชำระเงิน", "ยอด", "ออกใบเสร็จในนาม", "เลขผู้เสียภาษี", "Sale", "ช่องทาง", "เลขใบประกาศ"];
    const rows = regs.rows.map((r) => [r.code, r.profiles?.full_name ?? "", r.profiles?.email ?? "", r.profiles?.phone ?? "", REG_STATUS[r.status].label, PAY_STATUS[r.pay_status].label, r.total, r.billing?.name ?? "", r.billing?.tax_id ?? "", r.sale_name ?? "", r.source ?? "", r.cert_no ?? ""]);
    const csv = "﻿" + [head, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${s.courses.code}-${s.starts_on}.csv`;
    a.click();
  }

  return (
    <div className="mt-4 space-y-4">
      {edit && <CheckinPanel s={s} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          ผู้ลงทะเบียน {active.length}/{s.capacity} · เข้าอบรม {regs.rows.filter((r) => r.status === "attended").length}
        </p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> แสดงที่ยกเลิก/เลื่อน</label>
          <Button variant="secondary" className="!px-3 !py-1.5" onClick={exportCsv}>ส่งออก CSV</Button>
        </div>
      </div>
      {regs.loading ? <Loading /> : shown.length ? (
        <div className="rounded-xl bg-white px-4 ring-1 ring-slate-200">{shown.map((r) => <RosterRow key={r.id} r={r} edit={edit} onChange={regs.reload} />)}</div>
      ) : <Empty>ยังไม่มีผู้ลงทะเบียน</Empty>}
    </div>
  );
}

export default function SessionsTab() {
  const { can } = useAuth();
  const edit = can("courses");
  const [past, setPast] = useState(false);
  const sessions = useRows<S>(() => {
    const q = supabase.from("course_sessions").select(cols(`${SESSION_COLS}, courses(*)`)).eq("is_archived", false);
    return past ? q.lt("starts_on", todayBkk()).order("starts_on", { ascending: false }).limit(100) : q.gte("starts_on", todayBkk()).order("starts_on");
  }, [past]);
  const courses = useRows<Course>(() => supabase.from("courses").select("*").order("sort").order("title"));
  const templates = useRows<CertTemplate>(() => supabase.from("cert_templates").select("id, name, image_url, config").order("name"));
  const [seats, setSeats] = useState<Map<string, number>>(new Map());
  const [form, setForm] = useState<Partial<Session> | null>(null);
  const [roster, setRoster] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    loadSeats().then(setSeats);
  }, [sessions.rows]);
  const list = useMemo(() => sessions.rows, [sessions.rows]);

  async function archive(s: S) {
    if (!confirm("ซ่อนรอบนี้จากรายการ? (ข้อมูลผู้ลงทะเบียนยังอยู่)")) return;
    await supabase.from("course_sessions").update({ is_archived: true }).eq("id", s.id);
    sessions.reload();
  }
  async function noShows() {
    const { data, error } = await supabase.rpc("mark_no_shows");
    setMsg(error ? errorMessage(error) : `บันทึก “ไม่มาอบรม” ${data} รายการ`);
    sessions.reload();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${!past ? "bg-white shadow-sm" : ""}`} onClick={() => setPast(false)}>รอบที่จะถึง</button>
          <button className={`rounded-md px-3 py-1.5 ${past ? "bg-white shadow-sm" : ""}`} onClick={() => setPast(true)}>รอบที่ผ่านมา</button>
        </div>
        {edit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={noShows}>บันทึกไม่มาอบรม (รอบที่จบแล้ว)</Button>
            <Button onClick={() => setForm(blank(courses.rows[0]?.id))}>เพิ่มรอบอบรม</Button>
          </div>
        )}
      </div>
      {msg && <div className="mb-4"><Alert tone="navy">{msg}</Alert></div>}
      {form && <SessionForm key={form.id ?? "new"} value={form} courses={courses.rows} templates={templates.rows} onClose={() => setForm(null)} onSaved={() => { setForm(null); sessions.reload(); }} />}
      {sessions.loading ? <Loading /> : list.length ? (
        <div className="space-y-3">
          {list.map((s) => {
            const booked = seats.get(s.id) ?? 0;
            return (
              <Card key={s.id} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sun-600">{s.courses?.code}</p>
                    <p className="font-semibold text-navy-900">{s.courses?.title}{s.title ? ` · ${s.title}` : ""}</p>
                    <p className="text-sm text-slate-600">{sessionDateText(s)} · {s.location}</p>
                    <p className="text-xs text-slate-500">{sessionPrice(s, s.courses) > 0 ? formatMoney(sessionPrice(s, s.courses)) : "ฟรี"} · {s.lat != null ? "ตรวจ GPS" : "ไม่ตรวจ GPS"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</Badge>
                    <span className="text-sm font-semibold text-navy-900">{booked}/{s.capacity} ที่</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <button className="font-semibold text-navy-700 hover:underline" onClick={() => setRoster(roster === s.id ? null : s.id)}>{roster === s.id ? "ซ่อนรายชื่อ" : "รายชื่อ / เช็กอิน"}</button>
                  {edit && <button className="font-semibold text-navy-700 hover:underline" onClick={() => setForm(s)}>แก้ไข</button>}
                  {edit && <button className="text-slate-500 hover:underline" onClick={() => archive(s)}>ซ่อน</button>}
                </div>
                {roster === s.id && <Roster s={s} edit={edit} />}
              </Card>
            );
          })}
        </div>
      ) : <Empty>{past ? "ยังไม่มีรอบที่ผ่านมา" : "ยังไม่มีรอบอบรมที่จะถึง"}</Empty>}
    </div>
  );
}
