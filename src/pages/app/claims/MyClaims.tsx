import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ScanButton } from "../../../components/SnScanner";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Input, Loading, PageTitle, Spinner, Textarea, cx } from "../../../components/ui";
import { CLAIM_STATUS, fmtThai, fmtThaiTime, openClaimFile, productTypeLabel, splitSns, uploadClaimFile, type MyClaim } from "../../../lib/claims";
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

function ReturnForm({ c, onDone }: { c: MyClaim; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setErr("");
    const sns = splitSns(text);
    if (!sns.length) return setErr("กรุณากรอก SN ของตัวเก่าที่ส่งคืน");
    setBusy(true);
    const { error } = await supabase.rpc("return_claim", { p_claim: c.id, p_sns: sns });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }
  return (
    <div className="mt-4 rounded-xl bg-sun-500/10 p-4">
      <p className="text-sm font-semibold text-navy-900">ขั้นที่ 3: ส่งของเคลมกลับ</p>
      <p className="mt-1 text-xs text-slate-600">กรอก SN ของตัวเก่าที่ส่งคืน {c.reported_sns.length > 1 ? `ให้ครบ ${c.reported_sns.length} ตัว ` : ""}ต้องตรงกับ SN ที่แจ้งเคลมไว้ ไม่เช่นนั้นจะส่งไม่ได้</p>
      <div className="mt-3 flex gap-2">
        <Textarea rows={Math.min(6, Math.max(2, c.reported_sns.length))} className="font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์หรือสแกน SN ทีละบรรทัด" />
        <ScanButton multi onScan={(sn) => setText((t) => (t.trim() ? `${t.trim()}\n${sn}` : sn))} />
      </div>
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
      <Button className="mt-3" onClick={send} loading={busy}>ยืนยันส่งของคืน</Button>
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

function ClaimCard({ c, onChanged }: { c: MyClaim; onChanged: () => void }) {
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
        {c.status === "returned" && <p className="mt-3 text-sm text-slate-600">ส่ง SN คืนแล้ว {c.returned_sns?.join(", ")} · รอทีมงานตรวจรับเพื่อปิดงาน</p>}

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
                {c.reported_sns.length > 0 && <div><dt className="inline text-slate-500">SN ที่แจ้ง: </dt><dd className="inline font-mono">{c.reported_sns.join(", ")}</dd></div>}
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
          <Alert tone="green">ส่งแจ้งเคลมแล้ว เลขเคลมของคุณคือ <span className="font-mono font-bold">{st.created}</span> · สถานะ: {CLAIM_STATUS.submitted.label} (รอเจ้าหน้าที่รับเรื่อง) ติดตามสถานะได้ที่หน้านี้</Alert>
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
        <div className="space-y-4">{rows.map((c) => <ClaimCard key={c.id} c={c} onChanged={list.reload} />)}</div>
      )}
      <p className="mt-6 text-xs text-slate-500">สอบถามเพิ่มเติม ติดต่อฝ่ายบริการผ่าน LINE OA หรือ <Link to="/contact?topic=service" className="underline">หน้าติดต่อเรา</Link></p>
    </>
  );
}
