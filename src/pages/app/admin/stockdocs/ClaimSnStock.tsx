import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ButtonLink, Spinner } from "../../../../components/ui";
import { WarrantyBadge } from "../../../../components/Warranty";
import { useAuth } from "../../../../lib/auth";
import { formatDate } from "../../../../lib/catalog";
import type { Claim } from "../../../../lib/claims";
import { supabase } from "../../../../lib/supabase";
import { DOC_LABEL, DOC_STATUS_LABEL, DOC_STATUS_TONE, SERIAL_STATUS_LABEL, SERIAL_STATUS_TONE, type DocStatus, type DocType, type SerialStatus } from "../../../../lib/stockdocs";

interface Info { sn: string; sku: string | null; description: string | null; status: SerialStatus | null; sold_at: string | null; sold_doc_id: string | null; sold_doc_no: string | null; sold_to: string | null; sold_company_id: string | null; ref_no: string | null; warranty_months?: number | null; perf_end?: string | null; warranty_end?: string | null }

const age = (d: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / (30.44 * 864e5)));
  return m >= 12 ? `${Math.floor(m / 12)} ปี ${m % 12} เดือน` : `${m} เดือน`;
};

/** Claims page: what the stock records say about each reported SN, and stock documents for this claim. */
export function ClaimSnStock({ c }: { c: Claim }) {
  const { can } = useAuth();
  const [rows, setRows] = useState<Info[] | null>(null);
  const [docs, setDocs] = useState<{ id: string; doc_no: string; doc_type: DocType; status: DocStatus }[]>([]);
  const canDocs = can("stock.docs") || can("stock.post");

  useEffect(() => {
    if (!c.reported_sns.length) return setRows([]);
    supabase.rpc("sns_info", { p_sns: c.reported_sns }).then(({ data }) => setRows((data ?? []) as Info[]));
    supabase.from("stock_docs").select("id, doc_no, doc_type, status").eq("claim_id", c.id).order("created_at")
      .then(({ data }) => setDocs((data ?? []) as typeof docs));
  }, [c.id, c.reported_sns.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">ประวัติ SN จากเอกสารคลัง</p>
      {rows === null ? <Spinner className="h-4 w-4" /> : !rows.length ? <p className="text-sm text-slate-500">ไม่มี SN ที่แจ้ง</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">S/N</th><th className="py-1 pr-3">สถานะ</th><th className="py-1 pr-3">ขายโดยเรา</th><th className="py-1 pr-3">ใช้งานมา</th><th className="py-1 pr-3">ประกัน</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const other = r.sold_company_id && c.company_id && r.sold_company_id !== c.company_id;
                return (
                  <tr key={r.sn} className="border-t border-slate-100 align-top">
                    <td className="py-1 pr-3 font-mono"><Link to={`/app/admin/stock-docs?tab=search&sn=${encodeURIComponent(r.sn)}`} className="text-navy-700 underline">{r.sn}</Link><div className="font-sans text-slate-500">{r.sku}</div></td>
                    <td className="py-1 pr-3">{r.status ? <Badge tone={SERIAL_STATUS_TONE[r.status]}>{SERIAL_STATUS_LABEL[r.status]}</Badge> : <span className="text-slate-500">ไม่พบในเอกสารคลัง</span>}</td>
                    <td className="py-1 pr-3">
                      {r.sold_doc_no ? <>
                        {formatDate(r.sold_at)} · {r.sold_to}{r.ref_no ? ` · ${r.ref_no}` : ""}
                        <div className="text-slate-500">{r.sold_doc_no}</div>
                        {other && <Badge tone="amber">ขายให้บริษัทอื่น</Badge>}
                      </> : <span className="text-slate-500">ไม่พบใบขาย</span>}
                    </td>
                    <td className="py-1 pr-3">{r.sold_at ? age(r.sold_at) : "-"}</td>
                    <td className="py-1 pr-3">{r.status || r.sold_at ? <><WarrantyBadge end={r.warranty_end ?? null} months={r.warranty_months ?? null} />{r.warranty_end && <div className="mt-0.5 text-slate-500">ถึง {formatDate(r.warranty_end)}{r.perf_end ? ` · ประสิทธิภาพถึง ${formatDate(r.perf_end)}` : ""}</div>}</> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(docs.length > 0 || canDocs) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {docs.map((d) => (
            <Link key={d.id} to={`/app/admin/stock-docs?tab=docs&doc=${d.id}`} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-xs ring-1 ring-slate-200 hover:ring-navy-400">
              <span className="font-mono font-semibold">{d.doc_no}</span> {DOC_LABEL[d.doc_type]} <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
            </Link>
          ))}
          {canDocs && <>
            <ButtonLink variant="secondary" className="!py-1.5 text-xs" to={`/app/admin/stock-docs?tab=docs&new=RT&claim=${c.id}`}>รับของเสียเข้าคลัง</ButtonLink>
            <ButtonLink variant="secondary" className="!py-1.5 text-xs" to={`/app/admin/stock-docs?tab=docs&new=SO&claim=${c.id}`}>ส่งของเปลี่ยนให้ลูกค้า</ButtonLink>
          </>}
        </div>
      )}
    </div>
  );
}
