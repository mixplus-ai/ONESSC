import { useMemo, useRef, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Field, Input, Loading, PageTitle, Select, Spinner, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import {
  formatBaht,
  formatDate,
  formatDateTime,
  formatQty,
  QUOTE_STATUS,
  quoteFileUrl,
  RESERVATION_STATUS,
  reservationState,
  type QuoteRequest,
  type QuoteStatus,
  type Reservation,
  type ReservationStatus,
} from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { Tabs } from "../MyRequests";
import { BILLING_TYPE, type Billing } from "../../../lib/training";

const WHO = "profiles(full_name, email, phone), companies(name, tax_id)";

function Customer({ r }: { r: { profiles?: QuoteRequest["profiles"]; companies?: QuoteRequest["companies"]; contact_name?: string | null; contact_phone?: string | null; billing?: Billing | null } }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-navy-900">{r.contact_name || r.profiles?.full_name || r.profiles?.email}</p>
      <p className="text-xs text-slate-500">
        {[r.profiles?.email, r.contact_phone || r.profiles?.phone].filter(Boolean).join(" · ")}
      </p>
      <p className="text-xs text-slate-500">{r.companies ? `${r.companies.name} · ${r.companies.tax_id}` : "ยังไม่ผูกบริษัท"}</p>
      {r.billing?.name && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 ring-1 ring-slate-200">
          <p className="font-semibold text-navy-900">ออกเอกสารในนาม ({BILLING_TYPE[r.billing.type] ?? r.billing.type})</p>
          <p>{r.billing.name}{r.billing.tax_id ? ` · ${r.billing.tax_id}` : ""}{r.billing.branch ? ` · ${r.billing.branch}` : ""}</p>
          {r.billing.address && <p className="whitespace-pre-line">{r.billing.address}</p>}
          {(r.billing.phone || r.billing.email) && <p>{[r.billing.phone, r.billing.email].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

function QuoteCard({ q, onSaved }: { q: QuoteRequest; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<QuoteStatus>(q.status);
  const [total, setTotal] = useState(q.quoted_total?.toString() ?? "");
  const [note, setNote] = useState(q.staff_note ?? "");
  const [filePath, setFilePath] = useState(q.quote_file_path ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const est = (q.quote_request_items ?? []).reduce((s, i) => (i.unit_price == null ? s : s + Number(i.unit_price) * Number(i.qty)), 0);

  async function upload(f: File) {
    if (f.size > 20 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 20 MB");
    setUploading(true);
    setErr("");
    const ext = f.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${q.id}/${q.code}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("quote-files").upload(path, f, { contentType: f.type || undefined });
    setUploading(false);
    if (error) return setErr(errorMessage(error));
    setFilePath(path);
    if (status === "new" || status === "in_progress") setStatus("quoted");
  }

  async function save() {
    setBusy(true);
    setErr("");
    const { error } = await supabase
      .from("quote_requests")
      .update({ status, quoted_total: total === "" ? null : Number(total), staff_note: note || null, quote_file_path: filePath || null })
      .eq("id", q.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setOpen(false);
    onSaved();
  }

  async function view() {
    const url = await quoteFileUrl(filePath);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono font-semibold text-navy-900">{q.code}</p>
          <p className="text-xs text-slate-500">{formatDateTime(q.created_at)}</p>
        </div>
        <Customer r={q} />
        <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
      </div>
      <ul className="mt-3 space-y-0.5 text-sm">
        {(q.quote_request_items ?? []).map((i) => (
          <li key={i.id} className="flex justify-between gap-3">
            <span>{i.label}</span>
            <span className="shrink-0 text-slate-500">× {formatQty(i.qty)} @ {formatBaht(i.unit_price)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-500">ยอดตามราคาที่ลูกค้าเห็น {formatBaht(est)}{q.quoted_total != null && ` · เสนอ ${formatBaht(q.quoted_total)}`}</p>
      {q.project_note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">{q.project_note}</p>}
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-3 text-sm font-semibold text-navy-700 hover:underline">จัดการ</button>
      ) : (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
          <Field label="สถานะ">
            <Select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
              {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="ยอดเสนอราคา (บาท)"><Input type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
          <Field label="ใบเสนอราคา (PDF)">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading && <Spinner className="h-4 w-4" />}อัปโหลด</Button>
              {filePath && <button type="button" onClick={view} className="text-sm text-navy-700 underline">ดูไฟล์</button>}
            </div>
            <input ref={fileRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </Field>
          <div className="sm:col-span-3"><Field label="ข้อความถึงลูกค้า"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
          {err && <div className="sm:col-span-3"><Alert>{err}</Alert></div>}
          <div className="flex gap-2 sm:col-span-3"><Button onClick={save} loading={busy}>บันทึก</Button><Button variant="ghost" onClick={() => setOpen(false)}>ปิด</Button></div>
        </div>
      )}
    </Card>
  );
}

function ReservationCard({ r, onSaved }: { r: Reservation; onSaved: () => void }) {
  const { can } = useAuth();
  const [note, setNote] = useState(r.staff_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const st = reservationState(r);

  async function update(patch: Partial<Pick<Reservation, "status" | "expires_at" | "staff_note">>) {
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("reservations").update({ staff_note: note || null, ...patch }).eq("id", r.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }
  const extend = () => update({ expires_at: new Date(Math.max(Date.now(), new Date(r.expires_at).getTime()) + 7 * 86400000).toISOString() });
  const set = (status: ReservationStatus) => update({ status });

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono font-semibold text-navy-900">{r.code}</p>
          <p className="text-xs text-slate-500">{formatDateTime(r.created_at)} · กันถึง {formatDate(r.expires_at)}</p>
        </div>
        <Customer r={r} />
        <Badge tone={RESERVATION_STATUS[st].tone}>{RESERVATION_STATUS[st].label}</Badge>
      </div>
      <ul className="mt-3 space-y-0.5 text-sm">
        {(r.reservation_items ?? []).map((i) => (
          <li key={i.id} className="flex justify-between gap-3"><span>{i.label}</span><span className="shrink-0 font-semibold">× {formatQty(i.qty)}</span></li>
        ))}
      </ul>
      {r.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">{r.note}</p>}
      {(r.status === "pending" || r.status === "confirmed") && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <Input placeholder="ข้อความถึงลูกค้า (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {r.status === "pending" && <Button onClick={() => set("confirmed")} loading={busy}>ยืนยันการจอง</Button>}
            <Button variant="secondary" onClick={() => set("closed")} disabled={busy} title="บันทึกเข้าไฟล์สต๊อกแล้ว (จะเห็นในคอลัมน์หักจองหลังซิงก์)">บันทึกเข้าสต๊อกแล้ว</Button>
            <Button variant="ghost" onClick={extend} disabled={busy}>ต่ออายุ 7 วัน</Button>
            {(can("stock.docs") || can("stock.post")) && <>
              <ButtonLink variant="secondary" to={`/app/admin/stock-docs?tab=docs&new=RV&reservation=${r.id}`}>จอง SN ในคลัง</ButtonLink>
              <ButtonLink variant="secondary" to={`/app/admin/stock-docs?tab=docs&new=SO&reservation=${r.id}`}>ออกใบขาย / ตัดสต๊อก</ButtonLink>
            </>}
            <Button variant="ghost" className="text-red-600" onClick={() => confirm("ยกเลิกการจองนี้?") && set("cancelled")} disabled={busy}>ยกเลิก</Button>
          </div>
          <p className="text-xs text-slate-500">ระหว่างรอ/ยืนยัน ระบบหักจำนวนนี้ออกจาก “ขายได้” ในแอป เมื่อบันทึกเข้าไฟล์สต๊อกแล้วให้กด “บันทึกเข้าสต๊อกแล้ว” เพื่อไม่ให้หักซ้ำ</p>
        </div>
      )}
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
    </Card>
  );
}

export default function RequestsAdmin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"quotes" | "reservations">(new URLSearchParams(location.search).get("tab") === "reservations" ? "reservations" : "quotes");
  const [show, setShow] = useState<"open" | "all">("open");
  const quotes = useRows<QuoteRequest>(() => supabase.from("quote_requests").select(`*, quote_request_items(*), ${WHO}`).order("created_at", { ascending: false }).limit(300));
  const reservations = useRows<Reservation>(() => supabase.from("reservations").select(`*, reservation_items(*), ${WHO}`).order("created_at", { ascending: false }).limit(300));

  const openQuotes = useMemo(() => quotes.rows.filter((q) => q.status === "new" || q.status === "in_progress"), [quotes.rows]);
  const openRes = useMemo(() => reservations.rows.filter((r) => { const s = reservationState(r); return s === "pending" || s === "confirmed"; }), [reservations.rows]);
  const qRows = show === "open" ? openQuotes : quotes.rows;
  const rRows = show === "open" ? openRes : reservations.rows;

  return (
    <Gate allow={can("requests")}>
      <PageTitle
        title="ใบเสนอราคาและการจอง"
        subtitle="คำขอจากลูกค้าที่ส่งผ่านหน้าเว็บ"
        actions={
          <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="open">เฉพาะที่ยังเปิดอยู่</option>
            <option value="all">ทั้งหมด</option>
          </Select>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "quotes", label: "ขอใบเสนอราคา", count: openQuotes.length }, { key: "reservations", label: "จองสินค้า", count: openRes.length }]} />
      {tab === "quotes" && (quotes.loading ? <Loading /> : qRows.length ? <div className="space-y-3">{qRows.map((q) => <QuoteCard key={q.id + q.updated_at} q={q} onSaved={quotes.reload} />)}</div> : <Empty>ไม่มีคำขอ</Empty>)}
      {tab === "reservations" && (reservations.loading ? <Loading /> : rRows.length ? <div className="space-y-3">{rRows.map((r) => <ReservationCard key={r.id + r.updated_at} r={r} onSaved={reservations.reload} />)}</div> : <Empty>ไม่มีการจอง</Empty>)}
    </Gate>
  );
}
