import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Field, Input, Select, Spinner } from "../../../../components/ui";
import type { ClaimDetails, RmaHeader } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { useBoard } from "./shared";

/** Replenishment Request: one line per claimed unit with an RMA from the manufacturer, in the layout sent to SolarEdge. */
interface Row {
  id: number; seq: number; pcode: string | null; ret_pcode: string | null; ret_sn: string | null; iss_sn: string | null;
  rma_no: string | null; rma_date: string | null; rma_note: string | null;
  claims: { claim_no: string; case_id: string | null; site_id: string | null; details: ClaimDetails | null; brand_id: string | null };
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HEAD = ["ลำดับ", "Siam No.", "Date", "Case Number", "RMA Number", "Site ID", "Part Number Old", "Serial Number Old", "Part Number New", "Serial Number New", "หมายเหตุ"];
const dmy = (v: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "");
const monthNow = () => new Date().toISOString().slice(0, 7);

function lines(rows: Row[]) {
  return rows.map((r, i) => [
    i + 1, r.claims.claim_no, dmy(r.rma_date), r.claims.case_id ?? r.claims.details?.case_no ?? "", r.rma_no ?? "", r.claims.site_id ?? "",
    r.ret_pcode ?? r.pcode ?? "", r.ret_sn ?? "", r.pcode ?? "", r.iss_sn ?? "", r.rma_note ?? "",
  ]);
}

export default function RmaReport() {
  const { brands } = useBoard();
  const [month, setMonth] = useState(monthNow());
  const [brand, setBrand] = useState("");
  const [undated, setUndated] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [head, setHead] = useState<RmaHeader>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!brand && brands.length) setBrand(brands.find((b) => b.slug === "solaredge")?.id ?? "");
  }, [brands, brand]);
  useEffect(() => {
    supabase.from("claim_settings").select("rma_header").eq("id", 1).maybeSingle().then(({ data }) => setHead(((data as { rma_header?: RmaHeader } | null)?.rma_header) ?? {}));
  }, []);
  useEffect(() => {
    if (!month) return;
    let gone = false;
    setRows(null); setErr("");
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    let q = supabase.from("claim_units")
      .select("id, seq, pcode, ret_pcode, ret_sn, iss_sn, rma_no, rma_date, rma_note, claims!inner(claim_no, case_id, site_id, details, brand_id)")
      .or(undated ? `and(rma_date.gte.${from},rma_date.lt.${to}),and(rma_date.is.null,rma_no.not.is.null)` : `and(rma_date.gte.${from},rma_date.lt.${to})`)
      .order("rma_date", { ascending: true, nullsFirst: false }).order("id").limit(5000);
    if (brand) q = q.eq("claims.brand_id", brand);
    q.then(({ data, error }) => {
      if (gone) return;
      if (error) return setErr(errorMessage(error));
      const list = (data ?? []) as unknown as Row[];
      list.sort((a, b) => (a.rma_date ?? "9").localeCompare(b.rma_date ?? "9") || a.claims.claim_no.localeCompare(b.claims.claim_no) || a.seq - b.seq);
      setRows(list);
    });
    return () => { gone = true; };
  }, [month, brand, undated]);

  const body = useMemo(() => lines(rows ?? []), [rows]);
  const [y, m] = month.split("-").map(Number);
  const monthName = MONTHS[(m || 1) - 1];

  async function download() {
    setBusy(true);
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const b = { fontWeight: "bold" as const };
      const t = (v: string) => ({ value: v, type: String });
      const data = [
        [{ value: "Replenishment Request", ...b, fontSize: 14 }],
        [{ value: "Customer Name:", ...b }, null, null, t(head.customer_name ?? ""), null, null, { value: "Shipping Address:", ...b }, { ...t(head.ship_address ?? ""), columnSpan: 4, wrap: true }],
        [{ value: "Country:", ...b }, null, null, t(head.country ?? "")],
        [{ value: "Month:", ...b }, null, null, t(monthName), null, null, { value: "Bill to", ...b }, { value: "Company Name", ...b }, { ...t(head.bill_company ?? ""), columnSpan: 3 }],
        [{ value: "Year:", ...b }, null, null, { value: y, type: Number }, null, null, null, { value: "Address", ...b }, { ...t(head.bill_address ?? ""), columnSpan: 3, wrap: true }],
        HEAD.map((h) => ({ value: h, ...b, backgroundColor: "#E2E8F0", borderStyle: "thin" as const })),
        ...body.map((r) => r.map((v, i) => (i === 0 ? { value: v as number, type: Number, borderStyle: "thin" as const } : { value: String(v), type: String, borderStyle: "thin" as const }))),
      ];
      await writeXlsxFile(data, { columns: [6, 10, 11, 12, 16, 10, 16, 22, 16, 22, 14].map((width) => ({ width })) }).toFile(`Replenishment-Request-${month}.xlsx`);
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h3 className="font-semibold text-navy-900">Replenishment Request (RMA)</h3>
          <p className="text-xs text-slate-500">ดึงจากขั้นที่ 4 ของผัง 5 ขั้น: แถวที่ใส่ RMA No. และวันที่ออก RMA ในเดือนที่เลือก</p>
        </div>
        <Field label="เดือน"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label="แบรนด์">
          <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">ทุกแบรนด์</option>
            {brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <label className="mb-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={undated} onChange={(e) => setUndated(e.target.checked)} />รวมแถวที่มี RMA แต่ยังไม่ใส่วันที่</label>
        <Button onClick={download} loading={busy} disabled={!rows?.length}>ดาวน์โหลด Excel</Button>
      </div>

      <div className="mb-3 grid gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-2">
        <p><b>Customer Name:</b> {head.customer_name ?? "-"}</p>
        <p><b>Shipping Address:</b> {head.ship_address ?? "-"}</p>
        <p><b>Country:</b> {head.country ?? "-"} · <b>Month:</b> {monthName} · <b>Year:</b> {y}</p>
        <p><b>Bill to:</b> {head.bill_company ?? "-"} · {head.bill_address ?? ""}</p>
      </div>

      {err && <Alert>{err}</Alert>}
      {!rows && !err ? <Spinner /> : rows && rows.length === 0 ? (
        <Empty>ยังไม่มีรายการ RMA ในเดือนนี้ · กรอก RMA No. และวันที่ออก RMA ได้ที่ ผัง 5 ขั้นตอน → ขั้น 4</Empty>
      ) : rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="bg-slate-100 text-left text-slate-600">{HEAD.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5">{h}</th>)}</tr></thead>
            <tbody>
              {body.map((r, i) => (
                <tr key={rows[i].id} className="border-t border-slate-100">
                  {r.map((v, k) => <td key={k} className={k === 4 || k === 7 || k === 9 ? "whitespace-nowrap px-2 py-1 font-mono" : "whitespace-nowrap px-2 py-1"}>{v || (k === 7 || k === 9 ? <span className="text-amber-600">ยังไม่มี</span> : "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">{rows.length} รายการ · {new Set(rows.map((r) => r.claims.claim_no)).size} เคลม</p>
        </div>
      )}
    </Card>
  );
}
