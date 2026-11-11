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
  created_at: string;
  updated_at: string;
  product_variants?: Variant[];
  brands?: Pick<Brand, "id" | "name" | "slug"> | null;
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
  package_items?: { variant_id: string; qty: number; sort: number }[];
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
  reservation_items?: { id: number; sku: string; label: string; qty: number; variant_id: string }[];
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
  out: { label: "สั่งจอง / ขอใบเสนอราคา", tone: "amber" },
  unknown: { label: "สอบถามสต๊อก", tone: "slate" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const baht = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatBaht = (n: number | null | undefined) => (n == null ? "สอบถามราคา" : `฿${baht.format(Number(n))}`);
export const formatQty = (n: number | null | undefined) => baht.format(Number(n ?? 0));
export const formatDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "-";
export const formatDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

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
// Pricing: promo (everyone) → company price (approved login) → base price
// ---------------------------------------------------------------------------
export type PriceKind = "promo" | "company" | "base" | "ask";
export interface PriceInfo {
  price: number | null;
  base: number | null;
  kind: PriceKind;
}

export interface PriceBook {
  promo: Map<string, number>;
  company: Map<string, number>;
}

export async function loadPriceBook(variantIds: string[]): Promise<PriceBook> {
  const book: PriceBook = { promo: new Map(), company: new Map() };
  if (!supabaseConfigured || !variantIds.length) return book;
  // promotions RLS already hides unpublished / not-running promotions from customers,
  // but Staff can see all of them, so filter by date and publish flag here too.
  const [promo, company] = await Promise.all([
    supabase
      .from("promotion_items")
      .select("variant_id, promo_price, promotions!inner(is_published, starts_at, ends_at)")
      .in("variant_id", variantIds),
    supabase.from("company_prices").select("variant_id, price, company_id").in("variant_id", variantIds),
  ]);
  const myCompany = await currentCompanyId();
  for (const r of (promo.data ?? []) as unknown as { variant_id: string; promo_price: number; promotions: { is_published: boolean; starts_at: string | null; ends_at: string | null } }[]) {
    if (!r.promotions.is_published || !isRunning(r.promotions)) continue;
    const cur = book.promo.get(r.variant_id);
    if (cur == null || r.promo_price < cur) book.promo.set(r.variant_id, Number(r.promo_price));
  }
  for (const r of (company.data ?? []) as { variant_id: string; price: number; company_id: string }[]) {
    // Staff can read every company's prices; only use the viewer's own company
    if (r.company_id === myCompany) book.company.set(r.variant_id, Number(r.price));
  }
  return book;
}

let companyCache: { uid: string; company: string | null } | null = null;
async function currentCompanyId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  if (companyCache?.uid === uid) return companyCache.company;
  const { data: p } = await supabase.from("profiles").select("company_id, company_status").eq("id", uid).maybeSingle();
  const company = p?.company_status === "approved" ? (p.company_id as string | null) : null;
  companyCache = { uid, company };
  return company;
}
supabase.auth.onAuthStateChange(() => {
  companyCache = null;
});

export function priceFor(v: Pick<Variant, "id" | "base_price">, book: PriceBook): PriceInfo {
  const base = v.base_price == null ? null : Number(v.base_price);
  const promo = book.promo.get(v.id);
  if (promo != null) return { price: promo, base, kind: "promo" };
  const company = book.company.get(v.id);
  if (company != null) return { price: company, base, kind: "company" };
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
  const [book, setBook] = useState<PriceBook>({ promo: new Map(), company: new Map() });
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
  const price = useCallback((v: Pick<Variant, "id" | "base_price">) => priceFor(v, book), [book]);
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
