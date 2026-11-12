import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Select, cx, fieldBase } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { formatDateTime } from "../../../../lib/catalog";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import {
  DOC_LABEL, SCAN_RESULT, SERIAL_STATUS_LABEL, snKey, splitSns,
  type CountLine, type CountReport, type StockCount as Count, type Warehouse,
} from "../../../../lib/stockdocs";
import { beep, CameraScan } from "./CameraScan";
import { PhotoScan } from "./PhotoScan";
import { printStockCount } from "./print";

const COUNT_STATUS = { open: { label: "กำลังนับ", tone: "amber" }, closed: { label: "ปิดแล้ว", tone: "green" }, cancelled: { label: "ยกเลิก", tone: "red" } } as const;

/** Stock count tab: list of counts and a new-count form. */
export function StockCounts({ warehouses, openDoc }: { warehouses: Warehouse[]; openDoc: (id: string) => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const counts = useRows<Count>(() => supabase.from("stock_counts").select("*").order("started_at", { ascending: false }).limit(100), [current]);
  const [wh, setWh] = useState(warehouses[0]?.id ?? "");
  const [skus, setSkus] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "-";

  async function start() {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("start_stock_count", { p_warehouse: wh, p_skus: splitSns(skus), p_note: note });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setSkus(""); setNote("");
    setCurrent((data as Count).id);
  }

  if (current) return <CountScreen id={current} warehouses={warehouses} onBack={() => setCurrent(null)} openDoc={openDoc} />;
  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <p className="mb-2 text-sm font-semibold text-navy-900">เริ่มตรวจนับ</p>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_1fr_auto] sm:items-end">
          <Field label="คลัง"><Select value={wh} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
          <Field label="เฉพาะรหัส (เว้นว่าง = ทั้งคลัง)"><Input value={skus} onChange={(e) => setSkus(e.target.value)} placeholder="เช่น SE10K-RWS48BEN4, BAT-10" /></Field>
          <Field label="หมายเหตุ"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ชั้น A ประจำเดือน" /></Field>
          <Button onClick={start} loading={busy} disabled={!wh}>เริ่มนับ</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">เปิดใบตรวจนับบนมือถือแล้วสแกน SN ทุกชิ้นที่อยู่บนชั้น หลายคนช่วยกันสแกนใบเดียวกันได้ ปิดใบแล้วระบบจะสร้างร่างใบจำหน่ายออก (ของที่ไม่พบ) และร่างใบโอนคลัง (ของที่อยู่ผิดคลัง) ให้ผู้มีสิทธิ์ตรวจและยืนยัน</p>
        {err && <Alert>{err}</Alert>}
      </Card>
      {counts.loading ? <Loading /> : counts.rows.length ? (
        <div className="space-y-2">
          {counts.rows.map((c) => (
            <button key={c.id} onClick={() => setCurrent(c.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white p-3 text-left text-sm ring-1 ring-slate-200 hover:ring-navy-400">
              <span className="font-mono font-semibold">{c.count_no}</span>
              <Badge tone={COUNT_STATUS[c.status].tone}>{COUNT_STATUS[c.status].label}</Badge>
              <span>{whName(c.warehouse_id)}{c.skus ? ` · ${c.skus.join(", ")}` : ""}</span>
              {c.note && <span className="text-slate-500">{c.note}</span>}
              <span className="ml-auto text-xs text-slate-500">
                {c.result ? `นับได้ ${c.result.matched}/${c.result.expected} · ไม่พบ ${c.result.missing.length} · เกิน ${c.result.extra.length} · ` : ""}{formatDateTime(c.started_at)}
              </span>
            </button>
          ))}
        </div>
      ) : <Empty>ยังไม่มีใบตรวจนับ</Empty>}
    </div>
  );
}

function CountScreen({ id, warehouses, onBack, openDoc }: { id: string; warehouses: Warehouse[]; onBack: () => void; openDoc: (id: string) => void }) {
  const { can } = useAuth();
  const canClose = can("stock.docs") || can("stock.post");
  const [c, setC] = useState<Count | null>(null);
  const [rep, setRep] = useState<CountReport | null>(null);
  const [recent, setRecent] = useState<CountLine[]>([]);
  const [scan, setScan] = useState("");
  const [view, setView] = useState<"recent" | "missing" | "extra" | "sku">("recent");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const known = useRows<{ sku: string }>(() => supabase.from("stock_levels").select("sku"));

  const load = useCallback(async () => {
    const [{ data }, r] = await Promise.all([
      supabase.from("stock_counts").select("*").eq("id", id).single(),
      supabase.rpc("stock_count_report", { p_count: id }),
    ]);
    if (data) setC(data as Count);
    if (r.error) setErr(errorMessage(r.error)); else setRep(r.data as CountReport);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // the report is reloaded at most once a second while scanning fast
  const timer = useRef<number>(0);
  const refresh = () => { clearTimeout(timer.current); timer.current = window.setTimeout(load, 800); };

  async function add(sns: string[]) {
    if (!sns.length) return;
    setErr("");
    const { data, error } = await supabase.rpc("stock_count_scan", { p_count: id, p_sns: sns });
    if (error) { beep(false); return setErr(errorMessage(error)); }
    const lines = data as CountLine[];
    beep(lines.every((l) => l.result === "ok" && !l.dup));
    // newest on top; a repeat scan moves the SN up instead of listing it twice
    setRecent((r) => [...lines.reverse(), ...r.filter((x) => !lines.some((l) => snKey(l.sn) === snKey(x.sn)))].slice(0, 300));
    refresh();
  }
  async function unscan(sn: string) {
    const { error } = await supabase.rpc("stock_count_unscan", { p_count: id, p_sn: sn });
    if (error) return setErr(errorMessage(error));
    setRecent((r) => r.filter((x) => snKey(x.sn) !== snKey(sn)));
    load();
  }
  async function close() {
    if (!rep) return;
    if (!confirm(`ปิดใบตรวจนับ? ไม่พบ ${rep.missing.length} ชิ้น เกิน/ไม่ตรง ${rep.extra.length} ชิ้น\nระบบจะสร้างร่างใบจำหน่ายออกและใบโอนคลังให้ตรวจก่อนยืนยัน (ยังไม่ตัดสต๊อกจนกว่าจะยืนยัน)`)) return;
    setBusy("close");
    const { error } = await supabase.rpc("close_stock_count", { p_count: id, p_make_docs: true });
    setBusy("");
    if (error) return setErr(errorMessage(error));
    load();
  }
  async function cancel() {
    if (!confirm("ยกเลิกใบตรวจนับนี้? ข้อมูลที่สแกนไว้จะไม่ถูกใช้")) return;
    const { error } = await supabase.rpc("cancel_stock_count", { p_count: id });
    if (error) return setErr(errorMessage(error));
    load();
  }

  const last = recent[0];
  const lastTone = last ? (last.dup ? "navy" : SCAN_RESULT[last.result ?? "unknown"].tone) : null;
  const existing = useMemo(() => new Set(recent.map((r) => snKey(r.sn))), [recent]);
  if (!c || !rep) return err ? <Alert>{err}</Alert> : <Loading />;
  const open = c.status === "open";
  const pct = rep.expected ? Math.round((rep.matched / rep.expected) * 100) : 0;
  const lineText = (l: CountLine) => `${l.sn}${l.sku ? ` · ${l.sku}` : ""}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="text-sm font-semibold text-navy-700 hover:underline">← ใบตรวจนับทั้งหมด</button>
        <h2 className="text-lg font-bold text-navy-900">ตรวจนับ <span className="font-mono">{c.count_no}</span></h2>
        <Badge tone={COUNT_STATUS[c.status].tone}>{COUNT_STATUS[c.status].label}</Badge>
        <span className="text-sm text-slate-600">{warehouses.find((w) => w.id === c.warehouse_id)?.name}{c.skus ? ` · ${c.skus.join(", ")}` : " · ทุกรหัส"}</span>
        <Button variant="secondary" className="ml-auto" onClick={() => printStockCount(c, rep, warehouses.find((w) => w.id === c.warehouse_id)?.name ?? "")}>พิมพ์ / PDF</Button>
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div><p className="text-xs text-slate-500">ตรงกับระบบ</p><p className="text-2xl font-bold text-navy-900">{rep.matched}<span className="text-base font-normal text-slate-500"> / {rep.expected}</span></p></div>
          <div><p className="text-xs text-slate-500">ยังไม่พบ</p><p className="text-2xl font-bold text-red-700">{rep.missing.length}</p></div>
          <div><p className="text-xs text-slate-500">เกิน / ไม่ตรง</p><p className="text-2xl font-bold text-amber-700">{rep.extra.length}</p></div>
          <div><p className="text-xs text-slate-500">สแกนแล้ว</p><p className="text-2xl font-bold text-slate-700">{rep.scanned}</p></div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
      </Card>

      {open && (
        <Card className="!p-4">
          <form onSubmit={(e) => { e.preventDefault(); add(splitSns(scan)); setScan(""); input.current?.focus(); }} className="flex gap-2">
            <input ref={input} autoFocus value={scan} onChange={(e) => setScan(e.target.value)} placeholder="สแกนหรือพิมพ์ SN แล้วกด Enter" className={cx(fieldBase, "font-mono !text-lg")} autoCapitalize="characters" autoComplete="off" />
            <Button type="submit">เพิ่ม</Button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <CameraScan onScan={add} last={last && lastTone ? { text: `${last.dup ? "สแกนซ้ำ · " : ""}${lineText(last)} · ${SCAN_RESULT[last.result ?? "unknown"].label}`, tone: lastTone } : null} />
            <PhotoScan knownSkus={new Set(known.rows.map((r) => r.sku))} existing={existing} onAdd={(sns) => add(sns)} />
          </div>
          {last && lastTone && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${{ green: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-800", navy: "bg-slate-100 text-slate-700" }[lastTone]}`}>
              ล่าสุด: <span className="font-mono font-semibold">{last.sn}</span> {last.dup ? "· สแกนไปแล้ว" : `· ${SCAN_RESULT[last.result ?? "unknown"].label}`}
              {last.sku && ` · ${last.sku}`}{last.result === "other_wh" && last.warehouse ? ` (${last.warehouse})` : ""}{last.result === "out" && last.status ? ` (${SERIAL_STATUS_LABEL[last.status]}${last.holder ? ` · ${last.holder}` : ""})` : ""}
            </p>
          )}
        </Card>
      )}

      {err && <Alert>{err}</Alert>}

      {rep.docs && rep.docs.length > 0 && (
        <Alert tone="green">
          สร้างร่างเอกสารจากผลนับแล้ว ให้ผู้มีสิทธิ์ตรวจและยืนยัน:{" "}
          {rep.docs.map((d) => <button key={d.id} onClick={() => openDoc(d.id)} className="mr-2 font-semibold underline">{d.doc_no} {DOC_LABEL[d.doc_type]} ({d.n})</button>)}
        </Alert>
      )}
      {c.status === "closed" && !rep.docs?.length && <Alert tone="green">ปิดเมื่อ {formatDateTime(c.closed_at)} · ยอดตรงกับระบบ ไม่ต้องปรับ</Alert>}

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm">
        {([["recent", `สแกนล่าสุด (${recent.length})`], ["missing", `ยังไม่พบ (${rep.missing.length})`], ["extra", `เกิน / ไม่ตรง (${rep.extra.length})`], ["sku", "ตามรหัส"]] as const)
          .filter(([k]) => open || k !== "recent")
          .map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1.5 ${view === k || (!open && view === "recent" && k === "missing") ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}>{l}</button>)}
      </div>

      <Card className="!p-0">
        {(view === "recent" && open) && (recent.length ? <Lines rows={recent} onRemove={open ? unscan : undefined} /> : <p className="p-4 text-sm text-slate-500">ยังไม่ได้สแกนในเครื่องนี้ (ยอดรวมด้านบนนับรวมทุกเครื่อง)</p>)}
        {(view === "missing" || (!open && view === "recent")) && (rep.missing.length ? <Lines rows={rep.missing.map((m) => ({ ...m, result: undefined }))} /> : <p className="p-4 text-sm text-slate-500">พบครบทุกชิ้น</p>)}
        {view === "extra" && (rep.extra.length ? <Lines rows={rep.extra} onRemove={open ? unscan : undefined} /> : <p className="p-4 text-sm text-slate-500">ไม่มีของเกินหรือผิดคลัง</p>)}
        {view === "sku" && (
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="px-3 py-2">รหัส</th><th className="px-3 py-2 text-right">ในระบบ</th><th className="px-3 py-2 text-right">นับได้</th><th className="px-3 py-2 text-right">ขาด</th></tr></thead>
            <tbody>{rep.by_sku.map((s) => (
              <tr key={s.sku} className="border-t border-slate-100"><td className="px-3 py-2 font-mono">{s.sku}</td><td className="px-3 py-2 text-right">{s.expected}</td><td className="px-3 py-2 text-right">{s.counted}</td>
                <td className={`px-3 py-2 text-right ${s.expected - s.counted ? "font-semibold text-red-700" : "text-slate-400"}`}>{s.expected - s.counted}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {open && (
        <div className="flex flex-wrap gap-2">
          {canClose ? <Button onClick={close} loading={busy === "close"}>ปิดใบตรวจนับและสร้างใบปรับยอด</Button>
            : <p className="self-center text-sm text-slate-500">นับเสร็จแล้วให้ผู้มีสิทธิ์ทำเอกสารคลังกดปิดใบ</p>}
          <Button variant="secondary" onClick={cancel}>ยกเลิกใบตรวจนับ</Button>
        </div>
      )}
    </div>
  );
}

function Lines({ rows, onRemove }: { rows: CountLine[]; onRemove?: (sn: string) => void }) {
  return (
    <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
      {rows.map((l, i) => (
        <li key={l.sn + i} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
          <span className="font-mono font-semibold">{l.sn}</span>
          {l.sku && <span className="text-xs text-slate-500">{l.sku}</span>}
          {l.dup && <Badge>สแกนซ้ำ</Badge>}
          {l.result && <Badge tone={SCAN_RESULT[l.result].tone}>{SCAN_RESULT[l.result].label}{l.result === "other_wh" && l.warehouse ? ` · ${l.warehouse}` : ""}</Badge>}
          {l.status && l.result !== "ok" && <span className="text-xs text-slate-500">{SERIAL_STATUS_LABEL[l.status]}{l.holder ? ` · ${l.holder}` : ""}</span>}
          {onRemove && <button onClick={() => onRemove(l.sn)} className="ml-auto text-xs text-red-600 hover:underline">เอาออก</button>}
        </li>
      ))}
    </ul>
  );
}
