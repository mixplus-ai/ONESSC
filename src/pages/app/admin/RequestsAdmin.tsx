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
import { RankBadge } from "../../../components/catalog";
import type { PriceRank } from "../../../lib/catalog";
import { preparePrintWindow } from "../../../lib/printdoc";
import { printShopDoc, type ShopDoc } from "../../../lib/shopdocs";
import { createContext, useContext } from "react";

type CompanyRef = { name: string; tax_id: string; price_rank?: string | null; sales_member_id?: string | null } | null | undefined;
interface Ctx { ranks: PriceRank[]; plus: Set<string>; team: Map<string, { full_name: string; phone: string | null; email: string | null; line_id: string | null }> }
const ReqCtx = createContext<Ctx>({ ranks: [], plus: new Set(), team: new Map() });

function CompanyRank({ companyId, c }: { companyId: string | null; c: CompanyRef }) {
  const { ranks, plus } = useContext(ReqCtx);
  const r = ranks.find((x) => x.code === c?.price_rank);
  return r ? <RankBadge rank={{ ...r, plus: !!companyId && plus.has(companyId) }} size="xs" /> : null;
}

/** Same PDF the customer gets (website prices + "ติดต่อเซลล์เพื่อขอใบแจ้งหนี้"), printed by staff. */
function usePrintRequest() {
  const { ranks, plus, team } = useContext(ReqCtx);
  return async (kind: "quote" | "reservation", r: QuoteRequest | Reservation) => {
    const w = preparePrintWindow();
    if (!w) return;
    const q = kind === "quote" ? (r as QuoteRequest) : null;
    const res = kind === "reservation" ? (r as Reservation) : null;
    const c = r.companies as CompanyRef;
    const rk = ranks.find((x) => x.code === c?.price_rank);
    const doc: ShopDoc = {
      kind,
      code: r.code,
      date: r.created_at,
      status: q ? QUOTE_STATUS[q.status].label : RESERVATION_STATUS[reservationState(res as Reservation)].label,
      expires_at: res?.expires_at,
      lines: q
        ? (q.quote_request_items ?? []).map((i) => ({ variant_id: i.variant_id, label: i.label, qty: i.qty, unit_price: i.unit_price }))
        : (res?.reservation_items ?? []).map((i) => ({ variant_id: i.variant_id, sku: i.sku, label: i.label, qty: i.qty, unit_price: i.unit_price ?? null })),
      customer: { name: q?.contact_name || r.profiles?.full_name, email: r.profiles?.email, phone: q?.contact_phone || r.profiles?.phone, company: c?.name, taxId: c?.tax_id },
      billing: r.billing ?? null,
      rank: rk ? { ...rk, plus: !!r.company_id && plus.has(r.company_id) } : null,
      note: q ? q.project_note : res?.note,
      staffNote: r.staff_note,
      sales: c?.sales_member_id ? team.get(c.sales_member_id) ?? null : null,
    };
    await printShopDoc(doc, w);
  };
}

const WHO = "profiles(full_name, email, phone), companies(name, tax_id, price_rank, sales_member_id)";

function Customer({ r }: { r: { company_id?: string | null; profiles?: QuoteRequest["profiles"]; companies?: QuoteRequest["companies"]; contact_name?: string | null; contact_phone?: string | null; billing?: Billing | null } }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-navy-900">{r.contact_name || r.profiles?.full_name || r.profiles?.email}</p>
      <p className="text-xs text-slate-500">
        {[r.profiles?.email, r.contact_phone || r.profiles?.phone].filter(Boolean).join(" · ")}
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{r.companies ? `${r.companies.name} · ${r.companies.tax_id}` : "ยังไม่ผูกบริษัท"}<CompanyRank companyId={r.company_id ?? null} c={r.companies as CompanyRef} /></p>
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
  const print = usePrintRequest();
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
        <div className="mt-3 flex gap-4">
          <button onClick={() => setOpen(true)} className="text-sm font-semibold text-navy-700 hover:underline">จัดการ</button>
          <button onClick={() => print("quote", q)} className="text-sm font-semibold text-navy-700 hover:underline">PDF ตามราคาเว็บ</button>
        </div>
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
  const print = usePrintRequest();

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
          <li key={i.id} className="flex justify-between gap-3"><span>{i.label}</span><span className="shrink-0 font-semibold">× {formatQty(i.qty)}{i.unit_price != null && <span className="font-normal text-slate-500"> @ {formatBaht(i.unit_price)}</span>}</span></li>
        ))}
      </ul>
      {r.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">{r.note}</p>}
      <button onClick={() => print("reservation", r)} className="mt-2 text-sm font-semibold text-navy-700 hover:underline">PDF ใบจอง</button>
      {(r.status === "pending" || r.status === "confirmed") && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <Input placeholder="ข้อความถึงลูกค้า (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {r.status === "pending" && <Button onClick={() => set("confirmed")} loading={busy}>ยืนยันการจอง</Button>}
            <Button variant="secondary" onClick={() => set("closed")} disabled={busy} title="บันทึกเข้าไฟล์สต๊อกแล้ว (จะเห็นในคอลัมน์หักจองหลังซิงก์)">บันทึกเข้าสต๊อกแล้ว</Button>
            <Button variant="ghost" onClick={extend} disabled={busy}>ต่ออายุ 7 วัน</Button>
            {(can("stock.docs") || can("stock.post")) && <>
              <ButtonLink variant="secondary" to={`/app/admin/stock-docs?tab=docs&new=RV&reservation=${r.id}`}>จอง SN ในคลัง</ButtonLink>
              <ButtonLink variant="secondary" to={`/app/admin/stock-docs?tab=docs&new=SO&reservation=${r.id}`}>ออกใบส่งของ / ตัดสต๊อก</ButtonLink>
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
  const { can, session } = useAuth();
  const ranks = useRows<PriceRank>(() => supabase.from("price_ranks").select("*").order("sort"));
  const own = useRows<{ company_id: string }>(() => supabase.from("company_prices").select("company_id"));
  const teamRows = useRows<{ id: string; full_name: string; phone: string | null; email: string | null; line_id: string | null; user_id: string | null }>(() =>
    supabase.from("team_members").select("id, full_name, phone, email, line_id, user_id"),
  );
  const ctx = useMemo<Ctx>(
    () => ({ ranks: ranks.rows, plus: new Set(own.rows.map((r) => r.company_id)), team: new Map(teamRows.rows.map((t) => [t.id, t])) }),
    [ranks.rows, own.rows, teamRows.rows],
  );
  const seeAll = can("requests.all");
  const linked = teamRows.rows.some((t) => t.user_id === session?.user.id);
  const [tab, setTab] = useState<"quotes" | "reservations">(new URLSearchParams(location.search).get("tab") === "reservations" ? "reservations" : "quotes");
  const [show, setShow] = useState<"open" | "all">("open");
  const quotes = useRows<QuoteRequest>(() => supabase.from("quote_requests").select(`*, quote_request_items(*), ${WHO}`).order("created_at", { ascending: false }).limit(300));
  const reservations = useRows<Reservation>(() => supabase.from("reservations").select(`*, reservation_items(*), ${WHO}`).order("created_at", { ascending: false }).limit(300));

  const openQuotes = useMemo(() => quotes.rows.filter((q) => q.status === "new" || q.status === "in_progress"), [quotes.rows]);
  const openRes = useMemo(() => reservations.rows.filter((r) => { const s = reservationState(r); return s === "pending" || s === "confirmed"; }), [reservations.rows]);
  const qRows = show === "open" ? openQuotes : quotes.rows;
  const rRows = show === "open" ? openRes : reservations.rows;

  return (
    <Gate allow={can("requests") || can("requests.all")}>
      <ReqCtx.Provider value={ctx}>
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
      {!seeAll && (
        <div className="mb-4">
          <Alert tone={linked || teamRows.loading ? "navy" : "amber"}>
            {linked || teamRows.loading
              ? "แสดงและอนุมัติได้เฉพาะคำขอของบริษัทที่คุณเป็นเซลล์ดูแล (ตั้งเซลล์ที่ดูแลในหน้า บริษัทลูกค้า)"
              : "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อในหน้า ทีมงาน จึงยังไม่เห็นคำขอของลูกค้า ให้ Admin ผูกบัญชีในหน้า ทีมงาน"}
          </Alert>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "quotes", label: "ขอใบเสนอราคา", count: openQuotes.length }, { key: "reservations", label: "จองสินค้า", count: openRes.length }]} />
      {tab === "quotes" && (quotes.loading ? <Loading /> : qRows.length ? <div className="space-y-3">{qRows.map((q) => <QuoteCard key={q.id + q.updated_at} q={q} onSaved={quotes.reload} />)}</div> : <Empty>ไม่มีคำขอ</Empty>)}
      {tab === "reservations" && (reservations.loading ? <Loading /> : rRows.length ? <div className="space-y-3">{rRows.map((r) => <ReservationCard key={r.id + r.updated_at} r={r} onSaved={reservations.reload} />)}</div> : <Empty>ไม่มีการจอง</Empty>)}
      </ReqCtx.Provider>
    </Gate>
  );
}
