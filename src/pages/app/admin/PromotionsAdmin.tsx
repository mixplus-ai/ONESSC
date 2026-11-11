import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Gate } from "../../../components/AppLayout";
import { ImageUpload } from "../../../components/ImageUpload";
import { XIcon } from "../../../components/icons";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { formatBaht, formatDate, formatQty, isRunning, slugify, uploadProductFile, type Package, type Promotion, type Variant } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { Tabs } from "../MyRequests";

type VRow = Variant & { products: { name: string; brands: { id: string; name: string } | null } };

/** datetime-local ⇄ ISO */
const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** Pick a SKU: choose a brand, then the product from a list that shows the sellable stock after each name (typing still searches). */
function VariantPicker({ variants, exclude, onPick }: { variants: VRow[]; exclude: Set<string>; onPick: (v: VRow) => void }) {
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const stock = useStockBoard();
  const brands = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variants) if (v.products?.brands) m.set(v.products.brands.id, v.products.brands.name);
    return [...m.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  }, [variants]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return variants
      .filter((v) => !exclude.has(v.id) && (!brand || (brand === "-" ? !v.products?.brands : v.products?.brands?.id === brand)) && (!n || [v.sku, v.name, v.products?.name].join(" ").toLowerCase().includes(n)))
      .sort((x, y) => (x.products?.name ?? "").localeCompare(y.products?.name ?? "") || x.sku.localeCompare(y.sku));
  }, [variants, exclude, brand, q]);
  const stockText = (sku: string) => {
    const s = stock.get(sku);
    if (s == null) return "ไม่มีในสต๊อก";
    return s > 0 ? `คงเหลือ ${formatQty(s)}` : `สต๊อก ${formatQty(s)}`;
  };
  return (
    <div className="grid gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200 sm:grid-cols-[11rem_12rem_1fr]">
      <Select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="แบรนด์">
        <option value="">ทุกแบรนด์</option>
        {brands.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        <option value="-">ไม่มีแบรนด์</option>
      </Select>
      <Input type="search" placeholder="ค้นหารหัส/ชื่อ (ไม่บังคับ)" value={q} onChange={(e) => setQ(e.target.value)} />
      <Select
        value=""
        aria-label="เลือกสินค้าเพื่อเพิ่ม"
        onChange={(e) => {
          const v = variants.find((x) => x.id === e.target.value);
          if (v) onPick(v);
        }}
      >
        <option value="">{list.length ? `+ เลือกสินค้าเพื่อเพิ่ม (${list.length.toLocaleString("th-TH")} รายการ)` : "ไม่พบสินค้า"}</option>
        {list.map((v) => (
          <option key={v.id} value={v.id}>
            {v.products?.name}{v.name !== v.sku && v.name !== v.products?.name ? ` ${v.name}` : ""} · {v.sku} — {stockText(v.sku)}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Sellable qty per SKU from the staff stock board (sheet available minus holds made in the app). */
function useStockBoard() {
  const [m, setM] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    supabase.rpc("stock_board").then(({ data }) => setM(new Map(((data ?? []) as { sku: string; sellable: number }[]).map((r) => [r.sku, Number(r.sellable)]))));
  }, []);
  return m;
}

function PromotionEditor({ initial, variants, onClose }: { initial: Partial<Promotion>; variants: VRow[]; onClose: (saved: boolean) => void }) {
  const [p, setP] = useState<Partial<Promotion>>({ is_published: false, sort: 0, ...initial });
  const [items, setItems] = useState<{ variant_id: string; promo_price: string }[]>(
    (initial.promotion_items ?? []).map((i) => ({ variant_id: i.variant_id, promo_price: String(i.promo_price) })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const row = {
        title: (p.title ?? "").trim(),
        description: p.description || null,
        banner_url: p.banner_url || null,
        starts_at: p.starts_at || null,
        ends_at: p.ends_at || null,
        is_published: !!p.is_published,
        sort: p.sort ?? 0,
      };
      let id = p.id;
      if (id) {
        const { error } = await supabase.from("promotions").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("promotions").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      const { error: dErr } = await supabase.from("promotion_items").delete().eq("promotion_id", id);
      if (dErr) throw dErr;
      const rows = items.filter((i) => i.promo_price !== "").map((i) => ({ promotion_id: id, variant_id: i.variant_id, promo_price: Number(i.promo_price) }));
      if (rows.length) {
        const { error } = await supabase.from("promotion_items").insert(rows);
        if (error) throw error;
      }
      onClose(true);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!p.id || !confirm(`ลบโปรโมชั่น “${p.title}”?`)) return;
    const { error } = await supabase.from("promotions").delete().eq("id", p.id);
    if (error) return setErr(errorMessage(error));
    onClose(true);
  }

  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><Field label="ชื่อโปรโมชั่น" required><Input required value={p.title ?? ""} onChange={(e) => setP({ ...p, title: e.target.value })} /></Field></div>
        <Field label="เริ่ม" hint="ว่าง = เริ่มทันที"><Input type="datetime-local" value={toLocal(p.starts_at)} onChange={(e) => setP({ ...p, starts_at: fromLocal(e.target.value) })} /></Field>
        <Field label="สิ้นสุด" hint="ว่าง = ไม่มีวันหมด"><Input type="datetime-local" value={toLocal(p.ends_at)} onChange={(e) => setP({ ...p, ends_at: fromLocal(e.target.value) })} /></Field>
        <div className="sm:col-span-2 lg:col-span-4"><Field label="รายละเอียด / เงื่อนไข"><Textarea rows={3} value={p.description ?? ""} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="แบนเนอร์"><ImageUpload folder="promotions" upload={uploadProductFile} value={p.banner_url ?? ""} onChange={(v) => setP({ ...p, banner_url: v })} /></Field></div>
        <div className="space-y-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.is_published} onChange={(e) => setP({ ...p, is_published: e.target.checked })} /> เผยแพร่</label>
          <Field label="ลำดับ"><Input type="number" value={p.sort ?? 0} onChange={(e) => setP({ ...p, sort: Number(e.target.value) || 0 })} /></Field>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <h3 className="mb-2 font-semibold text-navy-900">สินค้าในโปรโมชั่น (ราคาโปรเห็นเหมือนกันทุกคน)</h3>
          <div className="space-y-2">
            {items.map((i) => {
              const v = byId.get(i.variant_id);
              return (
                <div key={i.variant_id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-mono text-xs text-slate-500">{v?.sku}</span> · {v?.products?.name}</span>
                  <span className="text-slate-400">ปกติ {formatBaht(v?.base_price)}</span>
                  <Input className="!w-32" type="number" min="0" step="0.01" required value={i.promo_price} onChange={(e) => setItems(items.map((x) => (x.variant_id === i.variant_id ? { ...x, promo_price: e.target.value } : x)))} placeholder="ราคาโปร" />
                  <button type="button" onClick={() => setItems(items.filter((x) => x.variant_id !== i.variant_id))} className="text-slate-400 hover:text-red-600" aria-label="เอาออก"><XIcon className="h-4 w-4" /></button>
                </div>
              );
            })}
            <VariantPicker variants={variants} exclude={new Set(items.map((i) => i.variant_id))} onPick={(v) => setItems([...items, { variant_id: v.id, promo_price: v.base_price?.toString() ?? "" }])} />
          </div>
        </div>
        {err && <div className="sm:col-span-2 lg:col-span-4"><Alert>{err}</Alert></div>}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" loading={busy}>บันทึก</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)}>ยกเลิก</Button>
          {p.id && <Button type="button" variant="danger" className="ml-auto" onClick={remove}>ลบ</Button>}
        </div>
      </form>
    </Card>
  );
}

function PackageEditor({ initial, variants, onClose }: { initial: Partial<Package>; variants: VRow[]; onClose: (saved: boolean) => void }) {
  const [p, setP] = useState<Partial<Package>>({ is_published: false, sort: 0, ...initial });
  const [items, setItems] = useState<{ variant_id: string; qty: string }[]>(
    [...(initial.package_items ?? [])].sort((a, b) => a.sort - b.sort).map((i) => ({ variant_id: i.variant_id, qty: String(i.qty) })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const sumBase = items.reduce((s, i) => s + Number(byId.get(i.variant_id)?.base_price ?? 0) * Number(i.qty || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const row = {
        name: (p.name ?? "").trim(),
        code: (p.code ?? "").trim() || null,
        slug: p.slug || slugify(p.name ?? ""),
        summary: p.summary || null,
        description: p.description || null,
        cover_url: p.cover_url || null,
        price: p.price ?? null,
        starts_at: p.starts_at || null,
        ends_at: p.ends_at || null,
        is_published: !!p.is_published,
        sort: p.sort ?? 0,
      };
      let id = p.id;
      if (id) {
        const { error } = await supabase.from("packages").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("packages").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      const { error: dErr } = await supabase.from("package_items").delete().eq("package_id", id);
      if (dErr) throw dErr;
      const rows = items.map((i, idx) => ({ package_id: id, variant_id: i.variant_id, qty: Number(i.qty) || 1, sort: idx }));
      if (rows.length) {
        const { error } = await supabase.from("package_items").insert(rows);
        if (error) throw error;
      }
      onClose(true);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!p.id || !confirm(`ลบแพ็กเกจ “${p.name}”?`)) return;
    const { error } = await supabase.from("packages").delete().eq("id", p.id);
    if (error) return setErr(errorMessage(error));
    onClose(true);
  }

  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><Field label="ชื่อแพ็กเกจ" required><Input required value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field></div>
        <Field label="รหัสแพ็กเกจ" hint="ใช้เหมือนรหัสสินค้า เช่น PKG-10K"><Input className="font-mono" value={p.code ?? ""} placeholder="PKG-001" pattern="[A-Za-z0-9][A-Za-z0-9._/\-]{0,39}" onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="slug"><Input value={p.slug ?? ""} placeholder={slugify(p.name || "package")} onChange={(e) => setP({ ...p, slug: e.target.value.toLowerCase() })} pattern="[a-z0-9][a-z0-9-]*" /></Field>
        <Field
          label="ราคาแพ็กเกจ (ราคาลด)"
          hint={
            <span className="flex flex-wrap items-center gap-x-2">
              <span>ราคาเต็ม {formatBaht(sumBase)}</span>
              {sumBase > 0 && p.price != null && p.price < sumBase && <span className="font-semibold text-red-600">ลด {Math.round((1 - p.price / sumBase) * 100)}%</span>}
              {sumBase > 0 && (
                <span className="flex items-center gap-1">
                  · ลด
                  <input
                    type="number" min="1" max="99" placeholder="%" aria-label="ลดกี่เปอร์เซ็นต์"
                    className="w-12 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    onChange={(e) => { const x = Number(e.target.value); if (x > 0 && x < 100) setP({ ...p, price: Math.round(sumBase * (1 - x / 100)) }); }}
                  />
                  %
                </span>
              )}
            </span>
          }
        >
          <Input type="number" min="0" step="0.01" value={p.price ?? ""} onChange={(e) => setP({ ...p, price: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-4"><Field label="คำอธิบายสั้น"><Input value={p.summary ?? ""} onChange={(e) => setP({ ...p, summary: e.target.value })} /></Field></div>
        <div className="sm:col-span-2 lg:col-span-4"><Field label="รายละเอียด"><Textarea rows={3} value={p.description ?? ""} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field></div>
        <Field label="เริ่ม"><Input type="datetime-local" value={toLocal(p.starts_at)} onChange={(e) => setP({ ...p, starts_at: fromLocal(e.target.value) })} /></Field>
        <Field label="สิ้นสุด"><Input type="datetime-local" value={toLocal(p.ends_at)} onChange={(e) => setP({ ...p, ends_at: fromLocal(e.target.value) })} /></Field>
        <div className="sm:col-span-2"><Field label="รูปปก"><ImageUpload folder="packages" upload={uploadProductFile} value={p.cover_url ?? ""} onChange={(v) => setP({ ...p, cover_url: v })} /></Field></div>
        <div className="sm:col-span-2 lg:col-span-4">
          <h3 className="mb-2 font-semibold text-navy-900">สินค้าในแพ็กเกจ</h3>
          <div className="space-y-2">
            {items.map((i) => {
              const v = byId.get(i.variant_id);
              return (
                <div key={i.variant_id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-mono text-xs text-slate-500">{v?.sku}</span> · {v?.products?.name}</span>
                  <span className="flex items-center gap-1">จำนวน <Input className="!w-20" type="number" min="1" step="1" value={i.qty} onChange={(e) => setItems(items.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: e.target.value } : x)))} /> {v?.unit}</span>
                  <button type="button" onClick={() => setItems(items.filter((x) => x.variant_id !== i.variant_id))} className="text-slate-400 hover:text-red-600" aria-label="เอาออก"><XIcon className="h-4 w-4" /></button>
                </div>
              );
            })}
            <VariantPicker variants={variants} exclude={new Set(items.map((i) => i.variant_id))} onPick={(v) => setItems([...items, { variant_id: v.id, qty: "1" }])} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.is_published} onChange={(e) => setP({ ...p, is_published: e.target.checked })} /> เผยแพร่</label>
        {err && <div className="sm:col-span-2 lg:col-span-4"><Alert>{err}</Alert></div>}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" loading={busy}>บันทึก</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)}>ยกเลิก</Button>
          {p.id && <Button type="button" variant="danger" className="ml-auto" onClick={remove}>ลบ</Button>}
        </div>
      </form>
    </Card>
  );
}

function StatusBadge({ x }: { x: { is_published: boolean; starts_at: string | null; ends_at: string | null } }) {
  if (!x.is_published) return <Badge>ร่าง</Badge>;
  if (x.ends_at && new Date(x.ends_at) <= new Date()) return <Badge tone="red">หมดเวลา</Badge>;
  if (!isRunning(x)) return <Badge tone="amber">ตั้งเวลาไว้</Badge>;
  return <Badge tone="green">กำลังใช้งาน</Badge>;
}

export default function PromotionsAdmin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"promotions" | "packages">("promotions");
  const variants = useRows<VRow>(() => supabase.from("product_variants").select("*, products(name, brands(id, name))").order("sku"));
  const promos = useRows<Promotion>(() => supabase.from("promotions").select("*, promotion_items(variant_id, promo_price)").order("sort").order("created_at", { ascending: false }));
  const packages = useRows<Package>(() => supabase.from("packages").select("*, package_items(variant_id, qty, sort)").order("sort").order("name"));
  const [editPromo, setEditPromo] = useState<Partial<Promotion> | null>(null);
  const [editPkg, setEditPkg] = useState<Partial<Package> | null>(null);

  const period = (x: { starts_at: string | null; ends_at: string | null }) => `${x.starts_at ? formatDate(x.starts_at) : "ตอนนี้"} – ${x.ends_at ? formatDate(x.ends_at) : "ไม่กำหนด"}`;

  return (
    <Gate allow={can("products")}>
      <PageTitle
        title="โปรโมชั่นและแพ็กเกจ"
        subtitle="ราคาโปรโมชั่นแสดงให้ทุกคนและมาก่อนราคาเฉพาะบริษัท"
        actions={tab === "promotions" ? !editPromo && <Button onClick={() => setEditPromo({})}>+ โปรโมชั่น</Button> : !editPkg && <Button onClick={() => setEditPkg({})}>+ แพ็กเกจ</Button>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "promotions", label: "โปรโมชั่น" }, { key: "packages", label: "แพ็กเกจ" }]} />
      {tab === "promotions" && (
        <>
          {editPromo && <PromotionEditor key={editPromo.id ?? "new"} initial={editPromo} variants={variants.rows} onClose={(s) => { setEditPromo(null); if (s) promos.reload(); }} />}
          {promos.loading ? <Loading /> : promos.rows.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {promos.rows.map((p) => (
                <Card key={p.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy-900">{p.title}</p>
                      <p className="text-xs text-slate-500">{period(p)} · {(p.promotion_items ?? []).length} รายการ</p>
                    </div>
                    <StatusBadge x={p} />
                  </div>
                  <button onClick={() => setEditPromo(p)} className="mt-2 text-sm font-semibold text-navy-700 hover:underline">แก้ไข</button>
                </Card>
              ))}
            </div>
          ) : <Empty>ยังไม่มีโปรโมชั่น</Empty>}
        </>
      )}
      {tab === "packages" && (
        <>
          {editPkg && <PackageEditor key={editPkg.id ?? "new"} initial={editPkg} variants={variants.rows} onClose={(s) => { setEditPkg(null); if (s) packages.reload(); }} />}
          {packages.loading ? <Loading /> : packages.rows.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {packages.rows.map((p) => (
                <Card key={p.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy-900">{p.code && <span className="mr-1.5 font-mono text-xs text-slate-500">{p.code}</span>}{p.name}</p>
                      <p className="text-xs text-slate-500">{formatBaht(p.price)} · {(p.package_items ?? []).length} รายการ · {period(p)}</p>
                    </div>
                    <StatusBadge x={p} />
                  </div>
                  <button onClick={() => setEditPkg(p)} className="mt-2 text-sm font-semibold text-navy-700 hover:underline">แก้ไข</button>
                </Card>
              ))}
            </div>
          ) : <Empty>ยังไม่มีแพ็กเกจ</Empty>}
        </>
      )}
    </Gate>
  );
}
