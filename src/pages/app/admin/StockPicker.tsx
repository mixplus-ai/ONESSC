import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Loading, Select, cx } from "../../../components/ui";
import { formatQty, slugify, type Brand, type Category } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";

interface StockRow { sku: string; stock_group: string | null; description: string | null; available: number; incoming: number }

/** The brand a stock-sheet group belongs to (brands.stock_groups, or the same name). */
export const brandForGroup = (brands: Brand[], g: string | null) =>
  g ? brands.find((b) => b.stock_groups.includes(g) || b.name.toUpperCase() === g.toUpperCase()) ?? null : null;

/**
 * Pick rows of the stock sheet that are not on the website yet and turn each into a product (1 SKU = 1 product).
 * Only what the sheet has is filled in (name = description, brand from the group); details, photos and price come later.
 */
export function StockPicker({ brands, categories, knownSkus, onDone, onClose }: {
  brands: Brand[];
  categories: Category[];
  knownSkus: Set<string>;
  onDone: (created: number) => void;
  onClose: () => void;
}) {
  const stock = useRows<StockRow>(() => supabase.from("stock_levels").select("sku, stock_group, description, available, incoming").order("stock_group").order("sku"));
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [publish, setPublish] = useState(true);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");

  const fresh = useMemo(() => stock.rows.filter((r) => !knownSkus.has(r.sku)), [stock.rows, knownSkus]);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of fresh) m.set(r.stock_group ?? "", (m.get(r.stock_group ?? "") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [fresh]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return fresh.filter(
      (r) => (!group || (r.stock_group ?? "") === group) && (!inStock || r.available > 0) && (!n || `${r.sku} ${r.description ?? ""}`.toLowerCase().includes(n)),
    );
  }, [fresh, q, group, inStock]);
  const allShown = shown.length > 0 && shown.every((r) => sel.has(r.sku));
  const toggle = (sku: string) => setSel((s) => { const x = new Set(s); if (x.has(sku)) x.delete(sku); else x.add(sku); return x; });
  const toggleAll = () => setSel((s) => { const x = new Set(s); for (const r of shown) if (allShown) x.delete(r.sku); else x.add(r.sku); return x; });

  async function create() {
    const picked = fresh.filter((r) => sel.has(r.sku));
    if (!picked.length) return;
    setBusy(true);
    setErr("");
    try {
      // a stock group with no brand yet gets one (same as the old bulk import)
      const brandList = [...brands];
      const { data: slugRows, error: se } = await supabase.from("products").select("slug");
      if (se) throw se;
      const slugs = new Set((slugRows ?? []).map((r) => r.slug as string));
      const uniq = (base: string, taken: Set<string>) => {
        let s = base || "p";
        while (taken.has(s)) s = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        taken.add(s);
        return s;
      };
      for (const g of new Set(picked.map((r) => r.stock_group).filter((g): g is string => !!g))) {
        if (brandForGroup(brandList, g)) continue;
        const { data, error } = await supabase
          .from("brands")
          .insert({ name: g, slug: uniq(slugify(g), new Set(brandList.map((b) => b.slug))), stock_groups: [g] })
          .select("*")
          .single();
        if (error) throw new Error(`แบรนด์ ${g}: ${errorMessage(error)}`);
        brandList.push(data as Brand);
      }
      let done = 0;
      for (const r of picked) {
        setProgress(`${done + 1} / ${picked.length}`);
        const name = (r.description ?? "").trim() || r.sku;
        const { data, error } = await supabase
          .from("products")
          .insert({
            name,
            slug: uniq(slugify(r.sku), slugs),
            summary: r.description,
            brand_id: brandForGroup(brandList, r.stock_group)?.id ?? null,
            category_id: category || null,
            is_published: publish,
          })
          .select("id")
          .single();
        if (error) throw new Error(`${r.sku}: ${errorMessage(error)}`);
        const { error: ve } = await supabase.from("product_variants").insert({ product_id: data.id, sku: r.sku, name: r.sku, detail: r.description });
        if (ve) {
          await supabase.from("products").delete().eq("id", data.id);
          throw new Error(`${r.sku}: ${errorMessage(ve)}`);
        }
        done++;
      }
      setSel(new Set());
      onDone(done);
    } catch (x) {
      setErr(errorMessage(x));
      stock.reload();
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <Card className="mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-navy-900">เพิ่มสินค้าจากรายการสต๊อก</h3>
          <p className="text-sm text-slate-500">เลือกรหัสที่อยากขึ้นหน้าเว็บ ระบบใส่ชื่อ รหัส และแบรนด์จากไฟล์สต๊อกให้ รูป รายละเอียด และราคาเพิ่มทีหลังได้ในหน้าแก้ไข</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-navy-800">ปิด</button>
      </div>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      {stock.loading ? (
        <Loading />
      ) : !fresh.length ? (
        <p className="text-sm text-slate-500">ทุกรหัสในไฟล์สต๊อกมีบนเว็บแล้ว (หรือยังไม่ได้ซิงก์สต๊อก)</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip on={!group} onClick={() => setGroup("")}>ทั้งหมด {fresh.length}</Chip>
            {groups.map(([g, n]) => {
              const b = brandForGroup(brands, g);
              return (
                <Chip key={g} on={group === g} onClick={() => setGroup(g)}>
                  {b?.name ?? (g || "ไม่มีกลุ่ม")} <span className="opacity-70">{b && b.name !== g ? `(${g}) ` : ""}{n}</span>
                </Chip>
              );
            })}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input type="search" className="!w-full sm:!w-72" placeholder="ค้นหารหัสหรือชื่อ" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> เฉพาะที่มีของ</label>
          </div>
          <div className="max-h-[55vh] overflow-y-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-10 p-2"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="เลือกทั้งหมด" /></th>
                  <th className="p-2">รหัส</th>
                  <th className="p-2">ชื่อในสต๊อก</th>
                  <th className="hidden p-2 sm:table-cell">แบรนด์</th>
                  <th className="p-2 text-right">คงเหลือ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.sku} onClick={() => toggle(r.sku)} className={cx("cursor-pointer", sel.has(r.sku) ? "bg-navy-50" : "hover:bg-slate-50")}>
                    <td className="p-2"><input type="checkbox" checked={sel.has(r.sku)} onChange={() => toggle(r.sku)} onClick={(e) => e.stopPropagation()} aria-label={r.sku} /></td>
                    <td className="p-2 font-mono text-xs">{r.sku}</td>
                    <td className="p-2">{r.description || "-"}</td>
                    <td className="hidden p-2 text-slate-500 sm:table-cell">{brandForGroup(brands, r.stock_group)?.name ?? <span title="จะสร้างแบรนด์ใหม่ให้">{r.stock_group ?? "-"} <Badge tone="amber">ใหม่</Badge></span>}</td>
                    <td className={cx("p-2 text-right tabular-nums", r.available > 0 ? "text-navy-900" : "text-slate-400")}>{formatQty(r.available)}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">ไม่พบรายการ</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-[14rem_1fr_auto]">
            <Field label="หมวดหมู่ (ไม่บังคับ)">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">-</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> แสดงบนหน้าเว็บทันที (ไม่ติ๊ก = เก็บเป็นแบบร่าง)</label>
            <Button onClick={create} loading={busy} disabled={!sel.size}>
              {busy ? `กำลังสร้าง ${progress}` : `สร้างสินค้า ${sel.size.toLocaleString("th-TH")} รายการ`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", on ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
      {children}
    </button>
  );
}
