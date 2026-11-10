// Dashboard ("แดชบอร์ดสรุปผลการดำเนินงานงานเคลม") and the audit report, computed in the browser like ssccare.
import { useMemo, useState } from "react";
import { Button, Card, Empty, Select, cx } from "../../../../components/ui";
import { AUDIT_LABEL, auditClaims, claimYear, download, stepProgress, STEPS, toCsv, type AuditKind, type Claim, type ClaimUnit } from "../../../../lib/claims";
import { exportSheetXlsx } from "./exporters";
import { useBoard } from "./shared";

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const days = (a: string | null | undefined, b: string | null | undefined) =>
  a && b ? Math.round((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / 86400000) : null;
const minOf = (xs: (string | null)[]) => xs.filter(Boolean).sort()[0] ?? null;
const maxOf = (xs: (string | null)[]) => xs.filter(Boolean).sort().pop() ?? null;
const fmtDays = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 1 })} วัน`);
const startOf = (c: Claim) => c.voucher_date ?? c.created_at.slice(0, 10);

interface Row { c: Claim; u: ClaimUnit[]; done: boolean; toIssue: number | null; toReturn: number | null; cycle: number | null; month: string }

function useRows(year: number | "all") {
  const { claims, unitsBy, statusBy } = useBoard();
  return useMemo(() => claims.filter((c) => year === "all" || claimYear(c) === year).map((c): Row => {
    const u = unitsBy.get(c.id) ?? [];
    const start = startOf(c);
    const done = statusBy.get(c.id) === "done";
    return {
      c, u, done,
      toIssue: days(start, minOf(u.map((x) => x.iss_date))),
      toReturn: days(start, minOf(u.map((x) => x.ret_date))),
      cycle: done ? days(start, maxOf(u.map((x) => x.rcv_date))) : null,
      month: start.slice(0, 7),
    };
  }), [claims, unitsBy, statusBy, year]);
}

function Bar({ value, max, tone = "bg-navy-600" }: { value: number; max: number; tone?: string }) {
  return <div className="h-2 w-full rounded-full bg-slate-100"><div className={cx("h-2 rounded-full", tone)} style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div>;
}

export function ClaimDashboard() {
  const { claims, statusBy } = useBoard();
  const years = useMemo(() => [...new Set(claims.map(claimYear))].sort((a, b) => b - a), [claims]);
  const [year, setYear] = useState<number | "all">("all");
  const rows = useRows(year);
  const pos = (xs: (number | null)[]) => xs.filter((x): x is number => x != null && x >= 0);
  const kpi = {
    all: rows.length,
    open: rows.filter((r) => statusBy.get(r.c.id) === "open").length,
    done: rows.filter((r) => r.done).length,
    problem: rows.filter((r) => statusBy.get(r.c.id) === "problem").length,
    toIssue: median(pos(rows.map((r) => r.toIssue))),
    toReturn: median(pos(rows.map((r) => r.toReturn))),
    cycle: median(pos(rows.map((r) => r.cycle))),
  };
  const stepUnits = STEPS.map((s, i) => ({ s, n: rows.reduce((t, r) => t + stepProgress(r.c, r.u)[i].count, 0) }));
  const totalUnits = rows.reduce((t, r) => t + r.c.qty, 0);
  const months = [...new Set(rows.map((r) => r.month))].sort().reverse().slice(0, 24).map((m) => {
    const rs = rows.filter((r) => r.month === m);
    return { m, n: rs.length, steps: STEPS.map((_, i) => rs.reduce((t, r) => t + stepProgress(r.c, r.u)[i].count, 0)) };
  });
  const byYear = [...new Set(claims.map(claimYear))].sort((a, b) => b - a).map((y) => {
    const rs = claims.filter((c) => claimYear(c) === y);
    return { y, n: rs.length, units: rs.reduce((t, c) => t + c.qty, 0), done: rs.filter((c) => statusBy.get(c.id) === "done").length };
  });
  const group = (key: (r: Row) => string) => {
    const m = new Map<string, { n: number; units: number; open: number }>();
    for (const r of rows) {
      const k = key(r) || "(ไม่ระบุ)";
      const v = m.get(k) ?? { n: 0, units: 0, open: 0 };
      v.n++; v.units += r.c.qty; if (!r.done) v.open++;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  };
  const companies = group((r) => r.c.company_name ?? "");
  const products = group((r) => r.u[0]?.pcode ?? r.c.model ?? "");

  function exportCsv() {
    download(`claim-dashboard-${year}.csv`, toCsv([
      ["บริษัท", "เคลม", "หน่วย", "ยังเปิด"],
      ...companies.map(([k, v]) => [k, v.n, v.units, v.open]),
    ]));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy-900">แดชบอร์ดสรุปผลการดำเนินงานงานเคลม</h2>
        <div className="flex gap-2">
          <Select className="!w-auto" value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}>
            <option value="all">ทุกปี</option>{years.map((y) => <option key={y} value={y}>ปี {y + 543}</option>)}
          </Select>
          <Button variant="secondary" onClick={exportCsv}>ส่งออก CSV</Button>
          <Button variant="secondary" onClick={() => exportSheetXlsx(`claim-companies-${year}.xlsx`, ["บริษัท", "เคลม", "หน่วย", "ยังเปิด"], companies.map(([k, v]) => [k, v.n, v.units, v.open]))}>Excel</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {([["เคลมทั้งหมด", kpi.all], ["กำลังดำเนินการ", kpi.open], ["ปิดครบ 4 ขั้นตอน", kpi.done], ["ต้องตรวจสอบข้อมูล", kpi.problem],
          ["รับเคลม → เบิกให้ลูกค้า (มัธยฐาน)", fmtDays(kpi.toIssue)], ["รับเคลม → คืนสินค้า", fmtDays(kpi.toReturn)], ["รอบเคลมจนปิดงาน", fmtDays(kpi.cycle)]] as [string, number | string][])
          .map(([k, v]) => <Card key={k} className="!p-3"><p className="text-xl font-bold text-navy-900">{typeof v === "number" ? v.toLocaleString() : v}</p><p className="text-xs text-slate-500">{k}</p></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-navy-900">สถานะหน่วยสินค้าตามขั้นตอน</h3>
          <div className="space-y-2">
            {stepUnits.map(({ s, n }) => (
              <div key={s.n} className="grid grid-cols-[9rem_1fr_4rem] items-center gap-2 text-sm">
                <span className="truncate">ขั้น {s.n} · {s.short}</span><Bar value={n} max={totalUnits} tone={s.n === 5 ? "bg-slate-400" : "bg-emerald-500"} /><span className="text-right">{n.toLocaleString()}</span>
              </div>
            ))}
            <p className="text-xs text-slate-500">จากทั้งหมด {totalUnits.toLocaleString()} หน่วยตามใบเคลม</p>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-navy-900">รายงานรายปี</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>ปี</th><th>เคลม</th><th>หน่วย</th><th>ปิดครบ</th><th>ยังเปิด</th></tr></thead>
            <tbody>{byYear.map((y) => <tr key={y.y} className="border-t border-slate-100"><td>{y.y + 543}</td><td>{y.n}</td><td>{y.units}</td><td>{y.done}</td><td>{y.n - y.done}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-navy-900">รายงานรายเดือน</h3>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>เดือน</th><th>เคลมใหม่</th>{STEPS.map((s) => <th key={s.n}>ขั้น {s.n}</th>)}</tr></thead>
              <tbody>{months.map((m) => <tr key={m.m} className="border-t border-slate-100"><td>{new Date(`${m.m}-01`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</td><td>{m.n}</td>{m.steps.map((n, i) => <td key={i}>{n}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-navy-900">สินค้าที่เคลมมากที่สุด (Top 10)</h3>
          <div className="space-y-2">{products.slice(0, 10).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-2 text-sm"><span className="truncate" title={k}>{k}</span><Bar value={v.n} max={products[0]?.[1].n ?? 1} /><span className="text-right">{v.n}</span></div>
          ))}</div>
        </Card>
        <Card className="lg:col-span-2">
          <h3 className="mb-3 font-semibold text-navy-900">รายบริษัท</h3>
          <div className="mb-4 space-y-2">{companies.slice(0, 12).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[14rem_1fr_3rem] items-center gap-2 text-sm"><span className="truncate" title={k}>{k}</span><Bar value={v.n} max={companies[0]?.[1].n ?? 1} tone="bg-sun-500" /><span className="text-right">{v.n}</span></div>
          ))}</div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>บริษัท</th><th>เคลม</th><th>หน่วย</th><th>ยังเปิด</th></tr></thead>
              <tbody>{companies.map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td>{k}</td><td>{v.n}</td><td>{v.units}</td><td>{v.open}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function ClaimAudit({ onOpen }: { onOpen: (id: string) => void }) {
  const { claims, unitsBy } = useBoard();
  const issues = useMemo(() => auditClaims(claims, unitsBy), [claims, unitsBy]);
  const [kind, setKind] = useState<AuditKind | "all">("all");
  const counts = new Map<AuditKind, number>();
  for (const i of issues) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const shown = issues.filter((i) => kind === "all" || i.kind === kind);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy-900">รายงานตรวจสอบ · {issues.length.toLocaleString()} รายการ</h2>
        <Button variant="secondary" onClick={() => download("claim-audit.csv", toCsv([["หัวข้อ", "เลขเคลม", "บริษัท", "แถว", "รายละเอียด"], ...shown.map((i) => [AUDIT_LABEL[i.kind], i.claim.claim_no, i.claim.company_name ?? "", i.unit?.seq ?? "", i.detail])]))}>ส่งออก CSV</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setKind("all")} className={cx("rounded-full px-3 py-1 text-sm", kind === "all" ? "bg-navy-800 text-white" : "bg-slate-100")}>ทั้งหมด {issues.length}</button>
        {(Object.keys(AUDIT_LABEL) as AuditKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cx("rounded-full px-3 py-1 text-sm", kind === k ? "bg-navy-800 text-white" : counts.get(k) ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-slate-50 text-slate-400")}>
            {AUDIT_LABEL[k]} {counts.get(k) ?? 0}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <Empty>ไม่พบปัญหา</Empty> : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">หัวข้อ</th><th className="px-3 py-2">เลขเคลม</th><th className="px-3 py-2">บริษัท</th><th className="px-3 py-2">รายละเอียด</th></tr></thead>
            <tbody>
              {shown.slice(0, 500).map((i, n) => (
                <tr key={n} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-1.5">{AUDIT_LABEL[i.kind]}</td>
                  <td className="px-3 py-1.5"><button className="font-mono text-navy-700 underline" onClick={() => onOpen(i.claim.id)}>{i.claim.claim_no}</button></td>
                  <td className="max-w-[12rem] truncate px-3 py-1.5">{i.claim.company_name}</td>
                  <td className="px-3 py-1.5 text-slate-600">{i.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 500 && <p className="p-3 text-center text-xs text-slate-500">แสดง 500 รายการแรก ส่งออก CSV เพื่อดูทั้งหมด</p>}
        </Card>
      )}
    </div>
  );
}
