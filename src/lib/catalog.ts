import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Spec {
  label: string;
  value: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  stock_groups: string[];
  is_published: boolean;
  sort: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort: number;
}

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  detail: string | null;
  specs: Spec[];
  unit: string;
  base_price: number | null;
  is_active: boolean;
  sort: number;
  /** false = the website shows "สอบถามราคา" (migration 17; undefined on older rows = shown) */
  show_price?: boolean;
  /** ราคาพิเศษ for everyone, acts like a promotion price until special_ends_at */
  special_price?: number | null;
  special_ends_at?: string | null;
  /** months; null = use the product's warranty (migration 29) */
  warranty_months?: number | null;
  /** ประกันประสิทธิภาพ (months), shown as "15/30 ปี" next to the product warranty */
  perf_warranty_months?: number | null;
}

export interface Product {
  id: string;
  brand_id: string | null;
  category_id: string | null;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  specs: Spec[];
  tags: string[];
  cover_url: string | null;
  images: string[];
  datasheet_url: string | null;
  manual_url: string | null;
  video_url: string | null;
  is_published: boolean;
  is_featured: boolean;
  sort: number;
  legacy_ref: string | null;
  /** warranty in months from the PI (sale) date, for every code of this product (migration 29) */
  warranty_months?: number | null;
  perf_warranty_months?: number | null;
  created_at: string;
  updated_at: string;
  product_variants?: Variant[];
  brands?: (Pick<Brand, "id" | "name" | "slug"> & { logo_url?: string | null }) | null;
  product_categories?: Pick<Category, "id" | "name" | "slug"> | null;
}

export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_published: boolean;
  sort: number;
  promotion_items?: { variant_id: string; promo_price: number }[];
}

export interface Package {
  id: string;
  /** รหัสแพ็กเกจ, used like a SKU (migration 18) */
  code?: string | null;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  cover_url: string | null;
  price: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_published: boolean;
  sort: number;
  package_items?: { variant_id: string; qty: number; sort: number; product_variants?: Pick<Variant, "base_price" | "show_price"> | null }[];
}

/** ราคาเต็ม of a package = its items at normal price; 0 when any item has no shown price (then no discount is claimed). */
export function packageFullPrice(items: { qty: number | string; base_price?: number | null; show_price?: boolean }[]): number {
  if (!items.length || items.some((i) => i.base_price == null || i.show_price === false)) return 0;
  return items.reduce((s, i) => s + Number(i.base_price) * Number(i.qty), 0);
}

export type StockState = "in_stock" | "low" | "out" | "incoming" | "unknown";
export interface StockInfo {
  sku: string;
  status: StockState;
  available: number | null;
  synced_at: string | null;
}

export type QuoteStatus = "new" | "in_progress" | "quoted" | "won" | "lost" | "cancelled";
export interface QuoteRequest {
  id: string;
  code: string;
  user_id: string;
  company_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  project_note: string | null;
  status: QuoteStatus;
  quoted_total: number | null;
  quote_file_path: string | null;
  billing?: import("./training").Billing | null;
  staff_note: string | null;
  created_at: string;
  updated_at: string;
  quote_request_items?: { id: number; label: string; qty: number; unit_price: number | null; variant_id: string | null; package_id: string | null }[];
  profiles?: { full_name: string | null; email: string; phone: string | null } | null;
  companies?: { name: string; tax_id: string } | null;
}

export type ReservationStatus = "pending" | "confirmed" | "closed" | "cancelled";
export interface Reservation {
  id: string;
  code: string;
  user_id: string;
  company_id: string | null;
  note: string | null;
  status: ReservationStatus;
  expires_at: string;
  billing?: import("./training").Billing | null;
  staff_note: string | null;
  created_at: string;
  updated_at: string;
  reservation_items?: { id: number; sku: string; label: string; qty: number; variant_id: string; unit_price?: number | null }[];
  profiles?: { full_name: string | null; email: string; phone: string | null } | null;
  companies?: { name: string; tax_id: string } | null;
}

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: "slate" | "green" | "amber" | "red" | "navy" }> = {
  new: { label: "ส่งคำขอแล้ว", tone: "amber" },
  in_progress: { label: "กำลังจัดทำ", tone: "navy" },
  quoted: { label: "ส่งใบเสนอราคาแล้ว", tone: "green" },
  won: { label: "สั่งซื้อแล้ว", tone: "green" },
  lost: { label: "ไม่สั่งซื้อ", tone: "slate" },
  cancelled: { label: "ยกเลิก", tone: "slate" },
};

export const RESERVATION_STATUS: Record<ReservationStatus | "expired", { label: string; tone: "slate" | "green" | "amber" | "red" | "navy" }> = {
  pending: { label: "รอยืนยัน", tone: "amber" },
  confirmed: { label: "ยืนยันการจอง", tone: "green" },
  closed: { label: "บันทึกเข้าระบบสต๊อกแล้ว", tone: "navy" },
  cancelled: { label: "ยกเลิก", tone: "slate" },
  expired: { label: "หมดอายุ", tone: "red" },
};

export const reservationState = (r: Pick<Reservation, "status" | "expires_at">) =>
  (r.status === "pending" || r.status === "confirmed") && new Date(r.expires_at) < new Date() ? "expired" : r.status;

export const STOCK_LABEL: Record<StockState, { label: string; tone: "slate" | "green" | "amber" | "red" | "navy" }> = {
  in_stock: { label: "มีสินค้า", tone: "green" },
  low: { label: "เหลือน้อย", tone: "amber" },
  incoming: { label: "รอของเข้า", tone: "navy" },
  out: { label: "ไม่มีสินค้า · จอง / ขอใบเสนอราคา", tone: "red" },
  unknown: { label: "สอบถามสต๊อก", tone: "slate" },
};

/** Cart line vs stock (stock_fit): customers see a status, never the number. */
export type StockFit = "full" | "partial" | "none" | "unknown";
export const FIT_LABEL: Record<StockFit, { label: string; tone: "slate" | "green" | "amber" | "red" | "navy" }> = {
  full: { label: "มีสินค้า", tone: "green" },
  partial: { label: "มีสินค้าบางส่วน", tone: "amber" },
  none: { label: "ไม่มีสินค้า", tone: "red" },
  unknown: { label: "สอบถามสต๊อก", tone: "slate" },
};

/** Quantity check for cart lines: sku → fit + the date of the stock it is based on. */
export async function loadStockFit(items: { sku: string; qty: number }[]): Promise<Map<string, { fit: StockFit; synced_at: string | null }>> {
  const map = new Map<string, { fit: StockFit; synced_at: string | null }>();
  if (!supabaseConfigured || !items.length) return map;
  const { data } = await supabase.rpc("stock_fit", { p_items: items });
  for (const r of (data ?? []) as { sku: string; fit: StockFit; synced_at: string | null }[]) map.set(r.sku, { fit: r.fit, synced_at: r.synced_at });
  return map;
}

/** Latest stock date among a set of rows ("สต๊อก ณ วันที่ …"). */
export const stockAsOf = (rows: Iterable<{ synced_at: string | null } | undefined>) => {
  let max = "";
  for (const r of rows) if (r?.synced_at && r.synced_at > max) max = r.synced_at;
  return max || null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const baht = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatBaht = (n: number | null | undefined) => (n == null ? "สอบถามราคา" : `฿${baht.format(Number(n))}`);
export const formatQty = (n: number | null | undefined) => baht.format(Number(n ?? 0));
/** 144 → "12 ปี", 18 → "1 ปี 6 เดือน" */
export function fmtWarranty(m: number | null | undefined): string {
  if (m == null) return "";
  if (m === 0) return "ไม่มีประกัน";
  const y = Math.floor(m / 12), r = m % 12;
  return [y ? `${y} ปี` : "", r ? `${r} เดือน` : ""].filter(Boolean).join(" ");
}
/** "15/30 ปี" (product / performance warranty); falls back to one value when there is no performance warranty */
export function fmtWarrantyPair(m: number | null | undefined, perf: number | null | undefined): string {
  if (perf == null) return fmtWarranty(m);
  if (m == null) return `ประสิทธิภาพ ${fmtWarranty(perf)}`;
  if (m % 12 === 0 && perf % 12 === 0 && m > 0) return `${m / 12}/${perf / 12} ปี`;
  return `${fmtWarranty(m)} / ${fmtWarranty(perf)}`;
}
/** days from today (Bangkok) to an ISO date; negative = past */
export function daysUntil(d: string): number {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
}
export const formatDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "-";
export const formatDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

/** Clean a typed slug to the allowed form (a-z 0-9 -). Returns "" when nothing usable is left. */
export function cleanSlug(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Typed slug if usable, else one made from the name; adds -2, -3 … when it is already taken. */
export function pickSlug(typed: string | null | undefined, name: string, taken: Iterable<string> = []): string {
  const base = cleanSlug(typed) || slugify(name);
  const used = new Set(taken);
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  return s;
}

export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `p-${Math.random().toString(36).slice(2, 8)}`;
}

export const isRunning = (x: { starts_at: string | null; ends_at: string | null }, now = new Date()) =>
  (!x.starts_at || new Date(x.starts_at) <= now) && (!x.ends_at || new Date(x.ends_at) > now);

export const productImage = (p: Pick<Product, "cover_url" | "images">) => p.cover_url || p.images[0] || "";

// ---------------------------------------------------------------------------
// Pricing: promo (everyone) → company's own price → rank price (approved login) → base price
// ---------------------------------------------------------------------------
export type PriceKind = "promo" | "company" | "rank" | "base" | "ask";
export interface PriceInfo {
  price: number | null;
  base: number | null;
  kind: PriceKind;
  /** the promo price comes from the product's own ราคาพิเศษ, not a promotion */
  special?: boolean;
  /** rank of the viewer's company (for the "ราคา Gold" / "ราคา Gold+" badge) */
  rank?: RankInfo | null;
}

/** Price rank of a customer company (migration 41). plus = the company also has its own prices → "Gold+". */
export interface RankInfo {
  code: string;
  name: string;
  color: string;
  logo_url: string | null;
  plus: boolean;
}
export interface PriceRank {
  code: string;
  name: string;
  color: string;
  logo_url: string | null;
  discount_pct: number | null;
  sort: number;
  is_active: boolean;
}
export const rankLabel = (r: Pick<RankInfo, "name" | "plus">) => `${r.name}${r.plus ? "+" : ""}`;

let rankCache: { uid: string; rank: Promise<RankInfo | null> } | null = null;
/** The signed-in customer's rank (null for guests, staff without a company, or no rank). */
export async function loadMyRank(): Promise<RankInfo | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  if (rankCache?.uid !== uid)
    rankCache = {
      uid,
      rank: Promise.resolve(supabase.rpc("my_price_rank")).then(({ data: r }) => ((r ?? []) as RankInfo[])[0] ?? null).catch(() => null),
    };
  return rankCache.rank;
}

export function useMyRank(): RankInfo | null {
  const [rank, setRank] = useState<RankInfo | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") { rankCache = null; setTick((t) => t + 1); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let alive = true;
    loadMyRank().then((r) => alive && setRank(r));
    return () => { alive = false; };
  }, [tick]);
  return rank;
}

/** Running special price of a SKU, or null. */
export const specialPrice = (v: Pick<Variant, "special_price" | "special_ends_at">, now = new Date()) =>
  v.special_price != null && (!v.special_ends_at || new Date(v.special_ends_at) > now) ? Number(v.special_price) : null;

export interface PriceBook {
  promo: Map<string, number>;
  /** the viewer's company / rank price per variant */
  company: Map<string, number>;
  /** variants whose company-map price is the company's own (else it comes from the rank) */
  own?: Set<string>;
  rank?: RankInfo | null;
}

export async function loadPriceBook(variantIds: string[]): Promise<PriceBook> {
  const book: PriceBook = { promo: new Map(), company: new Map(), own: new Set(), rank: null };
  if (!supabaseConfigured || !variantIds.length) return book;
  // promotions RLS already hides unpublished / not-running promotions from customers,
  // but Staff can see all of them, so filter by date and publish flag here too.
  const { data: sess } = await supabase.auth.getSession();
  const [promo, mine, rank] = await Promise.all([
    supabase
      .from("promotion_items")
      .select("variant_id, promo_price, promotions!inner(is_published, starts_at, ends_at)")
      .in("variant_id", variantIds),
    sess.session ? supabase.rpc("my_prices", { p_variant_ids: variantIds }) : Promise.resolve({ data: [] as unknown[] }),
    loadMyRank(),
  ]);
  book.rank = rank;
  for (const r of (promo.data ?? []) as unknown as { variant_id: string; promo_price: number; promotions: { is_published: boolean; starts_at: string | null; ends_at: string | null } }[]) {
    if (!r.promotions.is_published || !isRunning(r.promotions)) continue;
    const cur = book.promo.get(r.variant_id);
    if (cur == null || r.promo_price < cur) book.promo.set(r.variant_id, Number(r.promo_price));
  }
  // my_prices only returns the viewer's approved company's own / rank prices
  for (const r of (mine.data ?? []) as { variant_id: string; price: number; kind: "company" | "rank" }[]) {
    book.company.set(r.variant_id, Number(r.price));
    if (r.kind === "company") book.own?.add(r.variant_id);
  }
  return book;
}
supabase.auth.onAuthStateChange(() => {
  rankCache = null;
});

export type PricedVariant = Pick<Variant, "id" | "base_price"> & Partial<Pick<Variant, "show_price" | "special_price" | "special_ends_at">>;

export function priceFor(v: PricedVariant, book: PriceBook): PriceInfo {
  if (v.show_price === false) return { price: null, base: null, kind: "ask" };
  const base = v.base_price == null ? null : Number(v.base_price);
  const promo = book.promo.get(v.id);
  const special = specialPrice(v);
  if (special != null && (promo == null || special <= promo)) return { price: special, base, kind: "promo", special: true };
  if (promo != null) return { price: promo, base, kind: "promo" };
  const company = book.company.get(v.id);
  if (company != null) return { price: company, base, kind: book.own && !book.own.has(v.id) ? "rank" : "company", rank: book.rank };
  if (base != null) return { price: base, base, kind: "base" };
  return { price: null, base: null, kind: "ask" };
}

export async function loadStock(skus: string[]): Promise<Map<string, StockInfo>> {
  const map = new Map<string, StockInfo>();
  if (!supabaseConfigured || !skus.length) return map;
  const { data } = await supabase.rpc("stock_status", { p_skus: skus });
  for (const r of (data ?? []) as StockInfo[]) map.set(r.sku, { ...r, available: r.available == null ? null : Number(r.available) });
  return map;
}

/** Loads price book + stock for a set of variants and reloads when the session changes. */
export function usePricing(variants: Pick<Variant, "id" | "sku">[]) {
  const key = variants.map((v) => v.id).join(",");
  const [book, setBook] = useState<PriceBook>({ promo: new Map(), company: new Map(), own: new Set(), rank: null });
  const [stock, setStock] = useState<Map<string, StockInfo>>(new Map());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") setTick((t) => t + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let alive = true;
    const ids = variants.map((v) => v.id);
    const skus = variants.map((v) => v.sku);
    Promise.all([loadPriceBook(ids), loadStock(skus)]).then(([b, s]) => {
      if (!alive) return;
      setBook(b);
      setStock(s);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const price = useCallback((v: PricedVariant) => priceFor(v, book), [book]);
  return { price, stock, book };
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
export async function uploadProductFile(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("product-media").upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
}

export async function quoteFileUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("quote-files").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
