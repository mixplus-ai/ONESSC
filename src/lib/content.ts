import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import type { PortfolioProject, SiteSettings, TeamMember } from "./types";

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
};

let settingsCache: SiteSettings | null = null;
const listeners = new Set<(s: SiteSettings) => void>();

export async function loadSettings(force = false): Promise<SiteSettings> {
  if (settingsCache && !force) return settingsCache;
  if (!supabaseConfigured) return (settingsCache = DEFAULT_SETTINGS);
  const { data, error } = await supabase.from("site_settings").select("key, value");
  const merged: SiteSettings = structuredClone(DEFAULT_SETTINGS);
  if (!error && data) {
    for (const row of data as { key: keyof SiteSettings; value: object }[]) {
      if (row.key in merged) Object.assign(merged[row.key], row.value);
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
