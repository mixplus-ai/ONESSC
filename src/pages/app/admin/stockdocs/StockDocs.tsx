import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Gate } from "../../../../components/AppLayout";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageTitle, Select } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { formatDate } from "../../../../lib/catalog";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import {
  DIR, DOC_LABEL, DOC_STATUS_LABEL, DOC_STATUS_TONE, DOC_TYPES, SERIAL_STATUS_LABEL,
  type DocStatus, type DocType, type Serial, type SerialStatus, type StockDoc, type Warehouse,
} from "../../../../lib/stockdocs";
import { Tabs } from "../../MyRequests";
import { DocEditor } from "./DocEditor";
import { SnLookup } from "./SnLookup";
import { StockCounts } from "./StockCount";

type Tab = "search" | "docs" | "balance" | "out" | "count" | "settings";

function DocList({ open, newDoc }: { open: (id: string) => void; newDoc: (t: DocType) => void }) {
  const { can, isAdmin } = useAuth();
  const [type, setType] = useState<"" | DocType>("");
  const [status, setStatus] = useState<"" | DocStatus>("");
  const [q, setQ] = useState("");
  const docs = useRows<StockDoc & { stock_doc_items: { count: number }[] }>(() => {
    let r = supabase.from("stock_docs").select("*, stock_doc_items(count)").order("created_at", { ascending: false }).limit(500);
    if (type) r = r.eq("doc_type", type);
    if (status) r = r.eq("status", status);
    return r;
  }, [type, status]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return docs.rows.filter((d) => !s || [d.doc_no, d.partner_name, d.ref_no, d.customer_po, d.site_name].some((x) => x?.toLowerCase().includes(s)));
  }, [docs.rows, q]);
  const canMake = can("stock.docs") || can("stock.post");

  return (
    <div className="space-y-4">
      {canMake && (
        <Card className="!p-4">
          <p className="mb-2 text-sm font-semibold text-navy-900">สร้างเอกสารใหม่</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {DOC_TYPES.filter((d) => d.type !== "OB" || isAdmin).map((d) => (
              <button key={d.type} onClick={() => newDoc(d.type)} className="rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200 hover:ring-navy-400">
                <span className={`mr-1 rounded px-1.5 text-xs font-bold ${DIR[d.type] === "in" ? "bg-emerald-100 text-emerald-800" : DIR[d.type] === "out" ? "bg-red-100 text-red-800" : "bg-navy-50 text-navy-700"}`}>{d.type}</span>
                <span className="text-sm font-semibold text-navy-900">{d.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{d.hint}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="ค้นหาเลขที่ ลูกค้า PO ไซต์" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-[14rem]" value={type} onChange={(e) => setType(e.target.value as DocType | "")}>
          <option value="">ทุกประเภท</option>
          {DOC_TYPES.map((d) => <option key={d.type} value={d.type}>{d.type} · {d.label}</option>)}
        </Select>
        <Select className="max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value as DocStatus | "")}>
          <option value="">ทุกสถานะ</option>
          {(["draft", "posted", "cancelled"] as const).map((s) => <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      {docs.loading ? <Loading /> : shown.length ? (
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">เลขที่</th><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">วันที่</th><th className="px-3 py-2">คู่ค้า / ลูกค้า</th><th className="px-3 py-2">อ้างอิง</th><th className="px-3 py-2 text-right">ชิ้น</th><th className="px-3 py-2">สถานะ</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((d) => (
                <tr key={d.id} onClick={() => open(d.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-semibold text-navy-800">{d.doc_no}</td>
                  <td className="px-3 py-2">{DOC_LABEL[d.doc_type]}</td>
                  <td className="px-3 py-2">{formatDate(d.doc_date)}</td>
                  <td className="px-3 py-2">{d.partner_name ?? "-"}</td>
                  <td className="px-3 py-2">{[d.ref_no, d.customer_po].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-3 py-2 text-right">{d.stock_doc_items?.[0]?.count ?? 0}</td>
                  <td className="px-3 py-2"><Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>{d.status === "draft" && d.checked_at && <> <Badge tone="navy">ตรวจแล้ว</Badge></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>ยังไม่มีเอกสาร</Empty>}
    </div>
  );
}

/** Stock card for one code: every posted document in date order with in / out / running balance. */
function StockCard({ sku, onClose, open }: { sku: string; onClose: () => void; open: (id: string) => void }) {
  type Line = { doc_id: string; stock_docs: { doc_no: string; doc_type: DocType; doc_date: string; partner_name: string | null; ref_no: string | null; posted_at: string } };
  const lines = useRows<Line>(() => supabase.from("stock_doc_items").select("doc_id, stock_docs!inner(doc_no, doc_type, doc_date, partner_name, ref_no, posted_at, status)")
    .eq("sku", sku).eq("stock_docs.status", "posted").limit(5000) as unknown as PromiseLike<{ data: Line[] | null; error: unknown }>, [sku]);
  const docs = useMemo(() => {
    const m = new Map<string, { id: string; d: Line["stock_docs"]; n: number }>();
    for (const l of lines.rows) { const x = m.get(l.doc_id) ?? { id: l.doc_id, d: l.stock_docs, n: 0 }; x.n++; m.set(l.doc_id, x); }
    let bal = 0;
    return [...m.values()].sort((a, b) => (a.d.doc_date + a.d.posted_at).localeCompare(b.d.doc_date + b.d.posted_at)).map((x) => {
      const dir = DIR[x.d.doc_type];
      const inn = dir === "in" ? x.n : 0, out = dir === "out" ? x.n : 0;
      bal += inn - out;
      return { ...x, inn, out, bal };
    });
  }, [lines.rows]);
  return (
    <Modal open onClose={onClose} wide title={`สต๊อกการ์ด ${sku}`}>
      {lines.loading ? <Loading /> : docs.length ? (
        <div className="max-h-[65vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
              <tr><th className="py-1 pr-3">วันที่</th><th className="py-1 pr-3">เอกสาร</th><th className="py-1 pr-3">คู่ค้า / ลูกค้า</th><th className="py-1 pr-3 text-right">รับ</th><th className="py-1 pr-3 text-right">จ่าย</th><th className="py-1 text-right">คงเหลือ</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((x) => (
                <tr key={x.id}>
                  <td className="py-1 pr-3">{formatDate(x.d.doc_date)}</td>
                  <td className="py-1 pr-3"><button onClick={() => open(x.id)} className="font-mono text-navy-700 underline">{x.d.doc_no}</button> <span className="text-xs text-slate-500">{DOC_LABEL[x.d.doc_type]}</span></td>
                  <td className="py-1 pr-3">{x.d.partner_name ?? "-"}{x.d.ref_no ? <span className="text-xs text-slate-500"> · {x.d.ref_no}</span> : null}</td>
                  <td className="py-1 pr-3 text-right text-emerald-700">{x.inn || ""}</td>
                  <td className="py-1 pr-3 text-right text-red-700">{x.out || ""}</td>
                  <td className="py-1 text-right font-semibold">{x.bal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">คงเหลือนับรวมของเสียที่รับคืนเข้าคลัง · ใบโอนคลังและใบจองไม่เปลี่ยนยอดรวม</p>
        </div>
      ) : <Empty>ยังไม่มีเอกสารที่ยืนยันสำหรับรหัสนี้</Empty>}
    </Modal>
  );
}

function Balance({ warehouses, open }: { warehouses: Warehouse[]; open: (id: string) => void }) {
  const [card, setCard] = useState<string | null>(null);
  const serials = useRows<Serial>(async () => {
    const out: Serial[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("serials").select("*").order("sku").range(from, from + 999);
      if (error) return { data: null, error };
      out.push(...((data ?? []) as Serial[]));
      if (!data || data.length < 1000) break;
    }
    return { data: out, error: null };
  });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const m = new Map<string, { sku: string; description: string | null; c: Record<string, number> }>();
    for (const s of serials.rows) {
      const r = m.get(s.sku) ?? { sku: s.sku, description: s.description, c: {} };
      const k = s.status === "in_stock" && s.condition === "defective" ? "defective" : s.status;
      r.c[k] = (r.c[k] ?? 0) + 1;
      if (s.status === "in_stock" || s.status === "reserved") r.c["wh:" + s.warehouse_id] = (r.c["wh:" + s.warehouse_id] ?? 0) + 1;
      m.set(s.sku, r);
    }
    const t = q.trim().toLowerCase();
    return [...m.values()].filter((r) => !t || r.sku.toLowerCase().includes(t) || r.description?.toLowerCase().includes(t));
  }, [serials.rows, q]);
  const cols: { k: string; label: string }[] = [
    { k: "in_stock", label: "พร้อมขาย" }, { k: "reserved", label: "จอง" }, { k: "defective", label: "เสียในคลัง" },
    { k: "borrowed", label: "ยืม" }, { k: "withdrawn", label: "เบิก" }, { k: "sold", label: "ขายแล้ว" }, { k: "written_off", label: "จำหน่าย" },
  ];
  if (serials.loading) return <Loading />;
  return (
    <div className="space-y-3">
      <Input className="max-w-xs" placeholder="ค้นหารหัส / ชื่อสินค้า" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">รหัส</th><th className="px-3 py-2 text-left">สินค้า</th>
                {cols.map((c) => <th key={c.k} className="px-3 py-2 text-right">{c.label}</th>)}
                {warehouses.length > 1 && warehouses.map((w) => <th key={w.id} className="px-3 py-2 text-right">{w.code}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.sku}>
                  <td className="px-3 py-2 font-mono"><button onClick={() => setCard(r.sku)} className="text-navy-700 underline" title="ดูสต๊อกการ์ด">{r.sku}</button></td>
                  <td className="px-3 py-2">{r.description}</td>
                  {cols.map((c) => <td key={c.k} className={`px-3 py-2 text-right ${c.k === "in_stock" ? "font-semibold text-navy-900" : "text-slate-600"}`}>{r.c[c.k] ?? ""}</td>)}
                  {warehouses.length > 1 && warehouses.map((w) => <td key={w.id} className="px-3 py-2 text-right">{r.c["wh:" + w.id] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>ยังไม่มี SN ในระบบ เริ่มจากใบยอดยกมาหรือใบรับสินค้า</Empty>}
      {card && <StockCard sku={card} onClose={() => setCard(null)} open={open} />}
    </div>
  );
}

function OutList({ open }: { open: (id: string) => void }) {
  const list = useRows<Serial & { stock_docs: { doc_no: string; doc_type: DocType } | null }>(() =>
    supabase.from("serials").select("*, stock_docs!serials_last_doc_id_fkey(doc_no, doc_type)").in("status", ["borrowed", "withdrawn", "reserved"]).order("due_date", { nullsFirst: false }));
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (list.loading) return <Loading />;
  if (!list.rows.length) return <Empty>ไม่มีของยืม เบิก หรือจองค้างอยู่</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
      <table className="min-w-full bg-white text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr><th className="px-3 py-2">SN</th><th className="px-3 py-2">รหัส</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">อยู่กับ</th><th className="px-3 py-2">กำหนด</th><th className="px-3 py-2">เอกสาร</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.rows.map((s) => {
            const late = s.due_date && s.due_date < today;
            return (
              <tr key={s.sn_key} className={late ? "bg-red-50" : ""}>
                <td className="px-3 py-2 font-mono">{s.sn}</td>
                <td className="px-3 py-2">{s.sku}</td>
                <td className="px-3 py-2">{SERIAL_STATUS_LABEL[s.status as SerialStatus]}</td>
                <td className="px-3 py-2">{s.holder_name ?? "-"}</td>
                <td className={`px-3 py-2 ${late ? "font-semibold text-red-700" : ""}`}>{formatDate(s.due_date) || "-"}{late ? " (เลยกำหนด)" : ""}</td>
                <td className="px-3 py-2">{s.last_doc_id && <button onClick={() => open(s.last_doc_id!)} className="font-mono text-navy-700 underline">{s.stock_docs?.doc_no}</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Settings({ warehouses, reload }: { warehouses: Warehouse[]; reload: () => void }) {
  const cfg = useRows<{ stock_source: "sheet" | "docs"; docs_start_date: string | null; check_types: DocType[] }>(() => supabase.from("stock_config").select("stock_source, docs_start_date, check_types").eq("id", 1));
  const c = cfg.rows[0];
  const [start, setStart] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function setSource(src: "sheet" | "docs") {
    const msg = src === "docs"
      ? "เปลี่ยนให้ยอดสต๊อกในเว็บมาจากเอกสารคลัง? หลังจากนี้การดึงจาก Google Sheet จะถูกปิด และยอดจะเท่ากับจำนวน SN ที่อยู่ในคลัง"
      : "กลับไปใช้ยอดจาก Google Sheet? (ยอดจะอัปเดตเมื่อซิงก์ครั้งถัดไป)";
    if (!confirm(msg)) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_stock_source", { p_source: src, p_start: start || c?.docs_start_date || null });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    cfg.reload();
  }
  async function toggleCheck(tp: DocType) {
    const cur = c?.check_types ?? [];
    const { error } = await supabase.rpc("set_stock_check_types", { p_types: cur.includes(tp) ? cur.filter((x) => x !== tp) : [...cur, tp] });
    if (error) return setErr(errorMessage(error));
    cfg.reload();
  }
  async function addWh() {
    if (!code.trim() || !name.trim()) return;
    const { error } = await supabase.from("warehouses").insert({ code: code.trim().toUpperCase(), name: name.trim(), sort: warehouses.length + 1 });
    if (error) return setErr(errorMessage(error));
    setCode(""); setName(""); reload();
  }
  async function toggleWh(w: Warehouse) {
    const { error } = await supabase.from("warehouses").update({ is_active: !w.is_active }).eq("id", w.id);
    if (error) return setErr(errorMessage(error));
    reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="font-semibold text-navy-900">ยอดสต๊อกในเว็บมาจากไหน</h3>
        {c ? (
          <>
            <p className="mt-2 text-sm">ตอนนี้: <Badge tone={c.stock_source === "docs" ? "green" : "navy"}>{c.stock_source === "docs" ? "เอกสารคลัง (SN)" : "Google Sheet"}</Badge>
              {c.docs_start_date && <span className="ml-2 text-slate-500">วันเริ่มใช้เอกสาร {formatDate(c.docs_start_date)}</span>}</p>
            <p className="mt-2 text-xs text-slate-500">ระหว่างทดลองให้ใช้ Google Sheet ต่อไปได้ เอกสารคลังและประวัติ SN ทำงานคู่กันอยู่แล้ว พอนำยอดยกมาครบ ให้กดเปลี่ยนเป็นเอกสารคลัง</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="วันเริ่มใช้"><Input type="date" value={start || c.docs_start_date || ""} onChange={(e) => setStart(e.target.value)} /></Field>
              {c.stock_source === "sheet"
                ? <Button onClick={() => setSource("docs")} loading={busy}>ใช้ยอดจากเอกสารคลัง</Button>
                : <Button variant="secondary" onClick={() => setSource("sheet")} loading={busy}>กลับไปใช้ Google Sheet</Button>}
            </div>
          </>
        ) : <Loading />}
      </Card>
      <Card>
        <h3 className="font-semibold text-navy-900">คลังสินค้า</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {warehouses.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2 text-sm">
              <span><span className="font-mono font-semibold">{w.code}</span> · {w.name} {!w.is_active && <Badge>ปิดใช้</Badge>}</span>
              <button onClick={() => toggleWh(w)} className="text-xs text-navy-700 hover:underline">{w.is_active ? "ปิดใช้" : "เปิดใช้"}</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="max-w-[8rem]" placeholder="รหัส" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input className="max-w-xs" placeholder="ชื่อคลัง" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="secondary" onClick={addWh}>+ เพิ่มคลัง</Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <h3 className="font-semibold text-navy-900">อนุมัติ 2 ชั้น</h3>
        <p className="mt-1 text-xs text-slate-500">ประเภทที่เลือก: ผู้ตรวจ (สิทธิ์ "ผู้ตรวจเอกสาร ชั้นที่ 1") ต้องกดตรวจร่างก่อน แล้วผู้อนุมัติอีกคนจึงยืนยันตัดสต๊อกได้ ถ้าแก้ร่างหลังตรวจ ต้องตรวจใหม่ ประเภทที่ไม่เลือกใช้ผู้อนุมัติชั้นเดียวเหมือนเดิม</p>
        {c ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {DOC_TYPES.map((d) => (
              <label key={d.type} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                <input type="checkbox" checked={(c.check_types ?? []).includes(d.type)} onChange={() => toggleCheck(d.type)} />
                <span className="font-mono text-xs font-bold">{d.type}</span> {d.label}
              </label>
            ))}
          </div>
        ) : <Loading />}
      </Card>
      {err && <div className="lg:col-span-2"><Alert>{err}</Alert></div>}
    </div>
  );
}

export default function StockDocs() {
  const { can, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  // someone who only counts or only checks lands on their own tab
  const home: Tab = can("stock.view") || can("stock.docs") || can("stock.post") ? "search" : can("stock.check") ? "docs" : "count";
  const tab = (params.get("tab") as Tab) || home;
  const docId = params.get("doc");
  const newType = params.get("new") as DocType | null;
  // a delivery that already has its sale document: open that one instead of starting a second
  const deliveryParam = params.get("delivery") ?? (params.get("reservation") ? `r:${params.get("reservation")}` : null);
  const [checked, setChecked] = useState(!deliveryParam);
  useEffect(() => {
    if (!deliveryParam || !newType) return setChecked(true);
    supabase.from("stock_docs").select("id").eq(deliveryParam.startsWith("r:") ? "reservation_id" : "delivery_id", deliveryParam.replace(/^r:/, "")).eq("doc_type", newType).neq("status", "cancelled").limit(1)
      .then(({ data }) => {
        if (data?.[0]) setParams((p) => { p.set("doc", data[0].id); p.delete("new"); p.delete("delivery"); p.delete("reservation"); return p; }, { replace: true });
        setChecked(true);
      });
  }, [deliveryParam, newType]); // eslint-disable-line react-hooks/exhaustive-deps
  const [listKey, setListKey] = useState(0);
  const wh = useRows<Warehouse>(() => supabase.from("warehouses").select("*").order("sort").order("code"));
  const active = wh.rows.filter((w) => w.is_active);

  const setTab = (t: Tab) => setParams((p) => { p.set("tab", t); p.delete("doc"); p.delete("new"); return p; });
  const open = (id: string) => setParams((p) => { p.set("tab", "docs"); p.set("doc", id); p.delete("new"); return p; });
  const newDoc = (t: DocType) => setParams((p) => { p.set("tab", "docs"); p.set("new", t); p.delete("doc"); return p; });
  const close = () => setParams((p) => { p.delete("doc"); p.delete("new"); return p; });

  const allowed = can("stock.view") || can("stock.docs") || can("stock.post") || can("stock.check") || can("stock.count");
  const canCount = can("stock.count") || can("stock.docs") || can("stock.post");
  return (
    <Gate allow={allowed}>
      <PageTitle title="เอกสารคลังและ Serial Number" subtitle="รับเข้า จ่ายออก ยืม คืน จำหน่าย ทุกชิ้นตาม SN และค้นประวัติ SN ได้ในช่องเดียว" />
      {(docId || newType) && !wh.loading && checked ? (
        <DocEditor key={docId ?? newType} id={docId} type={newType ?? "GR"} warehouses={docId ? wh.rows : active} deliveryId={params.get("delivery")} claimId={params.get("claim")} reservationId={params.get("reservation")}
          onClose={close} onChanged={() => setListKey((k) => k + 1)} />
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: "search", label: "ค้นหา SN" },
            { key: "docs", label: "เอกสาร" },
            { key: "balance", label: "คงเหลือตาม SN" },
            { key: "out", label: "ยืม / เบิก / จอง ค้าง" },
            ...(canCount ? [{ key: "count" as Tab, label: "ตรวจนับ" }] : []),
            ...(isAdmin ? [{ key: "settings" as Tab, label: "ตั้งค่า" }] : []),
          ]} />
          {tab === "search" && <SnLookup initial={params.get("sn") ?? ""} />}
          {tab === "docs" && <DocList key={listKey} open={open} newDoc={newDoc} />}
          {tab === "balance" && <Balance warehouses={active} open={open} />}
          {tab === "out" && <OutList open={open} />}
          {tab === "count" && canCount && <StockCounts warehouses={active} openDoc={open} />}
          {tab === "settings" && isAdmin && <Settings warehouses={wh.rows} reload={wh.reload} />}
        </>
      )}
    </Gate>
  );
}
