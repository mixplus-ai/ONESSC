import { supabase } from "./supabase";

export type DeliveryStatus = "scheduled" | "waiting" | "shipped" | "delivered" | "cancelled";

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: "navy" | "amber" | "green" | "slate" | "red"; color: string }> = {
  scheduled: { label: "นัดส่งแล้ว", tone: "navy", color: "#1e3a8a" },
  waiting: { label: "รอข้อมูล/รอรถ", tone: "amber", color: "#d97706" },
  shipped: { label: "ออกจากคลังแล้ว", tone: "navy", color: "#0284c7" },
  delivered: { label: "ส่งถึงแล้ว", tone: "green", color: "#059669" },
  cancelled: { label: "ยกเลิก", tone: "red", color: "#94a3b8" },
};

export interface DeliveryItem {
  id?: string;
  model: string;
  description: string;
  unit_watt: number | null;
  qty: number;
  total_watt: number | null;
}

export interface Delivery {
  id: string;
  doc_no: string | null;
  doc_date: string | null;
  delivery_date: string;
  status: DeliveryStatus;
  customer_name: string;
  customer_tax_id: string | null;
  company_id: string | null;
  customer_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  site: string | null;
  warehouse: string | null;
  notes: string | null;
  internal_note: string | null;
  sales_name: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
  delivery_items: DeliveryItem[];
}

export type DeliveryDraft = Omit<Delivery, "id" | "created_at" | "updated_at" | "company_id" | "file_path" | "file_name"> & {
  id?: string;
  file?: File | null;
  file_path?: string | null;
  file_name?: string | null;
  warnings: string[];
};

export const emptyDraft = (): DeliveryDraft => ({
  doc_no: "",
  doc_date: null,
  delivery_date: "",
  status: "scheduled",
  customer_name: "",
  customer_tax_id: "",
  customer_address: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  site: "",
  warehouse: "",
  notes: "",
  internal_note: "",
  sales_name: "",
  delivery_items: [{ model: "", description: "", unit_watt: null, qty: 0, total_watt: null }],
  warnings: [],
});

// ---------------------------------------------------------------------------
// Reading a delivery note PDF
// ---------------------------------------------------------------------------

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Thai PDF fonts often draw shifted tone marks from the Private Use Area (U+F700–F71A).
 * Map them back to the real Thai characters so names and addresses keep their tone marks.
 */
const THAI_PUA = [
  "ฐ", "ิ", "ี", "ึ", "ื", // F700–F704
  "่", "้", "๊", "๋", "์", // F705–F709 low-left
  "่", "้", "๊", "๋", "์", // F70A–F70E low
  "ญ", "ั", "ํ", "็", // F70F–F712
  "่", "้", "๊", "๋", "์", // F713–F717 left
  "ุ", "ู", "ฺ", // F718–F71A
];

/** Fix PUA tone marks and decomposed vowels (ํา → ำ), then tidy spaces. */
export const cleanThai = (s: string) =>
  s
    .replace(/[-]/g, (c) => THAI_PUA[c.charCodeAt(0) - 0xf700] ?? "")
    .replace(/[-]/g, "")
    .replace(/ํา/g, "ำ")
    .replace(/\s+/g, " ")
    .trim();

const num = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** dd-mm-yyyy (or /, .) → yyyy-mm-dd; Buddhist-era years are converted. */
export function parseDate(s: string | undefined): string | null {
  const m = s?.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y > 2400) y -= 543;
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Group text items into visual lines (top to bottom, left to right). */
function toLines(items: TextItem[]) {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2.5);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Turn the text of an SSC delivery note (ใบส่งสินค้า / PI) into a draft.
 * The buyer sits in the left column and the seller in the right one, so labels are matched per column.
 */
export function parseDeliveryText(items: TextItem[]): DeliveryDraft {
  const d = emptyDraft();
  d.delivery_items = [];
  const clean = items.map((i) => ({ ...i, str: cleanThai(i.str) })).filter((i) => i.str);
  const lines = toLines(clean);
  const xs = clean.map((i) => i.x);
  const mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 300;
  const allText = lines.map((l) => l.items.map((i) => i.str).join(" ")).join("\n");

  /** Value right of a label on the same line, within one column. */
  const after = (label: RegExp, side: "left" | "right" | "any" = "any") => {
    for (const l of lines) {
      const inSide = l.items.filter((i) => side === "any" || (side === "left" ? i.x < mid : i.x >= mid));
      const k = inSide.findIndex((i) => label.test(i.str));
      if (k < 0) continue;
      const rest = inSide[k].str.replace(label, "").replace(/^\s*:?\s*/, "");
      if (rest) return rest;
      if (inSide[k + 1]) return inSide[k + 1].str;
    }
    return "";
  };

  d.doc_no = (allText.match(/PI\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9-/]+)/i)?.[1] ?? after(/^PI NO\.?:?/i)).trim() || "";
  d.doc_date = parseDate(after(/^PI DATE:?/i)) ?? null;

  d.customer_name = after(/^The Buyer:?/i, "left");
  d.customer_tax_id = (after(/^Tax ID:?/i, "left").match(/\d{13}/)?.[0] ?? "") || "";
  d.contact_name = after(/^Attn:?/i, "left");
  d.contact_phone = after(/^Tel:?/i, "left");
  d.contact_email = after(/^E-?mail:?/i, "left");
  d.sales_name = after(/^Name:?/i, "right");

  // address may wrap onto following lines until the Tax ID line
  const addrIdx = lines.findIndex((l) => l.items.some((i) => i.x < mid && /^Address:?/i.test(i.str)));
  if (addrIdx >= 0) {
    const parts: string[] = [];
    for (let n = addrIdx; n < lines.length; n++) {
      const left = lines[n].items.filter((i) => i.x < mid);
      if (n > addrIdx && left.some((i) => /:\s*$|^Tax ID/i.test(i.str))) break;
      parts.push(left.filter((i) => !/^Address:?$/i.test(i.str)).map((i) => i.str.replace(/^Address:?\s*/i, "")).join(" "));
      if (n - addrIdx > 3) break;
    }
    d.customer_address = parts.join("").trim();
  }

  d.site = allText.match(/โครงการ\s*\/\s*สถานที่ติดตั้ง\s*:?\s*(.+)/)?.[1]?.trim() ?? "";
  d.delivery_date = parseDate(allText.match(/วันที่(?:รับ|ส่ง)สินค\S*\s*:?\s*([0-9/.\- ]{8,12})/)?.[1]) ?? "";

  const notes = [...allText.matchAll(/หมายเหตุ\s*\d+\s*:\s*(.+)/g)].map((m) => m[1].trim());
  d.notes = notes.join("\n");
  d.warehouse = notes.map((n) => n.match(/คลัง\s*(.+)/)?.[0]).find(Boolean) ?? "";
  if (notes.some((n) => /รอ/.test(n))) d.status = "waiting";

  // items: between the "Model Type" header and the delivery-date line
  const start = lines.findIndex((l) => l.items.some((i) => /^Model\s*Type/i.test(i.str)));
  const end = lines.findIndex((l, n) => n > start && l.items.some((i) => /วันที่(รับ|ส่ง)สินค|หมายเหตุ/.test(i.str)));
  if (start >= 0) {
    for (const l of lines.slice(start + 1, end < 0 ? undefined : end)) {
      const nums = l.items.filter((i) => /^[\d,]+(\.\d+)?$/.test(i.str));
      const text = l.items.filter((i) => !/^[\d,]+(\.\d+)?$/.test(i.str)).map((i) => i.str).join(" ");
      if (/^(\(Wps|PCS|Wps|Quantity|Peak)/i.test(text) && !nums.length) continue;
      if (nums.length >= 2 && text) {
        const [a, b, c] = nums.map((i) => num(i.str));
        // 3 numbers = watt/pc, pcs, total watt · 2 numbers = pcs, total or watt, pcs
        const item: DeliveryItem =
          nums.length >= 3
            ? { model: text, description: "", unit_watt: a, qty: b ?? 0, total_watt: c }
            : { model: text, description: "", unit_watt: null, qty: a ?? 0, total_watt: b };
        d.delivery_items.push(item);
      } else if (text && d.delivery_items.length && !nums.length) {
        const last = d.delivery_items[d.delivery_items.length - 1];
        last.description = [last.description, text].filter(Boolean).join(" ");
      }
    }
  }

  if (!d.delivery_items.length) d.delivery_items.push({ model: "", description: "", unit_watt: null, qty: 0, total_watt: null });
  if (!d.delivery_date) d.warnings.push("ไม่พบวันที่รับสินค้าในเอกสาร กรุณาเลือกวันส่งเอง");
  if (!d.customer_name) d.warnings.push("ไม่พบชื่อลูกค้า");
  if (!d.delivery_items[0].model) d.warnings.push("ไม่พบรายการสินค้า");
  if (/[฀-๿]/.test(d.customer_name + d.customer_address)) d.warnings.push("ตรวจตัวสะกดชื่อและที่อยู่ภาษาไทยก่อนบันทึก");
  return d;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
export async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

/** Read the first page's text from a PDF file in the browser and parse it. */
export async function readDeliveryPdf(file: File): Promise<DeliveryDraft> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items: TextItem[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const offset = (p - 1) * -10000;
    for (const it of tc.items) if ("str" in it && it.str.trim()) items.push({ str: it.str, x: it.transform[4], y: it.transform[5] + offset });
  }
  if (!items.length) {
    const d = emptyDraft();
    d.warnings.push("ไฟล์นี้เป็นภาพสแกน ระบบอ่านตัวอักษรไม่ได้ กรุณากรอกข้อมูลเอง (ไฟล์จะถูกแนบไว้)");
    return { ...d, file, file_name: file.name };
  }
  return { ...parseDeliveryText(items), file, file_name: file.name };
}

/** Document number without its revision suffix: PI-SSC2026091004-R3 → PI-SSC2026091004 */
export const docBase = (no: string | null | undefined) => (no ?? "").trim().toUpperCase().replace(/-R\d+$/, "");

export const DELIVERY_SELECT = "*, delivery_items(*)";

export async function loadDeliveries(from: string, to: string) {
  return supabase
    .from("deliveries")
    .select(DELIVERY_SELECT)
    .gte("delivery_date", from)
    .lte("delivery_date", to)
    .order("delivery_date")
    .order("created_at")
    .returns<Delivery[]>();
}

/** Insert or update a delivery (a newer revision of the same document number updates the old one), then its items and file. */
export async function saveDelivery(d: DeliveryDraft): Promise<{ id: string; replaced: boolean }> {
  let id = d.id;
  let replaced = false;
  if (!id && d.doc_no) {
    const base = docBase(d.doc_no);
    const { data } = await supabase.from("deliveries").select("id, doc_no").ilike("doc_no", `${base}%`);
    const hit = (data ?? []).find((r) => docBase(r.doc_no) === base);
    if (hit) {
      id = hit.id;
      replaced = true;
    }
  }
  const row = {
    doc_no: d.doc_no?.trim() || null,
    doc_date: d.doc_date || null,
    delivery_date: d.delivery_date,
    status: d.status,
    customer_name: d.customer_name.trim(),
    customer_tax_id: d.customer_tax_id?.trim() || null,
    customer_address: d.customer_address?.trim() || null,
    contact_name: d.contact_name?.trim() || null,
    contact_phone: d.contact_phone?.trim() || null,
    contact_email: d.contact_email?.trim() || null,
    site: d.site?.trim() || null,
    warehouse: d.warehouse?.trim() || null,
    notes: d.notes?.trim() || null,
    internal_note: d.internal_note?.trim() || null,
    sales_name: d.sales_name?.trim() || null,
  };
  if (id) {
    const { error } = await supabase.from("deliveries").update(row).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("deliveries").insert(row).select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  const { error: delErr } = await supabase.from("delivery_items").delete().eq("delivery_id", id);
  if (delErr) throw delErr;
  const items = d.delivery_items
    .filter((i) => i.model.trim())
    .map((i, n) => ({ delivery_id: id, sort: n, model: i.model.trim(), description: i.description?.trim() || null, unit_watt: i.unit_watt, qty: i.qty || 0, total_watt: i.total_watt }));
  if (items.length) {
    const { error } = await supabase.from("delivery_items").insert(items);
    if (error) throw error;
  }
  if (d.file) {
    const safe = d.file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "file.pdf";
    const path = `${id}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("delivery-files").upload(path, d.file, { contentType: d.file.type || "application/pdf" });
    if (error) throw error;
    const { error: e2 } = await supabase.from("deliveries").update({ file_path: path, file_name: d.file.name }).eq("id", id);
    if (e2) throw e2;
  }
  return { id: id!, replaced };
}

export async function openDeliveryFile(path: string) {
  const { data, error } = await supabase.storage.from("delivery-files").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export const sumQty = (items: DeliveryItem[]) => items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
export const sumWatt = (items: DeliveryItem[]) => items.reduce((s, i) => s + (Number(i.total_watt) || 0), 0);
