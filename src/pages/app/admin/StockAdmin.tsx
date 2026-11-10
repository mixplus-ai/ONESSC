import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { parseStockWorkbook, parseCsv, type Grid } from "../../../../supabase/functions/_shared/stock_parser";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { formatDate, formatDateTime, formatQty } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { Tabs } from "../MyRequests";

interface BoardRow {
  sku: string;
  store: string | null;
  stock_group: string | null;
  description: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  incoming: number;
  app_held: number;
  sellable: number;
  backorder_qty: number;
  variant_id: string | null;
  product_id: string | null;
  product_name: string | null;
  synced_at: string;
}
interface Backorder { id: number; sku: string; doc_no: string | null; doc_type: string | null; doc_date: string | null; pi_no: string | null; customer: string | null; delivery_note: string | null; sales: string | null; qty: number }
interface Sync { id: number; source: string; file_name: string | null; sheet_date: string | null; rows_total: number; rows_matched: number; backorders: number; status: "ok" | "error"; error: string | null; created_at: string }
interface Config { source_url: string | null; sheet_name: string; backorder_sheet: string; low_threshold: number; show_qty_to_users: boolean; reservation_days: number }

async function readWorkbook(file: File): Promise<Record<string, Grid>> {
  if (/\.csv$/i.test(file.name)) return { [file.name.replace(/\.csv$/i, "")]: parseCsv(await file.text()) };
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  return Object.fromEntries(sheets.map((s) => [s.sheet, s.data as Grid]));
}

function SyncPanel({ onDone }: { onDone: () => void }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [busy, setBusy] = useState<"" | "url" | "upload" | "save">("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const history = useRows<Sync>(() => supabase.from("stock_syncs").select("*").order("id", { ascending: false }).limit(15));

  useEffect(() => {
    supabase.from("stock_config").select("*").eq("id", 1).single().then(({ data }) => setCfg(data as Config));
  }, []);

  const done = (text: string) => {
    setMsg(text);
    history.reload();
    onDone();
  };

  async function saveCfg() {
    if (!cfg) return;
    setBusy("save");
    setErr("");
    const { error } = await supabase.from("stock_config").update({
      source_url: cfg.source_url || null,
      sheet_name: cfg.sheet_name || "รวม",
      backorder_sheet: cfg.backorder_sheet || "ค้างส่ง",
      low_threshold: cfg.low_threshold,
      show_qty_to_users: cfg.show_qty_to_users,
      reservation_days: cfg.reservation_days,
    }).eq("id", 1);
    setBusy("");
    if (error) return setErr(errorMessage(error));
    setMsg("บันทึกการตั้งค่าแล้ว");
  }

  async function syncUrl() {
    setBusy("url");
    setErr("");
    setMsg("");
    const { data, error } = await supabase.functions.invoke("stock-sync", { body: {} });
    setBusy("");
    if (error) {
      let detail = errorMessage(error);
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) detail = body.error;
      } catch { /* keep generic */ }
      history.reload();
      return setErr(detail);
    }
    const s = (data as { sync: Sync }).sync;
    done(`ซิงก์แล้ว ${s.rows_total} รหัส (ตรงกับแคตตาล็อก ${s.rows_matched}) · ค้างส่ง ${s.backorders} แถว`);
  }

  async function upload(file: File) {
    if (!cfg) return;
    setBusy("upload");
    setErr("");
    setMsg("");
    try {
      const parsed = parseStockWorkbook(await readWorkbook(file), { sheetName: cfg.sheet_name, backorderSheet: cfg.backorder_sheet });
      const { data, error } = await supabase.rpc("apply_stock_sync", {
        p_source: "upload",
        p_file_name: file.name,
        p_sheet_date: parsed.sheetDate,
        p_rows: parsed.rows,
        p_backorders: parsed.backorders,
      });
      if (error) throw error;
      const s = data as Sync;
      done(`นำเข้า “${file.name}” แท็บ ${parsed.sheet}: ${s.rows_total} รหัส (ตรงกับแคตตาล็อก ${s.rows_matched}) · ค้างส่ง ${s.backorders} แถว${parsed.warnings.length ? ` · หมายเหตุ: ${parsed.warnings.slice(0, 3).join(", ")}` : ""}`);
    } catch (x) {
      const m = errorMessage(x);
      await supabase.rpc("log_stock_sync_error", { p_source: "upload", p_file_name: file.name, p_error: m });
      history.reload();
      setErr(m);
    } finally {
      setBusy("");
    }
  }

  if (!cfg) return <Loading />;
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h2 className="font-semibold text-navy-900">แหล่งข้อมูลสต๊อก</h2>
        <Field label="ลิงก์ Google Sheet / ไฟล์ใน Drive" hint='ต้องแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" ระบบดึงอัตโนมัติทุกชั่วโมง 07:00–19:00 เมื่อเปิดตั้งเวลาแล้ว'>
          <Input value={cfg.source_url ?? ""} onChange={(e) => setCfg({ ...cfg, source_url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/..." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="แท็บสต๊อก"><Input value={cfg.sheet_name} onChange={(e) => setCfg({ ...cfg, sheet_name: e.target.value })} /></Field>
          <Field label="แท็บค้างส่ง"><Input value={cfg.backorder_sheet} onChange={(e) => setCfg({ ...cfg, backorder_sheet: e.target.value })} /></Field>
          <Field label="ถือว่า “เหลือน้อย” เมื่อ ≤"><Input type="number" min="0" value={cfg.low_threshold} onChange={(e) => setCfg({ ...cfg, low_threshold: Number(e.target.value) || 0 })} /></Field>
          <Field label="กันสินค้าที่จองไว้ (วัน)"><Input type="number" min="1" max="90" value={cfg.reservation_days} onChange={(e) => setCfg({ ...cfg, reservation_days: Number(e.target.value) || 7 })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.show_qty_to_users} onChange={(e) => setCfg({ ...cfg, show_qty_to_users: e.target.checked })} /> ลูกค้าที่ล็อกอินเห็นจำนวนคงเหลือ (บุคคลทั่วไปเห็นแค่สถานะ มี/เหลือน้อย/หมด)</label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={saveCfg} loading={busy === "save"}>บันทึกการตั้งค่า</Button>
          <Button onClick={syncUrl} loading={busy === "url"} disabled={!!busy || !cfg.source_url}>ซิงก์จาก Google Sheet ตอนนี้</Button>
          <Button variant="sun" onClick={() => fileRef.current?.click()} loading={busy === "upload"} disabled={!!busy}>อัปโหลดไฟล์ .xlsx / .csv</Button>
          <input ref={fileRef} type="file" hidden accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </div>
        {msg && <Alert tone="green">{msg}</Alert>}
        {err && <Alert>{err}</Alert>}
      </Card>

      <Card className="!p-0">
        <h2 className="p-4 pb-2 font-semibold text-navy-900">ประวัติการซิงก์</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">เวลา</th><th className="p-3">ทาง</th><th className="p-3">วันที่ในไฟล์</th><th className="p-3">ผล</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {history.rows.map((s) => (
              <tr key={s.id}>
                <td className="p-3 whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                <td className="p-3">{{ url: "ลิงก์", upload: "อัปโหลด", cron: "อัตโนมัติ" }[s.source] ?? s.source}</td>
                <td className="p-3 text-xs">{s.sheet_date ?? "-"}</td>
                <td className="p-3">{s.status === "ok" ? <span>{s.rows_total} รหัส · ตรง {s.rows_matched}</span> : <span className="text-red-600">{s.error}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function StockAdmin() {
  const { isAdmin, can } = useAuth();
  const [tab, setTab] = useState<"board" | "backorders" | "sync">("board");
  const [tick, setTick] = useState(0);
  const board = useRows<BoardRow>(() => supabase.rpc("stock_board"), [tick]);
  const backorders = useRows<Backorder>(() => supabase.from("stock_backorders").select("*").order("doc_date", { ascending: false }).limit(1000), [tick]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [filter, setFilter] = useState<"" | "unlinked" | "out" | "held">("");

  const groups = useMemo(() => [...new Set(board.rows.map((r) => r.stock_group).filter(Boolean))] as string[], [board.rows]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return board.rows.filter(
      (r) =>
        (!group || r.stock_group === group) &&
        (!filter || (filter === "unlinked" && !r.variant_id) || (filter === "out" && Number(r.sellable) <= 0) || (filter === "held" && Number(r.app_held) > 0)) &&
        (!n || [r.sku, r.description, r.product_name].join(" ").toLowerCase().includes(n)),
    );
  }, [board.rows, q, group, filter]);
  const boRows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return backorders.rows.filter((b) => !n || [b.sku, b.customer, b.pi_no, b.doc_no].join(" ").toLowerCase().includes(n));
  }, [backorders.rows, q]);
  const syncedAt = board.rows[0]?.synced_at;

  return (
    <Gate allow={can("stock.view")}>
      <PageTitle title="สต๊อกสินค้า" subtitle={syncedAt ? `ข้อมูลจากไฟล์สต๊อก ซิงก์ล่าสุด ${formatDateTime(syncedAt)}` : "ยังไม่เคยซิงก์สต๊อก"} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "board", label: `สต๊อก (${board.rows.length})` },
          { key: "backorders", label: `ค้างส่ง (${backorders.rows.length})` },
          ...(isAdmin ? [{ key: "sync" as const, label: "ซิงก์และตั้งค่า" }] : []),
        ]}
      />
      {tab !== "sync" && (
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input type="search" placeholder={tab === "board" ? "ค้นหารหัส / รายละเอียด" : "ค้นหารหัส / ลูกค้า / PI"} value={q} onChange={(e) => setQ(e.target.value)} />
          {tab === "board" && (
            <>
              <Select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">ทุกกลุ่ม</option>
                {groups.map((g) => <option key={g}>{g}</option>)}
              </Select>
              <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="">ทั้งหมด</option>
                <option value="out">ขายได้ ≤ 0</option>
                <option value="held">มีการจองในแอป</option>
                <option value="unlinked">ยังไม่อยู่ในแคตตาล็อก</option>
              </Select>
            </>
          )}
        </div>
      )}

      {tab === "board" &&
        (board.loading ? <Loading /> : board.error ? <Alert>{errorMessage(board.error)}</Alert> : rows.length ? (
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-right text-xs text-slate-500">
                <tr>
                  <th className="p-3 text-left">รหัส / รายละเอียด</th>
                  <th className="p-3">สต๊อค</th><th className="p-3">หักจอง</th><th className="p-3">คงเหลือ</th><th className="p-3">ค้างรับ</th>
                  <th className="p-3" title="จองผ่าน One App ที่ยังไม่บันทึกเข้าไฟล์สต๊อก">จองในแอป</th>
                  <th className="p-3">ขายได้</th><th className="p-3">ค้างส่ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.sku} className={Number(r.sellable) < 0 ? "bg-red-50/60" : undefined}>
                    <td className="p-3">
                      <p className="font-mono text-xs text-slate-500">{r.sku} · {r.stock_group}</p>
                      <p className="text-navy-900">{r.description}</p>
                      {r.product_name ? <p className="text-xs text-emerald-700">แคตตาล็อก: {r.product_name}</p> : <p className="text-xs text-amber-700">ยังไม่อยู่ในแคตตาล็อก{can("products") && <> · <Link to="/app/admin/products" className="underline">จัดการสินค้า</Link></>}</p>}
                    </td>
                    <td className="p-3 text-right">{formatQty(r.on_hand)}</td>
                    <td className="p-3 text-right">{formatQty(r.reserved)}</td>
                    <td className="p-3 text-right">{formatQty(r.available)}</td>
                    <td className="p-3 text-right">{formatQty(r.incoming)}</td>
                    <td className="p-3 text-right">{Number(r.app_held) ? <Badge tone="amber">{formatQty(r.app_held)}</Badge> : "-"}</td>
                    <td className="p-3 text-right font-semibold">{formatQty(r.sellable)}</td>
                    <td className="p-3 text-right">{Number(r.backorder_qty) ? formatQty(r.backorder_qty) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : <Empty>{board.rows.length ? "ไม่พบรายการ" : isAdmin ? "ยังไม่มีข้อมูลสต๊อก ไปที่แท็บ “ซิงก์และตั้งค่า”" : "ยังไม่มีข้อมูลสต๊อก รอ Admin ซิงก์"}</Empty>)}

      {tab === "backorders" &&
        (backorders.loading ? <Loading /> : boRows.length ? (
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="p-3">รหัสสินค้า</th><th className="p-3">ลูกค้า</th><th className="p-3">เอกสาร</th><th className="p-3">วันที่</th><th className="p-3">PI</th><th className="p-3">นัดส่ง</th><th className="p-3">เซลล์</th><th className="p-3 text-right">จำนวน</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boRows.map((b) => (
                  <tr key={b.id}>
                    <td className="p-3 font-mono text-xs">{b.sku}</td>
                    <td className="p-3">{b.customer}</td>
                    <td className="p-3 text-xs">{b.doc_type}<br /><span className="text-slate-500">{b.doc_no}</span></td>
                    <td className="p-3 whitespace-nowrap">{formatDate(b.doc_date)}</td>
                    <td className="p-3 text-xs">{b.pi_no}</td>
                    <td className="p-3 text-xs">{b.delivery_note}</td>
                    <td className="p-3">{b.sales}</td>
                    <td className="p-3 text-right font-semibold">{formatQty(b.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : <Empty>ไม่มีรายการค้างส่ง</Empty>)}

      {tab === "sync" && isAdmin && <SyncPanel onDone={() => setTick((t) => t + 1)} />}
    </Gate>
  );
}
