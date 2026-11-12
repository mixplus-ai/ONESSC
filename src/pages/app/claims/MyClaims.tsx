import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NextSteps } from "../../../components/CareTeam";
import { ScanButton } from "../../../components/SnScanner";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Field, Input, Loading, PageTitle, Select, Spinner, Textarea, cx } from "../../../components/ui";
import {
  CLAIM_STATUS, SN_CHANGE_STATUS, SN_REASON, fmtThai, fmtThaiTime, openClaimFile, productTypeLabel, splitSns, uploadClaimFile,
  type MyClaim, type SnChange, type SnChangeReason,
} from "../../../lib/claims";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";

/** Shipping-style milestones the customer sees. */
const MILESTONES: { status: MyClaim["status"]; label: string; desc: string }[] = [
  { status: "submitted", label: "แจ้งเคลม", desc: "ระบบได้รับแบบฟอร์มแจ้งเคลมแล้ว รอเจ้าหน้าที่รับเรื่อง" },
  { status: "in_progress", label: "กำลังดำเนินการ", desc: "เจ้าหน้าที่รับเรื่องแล้ว กำลังตรวจสอบและประสานงานเคลม" },
  { status: "done", label: "ใบเคลมพร้อม", desc: "ดำเนินการเสร็จ ใบเคลมสินค้าพร้อมให้ดาวน์โหลดเพื่อรับสินค้า" },
  { status: "returned", label: "ส่งของคืน", desc: "ลูกค้าส่ง SN ของตัวเก่าคืนแล้ว รอทีมงานตรวจรับ" },
  { status: "closed", label: "ปิดงาน", desc: "ทีมงานตรวจรับของเคลมครบ ปิดงานเรียบร้อย" },
];
const STATUS_DESC: Record<string, string> = {
  ...Object.fromEntries(MILESTONES.map((m) => [m.status, m.desc])),
  rejected: "ไม่อนุมัติหรือยกเลิกเคลม ดูเหตุผลจากหมายเหตุ",
};
const ORDER = MILESTONES.map((m) => m.status);

/** When each milestone was first reached (submitted = filed date). */
function milestoneDates(c: MyClaim) {
  const at = new Map<string, string>([["submitted", c.created_at]]);
  for (const e of c.events) if (!at.has(e.status)) at.set(e.status, e.at);
  // a later milestone implies the earlier ones happened, even if staff skipped a step
  return at;
}

/** Horizontal tracker: done steps green, current step highlighted, dates under each reached step. */
export function ClaimTracker({ c }: { c: MyClaim }) {
  const rejected = c.status === "rejected";
  const cur = rejected ? 0 : ORDER.indexOf(c.status);
  const at = milestoneDates(c);
  const pct = rejected ? 0 : (cur / (MILESTONES.length - 1)) * 100;
  return (
    <div className="relative">
      <div className="absolute top-4 right-[10%] left-[10%] h-1 rounded-full bg-slate-200" aria-hidden>
        <div className={cx("h-full rounded-full transition-all", rejected ? "bg-red-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
      </div>
      <ol className="relative grid grid-cols-5 gap-1" aria-label="สถานะเคลม">
        {MILESTONES.map((m, i) => {
          const done = !rejected && i < cur;
          const active = !rejected && i === cur;
          const final = active && m.status === "closed";
          return (
            <li key={m.status} className="flex flex-col items-center text-center">
              <span
                className={cx(
                  "relative grid h-9 w-9 place-items-center rounded-full text-sm font-bold ring-4 ring-white",
                  done || final ? "bg-emerald-600 text-white" : active ? "bg-sun-500 text-navy-950" : rejected && i === 0 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-500",
                )}
              >
                {done || final ? "✓" : rejected && i === 0 ? "✕" : i + 1}
                {active && !final && <span className="absolute inset-0 animate-ping rounded-full bg-sun-500/40" aria-hidden />}
              </span>
              <span className={cx("mt-1.5 text-[11px] leading-tight sm:text-xs", active || done ? "font-semibold text-navy-900" : "text-slate-500")}>
                {rejected && i === 0 ? "ไม่อนุมัติ" : m.label}
              </span>
              {(done || active) && at.get(m.status) && <span className="text-[10px] text-slate-500 sm:text-[11px]">{fmtThai(at.get(m.status)!)}</span>}
              {final && c.closed_by && <span className="text-[10px] text-slate-500 sm:text-[11px]">โดย {c.closed_by}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Vertical tracking history, newest first, like a parcel tracking page. */
function TrackingHistory({ c }: { c: MyClaim }) {
  const items = [
    { status: "submitted", note: null as string | null, at: c.created_at },
    ...c.events.filter((e, i) => !(i === 0 && e.status === "submitted")),
  ].reverse();
  return (
    <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
      {items.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={cx(
              "absolute top-1 -left-[1.6rem] h-3.5 w-3.5 rounded-full ring-4 ring-white",
              i === 0 ? (e.status === "rejected" ? "bg-red-500" : "bg-emerald-500") : "bg-slate-300",
            )}
          />
          <p className={cx("text-sm", i === 0 ? "font-semibold text-navy-900" : "font-medium text-slate-700")}>{CLAIM_STATUS[e.status as MyClaim["status"]]?.label ?? e.status}</p>
          <p className="text-xs text-slate-500">{fmtThaiTime(e.at)}</p>
          <p className="mt-0.5 text-xs text-slate-600">{STATUS_DESC[e.status] ?? ""}</p>
          {e.note && <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs whitespace-pre-line text-slate-700 ring-1 ring-slate-200">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Same rule as public.sn_key() in the DB: upper-case, drop spaces - _ . /, letter O → zero. */
const snKey = (v: string) => v.toUpperCase().replace(/[\s\-_./]/g, "").replace(/O/g, "0");

/** Model for each reported SN (optimizer lines carry their own bad SNs), falling back to the claim's model. */
function snModels(c: MyClaim): Record<string, string> {
  const m: Record<string, string> = {};
  for (const it of c.details.items ?? []) for (const sn of splitSns(it.bad_sn ?? "")) m[snKey(sn)] = it.model;
  return m;
}

function ReturnForm({ c, onDone }: { c: MyClaim; onDone: () => void }) {
  const reported = c.reported_sns.filter((s) => snKey(s));
  const models = snModels(c);
  const [vals, setVals] = useState<string[]>(() => reported.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const ok = (i: number) => !!vals[i].trim() && snKey(vals[i]) === snKey(reported[i]);
  const matched = reported.filter((_, i) => ok(i)).length;
  const all = reported.length > 0 && matched === reported.length;

  const setAt = (i: number, v: string) => setVals((vs) => vs.map((x, k) => (k === i ? v : x)));
  /** A scanned code goes to the row whose reported SN it matches, otherwise to the first empty row. */
  function placeScan(sn: string) {
    const k = snKey(sn);
    let i = reported.findIndex((r, j) => snKey(r) === k && !ok(j));
    if (i < 0) i = vals.findIndex((v) => !v.trim());
    if (i < 0) return setErr(`สแกนได้ ${sn} แต่กรอกครบทุกช่องแล้ว`);
    setErr("");
    setAt(i, sn);
  }
  async function send() {
    setErr("");
    if (!all) return setErr(`SN ที่คืนยังไม่ตรงกับที่แจ้ง ${reported.length - matched} รายการ กรุณาตรวจช่องที่มีเครื่องหมาย ✕ หรือยังว่าง`);
    setBusy(true);
    const { error } = await supabase.rpc("return_claim", { p_claim: c.id, p_sns: vals.map((v) => v.trim()) });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }

  if (!reported.length) {
    return (
      <div className="mt-4 rounded-xl bg-sun-500/10 p-4 text-sm">
        <p className="font-semibold text-navy-900">ขั้นที่ 3: ส่งของเคลมกลับ</p>
        <p className="mt-1 text-slate-600">เคลมนี้ไม่มี SN ที่แจ้งไว้ในระบบ กรุณาติดต่อเจ้าหน้าที่</p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl bg-sun-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900">ขั้นที่ 3: ส่งของเคลมกลับ</p>
          <p className="mt-1 text-xs text-slate-600">กรอกหรือสแกน SN ของตัวเก่าที่ส่งคืนให้ตรงกับ SN ที่แจ้งไว้ทีละรายการ ระบบจะเทียบให้ทันที ส่งได้เมื่อตรงครบทุกรายการ</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", all ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-700")}>
            ตรงกัน {matched}/{reported.length}
          </span>
          <ScanButton multi onScan={placeScan} />
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_2rem] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:grid">
          <span>#</span><span>รุ่น</span><span>SN ที่แจ้ง</span><span>SN ที่คืน</span><span />
        </div>
        <ul className="divide-y divide-slate-100">
          {reported.map((sn, i) => {
            const filled = !!vals[i].trim();
            const good = ok(i);
            return (
              <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_2rem]">
                <span className="row-span-3 self-start pt-1 text-sm text-slate-500 sm:row-span-1 sm:self-center sm:pt-0">{i + 1}</span>
                <span className="truncate text-sm text-slate-700 sm:order-none">{models[snKey(sn)] ?? c.model ?? "-"}</span>
                <span className="hidden sm:block font-mono text-sm text-navy-900 break-all">{sn}</span>
                <span className="col-start-2 font-mono text-xs text-slate-500 sm:hidden">แจ้ง: <span className="text-navy-900">{sn}</span></span>
                <input
                  ref={(el) => { refs.current[i] = el; }}
                  value={vals[i]}
                  onChange={(e) => setAt(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refs.current[i + 1]?.focus(); } }}
                  placeholder="SN ที่คืน"
                  aria-label={`SN ที่คืน รายการ ${i + 1}`}
                  className={cx(
                    "col-start-2 w-full rounded-lg border px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2 sm:col-start-auto",
                    !filled ? "border-slate-300 focus:ring-navy-200" : good ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-200" : "border-red-400 bg-red-50 focus:ring-red-200",
                  )}
                />
                <span className="col-start-3 row-start-1 flex justify-center sm:col-start-auto sm:row-start-auto" aria-live="polite">
                  {filled && (good
                    ? <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-xs font-bold text-white" title="ตรงกับที่แจ้ง">✓</span>
                    : <span className="grid h-6 w-6 place-items-center rounded-full bg-red-500 text-xs font-bold text-white" title="ไม่ตรงกับที่แจ้ง">✕</span>)}
                </span>
                {filled && !good && <span className="col-start-2 text-xs text-red-600 sm:col-span-2 sm:col-start-4">ไม่ตรงกับ SN ที่แจ้ง · ถ้า SN ที่แจ้งไว้ผิด กด "ขอแก้ไข" ด้านล่าง</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
      <Button className="mt-3" onClick={send} loading={busy} disabled={!all}>ยืนยันส่งของคืน {reported.length > 1 ? `(${reported.length} รายการ)` : ""}</Button>
    </div>
  );
}

/** แจ้งแก้ไข SN: the customer reported a wrong SN; staff approve before step 3 checks the new one. */
function SnChangePanel({ c, changes, onDone }: { c: MyClaim; changes: SnChange[]; onDone: () => void }) {
  const reported = c.reported_sns.filter((s) => snKey(s));
  const pendingOld = new Set(changes.filter((x) => x.status === "pending").map((x) => snKey(x.old_sn)));
  const free = reported.filter((s) => !pendingOld.has(snKey(s)));
  const [open, setOpen] = useState(false);
  const [oldSn, setOldSn] = useState("");
  const [newSn, setNewSn] = useState("");
  const [reason, setReason] = useState<SnChangeReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canAsk = c.mine && ["submitted", "in_progress", "done"].includes(c.status) && reported.length > 0;
  if (!canAsk && !changes.length) return null;

  async function send() {
    setErr("");
    if (!oldSn) return setErr("เลือก SN เดิมที่จะแก้");
    if (!newSn.trim()) return setErr("กรอก SN ที่ถูกต้อง");
    if (!reason) return setErr("เลือกสาเหตุ");
    if (reason === "other" && !note.trim()) return setErr("ระบุสาเหตุ");
    setBusy(true);
    const { error } = await supabase.rpc("request_sn_change", { p_claim: c.id, p_old: oldSn, p_new: newSn.trim(), p_reason: reason, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setOpen(false);
    setOldSn(""); setNewSn(""); setReason(""); setNote("");
    onDone();
  }
  async function cancel(id: string) {
    if (!confirm("ยกเลิกคำขอแก้ SN นี้?")) return;
    const { error } = await supabase.rpc("cancel_sn_change", { p_id: id });
    if (error) return setErr(errorMessage(error));
    onDone();
  }

  return (
    <div className="mt-3 rounded-xl p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-900">แจ้งแก้ไข SN</p>
        {canAsk && free.length > 0 && !open && (
          <button type="button" className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => { setOpen(true); setOldSn(free.length === 1 ? free[0] : ""); }}>
            SN ที่แจ้งไว้ไม่ถูกต้อง? ขอแก้ไข
          </button>
        )}
      </div>
      {changes.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {changes.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono text-xs"><span className="text-slate-500 line-through">{x.old_sn}</span> → <span className="text-navy-900">{x.new_sn}</span></span>
              <span className="text-xs text-slate-500">{SN_REASON[x.reason]}{x.note ? `: ${x.note}` : ""}</span>
              <Badge tone={SN_CHANGE_STATUS[x.status].tone}>{SN_CHANGE_STATUS[x.status].label}</Badge>
              {x.status === "rejected" && x.staff_note && <span className="w-full text-xs text-red-700">เหตุผล: {x.staff_note}</span>}
              {x.status === "pending" && <button type="button" className="text-xs text-slate-500 underline" onClick={() => cancel(x.id)}>ยกเลิกคำขอ</button>}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="SN เดิมที่แจ้งไว้">
            <Select value={oldSn} onChange={(e) => setOldSn(e.target.value)}>
              <option value="">เลือก SN</option>
              {free.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="SN ที่ถูกต้อง">
            <div className="flex gap-1">
              <Input className="font-mono" value={newSn} onChange={(e) => setNewSn(e.target.value)} placeholder="กรอกหรือสแกน" />
              <ScanButton onScan={(sn) => setNewSn(sn)} />
            </div>
          </Field>
          <Field label="สาเหตุ">
            <Select value={reason} onChange={(e) => setReason(e.target.value as SnChangeReason)}>
              <option value="">เลือกสาเหตุ</option>
              {(Object.keys(SN_REASON) as SnChangeReason[]).map((k) => <option key={k} value={k}>{SN_REASON[k]}</option>)}
            </Select>
          </Field>
          <Field label={reason === "other" ? "รายละเอียด (จำเป็น)" : "รายละเอียดเพิ่มเติม (ไม่บังคับ)"}>
            <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={send} loading={busy}>ส่งคำขอให้เจ้าหน้าที่อนุมัติ</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setErr(""); }}>ยกเลิก</Button>
          </div>
          <p className="text-xs text-slate-500 sm:col-span-2">เมื่อเจ้าหน้าที่อนุมัติ ระบบจะเปลี่ยน SN ในเคลมนี้ให้ และใช้ SN ใหม่ตรวจตอนส่งของคืน (ขั้นที่ 3)</p>
        </div>
      )}
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
    </div>
  );
}

function AddFiles({ c, onDone }: { c: MyClaim; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function up(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setErr("");
    try {
      for (const f of [...list]) await uploadClaimFile(c.id, "customer", f);
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
  }
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />}แนบไฟล์เพิ่ม
      </button>
      <input ref={ref} type="file" hidden multiple accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={(e) => { up(e.target.files); e.target.value = ""; }} />
      {err && <span className="text-xs text-red-600">{err}</span>}
    </>
  );
}

function ClaimCard({ c, changes, onChanged }: { c: MyClaim; changes: SnChange[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const st = CLAIM_STATUS[c.status];
  const doc = c.files.find((f) => f.kind === "claim_doc" && f.path === c.claim_doc_path) ?? c.files.find((f) => f.kind === "claim_doc");
  const optItems = c.details.items ?? [];
  const last = c.events[c.events.length - 1];
  const lastAt = last?.at ?? c.created_at;
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="block w-full p-5 text-left hover:bg-slate-50/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">เลขเคลม</p>
            <p className="font-mono text-xl font-bold text-navy-900">{c.claim_no}</p>
            <p className="mt-0.5 truncate text-sm text-slate-700">
              {[c.brand, productTypeLabel(c.product_type), c.model].filter(Boolean).join(" · ")} · {c.qty} ชิ้น
              {c.site_name && <span className="text-slate-500"> · ไซต์ {c.site_name}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-xs text-slate-500">อัปเดต {fmtThaiTime(lastAt)}</span>
          </div>
        </div>
        <div className="mt-5"><ClaimTracker c={c} /></div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-slate-700">
            <span className="font-semibold text-navy-900">ล่าสุด:</span> {STATUS_DESC[c.status]}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-semibold text-navy-700">
            {open ? "ซ่อน" : "ดูรายละเอียด"}
            <svg viewBox="0 0 20 20" className={cx("h-4 w-4 transition-transform", open && "rotate-180")} fill="currentColor" aria-hidden><path d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" /></svg>
          </span>
        </div>
      </button>

      <div className="px-5 pb-5">
        {c.customer_note && <div className="mt-1"><Alert tone={c.status === "rejected" ? "red" : "navy"}><span className="whitespace-pre-line">{c.customer_note}</span></Alert></div>}
        {(c.status === "done" || c.status === "returned" || c.status === "closed") && doc && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-900">ใบเคลมสินค้าพร้อมแล้ว นำไปแจ้งรับสินค้าได้{c.delivery_type === "pickup" ? " ที่คลัง" : ""}</p>
            <Button variant="secondary" onClick={() => openClaimFile(doc.path)}>ดาวน์โหลดใบเคลม</Button>
          </div>
        )}
        {c.status === "done" && <ReturnForm c={c} onDone={onChanged} />}
        {(c.status === "done" || open || changes.some((x) => x.status === "pending")) && <SnChangePanel c={c} changes={changes} onDone={onChanged} />}
        {c.status === "returned" && <p className="mt-3 text-sm text-slate-600">ส่งของคืนแล้ว {c.returned_sns?.length ?? 0} รายการ ตรงกับ SN ที่แจ้งครบ · รอ{c.handler ? ` ${c.handler} (ผู้รับผิดชอบ)` : "ทีมงาน"}ตรวจรับเพื่อปิดงาน</p>}
        {c.status === "closed" && <p className="mt-3 text-sm text-emerald-700">ปิดงานเรียบร้อย{c.closed_at ? ` เมื่อ ${fmtThaiTime(c.closed_at)}` : ""}{c.closed_by ? ` โดย ${c.closed_by}` : ""}</p>}

        {open && (
          <div className="mt-4 grid gap-6 border-t border-slate-100 pt-4 text-sm md:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="mb-3 font-semibold text-navy-900">ประวัติสถานะ</p>
              <TrackingHistory c={c} />
            </div>
            <div>
              <p className="mb-2 font-semibold text-navy-900">รายละเอียดเคลม</p>
              <dl className="space-y-1">
                <div><dt className="inline text-slate-500">ผู้ติดต่อ: </dt><dd className="inline">{c.contact_name} · {c.contact_phone}</dd></div>
                {c.company_name && <div><dt className="inline text-slate-500">บริษัท: </dt><dd className="inline">{c.company_name}</dd></div>}
                {c.installer_name && <div><dt className="inline text-slate-500">ผู้ติดตั้ง: </dt><dd className="inline">{c.installer_name}</dd></div>}
                {c.case_id && <div><dt className="inline text-slate-500">Case: </dt><dd className="inline">{c.case_id}</dd></div>}
                {c.details.po_no && <div><dt className="inline text-slate-500">PO / PI: </dt><dd className="inline">{c.details.po_no}</dd></div>}
                {c.reported_sns.length > 0 && (c.returned_sns?.length ? (
                  <div>
                    <dt className="text-slate-500">SN ที่แจ้ง / SN ที่คืน</dt>
                    <dd>
                      <ul className="mt-1 space-y-0.5 font-mono text-xs">
                        {c.reported_sns.map((sn, i) => {
                          const back = c.returned_sns!.find((r) => snKey(r) === snKey(sn));
                          return (
                            <li key={i} className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-400">{i + 1}.</span><span>{sn}</span><span className="text-slate-400">→</span>
                              {back ? <span className="text-emerald-700">{back} ✓</span> : <span className="text-slate-400">ยังไม่คืน</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </dd>
                  </div>
                ) : <div><dt className="inline text-slate-500">SN ที่แจ้ง: </dt><dd className="inline font-mono">{c.reported_sns.join(", ")}</dd></div>)}
                {optItems.length > 0 && (
                  <div><dt className="text-slate-500">รายการ Optimizer</dt>
                    <dd><ul className="list-disc pl-5">{optItems.map((i, k) => <li key={k}>{i.model} × {i.qty}{i.ref_inv_sn ? ` · Ref Inv ${i.ref_inv_sn}` : ""}</li>)}</ul></dd></div>
                )}
                {c.symptom && <div><dt className="inline text-slate-500">อาการ: </dt><dd className="inline whitespace-pre-line">{c.symptom}</dd></div>}
                <div><dt className="inline text-slate-500">การรับสินค้า: </dt><dd className="inline">{c.delivery_type === "pickup" ? "รับเองที่คลัง" : `จัดส่ง · ${c.delivery_address ?? ""}`}</dd></div>
                {c.handler && <div><dt className="inline text-slate-500">ผู้รับเรื่อง: </dt><dd className="inline">{c.handler}</dd></div>}
              </dl>
              {c.files.length > 0 && (
                <>
                  <p className="mt-4 mb-1 font-semibold text-navy-900">ไฟล์</p>
                  <ul className="space-y-1">
                    {c.files.map((f) => (
                      <li key={f.id}><button type="button" className="text-navy-700 underline" onClick={() => openClaimFile(f.path)}>{f.kind === "claim_doc" ? "ใบเคลมสินค้า" : f.file_name ?? "ไฟล์"}</button> <span className="text-xs text-slate-500">{fmtThai(f.created_at)}</span></li>
                    ))}
                  </ul>
                </>
              )}
              {c.mine && (c.status === "submitted" || c.status === "in_progress") && <div className="mt-3"><AddFiles c={c} onDone={onChanged} /></div>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function MyClaims() {
  const loc = useLocation();
  const st = loc.state as { created?: string; failed?: string[] } | null;
  const list = useRows<MyClaim>(async () => {
    const { data, error } = await supabase.rpc("my_claims");
    return { data: (data ?? []) as MyClaim[], error };
  });
  const snChanges = useRows<SnChange>(async () => {
    const { data, error } = await supabase.rpc("my_sn_changes");
    return { data: (data ?? []) as SnChange[], error };
  });
  const reloadAll = () => { list.reload(); snChanges.reload(); };
  const [filter, setFilter] = useState<"open" | "all">("all");
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = list.rows
    .filter((c) => filter === "all" || !["closed", "rejected"].includes(c.status))
    .filter((c) => !term || [c.claim_no, c.model, c.site_name, ...c.reported_sns].some((v) => v?.toLowerCase().includes(term)));

  return (
    <>
      <PageTitle title="งานเคลมของฉัน" subtitle="ติดตามสถานะเคลมที่คุณแจ้งไว้" actions={<ButtonLink to="/app/claims/new" variant="sun">+ แจ้งเคลม</ButtonLink>} />
      {st?.created && (
        <div className="mb-4">
          <NextSteps kind="claim" code={st.created} />
          {st.failed && st.failed.length > 0 && <div className="mt-2"><Alert tone="amber">อัปโหลดไฟล์ไม่สำเร็จ: {st.failed.join(", ")} กรุณากด "แนบไฟล์เพิ่ม" อีกครั้ง</Alert></div>}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {list.rows.length > 3 && <Input type="search" className="!w-auto min-w-[14rem] flex-1" placeholder="ค้นหาเลขเคลม รุ่น ไซต์ หรือ SN" value={q} onChange={(e) => setQ(e.target.value)} />}
        {(["all", "open"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3 py-1", filter === k ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-700")}>
            {k === "open" ? "กำลังดำเนินการ" : "ทั้งหมด"}
          </button>
        ))}
      </div>
      {list.loading ? <Loading /> : list.error ? <Alert>{errorMessage(list.error)}</Alert> : rows.length === 0 ? (
        <Empty>
          {term ? "ไม่พบเคลมที่ค้นหา" : filter === "open" && list.rows.length ? "ไม่มีเคลมที่ค้างอยู่" : "ยังไม่มีรายการเคลม"} ·{" "}
          <Link to="/app/claims/new" className="font-semibold text-navy-700 underline">แจ้งเคลมใหม่</Link>
        </Empty>
      ) : (
        <div className="space-y-4">{rows.map((c) => <ClaimCard key={c.id} c={c} changes={snChanges.rows.filter((x) => x.claim_id === c.id)} onChanged={reloadAll} />)}</div>
      )}
      <p className="mt-6 text-xs text-slate-500">สอบถามเพิ่มเติม ติดต่อฝ่ายบริการผ่าน LINE OA หรือ <Link to="/contact?topic=service" className="underline">หน้าติดต่อเรา</Link></p>
    </>
  );
}
