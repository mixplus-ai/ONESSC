import QRCode from "qrcode";
import { supabase, supabaseConfigured } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CertField {
  show: boolean;
  x: number; // 0–1 of image width
  y: number; // 0–1 of image height
  size: number; // font size (or QR size) as a fraction of image width
  color?: string;
  weight?: number;
  font?: string;
  align?: CanvasTextAlign;
  maxWidth?: number;
  prefix?: string;
}
export type CertFieldKey = "name" | "nameEn" | "course" | "certNo" | "date" | "expires" | "qr";
export interface CertConfig {
  dateLang?: "th" | "en";
  fields?: Partial<Record<CertFieldKey, CertField>>;
}
export interface CertTemplate {
  id: string;
  name: string;
  image_url: string | null;
  config: CertConfig;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  hours: number | null;
  price: number | null;
  color: string | null;
  cover_url: string | null;
  cert_template_id: string | null;
  is_active: boolean;
  sort: number;
}

export interface Session {
  id: string;
  course_id: string;
  title: string | null;
  starts_on: string;
  ends_on: string | null;
  start_time: string;
  end_time: string;
  hours: number | null;
  location: string | null;
  map_url: string | null;
  lat: number | null;
  lng: number | null;
  capacity: number;
  status: "open" | "closed" | "cancelled";
  price: number | null;
  vat: boolean;
  wht_allowed: boolean;
  cert_template_id: string | null;
  note: string | null;
  is_archived: boolean;
  courses?: Course;
}

/** checkin_code is hidden from the API: always list session columns explicitly. */
export const SESSION_COLS: string =
  "id, course_id, title, starts_on, ends_on, start_time, end_time, hours, location, map_url, lat, lng, capacity, status, price, vat, wht_allowed, cert_template_id, note, is_archived";

export type RegStatus = "registered" | "attended" | "cancelled" | "no_show" | "rescheduled";
export type PayStatus = "free" | "unpaid" | "pending" | "paid" | "refunded";
export interface Billing {
  type: "company" | "person" | "person_no_vat";
  name: string;
  tax_id?: string;
  branch?: string;
  address?: string;
}
export interface Registration {
  id: string;
  code: string;
  user_id: string | null;
  session_id: string;
  status: RegStatus;
  registered_at: string;
  checked_in_at: string | null;
  check_in_method: string | null;
  points_awarded: number | null;
  evaluated_at: string | null;
  evaluation: Record<string, unknown> | null;
  cert_no: string | null;
  cert_issued_at: string | null;
  cert_expires_on: string | null;
  rescheduled_from: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  pay_status: PayStatus;
  wants_quote: boolean;
  quote_file_path: string | null;
  subtotal: number;
  discount: number;
  vat_amount: number;
  wht_amount: number;
  total: number;
  billing: Billing | null;
  coupon_code: string | null;
  slip_path: string | null;
  wht_cert_path: string | null;
  receipt_path: string | null;
  paid_at: string | null;
  sale_name: string | null;
  source: string | null;
  note: string | null;
  staff_note: string | null;
  course_sessions?: Session & { courses?: Course };
  profiles?: { full_name: string | null; email: string; phone: string | null; name_en: string | null } | null;
}

export interface TrainingSettings {
  max_active_bookings: number;
  change_days_before: number;
  strike_limit: number;
  auto_no_show: boolean;
  checkin_open_minutes: number;
  checkin_radius_m: number;
  cert_format: string;
  cert_run_digits: number;
  cert_valid_months: number;
  cert_requires_evaluation: boolean;
  vat_rate: number;
  wht_rate: number;
  person_no_vat: boolean;
  pay_info: string | null;
  wht_payee_info: string | null;
  sales_list: string[];
  source_list: string[];
  evaluation_questions: string[];
  email_enabled: boolean;
  confirm_email: boolean;
  reminder_days_before: number;
  email_note: string | null;
}

export interface TrainingStatus {
  strikes: number;
  strike_limit: number;
  banned: boolean;
  banned_until: string | null;
  active_bookings: number;
  max_active_bookings: number;
  change_days_before: number;
  personal_points: number;
  company_points: number | null;
}

export interface PointsConfig {
  points_per_hour: number;
  rewards_enabled: boolean;
  lucky_cost: number;
  company_baht_per_point: number;
  company_tiers: { min: number; multiplier: number }[];
  company_expiry: "end_of_year" | "end_of_next_year" | "none";
}

export interface Reward {
  id: string;
  wallet: "personal" | "company";
  kind: "item" | "prize";
  name: string;
  description: string | null;
  image_url: string | null;
  points: number | null;
  stock: number | null;
  weight: number | null;
  discount_baht: number | null;
  bonus_points: number | null;
  is_active: boolean;
  sort: number;
}

export interface Redemption {
  id: string;
  code: string;
  wallet: "personal" | "company";
  user_id: string | null;
  company_id: string | null;
  reward_id: string | null;
  reward_name: string;
  points: number;
  method: "direct" | "lucky" | "staff";
  status: "issued" | "used" | "cancelled";
  ref_doc: string | null;
  note: string | null;
  used_at: string | null;
  used_ref: string | null;
  cancel_reason: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
  companies?: { name: string; tax_id: string } | null;
}

export interface LedgerRow {
  id: number;
  wallet: "personal" | "company";
  user_id: string | null;
  company_id: string | null;
  points: number;
  kind: "earn" | "purchase" | "adjust" | "redeem" | "lucky" | "refund";
  expires_on: string | null;
  invoice_no: string | null;
  doc_date: string | null;
  amount: number | null;
  items: string | null;
  file_path: string | null;
  calc: Record<string, unknown> | null;
  registration_id: string | null;
  redemption_id: string | null;
  replaces_id: number | null;
  ref_doc: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface Bonus {
  id: string;
  label: string;
  multiplier: number;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
type Tone = "slate" | "green" | "amber" | "red" | "navy";
export const REG_STATUS: Record<RegStatus, { label: string; tone: Tone }> = {
  registered: { label: "ลงทะเบียนแล้ว", tone: "navy" },
  attended: { label: "เข้าอบรมแล้ว", tone: "green" },
  cancelled: { label: "ยกเลิก", tone: "slate" },
  no_show: { label: "ไม่มาอบรม", tone: "red" },
  rescheduled: { label: "เลื่อนรอบแล้ว", tone: "slate" },
};
export const PAY_STATUS: Record<PayStatus, { label: string; tone: Tone }> = {
  free: { label: "ไม่มีค่าใช้จ่าย", tone: "slate" },
  unpaid: { label: "รอชำระเงิน", tone: "amber" },
  pending: { label: "รอตรวจสลิป", tone: "navy" },
  paid: { label: "ชำระแล้ว", tone: "green" },
  refunded: { label: "คืนเงินแล้ว", tone: "slate" },
};
export const BILLING_TYPE: Record<Billing["type"], string> = {
  company: "นิติบุคคล (ใบกำกับภาษี + หัก ณ ที่จ่าย)",
  person: "บุคคลธรรมดา (ใบกำกับภาษี)",
  person_no_vat: "บุคคลธรรมดา (ไม่รับใบกำกับภาษี)",
};
export const LEDGER_KIND: Record<LedgerRow["kind"], string> = {
  earn: "ได้จากการอบรม",
  purchase: "ยอดซื้อ",
  adjust: "ปรับแต้ม",
  redeem: "แลกของรางวัล",
  lucky: "สุ่มรางวัล",
  refund: "คืนแต้ม",
};
export const REDEMPTION_STATUS: Record<Redemption["status"], { label: string; tone: Tone }> = {
  issued: { label: "ยังไม่ได้ใช้", tone: "amber" },
  used: { label: "ใช้แล้ว", tone: "green" },
  cancelled: { label: "ยกเลิก", tone: "slate" },
};
export const SESSION_STATUS: Record<Session["status"], { label: string; tone: Tone }> = {
  open: { label: "เปิดรับสมัคร", tone: "green" },
  closed: { label: "ปิดรับสมัคร", tone: "amber" },
  cancelled: { label: "ยกเลิกรอบ", tone: "red" },
};
export const EXPIRY_LABEL: Record<PointsConfig["company_expiry"], string> = {
  end_of_year: "สิ้นปีที่ซื้อ (31 ธ.ค.)",
  end_of_next_year: "สิ้นปีถัดไป",
  none: "ไม่มีวันหมดอายุ",
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const num = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });
export const formatPoints = (n: number | null | undefined) => num.format(Number(n ?? 0));
export const formatMoney = (n: number | null | undefined) => `฿${new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n ?? 0))}`;
export const formatThaiDate = (d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("th-TH", opts) : "-";
export const formatTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
export const sessionDateText = (s: Pick<Session, "starts_on" | "ends_on" | "start_time" | "end_time">) =>
  `${formatThaiDate(s.starts_on, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${
    s.ends_on && s.ends_on !== s.starts_on ? ` – ${formatThaiDate(s.ends_on)}` : ""
  } · ${formatTime(s.start_time)}–${formatTime(s.end_time)} น.`;
export const sessionPrice = (s: Pick<Session, "price">, c?: Pick<Course, "price"> | null) => Number(s.price ?? c?.price ?? 0);

export function todayBkk(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
export function daysUntil(date: string): number {
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayBkk()}T00:00:00Z`).getTime()) / 86400_000);
}
/** Session start as a Date (Asia/Bangkok, UTC+7, no DST). */
export const sessionStart = (s: Pick<Session, "starts_on" | "start_time">) => new Date(`${s.starts_on}T${s.start_time.slice(0, 5)}:00+07:00`);
export const sessionEnd = (s: Pick<Session, "starts_on" | "ends_on" | "end_time">) => new Date(`${s.ends_on ?? s.starts_on}T${s.end_time.slice(0, 5)}:00+07:00`);

/** Same maths as book_session() so the confirm step shows the exact total. */
export function priceBreakdown(price: number, billing: Billing["type"], s: Pick<Session, "vat" | "wht_allowed">, cfg: Pick<TrainingSettings, "vat_rate" | "wht_rate">, discount = 0) {
  const subtotal = Math.max(price - discount, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const vat = s.vat && billing !== "person_no_vat" ? r2((subtotal * cfg.vat_rate) / 100) : 0;
  const wht = billing === "company" && s.wht_allowed ? r2((subtotal * cfg.wht_rate) / 100) : 0;
  return { price, discount, subtotal, vat, wht, total: r2(subtotal + vat - wht) };
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
export async function loadTrainingSettings(): Promise<TrainingSettings | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.from("training_settings").select("*").eq("id", 1).maybeSingle();
  return (data as TrainingSettings) ?? null;
}
export async function loadPointsConfig(): Promise<PointsConfig | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.from("points_config").select("*").eq("id", 1).maybeSingle();
  return (data as PointsConfig) ?? null;
}
export async function loadSeats(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!supabaseConfigured) return m;
  const { data } = await supabase.rpc("session_seats");
  for (const r of (data ?? []) as { session_id: string; booked: number }[]) m.set(r.session_id, r.booked);
  return m;
}

export async function uploadTrainingFile(regId: string, file: File, label: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${regId}/${label}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("training-files").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}
export async function uploadPointFile(companyId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${companyId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("point-files").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}
export async function uploadTrainingMedia(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("training-media").upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from("training-media").getPublicUrl(path).data.publicUrl;
}
export async function openPrivateFile(bucket: "training-files" | "point-files", path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  return Boolean(data?.signedUrl);
}

export const qrDataUrl = (text: string, size = 240, color = "#111111") =>
  QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: color, light: "#ffffff" } });

export const checkinUrl = (sessionId: string, code: string) => `${window.location.origin}/app/training/checkin?s=${sessionId}&c=${code}`;
export const verifyUrl = (certNo: string) => `${window.location.origin}/verify/${encodeURIComponent(certNo)}`;

/** Reads the user's GPS position (resolves null when unavailable/denied). */
export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

// ---------------------------------------------------------------------------
// Certificate rendering (canvas) — same field model as the cerssc templates
// ---------------------------------------------------------------------------
export const DEFAULT_CERT_CONFIG: CertConfig = {
  dateLang: "en",
  fields: {
    name: { show: true, x: 0.5, y: 0.4, size: 0.05, color: "#16235a", weight: 600, font: "Kanit", align: "center", maxWidth: 0.7 },
    nameEn: { show: false, x: 0.5, y: 0.45, size: 0.03, color: "#555555", weight: 400, font: "Kanit", align: "center", maxWidth: 0.7 },
    course: { show: true, x: 0.5, y: 0.52, size: 0.03, color: "#16235a", weight: 500, font: "Kanit", align: "center", maxWidth: 0.75 },
    certNo: { show: true, x: 0.08, y: 0.86, size: 0.018, color: "#333333", weight: 400, font: "Kanit", align: "left", prefix: "No. " },
    date: { show: true, x: 0.08, y: 0.89, size: 0.018, color: "#333333", weight: 400, font: "Kanit", align: "left", prefix: "Date: " },
    expires: { show: false, x: 0.08, y: 0.92, size: 0.016, color: "#333333", weight: 400, font: "Kanit", align: "left", prefix: "VALID UNTIL: " },
    qr: { show: true, x: 0.87, y: 0.82, size: 0.1, color: "#111111" },
  },
};

export interface CertData {
  name: string;
  nameEn?: string | null;
  course: string;
  certNo: string;
  date: string; // yyyy-mm-dd
  expires?: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("โหลดรูปแม่แบบไม่ได้"));
    img.src = src;
  });
}

const fmtCertDate = (d: string, lang: "th" | "en" = "en") =>
  new Date(`${d}T00:00:00`).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function renderCertificate(canvas: HTMLCanvasElement, tpl: Pick<CertTemplate, "image_url" | "config"> | null, data: CertData) {
  const cfg: CertConfig = { ...DEFAULT_CERT_CONFIG, ...(tpl?.config ?? {}), fields: { ...DEFAULT_CERT_CONFIG.fields, ...(tpl?.config?.fields ?? {}) } };
  let w = 1600;
  let h = 1131;
  let img: HTMLImageElement | null = null;
  if (tpl?.image_url) {
    try {
      img = await loadImage(tpl.image_url);
      w = img.naturalWidth;
      h = img.naturalHeight;
    } catch {
      img = null;
    }
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (img) ctx.drawImage(img, 0, 0, w, h);
  else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#16235a";
    ctx.lineWidth = w * 0.01;
    ctx.strokeRect(w * 0.03, h * 0.04, w * 0.94, h * 0.92);
    ctx.fillStyle = "#16235a";
    ctx.font = `700 ${w * 0.045}px Kanit, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("CERTIFICATE OF COMPLETION", w / 2, h * 0.24);
  }
  if (document.fonts) await document.fonts.ready;
  const lang = cfg.dateLang ?? "en";
  const texts: Partial<Record<CertFieldKey, string>> = {
    name: data.name,
    nameEn: data.nameEn ?? "",
    course: data.course,
    certNo: data.certNo,
    date: fmtCertDate(data.date, lang),
    expires: data.expires ? fmtCertDate(data.expires, lang) : "",
  };
  for (const [key, f] of Object.entries(cfg.fields ?? {}) as [CertFieldKey, CertField][]) {
    if (!f?.show) continue;
    if (key === "qr") {
      const size = Math.round(f.size * w);
      const q = await loadImage(await qrDataUrl(verifyUrl(data.certNo), size, f.color ?? "#111111"));
      ctx.drawImage(q, f.x * w - size / 2, f.y * h - size / 2, size, size);
      continue;
    }
    const text = texts[key];
    if (!text) continue;
    let size = f.size * w;
    const maxW = f.maxWidth ? f.maxWidth * w : undefined;
    const fam = `${f.font ?? "Kanit"}, "Noto Sans Thai", sans-serif`;
    ctx.font = `${f.weight ?? 400} ${size}px ${fam}`;
    const full = `${f.prefix ?? ""}${text}`;
    while (maxW && ctx.measureText(full).width > maxW && size > 8) {
      size *= 0.95;
      ctx.font = `${f.weight ?? 400} ${size}px ${fam}`;
    }
    ctx.fillStyle = f.color ?? "#111111";
    ctx.textAlign = f.align ?? "left";
    ctx.textBaseline = "middle";
    ctx.fillText(full, f.x * w, f.y * h);
  }
}

export function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name}.png`;
  a.click();
}

export function printCanvas(canvas: HTMLCanvasElement, title: string) {
  const url = canvas.toDataURL("image/png");
  const landscape = canvas.width >= canvas.height;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!doctype html><title>${title}</title><style>@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:0}html,body{margin:0}img{width:100%;height:auto;display:block}</style><img src="${url}" onload="setTimeout(()=>{window.print()},200)">`,
  );
  win.document.close();
}

/** Dynamic select strings confuse supabase-js type inference; rows are typed by the caller. */
export const cols = (s: string) => s as "*";
