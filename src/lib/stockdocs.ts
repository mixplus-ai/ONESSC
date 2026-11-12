// Stock documents (migration 22): every unit in or out is a document row with its SN.
export type DocType = "OB" | "GR" | "GN" | "RT" | "SO" | "BR" | "WD" | "WO" | "TR" | "RV";
export type DocStatus = "draft" | "posted" | "cancelled";
export type SerialStatus = "in_stock" | "reserved" | "borrowed" | "withdrawn" | "sold" | "written_off";
export type Condition = "good" | "defective";

export interface Warehouse { id: string; code: string; name: string; is_active: boolean; sort: number }

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
  created_by: string | null;
  created_at: string;
  posted_by: string | null;
  posted_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface DocItem { id?: string; sku: string; description: string | null; sn: string; condition: Condition; note?: string | null }

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
  { type: "GR", label: "ใบรับสินค้าจาก PO", hint: "รับของจากผู้ขาย/โรงงานตามใบสั่งซื้อ" },
  { type: "GN", label: "ใบรับตามใบส่งของผู้ขาย", hint: "รับของที่มาพร้อมใบส่งสินค้าของผู้ขาย" },
  { type: "RT", label: "ใบรับคืน", hint: "รับคืนจากใบยืม ใบเบิก ลูกค้าคืน หรือของเคลมกลับ" },
  { type: "SO", label: "ใบขาย / ส่งสินค้า", hint: "ตัดออกเมื่อขายหรือส่งให้ลูกค้า" },
  { type: "BR", label: "ใบยืม", hint: "ให้ยืมพร้อมวันกำหนดคืน" },
  { type: "WD", label: "ใบเบิกชั่วคราว", hint: "เบิกใช้ภายใน ทดสอบ ตัวโชว์" },
  { type: "WO", label: "ใบจำหน่ายออก", hint: "ตัดออกถาวร เช่น เสียหาย สูญหาย ส่งคืนผู้ขาย" },
  { type: "TR", label: "ใบโอนคลัง", hint: "ย้ายสินค้าระหว่างคลัง" },
  { type: "RV", label: "ใบจองสินค้า", hint: "กัน SN ไว้ให้ลูกค้า ยังไม่ตัดสต๊อก" },
  { type: "OB", label: "ใบยอดยกมา", hint: "นำ SN ที่มีในคลังวันเริ่มใช้เข้าระบบ (Admin)" },
];
export const DOC_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.type, d.label])) as Record<DocType, string>;

export const DOC_STATUS_LABEL: Record<DocStatus, string> = { draft: "ร่าง", posted: "ยืนยันแล้ว", cancelled: "ยกเลิก" };
export const DOC_STATUS_TONE = { draft: "amber", posted: "green", cancelled: "red" } as const;

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "ในคลัง", reserved: "จอง", borrowed: "ถูกยืม", withdrawn: "เบิกชั่วคราว", sold: "ขายแล้ว", written_off: "จำหน่ายออก",
};
export const SERIAL_STATUS_TONE = {
  in_stock: "green", reserved: "navy", borrowed: "amber", withdrawn: "amber", sold: "slate", written_off: "red",
} as const;
export const CONDITION_LABEL: Record<Condition, string> = { good: "ดี", defective: "เสีย" };

export const REF_LABEL: Partial<Record<DocType, string>> = {
  GR: "เลขที่ PO", GN: "เลขที่ใบส่งของผู้ขาย", SO: "เลขที่ PI / ใบกำกับ", RT: "เลขที่อ้างอิง", BR: "เลขที่อ้างอิง", WD: "เลขที่อ้างอิง",
  WO: "เลขที่อ้างอิง", RV: "เลขที่ใบเสนอราคา / PI", TR: "เลขที่อ้างอิง", OB: "เลขที่อ้างอิง",
};
export const PARTNER_LABEL: Partial<Record<DocType, string>> = {
  GR: "ผู้ขาย / โรงงาน", GN: "ผู้ขาย", RT: "รับคืนจาก", SO: "ลูกค้า", BR: "ผู้ยืม", WD: "ผู้เบิก", RV: "ลูกค้าที่จอง", WO: "ส่งให้ (ถ้ามี)",
};

/** Split a pasted / scanned block into SNs: new lines, commas, tabs, semicolons. */
export const splitSns = (s: string) =>
  s.split(/[\n\r,;\t]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
export const snKey = (s: string) => s.toUpperCase().replace(/[\s\-_./]/g, "").replace(/O/g, "0");
