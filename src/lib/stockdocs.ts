// Stock documents (migration 22): every unit in or out is a document row with its SN.
export type DocType = "OB" | "GR" | "GN" | "RT" | "SO" | "BR" | "WD" | "WO" | "TR" | "RV";
export type DocStatus = "draft" | "posted" | "cancelled";
export type SerialStatus = "in_stock" | "reserved" | "borrowed" | "withdrawn" | "sold" | "written_off";
export type Condition = "good" | "defective";

export interface Warehouse { id: string; code: string; name: string; is_active: boolean; sort: number; role?: string | null }

export interface StockDoc {
  id: string;
  doc_no: string | null;
  doc_type: DocType;
  status: DocStatus;
  doc_date: string;
  warehouse_id: string;
  to_warehouse_id: string | null;
  partner_name: string | null;
  partner_tax_id: string | null;
  company_id: string | null;
  ref_no: string | null;
  customer_po: string | null;
  site_name: string | null;
  due_date: string | null;
  reason: string | null;
  note: string | null;
  return_of: string | null;
  delivery_id: string | null;
  claim_id: string | null;
  reservation_id?: string | null;
  created_by: string | null;
  created_at: string;
  posted_by: string | null;
  posted_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
}

/** Stock count (ตรวจนับ, migration 24). */
export interface StockCount {
  id: string; count_no: string; warehouse_id: string; skus: string[] | null; status: "open" | "closed" | "cancelled";
  note: string | null; started_by: string | null; started_at: string; closed_at: string | null; result: CountReport | null;
}
export type ScanResult = "ok" | "other_wh" | "out" | "other_sku" | "unknown";
export interface CountLine { sn: string; result?: ScanResult; sku?: string; description?: string | null; status?: SerialStatus; condition?: Condition; warehouse?: string | null; holder?: string | null; dup?: boolean }
export interface CountReport {
  expected: number; scanned: number; matched: number;
  by_sku: { sku: string; expected: number; counted: number }[];
  missing: CountLine[]; extra: CountLine[];
  docs?: { id: string; doc_no: string; doc_type: DocType; n: number }[];
}
export const SCAN_RESULT: Record<ScanResult, { label: string; tone: "green" | "amber" | "red" | "navy" }> = {
  ok: { label: "ตรงกับระบบ", tone: "green" },
  other_wh: { label: "ในระบบอยู่คลังอื่น", tone: "amber" },
  out: { label: "ในระบบไม่ได้อยู่ในคลัง", tone: "red" },
  other_sku: { label: "รหัสอื่น (ไม่อยู่ในรอบนับนี้)", tone: "navy" },
  unknown: { label: "ไม่มีในระบบ", tone: "red" },
};

/** Documents that travel on a truck: vehicle / driver fields, photo kinds, and a 2-sheet print (detail + SN). */
export const TRUCK_TYPES: DocType[] = ["GR", "GN", "SO", "BR"];
export type FileKind = "plate" | "vehicle_doc" | "driver_doc" | "goods" | "other";
export const FILE_KINDS: { kind: FileKind; label: string }[] = [
  { kind: "plate", label: "รูปทะเบียนรถ" },
  { kind: "vehicle_doc", label: "เอกสารรถ" },
  { kind: "driver_doc", label: "เอกสารคนขับ" },
  { kind: "goods", label: "รูปสินค้าบนรถ" },
  { kind: "other", label: "รูป / ไฟล์อื่น" },
];

export interface DocItem { id?: string; sku: string; description: string | null; sn: string; condition: Condition; note?: string | null; warranty_months?: number | null }

export interface Serial {
  sn_key: string;
  sn: string;
  sku: string;
  description: string | null;
  status: SerialStatus;
  condition: Condition;
  warehouse_id: string | null;
  holder_name: string | null;
  company_id: string | null;
  due_date: string | null;
  last_doc_id: string | null;
  first_in_at: string | null;
  sold_at: string | null;
}

export const DIR: Record<DocType, "in" | "out" | "move"> = {
  OB: "in", GR: "in", GN: "in", RT: "in", SO: "out", BR: "out", WD: "out", WO: "out", TR: "move", RV: "move",
};

export const DOC_TYPES: { type: DocType; label: string; hint: string }[] = [
  { type: "GR", label: "ใบรับสินค้าต่างประเทศ", hint: "รับของนำเข้าเข้าคลังหลัก ตาม PI / Invoice พร้อม SN" },
  { type: "GN", label: "ใบรับสินค้าในประเทศ", hint: "รับของจากผู้ขายในประเทศเข้าคลังหลัก ตามใบส่งของผู้ขาย พร้อม SN" },
  { type: "RT", label: "ใบรับคืน", hint: "รับคืนจากใบยืม ใบเบิก ลูกค้าคืน หรือของเคลมกลับ" },
  { type: "SO", label: "ใบส่งของ", hint: "ตัดออกเมื่อขายหรือส่งให้ลูกค้า พร้อมข้อมูลรถและคนขับ" },
  { type: "BR", label: "ใบเคลมสินค้า", hint: "จ่ายของเคลม/ของเปลี่ยนให้ลูกค้า อ้างอิงเลขเคลม" },
  { type: "WD", label: "ใบเบิกชั่วคราว / ยืม", hint: "เบิกใช้ภายใน ทดสอบ ตัวโชว์ หรือให้ยืมพร้อมวันกำหนดคืน" },
  { type: "WO", label: "ใบจำหน่ายออก", hint: "ตัดออกถาวร เช่น เสียหาย สูญหาย ส่งคืนผู้ขาย" },
  { type: "TR", label: "ใบโอนคลัง", hint: "ย้ายสินค้าระหว่างคลัง" },
  { type: "RV", label: "ใบจองสินค้า", hint: "กัน SN ไว้ให้ลูกค้า ยังไม่ตัดสต๊อก" },
  { type: "OB", label: "ใบยอดยกมา", hint: "นำ SN ที่มีในคลังวันเริ่มใช้เข้าระบบ (Admin)" },
];
export const DOC_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.type, d.label])) as Record<DocType, string>;

export const DOC_STATUS_LABEL: Record<DocStatus, string> = { draft: "ร่าง", posted: "ยืนยันแล้ว", cancelled: "ยกเลิก" };
export const DOC_STATUS_TONE = { draft: "amber", posted: "green", cancelled: "red" } as const;

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "ในคลัง", reserved: "จอง", borrowed: "ส่งเคลม", withdrawn: "เบิก / ยืม", sold: "ขายแล้ว", written_off: "จำหน่ายออก",
};
export const SERIAL_STATUS_TONE = {
  in_stock: "green", reserved: "navy", borrowed: "amber", withdrawn: "amber", sold: "slate", written_off: "red",
} as const;
export const CONDITION_LABEL: Record<Condition, string> = { good: "ดี", defective: "เสีย" };

export const REF_LABEL: Partial<Record<DocType, string>> = {
  GR: "เลขที่ PI / Invoice", GN: "เลขที่ใบส่งของผู้ขาย", SO: "เลขที่ PI / ใบกำกับ", RT: "เลขที่อ้างอิง", BR: "เลขที่เคลม", WD: "เลขที่อ้างอิง",
  WO: "เลขที่อ้างอิง", RV: "เลขที่ใบเสนอราคา / PI", TR: "เลขที่อ้างอิง", OB: "เลขที่อ้างอิง",
};
export const PARTNER_LABEL: Partial<Record<DocType, string>> = {
  GR: "ผู้ขาย / โรงงาน", GN: "ผู้ขาย", RT: "รับคืนจาก", SO: "ลูกค้า", BR: "ลูกค้า (เคลม)", WD: "ผู้เบิก / ผู้ยืม", RV: "ลูกค้าที่จอง", WO: "ส่งให้ (ถ้ามี)",
};

/** Split a pasted / scanned block into SNs: new lines, commas, tabs, semicolons. */
export const splitSns = (s: string) =>
  s.split(/[\n\r,;\t]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
export const snKey = (s: string) => s.toUpperCase().replace(/[\s\-_./]/g, "").replace(/O/g, "0");

/**
 * Where a document moves goods from and to (every document has both ends; outside parties are shown by name).
 * TO_WH: whether the document picks a destination warehouse (to_warehouse_id).
 */
export const TO_WH: Record<DocType, "none" | "optional" | "required"> = {
  OB: "none", GR: "none", GN: "none", RT: "none", SO: "none", WO: "none", TR: "required", RV: "optional", BR: "optional", WD: "optional",
};
const OUTSIDE_FROM: Partial<Record<DocType, string>> = { OB: "ยอดยกมา (ของที่มีอยู่ก่อนใช้ระบบ)", GR: "ผู้ขายต่างประเทศ", GN: "ผู้ขายในประเทศ", RT: "รับคืนจากภายนอก" };
const OUTSIDE_TO: Partial<Record<DocType, string>> = { SO: "ลูกค้า", BR: "ส่งเคลม (อยู่นอกคลัง)", WD: "ผู้เบิก / ผู้ยืม (อยู่นอกคลัง)", WO: "ตัดจำหน่ายออกจากระบบ" };
export function docRoute(d: Pick<StockDoc, "doc_type" | "warehouse_id" | "to_warehouse_id" | "partner_name">, whName: (id: string | null | undefined) => string) {
  const t = d.doc_type;
  const party = (base: string) => d.partner_name ? `${base}: ${d.partner_name}` : base;
  if (DIR[t] === "in") return { from: party(OUTSIDE_FROM[t]!), to: whName(d.warehouse_id), fromWh: false, toWh: true };
  if (d.to_warehouse_id) return { from: whName(d.warehouse_id), to: whName(d.to_warehouse_id), fromWh: true, toWh: true };
  if (t === "TR") return { from: whName(d.warehouse_id), to: "-", fromWh: true, toWh: true };
  if (t === "RV") return { from: whName(d.warehouse_id), to: `${whName(d.warehouse_id)} (จองไว้ในคลังเดิม)`, fromWh: true, toWh: true };
  return { from: whName(d.warehouse_id), to: party(OUTSIDE_TO[t]!), fromWh: true, toWh: false };
}
/** What approving the document does to each SN. */
export const POST_EFFECT: Record<DocType, string> = {
  OB: "เข้าคลังปลายทาง สถานะในคลัง", GR: "เข้าคลังปลายทาง สถานะในคลัง", GN: "เข้าคลังปลายทาง สถานะในคลัง", RT: "กลับเข้าคลังปลายทาง สถานะในคลัง",
  SO: "ออกจากคลังต้นทาง สถานะขายแล้ว", BR: "ออกจากคลังต้นทาง สถานะส่งเคลม", WD: "ออกจากคลังต้นทาง สถานะเบิก / ยืม",
  WO: "ออกจากคลังต้นทาง สถานะตัดจำหน่าย", TR: "ย้ายไปคลังปลายทาง สถานะเดิม", RV: "ย้ายไปคลังปลายทาง สถานะจอง",
};
