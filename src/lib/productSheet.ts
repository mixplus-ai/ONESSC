/**
 * Product list ⇄ Excel template (owner, 19 Nov): one row per product code (SKU) with every detail,
 * so staff can export the whole catalogue, edit it in Excel and import it back, or fill the blank
 * template to add many products at once.
 *
 * Rows with the same product (slug, or name when slug is blank) are one product with several codes.
 * On import an empty cell keeps what is in the system; it never clears a value.
 */
import { pickSlug, type Brand, type Category, type Product, type Spec, type Variant } from "./catalog";
import { errorMessage, supabase } from "./supabase";

type Kind = "text" | "num" | "bool" | "list" | "specs";
interface Col { key: string; head: string; kind: Kind; width: number; note: string; level: "product" | "variant" }

export const COLS: Col[] = [
  { key: "sku", head: "รหัสสินค้า (SKU)", kind: "text", width: 20, level: "variant", note: "ตรงกับไฟล์สต๊อก ห้ามซ้ำ · ว่าง = สินค้าที่ยังไม่มีรหัส" },
  { key: "name", head: "ชื่อสินค้า / รุ่น *", kind: "text", width: 34, level: "product", note: "จำเป็น · หลายแถวชื่อเดียวกัน = รุ่นเดียวกันหลายรหัส" },
  { key: "v_name", head: "ชื่อรุ่นย่อย", kind: "text", width: 24, level: "variant", note: "ว่าง = ใช้รหัสสินค้า" },
  { key: "brand", head: "แบรนด์", kind: "text", width: 14, level: "product", note: "ชื่อตามแท็บแบรนด์ · ชื่อใหม่จะสร้างแบรนด์ให้" },
  { key: "category", head: "หมวดหมู่", kind: "text", width: 16, level: "product", note: "ชื่อตามแท็บหมวดหมู่ · ชื่อใหม่จะสร้างให้" },
  { key: "unit", head: "หน่วย", kind: "text", width: 8, level: "variant", note: "เช่น ชิ้น, แผง, ชุด" },
  { key: "base_price", head: "ราคาปกติ (บาท)", kind: "num", width: 14, level: "variant", note: "ตัวเลข ไม่ใส่ , ก็ได้" },
  { key: "is_active", head: "เปิดขาย (Y/N)", kind: "bool", width: 10, level: "variant", note: "Y = เปิดขาย N = ปิดขาย" },
  { key: "show_price", head: "แสดงราคา (Y/N)", kind: "bool", width: 10, level: "variant", note: "N = หน้าเว็บขึ้น “สอบถามราคา”" },
  { key: "warranty_months", head: "ประกันสินค้า (เดือน)", kind: "num", width: 12, level: "product", note: "เช่น 144 = 12 ปี" },
  { key: "perf_warranty_months", head: "ประกันประสิทธิภาพ (เดือน)", kind: "num", width: 12, level: "product", note: "เช่น แผง 360 = 30 ปี" },
  { key: "v_warranty_months", head: "ประกันรหัสนี้ (เดือน)", kind: "num", width: 12, level: "variant", note: "ว่าง = ตามสินค้า" },
  { key: "v_perf_warranty_months", head: "ประสิทธิภาพรหัสนี้ (เดือน)", kind: "num", width: 12, level: "variant", note: "ว่าง = ตามสินค้า" },
  { key: "summary", head: "คำอธิบายสั้น", kind: "text", width: 36, level: "product", note: "" },
  { key: "description", head: "รายละเอียด", kind: "text", width: 50, level: "product", note: "ขึ้นบรรทัดใหม่ในช่องได้ (Alt+Enter)" },
  { key: "specs", head: "สเปกสินค้า", kind: "specs", width: 40, level: "product", note: "บรรทัดละ “หัวข้อ: ค่า”" },
  { key: "v_detail", head: "รายละเอียดรหัสนี้", kind: "text", width: 30, level: "variant", note: "" },
  { key: "v_specs", head: "สเปกรหัสนี้", kind: "specs", width: 30, level: "variant", note: "บรรทัดละ “หัวข้อ: ค่า”" },
  { key: "tags", head: "แท็ก", kind: "list", width: 20, level: "product", note: "คั่นด้วย ," },
  { key: "cover_url", head: "รูปหลัก (ลิงก์)", kind: "text", width: 30, level: "product", note: "ลิงก์รูป https://…" },
  { key: "images", head: "รูปเพิ่มเติม (ลิงก์)", kind: "list", width: 30, level: "product", note: "หลายลิงก์คั่นด้วย ," },
  { key: "datasheet_url", head: "Datasheet (ลิงก์)", kind: "text", width: 30, level: "product", note: "" },
  { key: "manual_url", head: "คู่มือ (ลิงก์)", kind: "text", width: 30, level: "product", note: "" },
  { key: "video_url", head: "วิดีโอ (ลิงก์)", kind: "text", width: 30, level: "product", note: "" },
  { key: "is_published", head: "แสดงบนเว็บ (Y/N)", kind: "bool", width: 10, level: "product", note: "N = ซ่อน" },
  { key: "is_featured", head: "สินค้าแนะนำ (Y/N)", kind: "bool", width: 10, level: "product", note: "" },
  { key: "sort", head: "ลำดับ", kind: "num", width: 8, level: "product", note: "เลขน้อยขึ้นก่อน" },
  { key: "slug", head: "slug (ลิงก์หน้า)", kind: "text", width: 22, level: "product", note: "อังกฤษตัวเล็ก ตัวเลข - · ว่างให้ระบบสร้าง · ใช้จับคู่สินค้าเดิม" },
];

type Cell = string | number | boolean | null;
const specsText = (s: Spec[] | null | undefined) => (s ?? []).map((x) => (x.value ? `${x.label}: ${x.value}` : x.label)).join("\n");
const parseSpecs = (t: string): Spec[] =>
  t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.search(/[:\t]/);
    return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: "" };
  });
const yn = (b: boolean | null | undefined) => (b == null ? "" : b ? "Y" : "N");

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function productRow(p: Product, v: Variant | null): Record<string, Cell> {
  return {
    sku: v?.sku ?? "", name: p.name, v_name: v && v.name !== v.sku ? v.name : "", brand: p.brands?.name ?? "", category: p.product_categories?.name ?? "",
    unit: v?.unit ?? "", base_price: v?.base_price ?? null, is_active: v ? yn(v.is_active) : "", show_price: v ? yn(v.show_price !== false) : "",
    warranty_months: p.warranty_months ?? null, perf_warranty_months: p.perf_warranty_months ?? null,
    v_warranty_months: v?.warranty_months ?? null, v_perf_warranty_months: v?.perf_warranty_months ?? null,
    summary: p.summary ?? "", description: p.description ?? "", specs: specsText(p.specs), v_detail: v?.detail ?? "", v_specs: specsText(v?.specs),
    tags: (p.tags ?? []).join(", "), cover_url: p.cover_url ?? "", images: (p.images ?? []).join(", "), datasheet_url: p.datasheet_url ?? "",
    manual_url: p.manual_url ?? "", video_url: p.video_url ?? "", is_published: yn(p.is_published), is_featured: yn(p.is_featured), sort: p.sort, slug: p.slug,
  };
}

/** blank = the empty template (header + 1 example row); otherwise every product and code in the system */
export async function exportProductSheet(products: Product[], brands: Brand[], categories: Category[], blank = false) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const head = COLS.map((c) => ({ value: c.head, fontWeight: "bold" as const, backgroundColor: c.level === "variant" ? "#FEF3C7" : "#DBEAFE", wrap: true, borderStyle: "thin" as const }));
  const toCells = (r: Record<string, Cell>) =>
    COLS.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined || v === "") return null;
      return typeof v === "number" ? { value: v, type: Number } : { value: String(v), type: String, wrap: c.kind === "specs" || c.key === "description" };
    });
  const rows: Record<string, Cell>[] = blank
    ? [{ sku: "EX-001", name: "ตัวอย่าง Inverter 10kW (ลบแถวนี้ได้)", brand: brands[0]?.name ?? "", category: categories[0]?.name ?? "", unit: "ชิ้น", base_price: 45000, is_active: "Y", show_price: "Y", warranty_months: 120, summary: "คำอธิบายสั้น", specs: "กำลังไฟ: 10 kW\nเฟส: 3", is_published: "N", sort: 0 }]
    : products
        .slice()
        .sort((a, b) => (a.brands?.name ?? "").localeCompare(b.brands?.name ?? "") || a.name.localeCompare(b.name))
        .flatMap((p) => {
          const vs = (p.product_variants ?? []).slice().sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku));
          return vs.length ? vs.map((v) => productRow(p, v)) : [productRow(p, null)];
        });
  const help = [
    [{ value: "วิธีใช้ Template สินค้า", fontWeight: "bold" as const, fontSize: 14 }],
    [{ value: "1 แถว = 1 รหัสสินค้า (SKU) · หลายแถวที่ชื่อสินค้า (หรือ slug) เดียวกัน = รุ่นเดียวกันที่มีหลายรหัส ใช้รูปและรายละเอียดร่วมกัน", type: String }],
    [{ value: "หัวคอลัมน์สีฟ้า = ข้อมูลของสินค้า (ใส่แถวไหนของรุ่นนั้นก็ได้) · สีเหลือง = ข้อมูลของรหัสนั้น ๆ", type: String }],
    [{ value: "นำเข้า: รหัสที่มีอยู่แล้วจะถูกอัปเดต รหัสใหม่จะถูกเพิ่ม · ช่องว่าง = ไม่เปลี่ยนค่าเดิม (ไม่ลบข้อมูล) · ระบบไม่ลบสินค้าที่ไม่มีในไฟล์", type: String }],
    [{ value: "ห้ามเปลี่ยนชื่อหัวคอลัมน์ในแถวแรกของแผ่น “สินค้า” · สลับลำดับคอลัมน์หรือลบคอลัมน์ที่ไม่ใช้ได้", type: String }],
    [],
    [{ value: "คอลัมน์", fontWeight: "bold" as const }, { value: "ใช้กับ", fontWeight: "bold" as const }, { value: "คำอธิบาย", fontWeight: "bold" as const }],
    ...COLS.map((c) => [{ value: c.head, type: String }, { value: c.level === "variant" ? "รหัสนี้" : "สินค้า", type: String }, { value: c.note, type: String }]),
    [],
    [{ value: "แบรนด์ในระบบ", fontWeight: "bold" as const }, null, { value: "หมวดหมู่ในระบบ", fontWeight: "bold" as const }],
    ...Array.from({ length: Math.max(brands.length, categories.length) }, (_, i) => [
      brands[i] ? { value: brands[i].name, type: String } : null, null, categories[i] ? { value: categories[i].name, type: String } : null,
    ]),
  ];
  const date = new Date().toISOString().slice(0, 10);
  await writeXlsxFile([
    { sheet: "สินค้า", data: [head, ...rows.map(toCells)], columns: COLS.map((c) => ({ width: c.width })), stickyRowsCount: 1 },
    { sheet: "วิธีใช้", data: help, columns: [{ width: 30 }, { width: 10 }, { width: 70 }] },
  ] as never).toFile(blank ? "Template-สินค้า.xlsx" : `สินค้าทั้งหมด-${date}.xlsx`);
}

// ---------------------------------------------------------------------------
// Import: read → plan (preview) → apply
// ---------------------------------------------------------------------------
type Raw = Record<string, string>;
export interface PlanProduct { key: string; existing: Product | null; fields: Record<string, unknown>; brand: string; category: string; rows: { line: number; raw: Raw }[] }
export interface ImportPlan {
  products: PlanProduct[];
  newProducts: number; updProducts: number; newSkus: number; updSkus: number; moveSkus: number;
  newBrands: string[]; newCategories: string[];
  errors: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const toStr = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
function toBool(s: string): boolean | undefined {
  const x = s.trim().toLowerCase();
  if (!x) return undefined;
  if (["y", "yes", "1", "true", "ใช่", "เปิด", "แสดง"].includes(x)) return true;
  if (["n", "no", "0", "false", "ไม่", "ปิด", "ซ่อน"].includes(x)) return false;
  return undefined;
}
function toNum(s: string): number | undefined | "bad" {
  if (!s.trim()) return undefined;
  const n = Number(s.replace(/[,฿\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : "bad";
}

export async function readProductSheet(file: File): Promise<Raw[] & { lines?: number[] }> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const sheet = sheets.find((s) => s.sheet === "สินค้า") ?? sheets[0];
  const grid = (sheet?.data ?? []) as unknown[][];
  const hi = grid.findIndex((r) => r.some((c) => toStr(c) === COLS[1].head || toStr(c) === COLS[0].head));
  if (hi < 0) throw new Error("ไม่พบหัวคอลัมน์ “ชื่อสินค้า / รุ่น *” ในแผ่น “สินค้า” กรุณาใช้ไฟล์ Template จากปุ่มดาวน์โหลด");
  const map = grid[hi].map((c) => COLS.find((x) => x.head === toStr(c))?.key ?? null);
  const out: Raw[] & { lines?: number[] } = [];
  out.lines = [];
  grid.slice(hi + 1).forEach((r, i) => {
    const o: Raw = {};
    map.forEach((k, j) => { if (k) o[k] = toStr(r[j]); });
    if (Object.values(o).some(Boolean)) { out.push(o); out.lines!.push(hi + i + 2); }
  });
  return out;
}

export function planImport(raws: Raw[] & { lines?: number[] }, products: Product[], brands: Brand[], categories: Category[]): ImportPlan {
  const errors: string[] = [];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const byName = new Map(products.map((p) => [norm(p.name), p]));
  const bySku = new Map<string, Product>();
  for (const p of products) for (const v of p.product_variants ?? []) bySku.set(v.sku.toUpperCase(), p);
  const brandNames = new Set(brands.map((b) => norm(b.name)));
  const catNames = new Set(categories.map((c) => norm(c.name)));
  const groups = new Map<string, PlanProduct>();
  const seenSku = new Set<string>();
  raws.forEach((r, i) => {
    const line = raws.lines?.[i] ?? i + 2;
    const sku = (r.sku ?? "").trim();
    if (sku) {
      if (seenSku.has(sku.toUpperCase())) errors.push(`แถว ${line}: รหัส ${sku} ซ้ำในไฟล์`);
      seenSku.add(sku.toUpperCase());
    }
    for (const c of COLS) {
      const v = r[c.key] ?? "";
      if (!v) continue;
      if (c.kind === "num" && toNum(v) === "bad") errors.push(`แถว ${line}: “${c.head}” ต้องเป็นตัวเลข (${v})`);
      if (c.kind === "bool" && toBool(v) === undefined) errors.push(`แถว ${line}: “${c.head}” ใส่ Y หรือ N (${v})`);
      if (/months/.test(c.key) && Number(v) > 600) errors.push(`แถว ${line}: “${c.head}” ไม่เกิน 600 เดือน`);
    }
    const slug = (r.slug ?? "").trim().toLowerCase();
    const name = (r.name ?? "").trim();
    const existing = (slug && bySlug.get(slug)) || (name && byName.get(norm(name))) || (sku && bySku.get(sku.toUpperCase())) || null;
    if (!name && !existing) return errors.push(`แถว ${line}: ไม่มีชื่อสินค้า`);
    const key = existing ? `id:${existing.id}` : slug ? `slug:${slug}` : `name:${norm(name)}`;
    if (!groups.has(key)) groups.set(key, { key, existing, fields: {}, brand: "", category: "", rows: [] });
    const g = groups.get(key)!;
    g.rows.push({ line, raw: r });
    // product-level values: the first non-empty cell in the group wins
    for (const c of COLS) {
      if (c.level !== "product" || c.key in g.fields) continue;
      const v = r[c.key] ?? "";
      if (!v) continue;
      if (c.key === "brand") { if (!g.brand) g.brand = v; continue; }
      if (c.key === "category") { if (!g.category) g.category = v; continue; }
      g.fields[c.key] = c.kind === "num" ? toNum(v) : c.kind === "bool" ? toBool(v) : c.kind === "list" ? v.split(",").map((x) => x.trim()).filter(Boolean) : c.kind === "specs" ? parseSpecs(v) : v;
    }
  });
  const plans = [...groups.values()];
  const newBrands = [...new Set(plans.map((g) => g.brand).filter((b) => b && !brandNames.has(norm(b))))];
  const newCategories = [...new Set(plans.map((g) => g.category).filter((c) => c && !catNames.has(norm(c))))];
  let newSkus = 0, updSkus = 0, moveSkus = 0;
  for (const g of plans)
    for (const { raw } of g.rows) {
      const sku = (raw.sku ?? "").trim().toUpperCase();
      if (!sku) continue;
      const owner = bySku.get(sku);
      if (!owner) newSkus++;
      else if (g.existing && owner.id === g.existing.id) updSkus++;
      else moveSkus++;
    }
  return {
    products: plans, errors, newBrands, newCategories, newSkus, updSkus, moveSkus,
    newProducts: plans.filter((g) => !g.existing).length, updProducts: plans.filter((g) => g.existing).length,
  };
}

export async function applyImport(plan: ImportPlan, products: Product[], brands: Brand[], categories: Category[], onProgress: (done: number, total: number) => void) {
  const log: string[] = [];
  const brandId = new Map(brands.map((b) => [norm(b.name), b.id]));
  const catId = new Map(categories.map((c) => [norm(c.name), c.id]));
  const brandSlugs = brands.map((b) => b.slug), catSlugs = categories.map((c) => c.slug);
  for (const name of plan.newBrands) {
    const { data, error } = await supabase.from("brands").insert({ name, slug: pickSlug("", name, brandSlugs), stock_groups: [] }).select("id, slug").single();
    if (error) { log.push(`แบรนด์ ${name}: ${errorMessage(error)}`); continue; }
    brandId.set(norm(name), data.id); brandSlugs.push(data.slug);
  }
  for (const name of plan.newCategories) {
    const { data, error } = await supabase.from("product_categories").insert({ name, slug: pickSlug("", name, catSlugs) }).select("id, slug").single();
    if (error) { log.push(`หมวด ${name}: ${errorMessage(error)}`); continue; }
    catId.set(norm(name), data.id); catSlugs.push(data.slug);
  }
  const variantBySku = new Map<string, Variant>();
  for (const p of products) for (const v of p.product_variants ?? []) variantBySku.set(v.sku.toUpperCase(), v);
  const slugs = products.map((p) => p.slug);
  let done = 0, ok = 0;
  const total = plan.products.length;
  for (const g of plan.products) {
    try {
      const f = { ...g.fields } as Record<string, unknown>;
      if (g.brand) f.brand_id = brandId.get(norm(g.brand)) ?? null;
      if (g.category) f.category_id = catId.get(norm(g.category)) ?? null;
      let id = g.existing?.id;
      if (id) {
        delete f.slug; // keep the page link of an existing product
        if (Object.keys(f).length) {
          const { error } = await supabase.from("products").update(f).eq("id", id);
          if (error) throw error;
        }
      } else {
        const name = String(f.name ?? g.rows[0].raw.name);
        f.slug = pickSlug(String(f.slug ?? ""), name, slugs);
        slugs.push(f.slug as string);
        f.is_published ??= false;
        const { data, error } = await supabase.from("products").insert(f).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      for (const [i, { raw, line }] of g.rows.entries()) {
        const sku = (raw.sku ?? "").trim();
        if (!sku) continue;
        const vr: Record<string, unknown> = {};
        const put = (k: string, v: unknown) => { if (v !== undefined && v !== "") vr[k] = v; };
        put("name", raw.v_name);
        put("unit", raw.unit);
        put("base_price", toNum(raw.base_price ?? ""));
        put("is_active", toBool(raw.is_active ?? ""));
        put("show_price", toBool(raw.show_price ?? ""));
        put("warranty_months", toNum(raw.v_warranty_months ?? ""));
        put("perf_warranty_months", toNum(raw.v_perf_warranty_months ?? ""));
        put("detail", raw.v_detail);
        if (raw.v_specs) vr.specs = parseSpecs(raw.v_specs);
        const old = variantBySku.get(sku.toUpperCase());
        if (old) {
          if (old.product_id !== id) {
            const { error } = await supabase.rpc("move_variant", { p_variant_id: old.id, p_product_id: id });
            if (error) throw new Error(`แถว ${line} ${sku}: ${errorMessage(error)}`);
          }
          if (Object.keys(vr).length) {
            const { error } = await supabase.from("product_variants").update(vr).eq("id", old.id);
            if (error) throw new Error(`แถว ${line} ${sku}: ${errorMessage(error)}`);
          }
        } else {
          const { error } = await supabase.from("product_variants").insert({ product_id: id, sku, name: sku, unit: "ชิ้น", sort: i, ...vr });
          if (error) throw new Error(`แถว ${line} ${sku}: ${errorMessage(error)}`);
        }
      }
      ok++;
    } catch (x) {
      log.push(`${g.existing?.name ?? g.rows[0].raw.name} (แถว ${g.rows.map((r) => r.line).join(", ")}): ${errorMessage(x)}`);
    }
    onProgress(++done, total);
  }
  return { ok, failed: total - ok, log };
}
