import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import type { AdBanner, AdPlacement, CompanyLocation, PageKey, PortfolioProject, SiteSettings, TeamMember } from "./types";

export const DEFAULT_SETTINGS: SiteSettings = {
  company: {
    name_th: "SSC",
    name_en: "SSC",
    tagline: "พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ",
    address: "",
    phone: "",
    email: "",
    line_oa_url: "https://lin.ee/w8rXmRU",
    facebook_url: "",
    map_embed_url: "",
    office_hours: "จันทร์–ศุกร์ 08:30–17:30",
    logo_url: "",
  },
  hero: {
    title: "อุปกรณ์โซลาร์ของแท้ จากตัวแทนจำหน่ายโดยตรง",
    subtitle: "สินค้า งานอบรม และงานบริการหลังการขาย รวมไว้ในที่เดียว",
    image_url: "",
    cta_primary_label: "ดูสินค้า",
    cta_primary_href: "/products",
    cta_secondary_label: "ขอใบเสนอราคา",
    cta_secondary_href: "/contact?topic=quotation",
  },
  about: {
    history:
      "SSC เป็นผู้นำเข้าและตัวแทนจำหน่ายอุปกรณ์ระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ พร้อมทีมวิศวกรที่ให้คำปรึกษา อบรม และดูแลงานเคลมหลังการขาย",
    vision: "ทำให้พลังงานสะอาดเข้าถึงง่าย ด้วยอุปกรณ์คุณภาพและบริการที่ไว้ใจได้",
    brands: ["SolarEdge", "KSTAR"],
    certificates: [],
  },
  home: {
    badge: "ตัวแทนจำหน่ายอุปกรณ์โซลาร์",
    modules: [
      { title: "สินค้าและโปรโมชั่น", text: "แคตตาล็อกอุปกรณ์ ราคา แพคเกจ และขอใบเสนอราคาออนไลน์" },
      { title: "อบรมและกิจกรรม", text: "จองรอบอบรม รับใบประกาศ และสะสมแต้มแลกของรางวัล" },
      { title: "งานบริการและเคลม", text: "แจ้งเคลมสินค้าและติดตามสถานะได้จากบัญชีของคุณ" },
      { title: "บัญชีเดียวใช้ได้ทุกส่วน", text: "ล็อกอินครั้งเดียว เห็นการจอง แต้ม และเคลมของคุณและบริษัท" },
    ],
    about_title: "พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ",
    products_title: "สินค้าแนะนำและโปรโมชั่น",
    products_text: "ดูสินค้า ราคา สต๊อก และโปรโมชั่นล่าสุด พร้อมขอใบเสนอราคาออนไลน์",
    products_button: "ดูสินค้าทั้งหมด",
    portfolio_title: "โครงการที่เราติดตั้ง",
    portfolio_subtitle: "ตัวอย่างงานบ้านพักอาศัย โรงงาน และอาคารพาณิชย์",
    team_title: "ติดต่อพนักงานได้โดยตรง",
    team_subtitle: "ฝ่ายขาย ฝ่ายบริการ และฝ่ายประสานงาน พร้อมช่วยเหลือคุณ",
  },
  pages: {
    about: { eyebrow: "เกี่ยวกับเรา", title: "", subtitle: "", image_url: "" },
    products: { eyebrow: "", title: "สินค้า", subtitle: "ราคาและสต๊อกอัปเดตจากระบบคลังสินค้า เข้าสู่ระบบเพื่อดูราคาเฉพาะบริษัทของคุณ", image_url: "" },
    promotions: { eyebrow: "", title: "โปรโมชั่นและแพ็กเกจ", subtitle: "ราคาโปรโมชั่นเป็นราคาเดียวกันสำหรับลูกค้าทุกคน", image_url: "" },
    training: {
      eyebrow: "อบรมและกิจกรรม",
      title: "ปฏิทินอบรม",
      subtitle: "เลือกหลักสูตรและรอบที่สะดวก จองได้ทันทีด้วยบัญชี One App เข้าอบรมรับแต้มสะสมชั่วโมงละ 1 แต้ม และรับใบประกาศหลังทำแบบประเมิน",
      image_url: "",
    },
    portfolio: { eyebrow: "ผลงาน", title: "โครงการที่เราติดตั้ง", subtitle: "", image_url: "" },
    claims: { eyebrow: "", title: "แจ้งเคลมสินค้า", subtitle: "แจ้งเคลมสินค้าทุกแบรนด์ของบริษัทออนไลน์ แล้วติดตามสถานะได้จากแดชบอร์ดของคุณ ไม่ต้องโทรถาม", image_url: "" },
    team: { eyebrow: "ทีมงาน", title: "ติดต่อพนักงาน", subtitle: "เลือกติดต่อทีมที่ตรงกับเรื่องของคุณได้โดยตรง", image_url: "" },
    contact: { eyebrow: "ติดต่อเรา", title: "ติดต่อบริษัท", subtitle: "ส่งข้อความถึงทีมงาน หรือติดต่อผ่านช่องทางด้านล่าง", image_url: "" },
  },
  ads: {
    announcement: { text: "", href: "", active: false },
    banners: [],
  },
};

export const PAGE_LABEL: Record<PageKey, string> = {
  about: "เกี่ยวกับเรา",
  products: "สินค้า",
  promotions: "โปรโมชั่น",
  training: "อบรมและกิจกรรม",
  portfolio: "ผลงาน",
  claims: "แจ้งเคลม",
  team: "ทีมงาน",
  contact: "ติดต่อเรา",
};

export const PLACEMENT_LABEL: Record<AdPlacement, string> = {
  home_top: "หน้าแรก: ใต้แบนเนอร์หลัก",
  home_middle: "หน้าแรก: กลางหน้า",
  products: "หน้าสินค้า",
  promotions: "หน้าโปรโมชั่น",
  training: "หน้าอบรม",
  claims: "หน้าแจ้งเคลม",
  popup: "ป๊อปอัปหน้าแรก",
};

/** Merge stored settings over defaults one level deeper than Object.assign so new fields keep their defaults. */
function mergeSettings(base: SiteSettings, key: keyof SiteSettings, value: Record<string, unknown>) {
  if (key === "pages") {
    for (const [k, v] of Object.entries(value)) if (k in base.pages) Object.assign(base.pages[k as PageKey], v);
    return;
  }
  if (key === "home") {
    const { modules, ...rest } = value as Partial<SiteSettings["home"]>;
    Object.assign(base.home, rest);
    if (Array.isArray(modules)) base.home.modules = base.home.modules.map((m, i) => ({ ...m, ...(modules[i] ?? {}) }));
    return;
  }
  if (key === "ads") {
    const v = value as Partial<SiteSettings["ads"]>;
    if (v.announcement) Object.assign(base.ads.announcement, v.announcement);
    if (Array.isArray(v.banners)) base.ads.banners = v.banners;
    return;
  }
  Object.assign(base[key], value);
}

/** Company branches; falls back to one location built from the single address fields. */
export function companyLocations(c: SiteSettings["company"]): CompanyLocation[] {
  const list = (c.locations ?? []).filter((l) => l.name || l.address || l.phone || l.map);
  if (list.length) return list;
  if (!c.address && !c.phone && !c.map_embed_url) return [];
  return [{ id: "main", name: "สำนักงานใหญ่", address: c.address, phone: c.phone, email: c.email, hours: c.office_hours, contact_name: "", map: c.map_embed_url, note: "" }];
}

/** Map field → iframe src. Accepts an embed src, a whole <iframe> code, a Google Maps link with coordinates, "lat,lng", or nothing (uses the address). */
export function mapEmbedSrc(map: string, address: string): string | null {
  const m = map.trim();
  const iframe = m.match(/src=["']([^"']+)["']/);
  if (iframe) return iframe[1];
  if (/^https:\/\/(www\.)?google\.[^/]+\/maps\/embed/.test(m)) return m;
  const at = m.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || m.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/) || m.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = at ? `${at[1]},${at[2]}` : m && !/^https?:/.test(m) ? m : address.trim();
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed` : null;
}

/** "Open in Google Maps / navigate" link for a location. */
export function mapLink(map: string, address: string): string | null {
  const m = map.trim();
  if (/^https?:\/\//.test(m) && !/\/maps\/embed/.test(m)) return m;
  const src = mapEmbedSrc(m, address);
  const q = src?.match(/[?&]q=([^&]+)/)?.[1];
  if (q) return `https://www.google.com/maps/search/?api=1&query=${q}`;
  return address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}` : null;
}

/** Banners active today for a placement, in admin order. */
export function activeAds(ads: SiteSettings["ads"], placement: AdPlacement, today = new Date().toISOString().slice(0, 10)): AdBanner[] {
  return ads.banners.filter(
    (b) => b.active && b.image_url && b.placements.includes(placement) && (!b.starts_at || b.starts_at <= today) && (!b.ends_at || b.ends_at >= today),
  );
}

let settingsCache: SiteSettings | null = null;
const listeners = new Set<(s: SiteSettings) => void>();

export async function loadSettings(force = false): Promise<SiteSettings> {
  if (settingsCache && !force) return settingsCache;
  if (!supabaseConfigured) return (settingsCache = DEFAULT_SETTINGS);
  const { data, error } = await supabase.from("site_settings").select("key, value");
  const merged: SiteSettings = structuredClone(DEFAULT_SETTINGS);
  if (!error && data) {
    for (const row of data as { key: keyof SiteSettings; value: object }[]) {
      if (row.key in merged) mergeSettings(merged, row.key, row.value as Record<string, unknown>);
    }
  }
  settingsCache = merged;
  listeners.forEach((l) => l(merged));
  return merged;
}

export function useSiteSettings(): SiteSettings {
  const [s, setS] = useState<SiteSettings>(settingsCache ?? DEFAULT_SETTINGS);
  useEffect(() => {
    listeners.add(setS);
    loadSettings().then(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/** Generic "load rows on mount" hook used by public and admin pages. */
export function useRows<T>(loader: () => PromiseLike<{ data: T[] | null; error: unknown }>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.resolve(loader()).then(({ data, error }) => {
      if (!alive) return;
      setRows(data ?? []);
      setError(error);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { rows, setRows, loading, error, reload: () => setTick((t) => t + 1) };
}

export const usePublishedPortfolio = (limit?: number) =>
  useRows<PortfolioProject>(() => {
    let q = supabase
      .from("portfolio_projects")
      .select("*")
      .eq("is_published", true)
      .order("sort")
      .order("year", { ascending: false });
    if (limit) q = q.limit(limit);
    return q;
  }, [limit]);

export const usePublishedTeam = () =>
  useRows<TeamMember>(() =>
    supabase.from("team_members").select("*").eq("is_published", true).order("sort").order("full_name"),
  );

export async function uploadSiteImage(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("site-media").upload(path, file, { cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("site-media").getPublicUrl(path).data.publicUrl;
}
