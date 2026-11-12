import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { Link } from "react-router-dom";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, Card, Input, Loading, PageTitle, Select, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import type { Brand, Category, Product, Variant } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";

/** Product-level fields edited from any of its code rows; variant-level fields per code. */
type PKey = "name" | "brand_id" | "category_id" | "summary" | "is_published";
type VKey = "name" | "detail" | "unit" | "is_active" | "base_price" | "show_price" | "special_price" | "special_ends_at";
type Val = string | boolean;
type Col = {
  id: string; label: string; level: "p" | "v"; key: PKey | VKey; kind: "text" | "num" | "bool" | "date" | "brand" | "cat";
  price?: boolean; w: string;
};

const COLS: Col[] = [
  { id: "p.name", label: "ชื่อสินค้า", level: "p", key: "name", kind: "text", w: "min-w-[14rem]" },
  { id: "p.brand_id", label: "แบรนด์", level: "p", key: "brand_id", kind: "brand", w: "min-w-[9rem]" },
  { id: "p.category_id", label: "หมวด", level: "p", key: "category_id", kind: "cat", w: "min-w-[10rem]" },
  { id: "v.name", label: "ชื่อรุ่น / รหัสนี้", level: "v", key: "name", kind: "text", w: "min-w-[11rem]" },
  { id: "v.detail", label: "รายละเอียดรหัสนี้", level: "v", key: "detail", kind: "text", w: "min-w-[14rem]" },
  { id: "v.unit", label: "หน่วย", level: "v", key: "unit", kind: "text", w: "min-w-[5rem]" },
  { id: "p.is_published", label: "แสดงบนเว็บ", level: "p", key: "is_published", kind: "bool", w: "" },
  { id: "v.is_active", label: "เปิดขาย", level: "v", key: "is_active", kind: "bool", w: "" },
  { id: "v.base_price", label: "ราคาปกติ", level: "v", key: "base_price", kind: "num", price: true, w: "min-w-[7rem]" },
  { id: "v.show_price", label: "แสดงราคา", level: "v", key: "show_price", kind: "bool", price: true, w: "" },
  { id: "v.special_price", label: "ราคาพิเศษ", level: "v", key: "special_price", kind: "num", price: true, w: "min-w-[7rem]" },
  { id: "v.special_ends_at", label: "ราคาพิเศษถึง", level: "v", key: "special_ends_at", kind: "date", price: true, w: "min-w-[9rem]" },
  { id: "p.summary", label: "คำอธิบายสั้น", level: "p", key: "summary", kind: "text", w: "min-w-[18rem]" },
];

type Row = { v: Variant; p: Product };
type Filter = "all" | "noprice" | "nocat" | "nobrand" | "hidden" | "changed";

const toLocalDate = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "";

function original(r: Row, c: Col): Val {
  const src = (c.level === "p" ? r.p : r.v) as unknown as Record<string, unknown>;
  const x = src[c.key];
  if (c.kind === "bool") return x === undefined ? true : !!x;
  if (c.kind === "date") return toLocalDate(x as string | null);
  return x == null ? "" : String(x);
}

/** Spreadsheet-style editor: every code on one table, change many cells, save once. */
export default function ProductsGrid() {
  const { can } = useAuth();
  const full = can("products");
  const canInfo = full || can("products.bulk");
  const canPrice = full || can("products.bulk_price");
  const list = useRows<Product>(() => supabase.from("products").select("*, product_variants(*)").order("name"));
  const brands = useRows<Brand>(() => supabase.from("brands").select("*").order("name"));
  const cats = useRows<Category>(() => supabase.from("product_categories").select("*").order("name"));
  const [pEdit, setPEdit] = useState<Record<string, Partial<Record<PKey, Val>>>>({});
  const [vEdit, setVEdit] = useState<Record<string, Partial<Record<VKey, Val>>>>({});
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [cat, setCat] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fillCol, setFillCol] = useState("");
  const [fillVal, setFillVal] = useState<Val>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const editable = (c: Col) => (c.price ? canPrice : canInfo);
  const cols = COLS;

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    list.rows.forEach((p) => (p.product_variants ?? []).forEach((v) => out.push({ p, v })));
    const bn = new Map(brands.rows.map((b) => [b.id, b.name]));
    return out.sort((a, b) => (bn.get(a.p.brand_id ?? "") ?? "~").localeCompare(bn.get(b.p.brand_id ?? "") ?? "~") || a.p.name.localeCompare(b.p.name) || a.v.sku.localeCompare(b.v.sku));
  }, [list.rows, brands.rows]);

  const value = (r: Row, c: Col): Val => {
    const e = c.level === "p" ? pEdit[r.p.id]?.[c.key as PKey] : vEdit[r.v.id]?.[c.key as VKey];
    return e !== undefined ? e : original(r, c);
  };
  const dirty = (r: Row, c: Col) => (c.level === "p" ? pEdit[r.p.id] : vEdit[r.v.id])?.[c.key as never] !== undefined;
  const rowDirty = (r: Row) => !!pEdit[r.p.id] || !!vEdit[r.v.id];

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const v = (c: string) => value(r, COLS.find((x) => x.id === c)!);
      if (brand && v("p.brand_id") !== brand) return false;
      if (cat && v("p.category_id") !== cat) return false;
      if (filter === "noprice" && v("v.base_price") !== "") return false;
      if (filter === "nocat" && v("p.category_id") !== "") return false;
      if (filter === "nobrand" && v("p.brand_id") !== "") return false;
      if (filter === "hidden" && v("p.is_published") === true && v("v.is_active") === true) return false;
      if (filter === "changed" && !rowDirty(r)) return false;
      if (s && !`${r.v.sku} ${v("p.name")} ${v("v.name")} ${v("v.detail")}`.toLowerCase().includes(s)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, brand, cat, filter, pEdit, vEdit]);

  function setCell(r: Row, c: Col, val: Val) {
    const same = val === original(r, c);
    if (c.level === "p") {
      setPEdit((m) => {
        const cur = { ...(m[r.p.id] ?? {}) };
        if (same) delete cur[c.key as PKey]; else cur[c.key as PKey] = val;
        const n = { ...m };
        if (Object.keys(cur).length) n[r.p.id] = cur; else delete n[r.p.id];
        return n;
      });
    } else {
      setVEdit((m) => {
        const cur = { ...(m[r.v.id] ?? {}) };
        if (same) delete cur[c.key as VKey]; else cur[c.key as VKey] = val;
        const n = { ...m };
        if (Object.keys(cur).length) n[r.v.id] = cur; else delete n[r.v.id];
        return n;
      });
    }
  }

  /** paste a column from Excel: one line per row, going down the visible rows */
  function onPaste(e: ClipboardEvent<HTMLInputElement>, idx: number, c: Col) {
    const text = e.clipboardData.getData("text");
    if (!/\r?\n/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t")[0]);
    lines.forEach((l, i) => { const r = shown[idx + i]; if (r) setCell(r, c, cleanText(c, l)); });
    setMsg(`วางข้อมูล ${Math.min(lines.length, shown.length - idx)} แถวในช่อง ${c.label}`);
  }
  const cleanText = (c: Col, s: string) => (c.kind === "num" ? s.replace(/[,\s฿]/g, "") : s.trim());

  const nChanged = Object.keys(pEdit).length + Object.keys(vEdit).length;
  const nCells = Object.values(pEdit).reduce((a, x) => a + Object.keys(x).length, 0) + Object.values(vEdit).reduce((a, x) => a + Object.keys(x).length, 0);

  useEffect(() => {
    if (!nCells) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [nCells]);

  async function save() {
    setErr(""); setMsg("");
    const bad: string[] = [];
    const num = (sku: string, label: string, s: Val) => {
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) { bad.push(`${sku}: ${label} "${s}"`); return null; }
      return Math.round(n * 100) / 100;
    };
    const skuOf = new Map(rows.map((r) => [r.v.id, r.v.sku]));
    const nameOf = new Map(rows.map((r) => [r.p.id, r.p.name]));
    const products = Object.entries(pEdit).map(([id, e]) => {
      if (e.name !== undefined && !String(e.name).trim()) bad.push(`${nameOf.get(id)}: ชื่อสินค้าว่าง`);
      return { id, ...e };
    });
    const variants = Object.entries(vEdit).map(([id, e]) => {
      const sku = skuOf.get(id) ?? id;
      const o: Record<string, unknown> = { id, ...e };
      if (e.name !== undefined && !String(e.name).trim()) bad.push(`${sku}: ชื่อรุ่นว่าง`);
      if (e.base_price !== undefined) o.base_price = num(sku, "ราคาปกติ", e.base_price);
      if (e.special_price !== undefined) o.special_price = num(sku, "ราคาพิเศษ", e.special_price);
      if (e.special_ends_at !== undefined) o.special_ends_at = e.special_ends_at ? new Date(`${e.special_ends_at}T23:59:59`).toISOString() : null;
      return o;
    });
    if (bad.length) return setErr(`แก้ก่อนบันทึก: ${bad.slice(0, 8).join(" · ")}${bad.length > 8 ? ` และอีก ${bad.length - 8}` : ""}`);
    setBusy(true);
    const { data, error } = await supabase.rpc("bulk_update_products", { p_products: products, p_variants: variants });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    const d = data as { products: number; variants: number };
    setPEdit({}); setVEdit({});
    setMsg(`บันทึกแล้ว: สินค้า ${d.products} รายการ · รหัส ${d.variants} รายการ`);
    list.reload();
  }

  function applyFill() {
    const c = COLS.find((x) => x.id === fillCol);
    if (!c) return;
    const targets = shown.filter((r) => sel.has(r.v.id));
    targets.forEach((r) => setCell(r, c, c.kind === "num" || c.kind === "text" ? cleanText(c, String(fillVal)) : fillVal));
    setMsg(`เติม "${c.label}" ให้ ${targets.length} แถวแล้ว (ยังไม่บันทึก)`);
  }

  const allSel = shown.length > 0 && shown.every((r) => sel.has(r.v.id));
  const fc = COLS.find((x) => x.id === fillCol);

  function cell(r: Row, c: Col, idx: number) {
    const v = value(r, c);
    const ro = !editable(c);
    const base = cx("h-8 w-full rounded-md border px-2 text-sm", dirty(r, c) ? "border-amber-400 bg-amber-50" : "border-transparent bg-transparent hover:border-slate-300 focus:border-navy-500 focus:bg-white", ro && "cursor-not-allowed text-slate-500");
    if (c.kind === "bool") {
      return <input type="checkbox" disabled={ro} checked={v === true} onChange={(e) => setCell(r, c, e.target.checked)} className={cx("h-4 w-4 accent-navy-700", dirty(r, c) && "outline outline-2 outline-amber-400")} aria-label={c.label} />;
    }
    if (c.kind === "brand" || c.kind === "cat") {
      const opts = c.kind === "brand" ? brands.rows : cats.rows;
      return (
        <select disabled={ro} value={String(v)} onChange={(e) => setCell(r, c, e.target.value)} className={base} aria-label={c.label}>
          <option value="">— ไม่ระบุ —</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      );
    }
    return (
      <input disabled={ro} type={c.kind === "date" ? "date" : "text"} inputMode={c.kind === "num" ? "decimal" : undefined} value={String(v)}
        onChange={(e) => setCell(r, c, c.kind === "num" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
        onPaste={(e) => onPaste(e, idx, c)} className={cx(base, c.kind === "num" && "text-right tabular-nums")} aria-label={c.label} />
    );
  }

  return (
    <Gate allow={canInfo || canPrice}>
      <PageTitle title="แก้สินค้าแบบตาราง" subtitle="เห็นทุกรหัสในหน้าเดียว แก้หลายช่องแล้วกดบันทึกครั้งเดียว · วางข้อมูลจาก Excel ลงช่องแรกได้ทั้งคอลัมน์"
        actions={<Link to="/app/admin/products" className="text-sm font-semibold text-navy-700 hover:underline">กลับหน้าสินค้า</Link>} />
      {!canPrice && <div className="mb-3"><Alert tone="amber">คุณแก้ได้เฉพาะรายละเอียด ช่องราคาเป็นแบบอ่านอย่างเดียว</Alert></div>}
      {!canInfo && <div className="mb-3"><Alert tone="amber">คุณแก้ได้เฉพาะราคา ช่องรายละเอียดเป็นแบบอ่านอย่างเดียว</Alert></div>}

      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="!h-10 !w-full sm:!w-64" placeholder="ค้นหา รหัส ชื่อ รายละเอียด" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="!h-10 !w-full sm:!w-40" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="แบรนด์">
            <option value="">ทุกแบรนด์</option>
            {brands.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select className="!h-10 !w-full sm:!w-44" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="หมวด">
            <option value="">ทุกหมวด</option>
            {cats.rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select className="!h-10 !w-full sm:!w-44" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="เงื่อนไข">
            <option value="all">ทั้งหมด</option>
            <option value="noprice">ยังไม่มีราคา</option>
            <option value="nocat">ยังไม่มีหมวด</option>
            <option value="nobrand">ยังไม่มีแบรนด์</option>
            <option value="hidden">ซ่อนอยู่ / ปิดขาย</option>
            <option value="changed">ที่แก้แล้วยังไม่บันทึก</option>
          </Select>
          <span className="text-sm text-slate-500">{shown.length} / {rows.length} รหัส</span>
        </div>
        {sel.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-navy-50 p-2 text-sm">
            <span className="font-semibold text-navy-900">เลือก {sel.size} แถว · เติมค่าเดียวกัน</span>
            <Select className="!h-10 !w-44" value={fillCol} onChange={(e) => { setFillCol(e.target.value); const c = COLS.find((x) => x.id === e.target.value); setFillVal(c?.kind === "bool" ? true : ""); }} aria-label="ช่องที่จะเติม">
              <option value="">เลือกช่อง</option>
              {COLS.filter(editable).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            {fc && (fc.kind === "bool" ? (
              <Select className="!h-10 !w-32" value={fillVal ? "1" : "0"} onChange={(e) => setFillVal(e.target.value === "1")} aria-label="ค่า"><option value="1">ใช่ / เปิด</option><option value="0">ไม่ / ปิด</option></Select>
            ) : fc.kind === "brand" || fc.kind === "cat" ? (
              <Select className="!h-10 !w-44" value={String(fillVal)} onChange={(e) => setFillVal(e.target.value)} aria-label="ค่า">
                <option value="">— ไม่ระบุ —</option>
                {(fc.kind === "brand" ? brands.rows : cats.rows).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            ) : (
              <Input className="!h-10 !w-44" type={fc.kind === "date" ? "date" : "text"} value={String(fillVal)} onChange={(e) => setFillVal(e.target.value)} placeholder="ว่าง = ล้างค่า" />
            ))}
            <Button variant="secondary" onClick={applyFill} disabled={!fc}>เติม</Button>
            <button onClick={() => setSel(new Set())} className="text-xs text-slate-600 hover:underline">ยกเลิกเลือก</button>
          </div>
        )}
      </Card>

      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      {msg && <div className="mt-3"><Alert tone="green">{msg}</Alert></div>}

      {list.loading ? <Loading /> : (
        <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20 bg-slate-100 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="sticky left-0 z-30 w-9 min-w-[2.25rem] bg-slate-100 px-2 py-2">
                  <input type="checkbox" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((r) => r.v.id)) : new Set())} aria-label="เลือกทั้งหมด" className="h-4 w-4 accent-navy-700" />
                </th>
                <th className="sticky left-9 z-30 border-r border-slate-200 bg-slate-100 px-2 py-2">รหัส (SKU)</th>
                {cols.map((c) => (
                  <th key={c.id} className={cx("whitespace-nowrap px-2 py-2", c.w, c.price && "text-red-700", c.kind === "bool" && "text-center")}>
                    {c.label}{c.level === "p" && <span className="ml-1 font-normal text-slate-400" title="แก้ที่แถวไหนก็เปลี่ยนทุกรหัสของสินค้านี้">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, idx) => (
                <tr key={r.v.id} className={cx("group", rowDirty(r) ? "bg-amber-50/40" : idx % 2 ? "bg-slate-50/50" : "bg-white")}>
                  <td className="sticky left-0 z-10 w-9 min-w-[2.25rem] border-b border-slate-100 bg-white px-2 py-1">
                    <input type="checkbox" checked={sel.has(r.v.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.v.id); else n.delete(r.v.id); return n; })} aria-label={`เลือก ${r.v.sku}`} className="h-4 w-4 accent-navy-700" />
                  </td>
                  <td className="sticky left-9 z-10 whitespace-nowrap border-b border-r border-slate-100 border-r-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-navy-900">{r.v.sku}</td>
                  {cols.map((c) => (
                    <td key={c.id} className={cx("border-b border-slate-100 px-1 py-1", c.w, c.kind === "bool" && "text-center")}>{cell(r, c, idx)}</td>
                  ))}
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={cols.length + 2} className="px-3 py-6 text-center text-slate-500">ไม่พบรหัสตามเงื่อนไข</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">* ช่องระดับสินค้า: แก้ที่แถวไหนก็เปลี่ยนทุกรหัสของสินค้านั้น · ช่องสีส้ม = แก้แล้วยังไม่บันทึก · ราคาว่าง = สอบถามราคา</p>

      <div className="sticky bottom-0 z-30 mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
        {nCells > 0 ? <Badge tone="amber">แก้ {nCells} ช่อง ใน {nChanged} รายการ</Badge> : <span className="text-sm text-slate-500">ยังไม่มีการแก้ไข</span>}
        <Button variant="secondary" disabled={!nCells || busy} onClick={() => { if (confirm("ทิ้งการแก้ไขทั้งหมด?")) { setPEdit({}); setVEdit({}); } }}>ยกเลิกการแก้ไข</Button>
        <Button onClick={save} loading={busy} disabled={!nCells}>บันทึกทั้งหมด</Button>
      </div>
    </Gate>
  );
}
