import type { HomeSection } from "./homeSections";
export type AppRole = "admin" | "staff" | "user";
export type CompanyLinkStatus = "none" | "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  line_id: string | null;
  position: string | null;
  role: AppRole;
  department: string | null;
  tax_id: string | null;
  company_name: string | null;
  company_id: string | null;
  company_status: CompanyLinkStatus;
  company_reviewed_at: string | null;
  pdpa_consent_at: string | null;
  name_en: string | null;
  legacy_cerssc_id: string | null;
  avatar_url: string | null;
  billing: import("./training").Billing | null;
  is_active: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  tax_id: string;
  name: string;
  branch: string | null;
  address: string | null;
  phone: string | null;
  note: string | null;
  created_at: string;
  sales_member_id?: string | null;
  support_member_id?: string | null;
}

export interface PermissionKey {
  key: string;
  label: string;
  description: string | null;
  sort: number;
  grp: string;
}

export interface PortfolioProject {
  id: string;
  title: string;
  project_type: "residential" | "factory" | "commercial" | "other";
  size_kwp: number | null;
  province: string | null;
  year: number | null;
  equipment: string | null;
  description: string | null;
  cover_url: string | null;
  images: string[];
  is_published: boolean;
  sort: number;
}

export interface TeamMember {
  id: string;
  full_name: string;
  position: string | null;
  department: "sales" | "service" | "coordination" | "management" | "other";
  phone: string | null;
  line_id: string | null;
  email: string | null;
  photo_url: string | null;
  is_published: boolean;
  sort: number;
}

export interface ContactMessage {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  topic: string | null;
  message: string;
  status: "new" | "in_progress" | "closed";
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface CompanySettings {
  name_th: string;
  name_en: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  line_oa_url: string;
  facebook_url: string;
  youtube_url?: string;
  tiktok_url?: string;
  instagram_url?: string;
  x_url?: string;
  website_url?: string;
  map_embed_url: string;
  office_hours: string;
  logo_url: string;
  /** Letterhead on printed documents (blank = taken from the address / web name). */
  legal_name_th?: string;
  legal_name_en?: string;
  tax_id?: string;
  doc_address?: string;
  /** Branches such as head office and warehouse; empty = one location from the fields above. */
  locations?: CompanyLocation[];
}

export interface CompanyLocation {
  id: string;
  name: string;          // เช่น สำนักงานใหญ่, คลังสินค้า
  address: string;
  phone: string;
  email: string;
  hours: string;
  contact_name: string;  // ผู้ติดต่อ (ไม่บังคับ)
  map: string;           // Google Maps link, embed code/src, "lat,lng" or blank (= use the address)
  note: string;          // เช่น เวลารับสินค้า ทางเข้ารถบรรทุก
}

export interface HeroSettings {
  title: string;
  subtitle: string;
  image_url: string;
  cta_primary_label: string;
  cta_primary_href: string;
  cta_secondary_label: string;
  cta_secondary_href: string;
}

export interface AboutSettings {
  history: string;
  vision: string;
  brands: string[];
  certificates: string[];
  /** Blocks of the public About page; empty = built from the fields above. */
  sections?: HomeSection[];
}

export type PageKey = "about" | "products" | "promotions" | "training" | "portfolio" | "claims" | "team" | "contact";

/** Banner/heading shown at the top of each public page. */
export interface PageBannerSettings {
  eyebrow: string;
  title: string;
  subtitle: string;
  image_url: string;
}

export interface HomeSettings {
  badge: string;
  modules: { title: string; text: string }[];
  about_title: string;
  products_title: string;
  products_text: string;
  products_button: string;
  portfolio_title: string;
  portfolio_subtitle: string;
  team_title: string;
  team_subtitle: string;
  /** home page builder blocks; empty/missing = the classic layout built from the fields above */
  sections?: HomeSection[];
}

export type AdPlacement = "home_top" | "home_middle" | "products" | "promotions" | "training" | "claims" | "popup";

export interface AdBanner {
  id: string;
  title: string;
  image_url: string;
  mobile_image_url: string;
  href: string;
  placements: AdPlacement[];
  active: boolean;
  starts_at: string; // yyyy-mm-dd or ""
  ends_at: string;
}

export interface AdsSettings {
  announcement: { text: string; href: string; active: boolean };
  banners: AdBanner[];
}

export interface SiteSettings {
  company: CompanySettings;
  hero: HeroSettings;
  about: AboutSettings;
  home: HomeSettings;
  pages: Record<PageKey, PageBannerSettings>;
  ads: AdsSettings;
}

export const ROLE_LABEL: Record<AppRole, string> = { admin: "Admin", staff: "Staff", user: "User" };

export const DEPARTMENT_LABEL: Record<string, string> = {
  sales: "ฝ่ายขาย",
  service: "ฝ่ายบริการ",
  coordination: "ฝ่ายประสานงาน",
  management: "ผู้บริหาร",
  other: "อื่น ๆ",
};

export const PROJECT_TYPE_LABEL: Record<PortfolioProject["project_type"], string> = {
  residential: "บ้านพักอาศัย",
  factory: "โรงงาน",
  commercial: "อาคารพาณิชย์",
  other: "อื่น ๆ",
};

export const COMPANY_STATUS_LABEL: Record<CompanyLinkStatus, string> = {
  none: "ยังไม่ได้ผูกบริษัท",
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

/** External legacy systems still serving modules that later phases will absorb. */
export const LEGACY = {
  catalog: "https://siamsolar.netlify.app",
  training: "https://cerssc.netlify.app",
};
