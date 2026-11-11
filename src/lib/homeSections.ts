// Home page builder: the home page is a list of blocks (sections) stored in site_settings.home.sections.
// Admins add, reorder, hide and edit blocks in "เนื้อหาเว็บและโฆษณา → หน้าแรก".
import type { SiteSettings } from "./types";

export type Bg = "white" | "light" | "dark" | "brand";
export type Anim = "fade-up" | "fade" | "zoom" | "slide" | "none";
export type IconKey = "box" | "academic" | "wrench" | "shield" | "sun" | "bolt" | "chart" | "users" | "star" | "truck" | "gift" | "building";

export interface Btn { label: string; href: string }
export interface Slide { image_url: string; video_url: string }

interface Base { id: string; hidden?: boolean; bg?: Bg; anim?: Anim }

export interface HeroSection extends Base {
  type: "hero";
  slides: Slide[]; // 1 slide = static image/video; more = slideshow
  badge: string;
  title: string;
  subtitle: string;
  buttons: Btn[];
  height: "full" | "large" | "medium";
  align: "left" | "center";
  overlay: number; // 0–90 (%)
  show_brands: boolean;
}
export interface ModulesSection extends Base {
  type: "modules";
  items: { icon: IconKey; title: string; text: string; href: string }[];
}
export interface StatsSection extends Base {
  type: "stats";
  eyebrow: string;
  title: string;
  items: { value: number; suffix: string; label: string }[];
}
export interface ImageTextSection extends Base {
  type: "image_text";
  eyebrow: string;
  title: string;
  text: string;
  bullets: string[];
  image_url: string;
  video_url: string;
  side: "left" | "right";
  button: Btn;
}
export interface VideoSection extends Base {
  type: "video";
  eyebrow: string;
  title: string;
  subtitle: string;
  video_url: string; // mp4/webm upload or YouTube / Vimeo link
  poster_url: string;
  autoplay: boolean;
}
export interface CardsSection extends Base {
  type: "cards";
  eyebrow: string;
  title: string;
  subtitle: string;
  columns: 2 | 3 | 4;
  items: { image_url: string; title: string; text: string; href: string }[];
}
export interface LogosSection extends Base {
  type: "logos";
  title: string;
  logos: string[]; // image URLs; empty = brand names from "เกี่ยวกับเรา"
  marquee: boolean;
}
export interface GallerySection extends Base {
  type: "gallery";
  eyebrow: string;
  title: string;
  images: string[];
}
export interface CtaSection extends Base {
  type: "cta";
  title: string;
  text: string;
  image_url: string;
  buttons: Btn[];
}
export interface TextSection extends Base {
  type: "text";
  eyebrow: string;
  title: string;
  body: string;
  align: "left" | "center";
}
/** Blocks whose content comes from elsewhere in the system. */
export interface FeedSection extends Base {
  type: "about" | "products" | "shop" | "training" | "portfolio" | "team" | "contact";
  eyebrow: string;
  title: string;
  subtitle: string;
  limit: number;
}
export interface AdSection extends Base {
  type: "ad";
  placement: "home_top" | "home_middle";
}

export type HomeSection =
  | HeroSection | ModulesSection | StatsSection | ImageTextSection | VideoSection | CardsSection
  | LogosSection | GallerySection | CtaSection | TextSection | FeedSection | AdSection;
export type SectionType = HomeSection["type"];

export const BG_LABEL: Record<Bg, string> = { white: "ขาว", light: "เทาอ่อน", dark: "น้ำเงินเข้ม", brand: "ส้มแบรนด์" };
export const ANIM_LABEL: Record<Anim, string> = { "fade-up": "ค่อย ๆ ลอยขึ้น", fade: "ค่อย ๆ ปรากฏ", zoom: "ซูมเข้า", slide: "เลื่อนจากด้านข้าง", none: "ไม่มี" };
export const ICON_LABEL: Record<IconKey, string> = {
  box: "กล่องสินค้า", academic: "หมวกอบรม", wrench: "ประแจ", shield: "โล่", sun: "พระอาทิตย์", bolt: "สายฟ้า",
  chart: "กราฟ", users: "ทีมงาน", star: "ดาว", truck: "รถส่งของ", gift: "ของขวัญ", building: "อาคาร",
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const SECTION_TYPES: { type: SectionType; label: string; desc: string; group: "ออกแบบเอง" | "ดึงข้อมูลจากระบบ" }[] = [
  { type: "hero", label: "แบนเนอร์หลัก (Hero)", desc: "ภาพหรือวิดีโอเต็มจอ สไลด์ได้หลายภาพ พร้อมหัวข้อและปุ่ม", group: "ออกแบบเอง" },
  { type: "modules", label: "การ์ดทางลัด", desc: "การ์ดไอคอนลิงก์ไปหน้าต่าง ๆ", group: "ออกแบบเอง" },
  { type: "stats", label: "ตัวเลขผลงาน", desc: "ตัวเลขนับขึ้นอัตโนมัติ เช่น จำนวนโครงการ", group: "ออกแบบเอง" },
  { type: "image_text", label: "ภาพคู่ข้อความ", desc: "ภาพหรือวิดีโอด้านหนึ่ง ข้อความและปุ่มอีกด้าน", group: "ออกแบบเอง" },
  { type: "video", label: "วิดีโอ", desc: "อัปโหลดวิดีโอ หรือวางลิงก์ YouTube", group: "ออกแบบเอง" },
  { type: "cards", label: "การ์ดรูปภาพ", desc: "บริการหรือจุดเด่น 2–4 คอลัมน์", group: "ออกแบบเอง" },
  { type: "logos", label: "โลโก้แบรนด์/พาร์ทเนอร์", desc: "แถบโลโก้เลื่อนอัตโนมัติ", group: "ออกแบบเอง" },
  { type: "gallery", label: "แกลเลอรีภาพ", desc: "ภาพหลายภาพ คลิกดูภาพใหญ่", group: "ออกแบบเอง" },
  { type: "cta", label: "แถบชวนติดต่อ (CTA)", desc: "ข้อความเด่นพร้อมปุ่ม บนภาพพื้นหลัง", group: "ออกแบบเอง" },
  { type: "text", label: "ข้อความ", desc: "หัวข้อและย่อหน้า", group: "ออกแบบเอง" },
  { type: "about", label: "เกี่ยวกับเรา", desc: "ประวัติและวิสัยทัศน์จากแท็บข้อมูลบริษัท", group: "ดึงข้อมูลจากระบบ" },
  { type: "products", label: "สินค้าและอบรมล่าสุด", desc: "ลิงก์สินค้า/โปรโมชั่น และรอบอบรมที่กำลังจะมาถึง", group: "ดึงข้อมูลจากระบบ" },
  { type: "shop", label: "ร้านค้า: ค้นหา หมวด สินค้าแนะนำ", desc: "ช่องค้นหา ไอคอนหมวดสินค้า และสินค้าแนะนำเลื่อนดูได้ แบบแอปมือถือ", group: "ดึงข้อมูลจากระบบ" },
  { type: "training", label: "รอบอบรมที่เปิดรับ", desc: "การ์ดรอบอบรมจากระบบอบรม", group: "ดึงข้อมูลจากระบบ" },
  { type: "portfolio", label: "ผลงาน", desc: "โครงการจากหน้าผลงาน", group: "ดึงข้อมูลจากระบบ" },
  { type: "team", label: "ทีมงาน", desc: "รายชื่อจากหน้าทีมงาน", group: "ดึงข้อมูลจากระบบ" },
  { type: "contact", label: "ติดต่อเรา", desc: "ที่อยู่ เบอร์ แผนที่ และฟอร์มติดต่อ", group: "ดึงข้อมูลจากระบบ" },
  { type: "ad", label: "ช่องโฆษณา", desc: "แบนเนอร์จากแท็บโฆษณา", group: "ดึงข้อมูลจากระบบ" },
];
export const sectionLabel = (t: SectionType) => SECTION_TYPES.find((x) => x.type === t)?.label ?? t;

const feed = (type: FeedSection["type"], eyebrow: string, title: string, subtitle = "", limit = 6): FeedSection => ({ id: uid(), type, eyebrow, title, subtitle, limit, anim: "fade-up" });

/** A fresh block of the given type with sample content. */
export function newSection(type: SectionType): HomeSection {
  const id = uid();
  switch (type) {
    case "hero":
      return { id, type, slides: [{ image_url: "", video_url: "" }], badge: "", title: "หัวข้อหลัก", subtitle: "คำอธิบายสั้น ๆ", buttons: [{ label: "ดูสินค้า", href: "/products" }], height: "large", align: "left", overlay: 55, show_brands: false, anim: "fade-up" };
    case "modules":
      return { id, type, anim: "fade-up", items: [{ icon: "box", title: "หัวข้อ", text: "คำอธิบาย", href: "/products" }] };
    case "stats":
      return { id, type, bg: "dark", anim: "fade-up", eyebrow: "", title: "ตัวเลขที่เราภูมิใจ", items: [{ value: 500, suffix: "+", label: "โครงการ" }, { value: 10, suffix: " ปี", label: "ประสบการณ์" }, { value: 1000, suffix: "+", label: "ผู้ผ่านการอบรม" }] };
    case "image_text":
      return { id, type, anim: "slide", eyebrow: "", title: "หัวข้อ", text: "รายละเอียด", bullets: [], image_url: "", video_url: "", side: "left", button: { label: "", href: "" } };
    case "video":
      return { id, type, bg: "light", anim: "zoom", eyebrow: "", title: "วิดีโอแนะนำบริษัท", subtitle: "", video_url: "", poster_url: "", autoplay: false };
    case "cards":
      return { id, type, anim: "fade-up", eyebrow: "", title: "บริการของเรา", subtitle: "", columns: 3, items: [{ image_url: "", title: "บริการ", text: "รายละเอียด", href: "" }] };
    case "logos":
      return { id, type, bg: "white", anim: "fade", title: "แบรนด์ที่เราเป็นตัวแทน", logos: [], marquee: true };
    case "gallery":
      return { id, type, anim: "fade-up", eyebrow: "", title: "ภาพบรรยากาศ", images: [] };
    case "cta":
      return { id, type, bg: "brand", anim: "zoom", title: "พร้อมเริ่มโครงการของคุณหรือยัง", text: "ทีมงานพร้อมให้คำปรึกษาและเสนอราคา", image_url: "", buttons: [{ label: "ขอใบเสนอราคา", href: "/contact?topic=quotation" }] };
    case "text":
      return { id, type, anim: "fade-up", eyebrow: "", title: "หัวข้อ", body: "ข้อความ", align: "center" };
    case "ad":
      return { id, type, placement: "home_middle" };
    case "about":
      return feed("about", "เกี่ยวกับเรา", "พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ");
    case "products":
      return { ...feed("products", "", "สินค้าแนะนำและโปรโมชั่น", "ดูสินค้า ราคา สต๊อก และโปรโมชั่นล่าสุด พร้อมขอใบเสนอราคาออนไลน์"), bg: "white" };
    case "shop":
      return { ...feed("shop", "สินค้า", "สินค้าแนะนำ", "", 8), bg: "white" };
    case "training":
      return feed("training", "อบรมและกิจกรรม", "รอบอบรมที่เปิดรับสมัคร", "", 3);
    case "portfolio":
      return feed("portfolio", "ผลงาน", "โครงการที่เราติดตั้ง", "ตัวอย่างงานบ้านพักอาศัย โรงงาน และอาคารพาณิชย์");
    case "team":
      return { ...feed("team", "ทีมงาน", "ติดต่อพนักงานได้โดยตรง", "ฝ่ายขาย ฝ่ายบริการ และฝ่ายประสานงาน พร้อมช่วยเหลือคุณ"), bg: "white" };
    case "contact":
      return feed("contact", "ติดต่อเรา", "ติดต่อบริษัท");
  }
}

/** The home page as it looked before the builder, rebuilt from the older settings fields. */
export function defaultSections(s: SiteSettings): HomeSection[] {
  const h = s.home;
  const icons: IconKey[] = ["box", "academic", "wrench", "shield"];
  const hrefs = ["/products", "/training", "/claims", "/register"];
  return [
    {
      id: "hero", type: "hero", anim: "fade-up",
      slides: [{ image_url: s.hero.image_url, video_url: "" }],
      badge: h.badge, title: s.hero.title, subtitle: s.hero.subtitle,
      buttons: [{ label: s.hero.cta_primary_label, href: s.hero.cta_primary_href }, { label: s.hero.cta_secondary_label, href: s.hero.cta_secondary_href }],
      height: "large", align: "left", overlay: 60, show_brands: true,
    },
    { id: "modules", type: "modules", anim: "fade-up", items: h.modules.map((m, i) => ({ icon: icons[i] ?? "sun", title: m.title, text: m.text, href: hrefs[i] ?? "/" })) },
    { id: "shop", type: "shop", bg: "white", anim: "fade-up", eyebrow: "สินค้า", title: "สินค้าแนะนำ", subtitle: "", limit: 8 },
    { id: "ad-top", type: "ad", placement: "home_top" },
    { id: "about", type: "about", anim: "fade-up", eyebrow: "เกี่ยวกับเรา", title: h.about_title, subtitle: "", limit: 0 },
    { id: "products", type: "products", bg: "white", anim: "fade-up", eyebrow: "", title: h.products_title, subtitle: h.products_text, limit: 3 },
    { id: "ad-middle", type: "ad", placement: "home_middle" },
    { id: "portfolio", type: "portfolio", anim: "fade-up", eyebrow: "ผลงาน", title: h.portfolio_title, subtitle: h.portfolio_subtitle, limit: 6 },
    { id: "team", type: "team", bg: "white", anim: "fade-up", eyebrow: "ทีมงาน", title: h.team_title, subtitle: h.team_subtitle, limit: 6 },
    { id: "contact", type: "contact", anim: "fade-up", eyebrow: "ติดต่อเรา", title: "", subtitle: "", limit: 0 },
  ];
}

export const homeSections = (s: SiteSettings): HomeSection[] => (s.home.sections?.length ? s.home.sections : defaultSections(s));

/** The About page as it looked before the builder, rebuilt from the "about" banner and company fields. */
export function defaultAboutSections(s: SiteSettings): HomeSection[] {
  const pg = s.pages.about;
  const list: HomeSection[] = [
    {
      id: "about-hero", type: "hero", anim: "fade-up",
      slides: [{ image_url: pg.image_url, video_url: "" }],
      badge: pg.eyebrow, title: pg.title || s.company.name_th, subtitle: pg.subtitle || s.company.tagline,
      buttons: [{ label: "ติดต่อเรา", href: "/contact" }],
      height: "medium", align: "left", overlay: 60, show_brands: false,
    },
    { id: "about-story", type: "about", anim: "fade-up", eyebrow: "ประวัติบริษัท", title: s.home.about_title, subtitle: "", limit: 0 },
  ];
  if (s.about.brands.length) list.push({ id: "about-brands", type: "logos", bg: "white", anim: "fade", title: "แบรนด์ที่เป็นตัวแทนจำหน่าย", logos: [], marquee: true });
  if (s.about.certificates.length) {
    list.push({ id: "about-certs", type: "text", anim: "fade-up", eyebrow: "มาตรฐาน", title: "ใบรับรอง", body: s.about.certificates.map((c) => `• ${c}`).join("\n"), align: "center" });
  }
  list.push(
    { id: "about-team", type: "team", bg: "white", anim: "fade-up", eyebrow: "ทีมงาน", title: s.home.team_title, subtitle: s.home.team_subtitle, limit: 6 },
    { id: "about-cta", type: "cta", bg: "brand", anim: "zoom", title: "อยากคุยกับทีมงานของเรา", text: "สอบถามสินค้า ขอใบเสนอราคา หรือนัดอบรม ติดต่อได้ทุกช่องทาง", image_url: "", buttons: [{ label: "ติดต่อเรา", href: "/contact" }] },
  );
  return list;
}

export const aboutSections = (s: SiteSettings): HomeSection[] => (s.about.sections?.length ? s.about.sections : defaultAboutSections(s));

/** YouTube / Vimeo link → embed URL; null for a direct video file. */
export function embedUrl(url: string, autoplay = false): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    const p = autoplay ? `?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&controls=0&modestbranding=1&playsinline=1&rel=0` : "?rel=0&modestbranding=1";
    return `https://www.youtube-nocookie.com/embed/${yt[1]}${p}`;
  }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}${autoplay ? "?autoplay=1&muted=1&loop=1&background=1" : ""}`;
  return null;
}
