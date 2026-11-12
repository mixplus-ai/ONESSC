import { useEffect, useMemo, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, Card, Field, Input, PageTitle, Select, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import {
  MAX_ROWS, REPORTS, REPORT_GROUPS, buildTable, canOpenReport, exportCsv, exportXlsx, loadReport,
  type Cell, type ReportDef, type Sheet,
} from "../../../lib/reports";
import { errorMessage } from "../../../lib/supabase";
import { openPrintDoc, preparePrintWindow, table as printTable } from "../../../lib/printdoc";

// ---------------------------------------------------------------------------
// date presets (Bangkok calendar days)
// ---------------------------------------------------------------------------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "month", label: "เดือนนี้", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(new Date(n.getFullYear(), n.getMonth() + 1, 0))]; } },
  { key: "last", label: "เดือนก่อน", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
  { key: "3m", label: "3 เดือนล่าสุด", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 2, 1)), iso(new Date(n.getFullYear(), n.getMonth() + 1, 0))]; } },
  { key: "year", label: "ปีนี้", range: () => { const y = new Date().getFullYear(); return [`${y}-01-01`, `${y}-12-31`]; } },
  { key: "all", label: "ทั้งหมด", range: () => ["", ""] },
];

// column choice per report, remembered in this browser
const colsKey = (k: string) => `reports.cols.${k}`;
const defaultCols = (d: ReportDef) => d.cols.filter((c) => c.def).map((c) => c.key);
function savedCols(d: ReportDef): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(colsKey(d.key)) ?? "null");
    if (Array.isArray(v)) {
      const ok = v.filter((k) => d.cols.some((c) => c.key === k));
      if (ok.length) return ok;
    }
  } catch { /* storage blocked */ }
  return defaultCols(d);
}
function storeCols(d: ReportDef, cols: string[]) {
  try { localStorage.setItem(colsKey(d.key), JSON.stringify(cols)); } catch { /* storage blocked */ }
}

const stamp = () => iso(new Date()).replace(/-/g, "");
const rangeText = (from: string, to: string) => (from || to ? `${from || "…"}_${to || "…"}` : "all");

interface Loaded { key: string; q: string; sheet: Sheet; total: number; truncated: boolean }

export default function Reports() {
  const { isAdmin, can } = useAuth();
  const allowed = useMemo(() => REPORTS.filter((r) => canOpenReport(r, isAdmin, can)), [isAdmin, can]);
  const [sel, setSel] = useState<string>("");
  const def = allowed.find((r) => r.key === sel) ?? allowed[0];
  const [preset, setPreset] = useState("month");
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[0].range());
  const [status, setStatus] = useState("");
  const [cols, setCols] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [multi, setMulti] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!def) return;
    setCols(savedCols(def));
    setStatus("");
    setErr("");
  }, [def]);

  const setColsAndSave = (next: string[]) => {
    // keep the report's own column order
    const ordered = def.cols.map((c) => c.key).filter((k) => next.includes(k));
    setCols(ordered);
    storeCols(def, ordered);
  };

  const qKey = def ? JSON.stringify([def.key, def.dateCol ? from : "", def.dateCol ? to : "", status]) : "";

  async function fetchSheet(d: ReportDef, chosen: string[], st: string): Promise<Loaded> {
    setProgress(0);
    const { rows, lookups, truncated } = await loadReport(d, { from: d.dateCol ? from : "", to: d.dateCol ? to : "", status: st }, setProgress);
    const t = buildTable(d, chosen, rows, lookups);
    return { key: d.key, q: JSON.stringify([d.key, d.dateCol ? from : "", d.dateCol ? to : "", st]), sheet: { name: d.label, ...t }, total: rows.length, truncated };
  }

  async function run(kind: "preview" | "xlsx" | "csv" | "print") {
    if (!def) return;
    if (!cols.length) return setErr("เลือกหัวข้ออย่างน้อย 1 หัวข้อ");
    setErr("");
    setBusy(kind);
    const pw = kind === "print" ? preparePrintWindow() : null;
    if (kind === "print" && !pw) return setBusy("");
    try {
      // reuse the preview when nothing changed, but rebuild columns (cheap) by reloading only if needed
      const data = await fetchSheet(def, cols, status);
      setLoaded(data);
      const name = `${def.key}_${rangeText(def.dateCol ? from : "", def.dateCol ? to : "")}_${stamp()}`;
      if (kind === "xlsx") await exportXlsx(`${name}.xlsx`, [data.sheet]);
      if (kind === "csv") exportCsv(`${name}.csv`, data.sheet);
      if (kind === "print") printReport(data, pw);
    } catch (e) {
      pw?.close();
      setErr(errorMessage(e));
    }
    setBusy("");
  }

  async function runMulti() {
    const defs = allowed.filter((r) => multi.has(r.key));
    if (!defs.length) return;
    setErr("");
    setBusy("multi");
    try {
      const sheets: Sheet[] = [];
      for (const d of defs) sheets.push((await fetchSheet(d, savedCols(d), "")).sheet);
      await exportXlsx(`report_${rangeText(from, to)}_${stamp()}.xlsx`, sheets);
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy("");
  }

  // printed report on the shared document layout; wide reports go landscape, very long ones are cut with a note
  function printReport(data: Loaded, pw: Window | null) {
    const MAX = 3000;
    const { header, body, numeric } = data.sheet;
    const th = (d: string) => (d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");
    const range = def.dateCol ? (from || to ? `${th(from) || "…"} – ${th(to) || "…"}` : "ทั้งหมด") : "ข้อมูล ณ ปัจจุบัน";
    const fmt = (v: string | number | null, i: number) => (numeric[i] && typeof v === "number" ? v.toLocaleString("th-TH") : v);
    openPrintDoc({
      title: def.label, titleEn: "REPORT", docNo: null,
      date: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }),
      extra: [["ช่วงข้อมูล", range], ["จำนวน", `${data.total.toLocaleString("th-TH")} รายการ`]],
      landscape: header.length > 6,
      panels: [{ heading: "เงื่อนไขรายงาน", rows: [["รายงาน", `${def.group} · ${def.label}`], [def.dateLabel ?? "ช่วงเวลา", range], [statusLabel, status && def.statuses ? def.statuses[status] : null], ["หัวข้อ", header.join(", ")]] }],
      body: printTable([["#", "c"], ...header.map((h, i) => [h, numeric[i] ? "r" : ""] as [string, string])],
        body.slice(0, MAX).map((r, i) => [i + 1, ...r.map(fmt)]), { small: header.length > 6 })
        + (body.length > MAX ? `<p class="muted">แสดง ${MAX.toLocaleString("th-TH")} รายการแรกจาก ${body.length.toLocaleString("th-TH")} รายการ ส่งออก Excel เพื่อดูทั้งหมด</p>` : "")
        + (data.truncated ? `<p class="muted">ข้อมูลมากเกินกำหนด ระบบดึงมาเพียงบางส่วน</p>` : ""),
      signatures: ["ผู้จัดทำรายงาน", "ผู้ตรวจสอบ"],
      fileName: `${def.label} ${range}`,
    }, pw);
  }

  const preview = loaded && loaded.q === qKey ? loaded : null;
  const statusLabel = def?.statusCol === "role" ? "บทบาท" : def?.statusCol === "kind" ? "ประเภท" : "สถานะ";

  return (
    <Gate allow={can("reports")}>
      <PageTitle title="รายงานและส่งออกข้อมูล" subtitle="เลือกรายงาน ช่วงเวลา และหัวข้อที่ต้องการ แล้วส่งออกเป็น Excel, CSV หรือพิมพ์ / PDF" />
      {!allowed.length ? (
        <Alert tone="amber">ยังไม่มีรายงานที่คุณเปิดได้ รายงานแต่ละหัวข้อต้องมีสิทธิ์ของหน้านั้นด้วย กรุณาติดต่อ Admin</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* report list */}
          <aside className="space-y-4">
            {REPORT_GROUPS.map((g) => {
              const items = allowed.filter((r) => r.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-slate-500">{g}</p>
                  <ul className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                    {items.map((r) => (
                      <li key={r.key} className={cx("flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0", r.key === def.key && "bg-navy-900/5")}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0"
                          aria-label={`รวม ${r.label} ในไฟล์รวม`}
                          title="เลือกเพื่อส่งออกรวมหลายรายงาน"
                          checked={multi.has(r.key)}
                          onChange={(e) => {
                            const n = new Set(multi);
                            if (e.target.checked) n.add(r.key);
                            else n.delete(r.key);
                            setMulti(n);
                          }}
                        />
                        <button type="button" onClick={() => setSel(r.key)} className={cx("min-w-0 flex-1 text-left text-sm", r.key === def.key ? "font-semibold text-navy-900" : "text-slate-700 hover:text-navy-900")}>
                          {r.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <Card className="!p-4">
              <p className="text-sm font-semibold text-navy-900">ส่งออกรวมหลายรายงาน</p>
              <p className="mt-1 text-xs text-slate-500">ติ๊กหน้ารายงานที่ต้องการ ระบบรวมเป็นไฟล์ Excel เดียว แยกชีตละรายงาน ใช้ช่วงเวลาที่เลือกไว้และหัวข้อที่บันทึกของแต่ละรายงาน</p>
              <Button className="mt-3 w-full" variant="secondary" disabled={!multi.size || Boolean(busy)} loading={busy === "multi"} onClick={runMulti}>
                ส่งออกรวม {multi.size ? `${multi.size} รายงาน` : ""}
              </Button>
            </Card>
          </aside>

          {/* selected report */}
          <div className="min-w-0 space-y-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-navy-900">{def.label}</h2>
                  <p className="text-sm text-slate-500">{def.desc}</p>
                </div>
                <Badge tone="navy">{def.group}</Badge>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {def.dateCol ? (
                  <>
                    <Field label={`${def.dateLabel ?? "วันที่"} ตั้งแต่`}>
                      <Input type="date" value={from} onChange={(e) => { setPreset(""); setRange([e.target.value, to]); }} />
                    </Field>
                    <Field label="ถึง">
                      <Input type="date" value={to} onChange={(e) => { setPreset(""); setRange([from, e.target.value]); }} />
                    </Field>
                  </>
                ) : (
                  <div className="text-sm text-slate-500 sm:col-span-2">รายงานนี้เป็นข้อมูล ณ ปัจจุบัน ไม่มีช่วงเวลา</div>
                )}
                {def.statuses && (
                  <Field label={statusLabel}>
                    <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">ทั้งหมด</option>
                      {Object.entries(def.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
              {def.dateCol && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => { setPreset(p.key); setRange(p.range()); }}
                      className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", preset === p.key ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-navy-900">หัวข้อที่จะส่งออก <span className="text-sm font-normal text-slate-500">{cols.length}/{def.cols.length}</span></h3>
                  <p className="text-xs text-slate-500">ติ๊กหัวข้อที่ต้องการ ระบบจำค่าที่เลือกไว้ในเครื่องนี้</p>
                </div>
                <div className="flex gap-3 text-xs font-semibold text-navy-700">
                  <button type="button" className="hover:underline" onClick={() => setColsAndSave(def.cols.map((c) => c.key))}>เลือกทั้งหมด</button>
                  <button type="button" className="hover:underline" onClick={() => setColsAndSave(defaultCols(def))}>ค่าเริ่มต้น</button>
                  <button type="button" className="hover:underline" onClick={() => setColsAndSave([])}>ล้าง</button>
                </div>
              </div>
              <div className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {def.cols.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={cols.includes(c.key)}
                      onChange={(e) => setColsAndSave(e.target.checked ? [...cols, c.key] : cols.filter((k) => k !== c.key))}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              {err && <div className="mt-3"><Alert>{err}</Alert></div>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="sun" onClick={() => run("xlsx")} loading={busy === "xlsx"} disabled={Boolean(busy)}>ส่งออก Excel</Button>
                <Button variant="secondary" onClick={() => run("csv")} loading={busy === "csv"} disabled={Boolean(busy)}>ส่งออก CSV</Button>
                <Button variant="secondary" onClick={() => run("print")} loading={busy === "print"} disabled={Boolean(busy)}>พิมพ์ / PDF</Button>
                <Button variant="ghost" onClick={() => run("preview")} loading={busy === "preview"} disabled={Boolean(busy)}>ดูตัวอย่าง</Button>
                {busy && progress > 0 && <span className="text-xs text-slate-500">กำลังโหลด {progress.toLocaleString("th-TH")} แถว…</span>}
              </div>
            </Card>

            {preview && <Preview data={preview} />}
          </div>
        </div>
      )}
    </Gate>
  );
}

function Preview({ data }: { data: Loaded }) {
  const { sheet } = data;
  const show = sheet.body.slice(0, 50);
  const fmt = (v: Cell, n: boolean) => (v === null ? "" : n && typeof v === "number" ? v.toLocaleString("th-TH") : String(v));
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <p className="text-sm text-slate-700">
          พบ <b>{data.total.toLocaleString("th-TH")}</b> แถว{data.total > show.length ? ` · แสดงตัวอย่าง ${show.length} แถวแรก` : ""}
        </p>
        {data.truncated && <Badge tone="amber">ตัดที่ {MAX_ROWS.toLocaleString("th-TH")} แถว กรุณาแบ่งช่วงเวลา</Badge>}
      </div>
      {sheet.body.length === 0 ? (
        <p className="border-t border-slate-100 px-5 py-6 text-center text-sm text-slate-500">ไม่มีข้อมูลในช่วงเวลานี้</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto border-t border-slate-100">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>{sheet.header.map((h, i) => <th key={i} className={cx("whitespace-nowrap px-3 py-2 font-semibold text-slate-600", sheet.numeric[i] ? "text-right" : "text-left")}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {show.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {r.map((v, j) => <td key={j} className={cx("max-w-[20rem] truncate px-3 py-1.5 text-slate-700", sheet.numeric[j] && "text-right tabular-nums")} title={v === null ? "" : String(v)}>{fmt(v, sheet.numeric[j])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
