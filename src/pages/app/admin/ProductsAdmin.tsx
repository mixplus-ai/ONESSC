import { useMemo, useState, type FormEvent } from "react";
import { Gate } from "../../../components/AppLayout";
import { FileUpload, GalleryUpload, ImageUpload } from "../../../components/ImageUpload";
import { BoxIcon, XIcon } from "../../../components/icons";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select, Textarea, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { formatBaht, productImage, slugify, uploadProductFile, type Brand, type Category, type Product, type Spec, type Variant } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { Tabs } from "../MyRequests";
import { StockPicker } from "./StockPicker";

// ---------------------------------------------------------------------------
// Spec rows editor
// ---------------------------------------------------------------------------
export function SpecEditor({ value, onChange }: { value: Spec[]; onChange: (v: Spec[]) => void }) {
  const set = (i: number, k: keyof Spec, v: string) => onChange(value.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="flex gap-2">
          <Input className="!w-2/5" placeholder="หัวข้อ เช่น กำลังไฟ" value={s.label} onChange={(e) => set(i, "label", e.target.value)} />
          <Input placeholder="ค่า เช่น 10 kW" value={s.value} onChange={(e) => set(i, "value", e.target.value)} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-lg px-2 text-slate-400 hover:text-red-600" aria-label="ลบแถว"><XIcon className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { label: "", value: "" }])} className="text-sm font-semibold text-navy-700 hover:underline">+ เพิ่มแถวสเปก</button>
    </div>
  );
}

/** "label: value" per line ⇄ Spec[] (fast paste from datasheets) */
const specsFromText = (t: string): Spec[] =>
  t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.search(/[:\t]/);
    return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: "" };
  });

type VariantDraft = Omit<Variant, "id" | "product_id"> & { id?: string; _key: string };
const newVariant = (sort: number): VariantDraft => ({ _key: crypto.randomUUID(), sku: "", name: "", detail: "", specs: [], unit: "ชิ้น", base_price: null, is_active: true, sort });

// ---------------------------------------------------------------------------
// Product editor
// ---------------------------------------------------------------------------
function ProductEditor({ initial, brands, categories, onClose }: { initial: Partial<Product>; brands: Brand[]; categories: Category[]; onClose: (saved: boolean) => void }) {
  const [p, setP] = useState({
    name: "", slug: "", summary: "", description: "", specs: [] as Spec[], tags: [] as string[], cover_url: "", images: [] as string[],
    datasheet_url: "", manual_url: "", video_url: "", brand_id: "", category_id: "", is_published: false, is_featured: false, sort: 0,
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ""])),
  } as Product & { brand_id: string; category_id: string });
  const [variants, setVariants] = useState<VariantDraft[]>(
    (initial.product_variants ?? []).slice().sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku)).map((v) => ({ ...v, _key: v.id })),
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [tagText, setTagText] = useState((initial.tags ?? []).join(", "));
  const [specPaste, setSpecPaste] = useState("");
  const [moveSku, setMoveSku] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((x) => ({ ...x, [k]: v }));
  const setV = (key: string, patch: Partial<VariantDraft>) => setVariants((vs) => vs.map((v) => (v._key === key ? { ...v, ...patch } : v)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const row = {
      name: p.name.trim(),
      slug: (p.slug || slugify(p.name)).trim(),
      summary: p.summary || null,
      description: p.description || null,
      specs: p.specs.filter((s) => s.label.trim()),
      tags: tagText.split(",").map((t) => t.trim()).filter(Boolean),
      cover_url: p.cover_url || null,
      images: p.images,
      datasheet_url: p.datasheet_url || null,
      manual_url: p.manual_url || null,
      video_url: p.video_url || null,
      brand_id: p.brand_id || null,
      category_id: p.category_id || null,
      is_published: p.is_published,
      is_featured: p.is_featured,
      sort: p.sort,
    };
    try {
      let id = p.id;
      if (id) {
        const { error } = await supabase.from("products").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      if (removed.length) {
        const { error } = await supabase.from("product_variants").delete().in("id", removed);
        if (error) throw error;
      }
      for (const v of variants) {
        if (!v.sku.trim()) continue;
        const vr = {
          product_id: id,
          sku: v.sku.trim(),
          name: v.name.trim() || v.sku.trim(),
          detail: v.detail || null,
          specs: v.specs.filter((s) => s.label.trim()),
          unit: v.unit || "ชิ้น",
          base_price: v.base_price,
          is_active: v.is_active,
          sort: v.sort,
        };
        const { error } = v.id ? await supabase.from("product_variants").update(vr).eq("id", v.id) : await supabase.from("product_variants").insert(vr);
        if (error) throw new Error(`${v.sku}: ${errorMessage(error)}`);
      }
      onClose(true);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!p.id || !confirm(`ลบสินค้า “${p.name}” และรหัสสินค้าทั้งหมดในนี้?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return setErr(errorMessage(error) + " (ถ้ารหัสนี้เคยถูกจอง ให้ปิดการขายแทนการลบ)");
    onClose(true);
  }

  async function moveIn() {
    if (!p.id) return setErr("บันทึกสินค้านี้ก่อน แล้วจึงดึงรหัสจากสินค้าอื่นเข้ามา");
    const sku = moveSku.trim();
    const { data, error } = await supabase.from("product_variants").select("*").eq("sku", sku).maybeSingle();
    if (error || !data) return setErr(`ไม่พบรหัส ${sku}`);
    const { error: e2 } = await supabase.rpc("move_variant", { p_variant_id: data.id, p_product_id: p.id });
    if (e2) return setErr(errorMessage(e2));
    setVariants((vs) => [...vs.filter((v) => v.id !== data.id), { ...(data as Variant), _key: data.id }]);
    setMoveSku("");
    setMsg(`ย้าย ${sku} เข้ามาแล้ว (ใช้รูปของสินค้านี้)`);
  }

  return (
    <Card className="mb-6">
      <form onSubmit={save} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2"><Field label="ชื่อสินค้า / รุ่น" required><Input value={p.name} onChange={(e) => set("name", e.target.value)} required /></Field></div>
          <Field label="แบรนด์">
            <Select value={p.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value)}>
              <option value="">-</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="หมวดหมู่">
            <Select value={p.category_id ?? ""} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">-</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><Field label="ลิงก์หน้า (slug)" hint="อังกฤษตัวเล็ก ตัวเลข และ - เว้นว่างให้ระบบสร้าง"><Input value={p.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder={slugify(p.name || "product")} pattern="[a-z0-9][a-z0-9-]*" /></Field></div>
          <div className="sm:col-span-2"><Field label="แท็ก" hint="คั่นด้วย ,"><Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="hybrid, 3 เฟส" /></Field></div>
          <div className="sm:col-span-2 lg:col-span-4"><Field label="คำอธิบายสั้น"><Input value={p.summary ?? ""} onChange={(e) => set("summary", e.target.value)} /></Field></div>
          <div className="sm:col-span-2 lg:col-span-4"><Field label="รายละเอียด"><Textarea rows={4} value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="รูปหลัก (ใช้ร่วมกันทุกรหัส)"><ImageUpload folder="products" upload={uploadProductFile} value={p.cover_url ?? ""} onChange={(v) => set("cover_url", v)} /></Field>
          <Field label="รูปเพิ่มเติม"><GalleryUpload folder="products" upload={uploadProductFile} value={p.images} onChange={(v) => set("images", v)} /></Field>
          <Field label="Datasheet (PDF)"><FileUpload folder="docs" upload={uploadProductFile} value={p.datasheet_url ?? ""} onChange={(v) => set("datasheet_url", v)} /></Field>
          <Field label="คู่มือ (PDF)"><FileUpload folder="docs" upload={uploadProductFile} value={p.manual_url ?? ""} onChange={(v) => set("manual_url", v)} /></Field>
          <Field label="ลิงก์วิดีโอ"><Input value={p.video_url ?? ""} onChange={(e) => set("video_url", e.target.value)} placeholder="https://youtube.com/..." /></Field>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="สเปกของสินค้า (ทุกรหัสเหมือนกัน)"><SpecEditor value={p.specs} onChange={(v) => set("specs", v)} /></Field>
          <Field label="วางสเปกทีละบรรทัด" hint='รูปแบบ "หัวข้อ: ค่า" แล้วกด เพิ่ม'>
            <Textarea rows={4} value={specPaste} onChange={(e) => setSpecPaste(e.target.value)} placeholder={"กำลังไฟ: 10 kW\nแรงดัน: 400 V"} />
            <button type="button" className="mt-1 text-sm font-semibold text-navy-700 hover:underline" onClick={() => { set("specs", [...p.specs, ...specsFromText(specPaste)]); setSpecPaste(""); }}>เพิ่ม</button>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-semibold text-navy-900">รหัสสินค้า (SKU) ในรุ่นนี้</h3>
              <p className="text-xs text-slate-500">รหัสต้องตรงกับคอลัมน์ “รหัสสินค้า” ในไฟล์สต๊อก ทุกรหัสใช้รูปเดียวกัน แต่รายละเอียดและราคาแยกกัน</p>
            </div>
            <div className="flex gap-2">
              <Input className="!w-44" placeholder="ดึงรหัสจากสินค้าอื่น" value={moveSku} onChange={(e) => setMoveSku(e.target.value)} />
              <Button type="button" variant="secondary" onClick={moveIn} disabled={!moveSku.trim()}>ดึงเข้า</Button>
            </div>
          </div>
          <div className="space-y-3">
            {variants.map((v) => (
              <div key={v._key} className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-6">
                <Field label="รหัสสินค้า" required><Input value={v.sku} onChange={(e) => setV(v._key, { sku: e.target.value })} className="font-mono" /></Field>
                <div className="lg:col-span-2"><Field label="ชื่อรุ่นย่อย"><Input value={v.name} placeholder={v.sku} onChange={(e) => setV(v._key, { name: e.target.value })} /></Field></div>
                <Field label="ราคาปกติ (บาท)" hint="ว่าง = สอบถามราคา"><Input type="number" min="0" step="0.01" value={v.base_price ?? ""} onChange={(e) => setV(v._key, { base_price: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                <Field label="หน่วย"><Input value={v.unit} onChange={(e) => setV(v._key, { unit: e.target.value })} /></Field>
                <div className="flex items-end gap-3 pb-2">
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={v.is_active} onChange={(e) => setV(v._key, { is_active: e.target.checked })} /> เปิดขาย</label>
                  <button type="button" className="ml-auto text-sm text-red-600 hover:underline" onClick={() => { if (v.id) setRemoved((r) => [...r, v.id as string]); setVariants((vs) => vs.filter((x) => x._key !== v._key)); }}>ลบ</button>
                </div>
                <div className="sm:col-span-2 lg:col-span-6"><Field label="รายละเอียดเฉพาะรหัสนี้"><Input value={v.detail ?? ""} onChange={(e) => setV(v._key, { detail: e.target.value })} /></Field></div>
              </div>
            ))}
            <button type="button" onClick={() => setVariants((vs) => [...vs, newVariant(vs.length)])} className="text-sm font-semibold text-navy-700 hover:underline">+ เพิ่มรหัสสินค้า</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.is_published} onChange={(e) => set("is_published", e.target.checked)} /> แสดงบนหน้าเว็บ</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.is_featured} onChange={(e) => set("is_featured", e.target.checked)} /> สินค้าแนะนำ (แสดงก่อน)</label>
          <label className="flex items-center gap-2 text-sm">ลำดับ <Input type="number" className="!w-20" value={p.sort} onChange={(e) => set("sort", Number(e.target.value) || 0)} /></label>
        </div>
        {msg && <Alert tone="green">{msg}</Alert>}
        {err && <Alert>{err}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>บันทึก</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)}>ยกเลิก</Button>
          {p.id && <Button type="button" variant="danger" className="ml-auto" onClick={remove}>ลบสินค้า</Button>}
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Brands & categories
// ---------------------------------------------------------------------------
function BrandsTab() {
  const list = useRows<Brand>(() => supabase.from("brands").select("*").order("sort").order("name"));
  const [edit, setEdit] = useState<Partial<Brand> | null>(null);
  const [groups, setGroups] = useState("");
  const [err, setErr] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const row = {
      name: (edit.name ?? "").trim(),
      slug: edit.slug || slugify(edit.name ?? ""),
      logo_url: edit.logo_url || null,
      description: edit.description || null,
      stock_groups: groups.split(",").map((g) => g.trim()).filter(Boolean),
      is_published: edit.is_published ?? true,
      sort: edit.sort ?? 0,
    };
    const { error } = edit.id ? await supabase.from("brands").update(row).eq("id", edit.id) : await supabase.from("brands").insert(row);
    if (error) return setErr(errorMessage(error));
    setEdit(null);
    list.reload();
  }
  return (
    <>
      {edit ? (
        <Card className="mb-4">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="ชื่อแบรนด์" required><Input required value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="slug"><Input value={edit.slug ?? ""} placeholder={slugify(edit.name ?? "brand")} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase() })} /></Field>
            <Field label="กลุ่มในไฟล์สต๊อก" hint="เช่น SLE-IVT, SLE-SPP"><Input value={groups} onChange={(e) => setGroups(e.target.value)} /></Field>
            <Field label="ลำดับ"><Input type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) || 0 })} /></Field>
            <div className="sm:col-span-2"><Field label="โลโก้"><ImageUpload folder="brands" upload={uploadProductFile} value={edit.logo_url ?? ""} onChange={(v) => setEdit({ ...edit, logo_url: v })} /></Field></div>
            <div className="sm:col-span-2"><Field label="คำอธิบาย"><Textarea rows={2} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_published ?? true} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} /> แสดงบนหน้าเว็บ</label>
            {err && <div className="sm:col-span-2 lg:col-span-4"><Alert>{err}</Alert></div>}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit">บันทึก</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>ยกเลิก</Button></div>
          </form>
        </Card>
      ) : (
        <div className="mb-4"><Button onClick={() => { setEdit({}); setGroups(""); setErr(""); }}>+ เพิ่มแบรนด์</Button></div>
      )}
      {list.loading ? <Loading /> : (
        <Card className="!p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">แบรนด์</th><th className="p-3">กลุ่มในไฟล์สต๊อก</th><th className="p-3">สถานะ</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.rows.map((b) => (
                <tr key={b.id}>
                  <td className="p-3 font-medium">{b.name}</td>
                  <td className="p-3 font-mono text-xs">{b.stock_groups.join(", ")}</td>
                  <td className="p-3">{b.is_published ? <Badge tone="green">แสดง</Badge> : <Badge>ซ่อน</Badge>}</td>
                  <td className="p-3 text-right"><button className="font-semibold text-navy-700 hover:underline" onClick={() => { setEdit(b); setGroups(b.stock_groups.join(", ")); setErr(""); }}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function CategoriesTab() {
  const list = useRows<Category>(() => supabase.from("product_categories").select("*").order("sort").order("name"));
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("product_categories").insert({ name: name.trim(), slug: slugify(name), sort: (list.rows.at(-1)?.sort ?? 0) + 10 });
    if (error) return setErr(errorMessage(error));
    setName("");
    list.reload();
  }
  async function rename(c: Category) {
    const n = prompt("ชื่อหมวดหมู่", c.name);
    if (!n || n === c.name) return;
    const { error } = await supabase.from("product_categories").update({ name: n.trim() }).eq("id", c.id);
    if (error) return setErr(errorMessage(error));
    list.reload();
  }
  async function remove(c: Category) {
    if (!confirm(`ลบหมวด “${c.name}”? สินค้าในหมวดนี้จะไม่มีหมวด`)) return;
    const { error } = await supabase.from("product_categories").delete().eq("id", c.id);
    if (error) return setErr(errorMessage(error));
    list.reload();
  }
  return (
    <Card>
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input placeholder="ชื่อหมวดหมู่ใหม่ (ใช้ภาษาอังกฤษบางส่วนเพื่อให้ได้ slug)" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit">เพิ่ม</Button>
      </form>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <ul className="divide-y divide-slate-100">
        {list.rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{c.name} <span className="font-mono text-xs text-slate-400">{c.slug}</span></span>
            <span className="flex gap-3"><button className="text-navy-700 hover:underline" onClick={() => rename(c)}>เปลี่ยนชื่อ</button><button className="text-red-600 hover:underline" onClick={() => remove(c)}>ลบ</button></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ProductsAdmin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"products" | "brands" | "categories">("products");
  const brands = useRows<Brand>(() => supabase.from("brands").select("*").order("sort").order("name"), [tab]);
  const categories = useRows<Category>(() => supabase.from("product_categories").select("*").order("sort").order("name"), [tab]);
  const list = useRows<Product>(() => supabase.from("products").select("*, brands(id, name, slug), product_categories(id, name, slug), product_variants(*)").order("sort").order("name"));
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [state, setState] = useState<"" | "published" | "draft">("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list.rows.filter(
      (p) =>
        (!brand || p.brand_id === brand) &&
        (!state || (state === "published") === p.is_published) &&
        (!n || [p.name, p.summary, ...(p.product_variants ?? []).map((v) => v.sku)].join(" ").toLowerCase().includes(n)),
    );
  }, [list.rows, q, brand, state]);

  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const knownSkus = useMemo(() => new Set(list.rows.flatMap((p) => (p.product_variants ?? []).map((v) => v.sku))), [list.rows]);
  const selling = (p: Product) => (p.product_variants ?? []).some((v) => v.is_active);

  /** แสดง/ซ่อน on the website (products.is_published) and เปิด/ปิดขาย (every SKU's is_active) for one or many products. */
  async function setFlag(ids: string[], what: "publish" | "sell", on: boolean) {
    if (!ids.length) return;
    setBulkBusy(true);
    setErr("");
    const { error } =
      what === "publish"
        ? await supabase.from("products").update({ is_published: on }).in("id", ids)
        : await supabase.from("product_variants").update({ is_active: on }).in("product_id", ids);
    setBulkBusy(false);
    if (error) return setErr(errorMessage(error));
    setMsg(`${what === "publish" ? (on ? "แสดงบนเว็บ" : "ซ่อนจากเว็บ") : on ? "เปิดขาย" : "ปิดขาย"} ${ids.length.toLocaleString("th-TH")} รายการแล้ว`);
    list.reload();
  }
  const toggleCheck = (id: string) => setChecked((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const allChecked = rows.length > 0 && rows.every((p) => checked.has(p.id));
  const ids = rows.filter((p) => checked.has(p.id)).map((p) => p.id);

  return (
    <Gate allow={can("products")}>
      <PageTitle
        title="สินค้า"
        subtitle="แคตตาล็อก รูป สเปก ราคาปกติ และรหัสสินค้าที่ผูกกับสต๊อก"
        actions={tab === "products" && !editing && (
          <>
            <Button variant="secondary" onClick={() => { setPicking(true); setMsg(""); }}>+ เพิ่มจากสต๊อก</Button>
            <Button onClick={() => setEditing({})}>+ เพิ่มสินค้า</Button>
          </>
        )}
      />
      <Tabs value={tab} onChange={(t) => { setTab(t); setEditing(null); }} tabs={[{ key: "products", label: "สินค้า" }, { key: "brands", label: "แบรนด์" }, { key: "categories", label: "หมวดหมู่" }]} />
      {tab === "brands" && <BrandsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "products" && (
        <>
          {msg && <div className="mb-4"><Alert tone="green">{msg}</Alert></div>}
          {err && <div className="mb-4"><Alert>{err}</Alert></div>}
          {picking && !editing && (
            <StockPicker
              brands={brands.rows}
              categories={categories.rows}
              knownSkus={knownSkus}
              onClose={() => setPicking(false)}
              onDone={(n) => { setPicking(false); setMsg(`สร้างสินค้า ${n.toLocaleString("th-TH")} รายการแล้ว กด “แก้ไข” เพื่อใส่รูป รายละเอียด และราคา รหัสที่เป็นรุ่นเดียวกันรวมได้ด้วยปุ่ม “ดึงเข้า”`); list.reload(); brands.reload(); }}
            />
          )}
          {editing && (
            <ProductEditor key={editing.id ?? "new"} initial={editing} brands={brands.rows} categories={categories.rows} onClose={(saved) => { setEditing(null); if (saved) list.reload(); }} />
          )}
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input type="search" placeholder="ค้นหาชื่อหรือรหัสสินค้า" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">ทุกแบรนด์</option>
              {brands.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
              <option value="">ทุกสถานะ</option>
              <option value="published">แสดงบนเว็บ</option>
              <option value="draft">ซ่อนอยู่</option>
            </Select>
          </div>
          {list.loading ? (
            <Loading />
          ) : rows.length ? (
            <Card className="!p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 text-sm">
                <label className="flex items-center gap-2 font-medium text-slate-600">
                  <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((p) => p.id)))} />
                  {ids.length ? `เลือก ${ids.length.toLocaleString("th-TH")} รายการ` : `${rows.length.toLocaleString("th-TH")} รายการ`}
                </label>
                {ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="secondary" disabled={bulkBusy} onClick={() => setFlag(ids, "publish", true)}>แสดงบนเว็บ</Button>
                    <Button variant="secondary" disabled={bulkBusy} onClick={() => setFlag(ids, "publish", false)}>ซ่อน</Button>
                    <Button variant="secondary" disabled={bulkBusy} onClick={() => setFlag(ids, "sell", true)}>เปิดขาย</Button>
                    <Button variant="secondary" disabled={bulkBusy} onClick={() => setFlag(ids, "sell", false)}>ปิดขาย</Button>
                    <button type="button" onClick={() => setChecked(new Set())} className="px-2 text-slate-500 hover:text-navy-800">ยกเลิก</button>
                  </div>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {rows.map((p) => {
                  const vs = p.product_variants ?? [];
                  const prices = vs.map((v) => v.base_price).filter((x): x is number => x != null);
                  const on = selling(p);
                  return (
                    <li key={p.id} className={cx("flex items-center gap-3 p-3", checked.has(p.id) && "bg-navy-50/60")}>
                      <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggleCheck(p.id)} aria-label={p.name} />
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                        {productImage(p) ? <img src={productImage(p)} alt="" className="h-full w-full object-contain" /> : <BoxIcon className="text-slate-300" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cx("truncate font-semibold", p.is_published ? "text-navy-900" : "text-slate-400")}>{p.name}</p>
                        <p className="truncate font-mono text-xs text-slate-500">{vs.map((v) => v.sku).join(" · ") || "ยังไม่มีรหัสสินค้า"}</p>
                        <p className="text-xs text-slate-500">{p.brands?.name ?? "ไม่มีแบรนด์"}{p.product_categories && ` · ${p.product_categories.name}`} · {prices.length ? formatBaht(Math.min(...prices)) : "ไม่มีราคา"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                        <Toggle on={p.is_published} disabled={bulkBusy} onChange={(v) => setFlag([p.id], "publish", v)} label={p.is_published ? "แสดง" : "ซ่อน"} />
                        {vs.length > 0 && <Toggle on={on} disabled={bulkBusy} onChange={(v) => setFlag([p.id], "sell", v)} label={on ? "เปิดขาย" : "ปิดขาย"} />}
                        <button onClick={() => { setEditing(p); setPicking(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-sm font-semibold text-navy-700 hover:underline sm:ml-2">แก้ไข</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <Empty>{list.rows.length ? "ไม่พบสินค้าตามเงื่อนไข" : "ยังไม่มีสินค้า ซิงก์สต๊อกก่อน แล้วกด “เพิ่มจากสต๊อก” หรือเพิ่มสินค้าเอง"}</Empty>
          )}
        </>
      )}
    </Gate>
  );
}

/** Small on/off switch with its current state as the label. */
function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">
      <span className={cx("relative h-5 w-9 rounded-full transition", on ? "bg-emerald-500" : "bg-slate-300")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
      <span className="w-12">{label}</span>
    </button>
  );
}
