import { useState } from "react";
import { WarrantyBadge, WarrantyFacts } from "../../../../components/Warranty";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, Input } from "../../../../components/ui";
import { formatDate, formatDateTime } from "../../../../lib/catalog";
import { CLAIM_STATUS, type ClaimStatus } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import {
  CONDITION_LABEL, DOC_LABEL, SERIAL_STATUS_LABEL, SERIAL_STATUS_TONE,
  type Condition, type DocStatus, type DocType, type SerialStatus,
} from "../../../../lib/stockdocs";

interface HistDoc {
  id: string; doc_no: string; doc_type: DocType; status: DocStatus; doc_date: string; partner_name: string | null; company: string | null;
  ref_no: string | null; customer_po: string | null; site_name: string | null; due_date: string | null; reason: string | null;
  warehouse: string | null; to_warehouse: string | null; sku: string; description: string | null; condition: Condition;
  posted_at: string | null; cancel_reason: string | null;
}
interface HistClaim { id: string; claim_no: string; status: string; created_at: string; company_name: string | null; model: string | null; symptom: string | null; site_name: string | null; case_id: string | null }
interface History {
  sn_key: string;
  serial: null | {
    sn: string; sku: string; description: string | null; status: SerialStatus; condition: Condition; warehouse: string | null;
    holder_name: string | null; company: string | null; due_date: string | null; first_in_at: string | null; sold_at: string | null;
  };
  docs: HistDoc[];
  claims: HistClaim[];
  sn_changes: { old_sn: string; new_sn: string; status: string; created_at: string }[];
}
interface Hit { sn: string; sku: string | null; status: string; source: "stock" | "claim" }


function docLine(d: HistDoc) {
  const who = d.company || d.partner_name;
  switch (d.doc_type) {
    case "OB": return `ยอดยกมา เข้าคลัง ${d.warehouse ?? ""}`;
    case "GR": return `รับเข้าจาก ${who ?? "ผู้ขาย"}${d.ref_no ? ` · PO ${d.ref_no}` : ""} · ${d.warehouse ?? ""}`;
    case "GN": return `รับเข้าตามใบส่งของ ${d.ref_no ?? ""}${who ? ` จาก ${who}` : ""} · ${d.warehouse ?? ""}`;
    case "RT": return `รับคืนจาก ${who ?? "-"} · สภาพ${CONDITION_LABEL[d.condition]}${d.reason ? ` · ${d.reason}` : ""}`;
    case "SO": return `ขายให้ ${who ?? "-"}${d.ref_no ? ` · ${d.ref_no}` : ""}${d.customer_po ? ` · PO ลูกค้า ${d.customer_po}` : ""}${d.site_name ? ` · ไซต์ ${d.site_name}` : ""}`;
    case "BR": return `ให้ ${who ?? "-"} ยืม${d.due_date ? ` · กำหนดคืน ${formatDate(d.due_date)}` : ""}${d.site_name ? ` · ${d.site_name}` : ""}`;
    case "WD": return `เบิกชั่วคราวโดย ${who ?? "-"}${d.due_date ? ` · กำหนดคืน ${formatDate(d.due_date)}` : ""}`;
    case "WO": return `จำหน่ายออก · ${d.reason ?? ""}`;
    case "TR": return `โอนจาก ${d.warehouse ?? ""} ไป ${d.to_warehouse ?? ""}`;
    case "RV": return `จองให้ ${who ?? "-"}${d.ref_no ? ` · ${d.ref_no}` : ""}`;
  }
}

/** Search box + full SN history (stock documents, claims, SN corrections). */
export function SnLookup({ initial = "" }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hist, setHist] = useState<History | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [war, setWar] = useState<{ sold_at: string | null; ref_no: string | null; sold_doc_no: string | null; warranty_months: number | null; warranty_end: string | null } | null>(null);

  async function open(sn: string) {
    setBusy(true); setErr(""); setHits(null);
    const { data, error } = await supabase.rpc("sn_history", { p_sn: sn });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    const h = data as History | null;
    if (h && (h.serial || h.docs.length || h.claims.length)) {
      setHist(h);
      setWar(null);
      supabase.rpc("sns_info", { p_sns: [sn] }).then(({ data }) => setWar(((data ?? []) as NonNullable<typeof war>[])[0] ?? null));
      return;
    }
    setHist(null);
    // nothing exact: try partial
    setBusy(true);
    const r = await supabase.rpc("sn_search", { p_q: sn });
    setBusy(false);
    if (r.error) return setErr(errorMessage(r.error));
    const list = (r.data ?? []) as Hit[];
    if (list.length === 1) return open(list[0].sn);
    setHits(list);
  }

  const s = hist?.serial;
  type Ev = { date: string; at: string; node: React.ReactNode; key: string };
  const events: Ev[] = [];
  hist?.docs.forEach((d) => events.push({
    key: "d" + d.id, date: d.doc_date, at: d.posted_at ?? d.doc_date,
    node: (
      <div className={d.status === "cancelled" ? "opacity-60" : ""}>
        <p className="text-sm text-navy-900">
          <Link to={`/app/admin/stock-docs?doc=${d.id}`} className="font-semibold text-navy-700 underline">{d.doc_no}</Link>{" "}
          <span className="text-slate-500">{DOC_LABEL[d.doc_type]}</span>
          {d.status === "cancelled" && <Badge tone="red">ยกเลิก{d.cancel_reason ? `: ${d.cancel_reason}` : ""}</Badge>}
        </p>
        <p className={`text-sm text-slate-700 ${d.status === "cancelled" ? "line-through" : ""}`}>{docLine(d)}</p>
      </div>
    ),
  }));
  hist?.claims.forEach((c) => events.push({
    key: "c" + c.id, date: c.created_at.slice(0, 10), at: c.created_at,
    node: (
      <div>
        <p className="text-sm text-navy-900">
          <Link to={`/app/admin/claims?tab=board&claim=${c.id}`} className="font-semibold text-navy-700 underline">เคลม {c.claim_no}</Link>{" "}
          <Badge tone={CLAIM_STATUS[c.status as ClaimStatus]?.tone ?? "slate"}>{CLAIM_STATUS[c.status as ClaimStatus]?.label ?? c.status}</Badge>
        </p>
        <p className="text-sm text-slate-700">{[c.company_name, c.model, c.case_id && `Case ${c.case_id}`, c.site_name].filter(Boolean).join(" · ")}</p>
        {c.symptom && <p className="text-xs text-slate-500">อาการ: {c.symptom}</p>}
      </div>
    ),
  }));
  hist?.sn_changes.forEach((c, i) => events.push({
    key: "x" + i, date: c.created_at.slice(0, 10), at: c.created_at,
    node: <p className="text-sm text-slate-700">ลูกค้าขอแก้ SN {c.old_sn} → {c.new_sn} ({c.status === "approved" ? "อนุมัติ" : c.status === "rejected" ? "ไม่อนุมัติ" : "รออนุมัติ"})</p>,
  }));
  events.sort((a, b) => a.at.localeCompare(b.at));
  const openClaim = hist?.claims.find((c) => !["closed", "returned", "rejected"].includes(c.status));
  const warrantyNote = s?.sold_at ? `ขายเมื่อ ${formatDate(s.sold_at)}` : null;

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) open(q.trim()); }} className="flex max-w-xl gap-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="สแกนหรือพิมพ์ Serial Number (ใส่บางส่วนได้ อย่างน้อย 4 ตัว)" />
        <Button type="submit" loading={busy}>ค้นหา</Button>
      </form>
      {err && <Alert>{err}</Alert>}
      {hits && (hits.length ? (
        <Card className="!p-3">
          <p className="mb-2 text-sm text-slate-500">พบ {hits.length} รายการ เลือก SN ที่ต้องการ</p>
          <div className="flex flex-wrap gap-2">
            {hits.map((h) => (
              <button key={h.sn + h.source} onClick={() => { setQ(h.sn); open(h.sn); }} className="rounded-lg bg-slate-50 px-3 py-1.5 text-left text-sm ring-1 ring-slate-200 hover:ring-navy-400">
                <span className="font-mono font-semibold">{h.sn}</span>
                <span className="ml-2 text-xs text-slate-500">{h.sku}{h.source === "claim" ? " · จากงานเคลม" : ` · ${SERIAL_STATUS_LABEL[h.status as SerialStatus] ?? h.status}`}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : <Alert tone="amber">ไม่พบ SN นี้ทั้งในคลังและงานเคลม</Alert>)}

      {hist && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xl font-bold text-navy-900">{s?.sn ?? q.toUpperCase()}</p>
              <p className="text-sm text-slate-600">{s ? `${s.sku}${s.description ? ` · ${s.description}` : ""}` : "ยังไม่มีในเอกสารคลัง (พบในงานเคลม)"}</p>
            </div>
            {s && (
              <div className="flex flex-wrap gap-2">
                <Badge tone={SERIAL_STATUS_TONE[s.status]}>{SERIAL_STATUS_LABEL[s.status]}</Badge>
                <Badge tone={s.condition === "good" ? "green" : "red"}>สภาพ{CONDITION_LABEL[s.condition]}</Badge>
                {openClaim && <Badge tone="amber">อยู่ระหว่างเคลม {openClaim.claim_no}</Badge>}
              </div>
            )}
          </div>
          {s && (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">อยู่ที่</dt><dd className="font-medium text-navy-900">{s.warehouse ?? s.company ?? s.holder_name ?? "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">รับเข้าครั้งแรก</dt><dd className="font-medium text-navy-900">{formatDate(s.first_in_at) || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">ขาย</dt><dd className="font-medium text-navy-900">{warrantyNote ?? "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">กำหนดคืน</dt><dd className="font-medium text-navy-900">{formatDate(s.due_date) || "-"}</dd></div>
            </dl>
          )}
          {s && war && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="mb-2 flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-navy-900">การรับประกัน</p><WarrantyBadge end={war.warranty_end} months={war.warranty_months} /></div>
              <WarrantyFacts soldAt={war.sold_at} piNo={war.ref_no || war.sold_doc_no} months={war.warranty_months} end={war.warranty_end} />
            </div>
          )}
          <h3 className="mt-6 text-sm font-semibold text-navy-900">ประวัติ</h3>
          <ol className="mt-2 space-y-3 border-l-2 border-slate-200 pl-4">
            {events.map((e) => (
              <li key={e.key} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-navy-600" />
                <p className="text-xs text-slate-500">{e.at.length > 10 ? formatDateTime(e.at) : formatDate(e.date)}</p>
                {e.node}
              </li>
            ))}
            {!events.length && <li className="text-sm text-slate-500">ยังไม่มีประวัติ</li>}
          </ol>
        </Card>
      )}
    </div>
  );
}
