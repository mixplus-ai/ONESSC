// Reports: one definition per dataset (what to load, which columns can be exported).
// Rows are read with the signed-in user's own rights (RLS), so a report never shows more
// than that person could already see in the app.
import { CLAIM_STATUS, productTypeLabel } from "./claims";
import { QUOTE_STATUS, RESERVATION_STATUS, reservationState } from "./catalog";
import { DELIVERY_STATUS } from "./deliveries";
import { CONDITION_LABEL, DIR, DOC_LABEL, DOC_STATUS_LABEL, SERIAL_STATUS_LABEL } from "./stockdocs";
import { supabase } from "./supabase";
import { LEDGER_KIND, PAY_STATUS, REDEMPTION_STATUS, REG_STATUS } from "./training";
import { COMPANY_STATUS_LABEL, DEPARTMENT_LABEL, ROLE_LABEL } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;
export type Cell = string | number | null;

export interface Person { id: string; full_name: string | null; email: string; phone: string | null; company_name: string | null }
export interface Lookups { people: Map<string, Person> }

export interface ReportCol {
  key: string;
  label: string;
  get: (r: Row, l: Lookups) => Cell;
  /** ticked when the person has not chosen columns yet */
  def?: boolean;
  num?: boolean;
}

export interface ReportDef {
  key: string;
  label: string;
  group: string;
  desc: string;
  table: string;
  select: string;
  /** column used for the date range; none = the report is a snapshot (date range hidden) */
  dateCol?: string;
  dateLabel?: string;
  order: { col: string; asc?: boolean };
  /** the permission(s) that open this report, besides "reports" itself; empty = Admin only */
  perms: string[];
  needsPeople?: boolean;
  /** optional status filter */
  statusCol?: string;
  statuses?: Record<string, string>;
  cols: ReportCol[];
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
/** dd/mm/yyyy (ค.ศ., so Excel can sort it) */
export function fmtDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function fmtDateTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${fmtDate(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const yesNo = (v: unknown) => (v ? "ใช่" : "ไม่ใช่");
const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : (v as string) ?? null);
const person = (l: Lookups, id: string | null | undefined) => {
  if (!id) return null;
  const p = l.people.get(id);
  return p ? p.full_name || p.email : null;
};
const billing = (b: Row) => (b && b.name ? [b.name, b.tax_id && `เลขผู้เสียภาษี ${b.tax_id}`, b.branch].filter(Boolean).join(" · ") : null);
const labelOf = (m: Record<string, { label: string } | string>, k: string | null | undefined) => {
  if (!k) return null;
  const v = m[k];
  return typeof v === "string" ? v : v?.label ?? k;
};
const statusMap = (m: Record<string, { label: string } | string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "string" ? v : v.label]));

const created = (def = true): ReportCol => ({ key: "created_at", label: "วันที่สร้าง", get: (r) => fmtDateTime(r.created_at), def });

// ---------------------------------------------------------------------------
// definitions
// ---------------------------------------------------------------------------
export const REPORTS: ReportDef[] = [
  {
    key: "claims", group: "งานบริการและเคลม", label: "งานเคลม", desc: "1 แถวต่อ 1 ใบเคลม",
    table: "claims", select: "*, brands(name)", dateCol: "created_at", dateLabel: "วันที่แจ้งเคลม",
    order: { col: "created_at" }, perms: ["claims.view", "claims"], needsPeople: true,
    statusCol: "status", statuses: statusMap(CLAIM_STATUS),
    cols: [
      { key: "claim_no", label: "เลขเคลม", get: (r) => r.claim_no, def: true },
      { key: "legacy_ref", label: "เลขอ้างอิงเดิม", get: (r) => r.legacy_ref },
      created(),
      { key: "status", label: "สถานะ", get: (r) => labelOf(CLAIM_STATUS, r.status), def: true },
      { key: "source", label: "ที่มา", get: (r) => ({ customer: "ลูกค้าแจ้ง", staff: "เจ้าหน้าที่เปิด", import: "นำเข้าจากระบบเดิม" })[r.source as string] ?? r.source },
      { key: "company_name", label: "บริษัท", get: (r) => r.company_name, def: true },
      { key: "contact_name", label: "ผู้ติดต่อ", get: (r) => r.contact_name, def: true },
      { key: "contact_phone", label: "เบอร์โทร", get: (r) => r.contact_phone, def: true },
      { key: "contact_email", label: "อีเมล", get: (r) => r.contact_email },
      { key: "installer_name", label: "ผู้ติดตั้ง (EPC)", get: (r) => r.installer_name },
      { key: "site_name", label: "ไซต์งาน", get: (r) => r.site_name },
      { key: "brand", label: "แบรนด์", get: (r) => r.brands?.name ?? null, def: true },
      { key: "product_type", label: "ประเภทสินค้า", get: (r) => (r.product_type ? productTypeLabel(r.product_type) : null), def: true },
      { key: "model", label: "รุ่น", get: (r) => r.model, def: true },
      { key: "qty", label: "จำนวน", get: (r) => num(r.qty), def: true, num: true },
      { key: "reported_sns", label: "SN ที่แจ้ง", get: (r) => list(r.reported_sns), def: true },
      { key: "returned_sns", label: "SN ที่คืน", get: (r) => list(r.returned_sns) },
      { key: "symptom", label: "อาการ", get: (r) => r.symptom },
      { key: "case_id", label: "Case ID", get: (r) => r.case_id },
      { key: "site_id", label: "Site ID", get: (r) => r.site_id },
      { key: "voucher_no", label: "เลขใบสำคัญ", get: (r) => r.voucher_no },
      { key: "voucher_date", label: "วันที่ใบสำคัญ", get: (r) => fmtDate(r.voucher_date) },
      { key: "sales_code", label: "รหัสเซลล์", get: (r) => r.sales_code },
      { key: "delivery_type", label: "การรับสินค้า", get: (r) => (r.delivery_type === "pickup" ? "รับเองที่คลัง" : r.delivery_type === "shipping" ? "จัดส่ง" : null) },
      { key: "delivery_address", label: "ที่อยู่จัดส่ง", get: (r) => r.delivery_address },
      { key: "assigned_to", label: "ผู้รับผิดชอบ", get: (r, l) => person(l, r.assigned_to), def: true },
      { key: "returned_at", label: "วันที่ลูกค้าส่งคืน", get: (r) => fmtDateTime(r.returned_at) },
      { key: "closed_at", label: "วันที่ปิดงาน", get: (r) => fmtDateTime(r.closed_at), def: true },
      { key: "closed_by", label: "ปิดงานโดย", get: (r, l) => person(l, r.closed_by) },
      { key: "customer_note", label: "ข้อความถึงลูกค้า", get: (r) => r.customer_note },
      { key: "internal_note", label: "หมายเหตุภายใน", get: (r) => r.internal_note },
    ],
  },
  {
    key: "claim_units", group: "งานบริการและเคลม", label: "รายการสินค้าในงานเคลม (SN 5 ขั้น)", desc: "1 แถวต่อ 1 ชิ้นในใบเคลม",
    table: "claim_units", select: "*, claims!inner(claim_no, company_name, status, model, created_at)", dateCol: "claims.created_at", dateLabel: "วันที่แจ้งเคลม",
    order: { col: "id" }, perms: ["claims.view", "claims"],
    cols: [
      { key: "claim_no", label: "เลขเคลม", get: (r) => r.claims?.claim_no, def: true },
      { key: "company", label: "บริษัท", get: (r) => r.claims?.company_name, def: true },
      { key: "claim_status", label: "สถานะเคลม", get: (r) => labelOf(CLAIM_STATUS, r.claims?.status) },
      { key: "seq", label: "ลำดับ", get: (r) => num(r.seq), def: true, num: true },
      { key: "pcode", label: "รหัสสินค้า", get: (r) => r.pcode, def: true },
      { key: "iss_doc", label: "ขั้น 2 เลขเอกสารเบิก", get: (r) => r.iss_doc },
      { key: "iss_date", label: "ขั้น 2 วันที่เบิก", get: (r) => fmtDate(r.iss_date) },
      { key: "iss_sn", label: "ขั้น 2 SN เบิก", get: (r) => r.iss_sn, def: true },
      { key: "ret_doc", label: "ขั้น 3 เลขเอกสารคืน", get: (r) => r.ret_doc },
      { key: "ret_date", label: "ขั้น 3 วันที่คืน", get: (r) => fmtDate(r.ret_date) },
      { key: "ret_sn", label: "ขั้น 3 SN คืน", get: (r) => r.ret_sn, def: true },
      { key: "ret_note", label: "ขั้น 3 หมายเหตุ", get: (r) => r.ret_note },
      { key: "rcv_doc", label: "ขั้น 4 เลขเอกสารรับ", get: (r) => r.rcv_doc },
      { key: "rcv_date", label: "ขั้น 4 วันที่รับ", get: (r) => fmtDate(r.rcv_date) },
      { key: "rcv_sn", label: "ขั้น 4 SN รับ", get: (r) => r.rcv_sn, def: true },
      { key: "ok_doc", label: "ขั้น 5 เลขเอกสารจ่าย", get: (r) => r.ok_doc },
      { key: "ok_date", label: "ขั้น 5 วันที่จ่าย", get: (r) => fmtDate(r.ok_date) },
      { key: "ok_sn", label: "ขั้น 5 SN จ่าย", get: (r) => r.ok_sn, def: true },
    ],
  },
  {
    key: "deliveries", group: "สินค้าและการขาย", label: "ตารางส่งสินค้า", desc: "1 แถวต่อ 1 ใบส่งสินค้า",
    table: "deliveries", select: "*, delivery_items(model, qty, total_watt, sort)", dateCol: "delivery_date", dateLabel: "วันที่ส่ง",
    order: { col: "delivery_date" }, perms: ["deliveries.view", "deliveries.manage"],
    statusCol: "status", statuses: statusMap(DELIVERY_STATUS),
    cols: [
      { key: "delivery_date", label: "วันที่ส่ง", get: (r) => fmtDate(r.delivery_date), def: true },
      { key: "doc_no", label: "เลขที่เอกสาร (PI)", get: (r) => r.doc_no, def: true },
      { key: "doc_date", label: "วันที่เอกสาร", get: (r) => fmtDate(r.doc_date) },
      { key: "status", label: "สถานะ", get: (r) => labelOf(DELIVERY_STATUS, r.status), def: true },
      { key: "customer_name", label: "ลูกค้า", get: (r) => r.customer_name, def: true },
      { key: "customer_tax_id", label: "เลขผู้เสียภาษี", get: (r) => r.customer_tax_id },
      { key: "customer_address", label: "ที่อยู่ลูกค้า", get: (r) => r.customer_address },
      { key: "contact", label: "ผู้ติดต่อ", get: (r) => [r.contact_name, r.contact_phone].filter(Boolean).join(" ") || null, def: true },
      { key: "contact_email", label: "อีเมลผู้ติดต่อ", get: (r) => r.contact_email },
      { key: "site", label: "สถานที่ส่ง", get: (r) => r.site, def: true },
      { key: "warehouse", label: "คลัง", get: (r) => r.warehouse, def: true },
      { key: "items", label: "รายการสินค้า", get: (r) => [...(r.delivery_items ?? [])].sort((a: Row, b: Row) => a.sort - b.sort).map((i: Row) => `${i.model} × ${Number(i.qty)}`).join(", ") || null, def: true },
      { key: "qty", label: "จำนวนรวม (ชิ้น)", get: (r) => (r.delivery_items ?? []).reduce((s: number, i: Row) => s + Number(i.qty || 0), 0), def: true, num: true },
      { key: "watt", label: "กำลังรวม (W)", get: (r) => (r.delivery_items ?? []).reduce((s: number, i: Row) => s + Number(i.total_watt || 0), 0) || null, num: true },
      { key: "sales_name", label: "ผู้ขาย", get: (r) => r.sales_name },
      { key: "notes", label: "หมายเหตุในเอกสาร", get: (r) => r.notes },
      { key: "internal_note", label: "หมายเหตุภายใน", get: (r) => r.internal_note },
    ],
  },
  {
    key: "delivery_items", group: "สินค้าและการขาย", label: "รายการสินค้าที่ส่ง", desc: "1 แถวต่อ 1 รุ่นสินค้าในใบส่งสินค้า",
    table: "delivery_items", select: "*, deliveries!inner(doc_no, delivery_date, customer_name, status, site)", dateCol: "deliveries.delivery_date", dateLabel: "วันที่ส่ง",
    order: { col: "id" }, perms: ["deliveries.view", "deliveries.manage"],
    cols: [
      { key: "delivery_date", label: "วันที่ส่ง", get: (r) => fmtDate(r.deliveries?.delivery_date), def: true },
      { key: "doc_no", label: "เลขที่เอกสาร", get: (r) => r.deliveries?.doc_no, def: true },
      { key: "customer", label: "ลูกค้า", get: (r) => r.deliveries?.customer_name, def: true },
      { key: "status", label: "สถานะ", get: (r) => labelOf(DELIVERY_STATUS, r.deliveries?.status) },
      { key: "site", label: "สถานที่ส่ง", get: (r) => r.deliveries?.site },
      { key: "model", label: "รุ่น", get: (r) => r.model, def: true },
      { key: "description", label: "รายละเอียด", get: (r) => r.description },
      { key: "qty", label: "จำนวน", get: (r) => num(r.qty), def: true, num: true },
      { key: "unit_watt", label: "วัตต์ต่อชิ้น", get: (r) => num(r.unit_watt), num: true },
      { key: "total_watt", label: "วัตต์รวม", get: (r) => num(r.total_watt), def: true, num: true },
    ],
  },
  {
    key: "quotes", group: "สินค้าและการขาย", label: "คำขอใบเสนอราคา", desc: "1 แถวต่อ 1 คำขอ",
    table: "quote_requests", select: "*, profiles(full_name, email, phone), companies(name, tax_id), quote_request_items(label, qty, unit_price)", dateCol: "created_at", dateLabel: "วันที่ขอ",
    order: { col: "created_at" }, perms: ["requests"], needsPeople: true,
    statusCol: "status", statuses: statusMap(QUOTE_STATUS),
    cols: [
      { key: "code", label: "เลขที่คำขอ", get: (r) => r.code, def: true },
      created(),
      { key: "status", label: "สถานะ", get: (r) => labelOf(QUOTE_STATUS, r.status), def: true },
      { key: "customer", label: "ลูกค้า", get: (r) => r.profiles?.full_name ?? r.profiles?.email ?? null, def: true },
      { key: "email", label: "อีเมล", get: (r) => r.profiles?.email ?? null },
      { key: "company", label: "บริษัท", get: (r) => r.companies?.name ?? null, def: true },
      { key: "tax_id", label: "เลขผู้เสียภาษีบริษัท", get: (r) => r.companies?.tax_id ?? null },
      { key: "billing", label: "ออกเอกสารในนาม", get: (r) => billing(r.billing) },
      { key: "contact", label: "ผู้ติดต่อ", get: (r) => [r.contact_name, r.contact_phone].filter(Boolean).join(" ") || null, def: true },
      { key: "items", label: "รายการสินค้า", get: (r) => (r.quote_request_items ?? []).map((i: Row) => `${i.label} × ${Number(i.qty)}`).join(", ") || null, def: true },
      { key: "item_count", label: "จำนวนรายการ", get: (r) => (r.quote_request_items ?? []).length, num: true },
      { key: "quoted_total", label: "ยอดเสนอราคา (บาท)", get: (r) => num(r.quoted_total), def: true, num: true },
      { key: "project_note", label: "รายละเอียดโครงการ", get: (r) => r.project_note },
      { key: "staff_note", label: "หมายเหตุเจ้าหน้าที่", get: (r) => r.staff_note },
      { key: "handled_by", label: "ผู้ดูแล", get: (r, l) => person(l, r.handled_by), def: true },
    ],
  },
  {
    key: "reservations", group: "สินค้าและการขาย", label: "ใบจองสินค้า", desc: "1 แถวต่อ 1 ใบจอง",
    table: "reservations", select: "*, profiles(full_name, email, phone), companies(name, tax_id), reservation_items(sku, label, qty)", dateCol: "created_at", dateLabel: "วันที่จอง",
    order: { col: "created_at" }, perms: ["requests"], needsPeople: true,
    statusCol: "status", statuses: statusMap(RESERVATION_STATUS),
    cols: [
      { key: "code", label: "เลขที่ใบจอง", get: (r) => r.code, def: true },
      created(),
      { key: "status", label: "สถานะ", get: (r) => labelOf(RESERVATION_STATUS, reservationState(r)), def: true },
      { key: "expires_at", label: "หมดอายุ", get: (r) => fmtDateTime(r.expires_at), def: true },
      { key: "customer", label: "ลูกค้า", get: (r) => r.profiles?.full_name ?? r.profiles?.email ?? null, def: true },
      { key: "company", label: "บริษัท", get: (r) => r.companies?.name ?? null, def: true },
      { key: "billing", label: "ออกเอกสารในนาม", get: (r) => billing(r.billing) },
      { key: "items", label: "รายการสินค้า", get: (r) => (r.reservation_items ?? []).map((i: Row) => `${i.sku ?? i.label} × ${Number(i.qty)}`).join(", ") || null, def: true },
      { key: "qty", label: "จำนวนรวม", get: (r) => (r.reservation_items ?? []).reduce((s: number, i: Row) => s + Number(i.qty || 0), 0), num: true },
      { key: "note", label: "หมายเหตุลูกค้า", get: (r) => r.note },
      { key: "staff_note", label: "หมายเหตุเจ้าหน้าที่", get: (r) => r.staff_note },
      { key: "handled_by", label: "ผู้ดูแล", get: (r, l) => person(l, r.handled_by) },
    ],
  },
  {
    key: "stock", group: "สินค้าและการขาย", label: "สต๊อกสินค้า (ล่าสุด)", desc: "ข้อมูลสต๊อกจากการซิงก์ครั้งล่าสุด",
    table: "stock_levels", select: "*", order: { col: "sku", asc: true }, perms: ["stock.view"],
    cols: [
      { key: "sku", label: "รหัสสินค้า", get: (r) => r.sku, def: true },
      { key: "description", label: "รายละเอียด", get: (r) => r.description, def: true },
      { key: "store", label: "คลัง", get: (r) => r.store, def: true },
      { key: "stock_group", label: "กลุ่มสินค้า", get: (r) => r.stock_group },
      { key: "on_hand", label: "คงเหลือ", get: (r) => num(r.on_hand), def: true, num: true },
      { key: "reserved", label: "ติดจอง", get: (r) => num(r.reserved), def: true, num: true },
      { key: "available", label: "พร้อมขาย", get: (r) => num(r.available), def: true, num: true },
      { key: "incoming", label: "กำลังเข้า", get: (r) => num(r.incoming), num: true },
      { key: "synced_at", label: "ซิงก์เมื่อ", get: (r) => fmtDateTime(r.synced_at) },
    ],
  },
  {
    key: "stock_moves", group: "คลังสินค้าและ SN", label: "ความเคลื่อนไหวสินค้าตาม SN", desc: "1 แถวต่อ 1 SN ในเอกสารคลัง (เข้า +1 / ออก −1 ใช้ทำ Pivot สต๊อกการ์ดได้)",
    table: "stock_doc_items",
    select: "*, stock_docs!inner(doc_no, doc_type, status, doc_date, partner_name, partner_tax_id, ref_no, customer_po, site_name, due_date, reason, posted_at, wh:warehouses!stock_docs_warehouse_id_fkey(name), to_wh:warehouses!stock_docs_to_warehouse_id_fkey(name))",
    dateCol: "stock_docs.doc_date", dateLabel: "วันที่เอกสาร", order: { col: "sku", asc: true }, perms: ["stock.view", "stock.docs", "stock.post"],
    statusCol: "stock_docs.status", statuses: DOC_STATUS_LABEL,
    cols: [
      { key: "doc_date", label: "วันที่", get: (r) => fmtDate(r.stock_docs?.doc_date), def: true },
      { key: "doc_no", label: "เลขที่เอกสาร", get: (r) => r.stock_docs?.doc_no, def: true },
      { key: "doc_type", label: "ประเภท", get: (r) => labelOf(DOC_LABEL, r.stock_docs?.doc_type), def: true },
      { key: "dir", label: "เข้า/ออก", get: (r) => { const d = DIR[r.stock_docs?.doc_type as keyof typeof DIR]; return d === "in" ? 1 : d === "out" ? -1 : 0; }, def: true, num: true },
      { key: "status", label: "สถานะเอกสาร", get: (r) => labelOf(DOC_STATUS_LABEL, r.stock_docs?.status), def: true },
      { key: "sku", label: "รหัสสินค้า", get: (r) => r.sku, def: true },
      { key: "description", label: "รายละเอียด", get: (r) => r.description, def: true },
      { key: "sn", label: "Serial Number", get: (r) => r.sn, def: true },
      { key: "condition", label: "สภาพ", get: (r) => labelOf(CONDITION_LABEL, r.condition), def: true },
      { key: "warehouse", label: "คลัง", get: (r) => r.stock_docs?.wh?.name ?? null, def: true },
      { key: "to_warehouse", label: "ไปคลัง", get: (r) => r.stock_docs?.to_wh?.name ?? null },
      { key: "partner", label: "คู่ค้า / ลูกค้า", get: (r) => r.stock_docs?.partner_name, def: true },
      { key: "tax_id", label: "เลขผู้เสียภาษี", get: (r) => r.stock_docs?.partner_tax_id },
      { key: "ref_no", label: "เลขที่อ้างอิง (PO/PI)", get: (r) => r.stock_docs?.ref_no, def: true },
      { key: "customer_po", label: "PO ลูกค้า", get: (r) => r.stock_docs?.customer_po },
      { key: "site", label: "ไซต์", get: (r) => r.stock_docs?.site_name },
      { key: "due_date", label: "กำหนดคืน", get: (r) => fmtDate(r.stock_docs?.due_date) },
      { key: "reason", label: "เหตุผล", get: (r) => r.stock_docs?.reason },
      { key: "posted_at", label: "ยืนยันเมื่อ", get: (r) => fmtDateTime(r.stock_docs?.posted_at) },
    ],
  },
  {
    key: "stock_docs", group: "คลังสินค้าและ SN", label: "เอกสารคลัง", desc: "1 แถวต่อ 1 เอกสาร พร้อมจำนวนชิ้น",
    table: "stock_docs", select: "*, stock_doc_items(count), wh:warehouses!stock_docs_warehouse_id_fkey(name)",
    dateCol: "doc_date", dateLabel: "วันที่เอกสาร", order: { col: "doc_date" }, perms: ["stock.view", "stock.docs", "stock.post"], needsPeople: true,
    statusCol: "status", statuses: DOC_STATUS_LABEL,
    cols: [
      { key: "doc_no", label: "เลขที่", get: (r) => r.doc_no, def: true },
      { key: "doc_date", label: "วันที่", get: (r) => fmtDate(r.doc_date), def: true },
      { key: "doc_type", label: "ประเภท", get: (r) => labelOf(DOC_LABEL, r.doc_type), def: true },
      { key: "status", label: "สถานะ", get: (r) => labelOf(DOC_STATUS_LABEL, r.status), def: true },
      { key: "qty", label: "จำนวนชิ้น", get: (r) => r.stock_doc_items?.[0]?.count ?? 0, def: true, num: true },
      { key: "warehouse", label: "คลัง", get: (r) => r.wh?.name ?? null, def: true },
      { key: "partner", label: "คู่ค้า / ลูกค้า", get: (r) => r.partner_name, def: true },
      { key: "ref_no", label: "เลขที่อ้างอิง", get: (r) => r.ref_no, def: true },
      { key: "customer_po", label: "PO ลูกค้า", get: (r) => r.customer_po },
      { key: "site", label: "ไซต์", get: (r) => r.site_name },
      { key: "due_date", label: "กำหนดคืน", get: (r) => fmtDate(r.due_date) },
      { key: "reason", label: "เหตุผล", get: (r) => r.reason },
      { key: "created_by", label: "ผู้สร้าง", get: (r, l) => person(l, r.created_by) },
      { key: "posted_by", label: "ผู้ยืนยัน", get: (r, l) => person(l, r.posted_by), def: true },
      { key: "posted_at", label: "ยืนยันเมื่อ", get: (r) => fmtDateTime(r.posted_at) },
      { key: "cancel_reason", label: "เหตุผลที่ยกเลิก", get: (r) => r.cancel_reason },
    ],
  },
  {
    key: "serials", group: "คลังสินค้าและ SN", label: "สถานะ SN ปัจจุบัน และอายุในคลัง", desc: "1 แถวต่อ 1 SN · ใช้ดูของยืมค้างคืน ของเสียในคลัง และของค้างนาน",
    table: "serials", select: "*, warehouses(name), stock_docs!serials_last_doc_id_fkey(doc_no)",
    order: { col: "sku", asc: true }, perms: ["stock.view", "stock.docs", "stock.post"],
    statusCol: "status", statuses: SERIAL_STATUS_LABEL,
    cols: [
      { key: "sku", label: "รหัสสินค้า", get: (r) => r.sku, def: true },
      { key: "description", label: "รายละเอียด", get: (r) => r.description, def: true },
      { key: "sn", label: "Serial Number", get: (r) => r.sn, def: true },
      { key: "status", label: "สถานะ", get: (r) => labelOf(SERIAL_STATUS_LABEL, r.status), def: true },
      { key: "condition", label: "สภาพ", get: (r) => labelOf(CONDITION_LABEL, r.condition), def: true },
      { key: "warehouse", label: "คลัง", get: (r) => r.warehouses?.name ?? null, def: true },
      { key: "holder", label: "อยู่กับ", get: (r) => r.holder_name, def: true },
      { key: "due_date", label: "กำหนดคืน", get: (r) => fmtDate(r.due_date), def: true },
      { key: "overdue", label: "เลยกำหนด (วัน)", get: (r) => r.due_date && ["borrowed", "withdrawn"].includes(r.status) ? Math.max(0, Math.floor((Date.now() - new Date(`${r.due_date}T00:00:00+07:00`).getTime()) / 864e5)) || null : null, num: true },
      { key: "first_in_at", label: "รับเข้าครั้งแรก", get: (r) => fmtDate(r.first_in_at), def: true },
      { key: "days_in", label: "อยู่ในคลัง (วัน)", get: (r) => r.first_in_at && ["in_stock", "reserved"].includes(r.status) ? Math.floor((Date.now() - new Date(`${r.first_in_at}T00:00:00+07:00`).getTime()) / 864e5) : null, def: true, num: true },
      { key: "sold_at", label: "วันที่ขาย", get: (r) => fmtDate(r.sold_at) },
      { key: "last_doc", label: "เอกสารล่าสุด", get: (r) => r.stock_docs?.doc_no ?? null, def: true },
    ],
  },
  {
    key: "products", group: "สินค้าและการขาย", label: "สินค้าและราคา", desc: "1 แถวต่อ 1 รุ่น (SKU)",
    table: "product_variants", select: "*, products(name, is_published, brands(name), product_categories(name))", order: { col: "sku", asc: true }, perms: ["products"],
    cols: [
      { key: "sku", label: "SKU", get: (r) => r.sku, def: true },
      { key: "product", label: "สินค้า", get: (r) => r.products?.name, def: true },
      { key: "variant", label: "รุ่นย่อย", get: (r) => r.name, def: true },
      { key: "brand", label: "แบรนด์", get: (r) => r.products?.brands?.name ?? null, def: true },
      { key: "category", label: "หมวดหมู่", get: (r) => r.products?.product_categories?.name ?? null },
      { key: "unit", label: "หน่วย", get: (r) => r.unit },
      { key: "base_price", label: "ราคาปกติ (บาท)", get: (r) => num(r.base_price), def: true, num: true },
      { key: "is_active", label: "เปิดขาย", get: (r) => yesNo(r.is_active) },
      { key: "published", label: "แสดงบนเว็บ", get: (r) => yesNo(r.products?.is_published) },
    ],
  },
  {
    key: "training", group: "อบรม แต้ม และของรางวัล", label: "ผู้ลงทะเบียนอบรม", desc: "1 แถวต่อ 1 การลงทะเบียน",
    table: "training_registrations", select: "*, profiles(full_name, email, phone, company_name), course_sessions!inner(title, starts_on, location, courses(code, title))",
    dateCol: "course_sessions.starts_on", dateLabel: "วันที่อบรม", order: { col: "registered_at" }, perms: ["training.view", "courses"],
    statusCol: "status", statuses: statusMap(REG_STATUS),
    cols: [
      { key: "code", label: "เลขที่ลงทะเบียน", get: (r) => r.code, def: true },
      { key: "registered_at", label: "วันที่ลงทะเบียน", get: (r) => fmtDateTime(r.registered_at) },
      { key: "course", label: "หลักสูตร", get: (r) => r.course_sessions?.courses?.title ?? null, def: true },
      { key: "course_code", label: "รหัสหลักสูตร", get: (r) => r.course_sessions?.courses?.code ?? null },
      { key: "session", label: "รอบอบรม", get: (r) => r.course_sessions?.title ?? null },
      { key: "starts_on", label: "วันที่อบรม", get: (r) => fmtDate(r.course_sessions?.starts_on), def: true },
      { key: "location", label: "สถานที่", get: (r) => r.course_sessions?.location ?? null },
      { key: "name", label: "ชื่อผู้อบรม", get: (r) => r.profiles?.full_name ?? r.billing?.name ?? null, def: true },
      { key: "email", label: "อีเมล", get: (r) => r.profiles?.email ?? null, def: true },
      { key: "phone", label: "เบอร์โทร", get: (r) => r.profiles?.phone ?? null, def: true },
      { key: "company", label: "บริษัท", get: (r) => r.profiles?.company_name ?? null, def: true },
      { key: "status", label: "สถานะ", get: (r) => labelOf(REG_STATUS, r.status), def: true },
      { key: "checked_in_at", label: "เวลาเช็กอิน", get: (r) => fmtDateTime(r.checked_in_at) },
      { key: "points_awarded", label: "แต้มที่ได้", get: (r) => num(r.points_awarded), num: true },
      { key: "cert_no", label: "เลขใบประกาศ", get: (r) => r.cert_no },
      { key: "pay_status", label: "การชำระเงิน", get: (r) => labelOf(PAY_STATUS, r.pay_status), def: true },
      { key: "total", label: "ยอดชำระ (บาท)", get: (r) => num(r.total), num: true },
      { key: "discount", label: "ส่วนลด", get: (r) => num(r.discount), num: true },
      { key: "coupon_code", label: "โค้ดส่วนลด", get: (r) => r.coupon_code },
      { key: "billing", label: "ออกใบเสร็จในนาม", get: (r) => billing(r.billing) },
      { key: "paid_at", label: "วันที่ชำระ", get: (r) => fmtDateTime(r.paid_at) },
      { key: "sale_name", label: "เซลล์", get: (r) => r.sale_name },
      { key: "source", label: "รู้จักจาก", get: (r) => r.source },
      { key: "cancel_reason", label: "เหตุผลยกเลิก", get: (r) => r.cancel_reason },
    ],
  },
  {
    key: "points", group: "อบรม แต้ม และของรางวัล", label: "ความเคลื่อนไหวแต้ม", desc: "1 แถวต่อ 1 รายการแต้ม (ส่วนตัวและบริษัท)",
    table: "point_ledger", select: "*, profiles(full_name, email), companies(name, tax_id)", dateCol: "created_at", dateLabel: "วันที่บันทึก",
    order: { col: "created_at" }, perms: ["company_points", "rewards"], needsPeople: true,
    statusCol: "kind", statuses: LEDGER_KIND,
    cols: [
      created(),
      { key: "wallet", label: "กระเป๋า", get: (r) => (r.wallet === "company" ? "บริษัท" : "ส่วนตัว"), def: true },
      { key: "owner", label: "เจ้าของแต้ม", get: (r) => r.companies?.name ?? r.profiles?.full_name ?? r.profiles?.email ?? null, def: true },
      { key: "tax_id", label: "เลขผู้เสียภาษี", get: (r) => r.companies?.tax_id ?? null },
      { key: "kind", label: "ประเภท", get: (r) => labelOf(LEDGER_KIND, r.kind), def: true },
      { key: "points", label: "แต้ม", get: (r) => num(r.points), def: true, num: true },
      { key: "expires_on", label: "หมดอายุ", get: (r) => fmtDate(r.expires_on), def: true },
      { key: "invoice_no", label: "เลขที่ใบแจ้งหนี้", get: (r) => r.invoice_no },
      { key: "amount", label: "ยอดซื้อ (บาท)", get: (r) => num(r.amount), num: true },
      { key: "ref_doc", label: "เอกสารอ้างอิง", get: (r) => r.ref_doc },
      { key: "note", label: "หมายเหตุ", get: (r) => r.note, def: true },
      { key: "created_by", label: "บันทึกโดย", get: (r, l) => person(l, r.created_by) },
      { key: "voided", label: "ยกเลิกแล้ว", get: (r) => (r.voided_at ? `ยกเลิก ${fmtDate(r.voided_at)}${r.void_reason ? ` · ${r.void_reason}` : ""}` : null) },
    ],
  },
  {
    key: "redemptions", group: "อบรม แต้ม และของรางวัล", label: "การแลกของรางวัลและคูปอง", desc: "1 แถวต่อ 1 การแลก",
    table: "redemptions", select: "*, profiles(full_name, email), companies(name)", dateCol: "created_at", dateLabel: "วันที่แลก",
    order: { col: "created_at" }, perms: ["rewards"], needsPeople: true,
    statusCol: "status", statuses: statusMap(REDEMPTION_STATUS),
    cols: [
      { key: "code", label: "รหัสคูปอง", get: (r) => r.code, def: true },
      created(),
      { key: "owner", label: "ผู้แลก", get: (r) => r.companies?.name ?? r.profiles?.full_name ?? r.profiles?.email ?? null, def: true },
      { key: "wallet", label: "กระเป๋า", get: (r) => (r.wallet === "company" ? "บริษัท" : "ส่วนตัว") },
      { key: "reward_name", label: "ของรางวัล", get: (r) => r.reward_name, def: true },
      { key: "points", label: "แต้มที่ใช้", get: (r) => num(r.points), def: true, num: true },
      { key: "status", label: "สถานะ", get: (r) => labelOf(REDEMPTION_STATUS, r.status), def: true },
      { key: "used_at", label: "ใช้เมื่อ", get: (r) => fmtDateTime(r.used_at) },
      { key: "used_by", label: "ยืนยันการใช้โดย", get: (r, l) => person(l, r.used_by) },
      { key: "used_ref", label: "อ้างอิงการใช้", get: (r) => r.used_ref },
      { key: "cancel_reason", label: "เหตุผลยกเลิก", get: (r) => r.cancel_reason },
    ],
  },
  {
    key: "companies", group: "ลูกค้า", label: "บริษัทลูกค้า", desc: "1 แถวต่อ 1 บริษัท",
    table: "companies", select: "*", dateCol: "created_at", dateLabel: "วันที่ลงทะเบียน", order: { col: "name", asc: true }, perms: ["companies"],
    cols: [
      { key: "name", label: "ชื่อบริษัท", get: (r) => r.name, def: true },
      { key: "tax_id", label: "เลขผู้เสียภาษี", get: (r) => r.tax_id, def: true },
      { key: "branch", label: "สาขา", get: (r) => r.branch },
      { key: "address", label: "ที่อยู่", get: (r) => r.address, def: true },
      { key: "phone", label: "เบอร์โทร", get: (r) => r.phone, def: true },
      { key: "note", label: "หมายเหตุ", get: (r) => r.note },
      created(false),
    ],
  },
  {
    key: "users", group: "ลูกค้า", label: "ผู้ใช้งาน", desc: "1 แถวต่อ 1 บัญชี (เฉพาะ Admin)",
    table: "profiles", select: "*", dateCol: "created_at", dateLabel: "วันที่สมัคร", order: { col: "created_at" }, perms: [],
    statusCol: "role", statuses: ROLE_LABEL,
    cols: [
      { key: "full_name", label: "ชื่อ-นามสกุล", get: (r) => r.full_name, def: true },
      { key: "email", label: "อีเมล", get: (r) => r.email, def: true },
      { key: "phone", label: "เบอร์โทร", get: (r) => r.phone, def: true },
      { key: "line_id", label: "LINE ID", get: (r) => r.line_id },
      { key: "position", label: "ตำแหน่ง", get: (r) => r.position },
      { key: "role", label: "บทบาท", get: (r) => labelOf(ROLE_LABEL, r.role), def: true },
      { key: "department", label: "แผนก", get: (r) => (r.department ? DEPARTMENT_LABEL[r.department] ?? r.department : null) },
      { key: "company_name", label: "บริษัท", get: (r) => r.company_name, def: true },
      { key: "tax_id", label: "เลขผู้เสียภาษี", get: (r) => r.tax_id },
      { key: "company_status", label: "สถานะผูกบริษัท", get: (r) => labelOf(COMPANY_STATUS_LABEL, r.company_status) },
      { key: "billing", label: "ข้อมูลออกใบเสร็จ", get: (r) => billing(r.billing) },
      { key: "is_active", label: "สถานะบัญชี", get: (r) => (r.is_active ? "ใช้งาน" : "ระงับ"), def: true },
      created(),
    ],
  },
  {
    key: "messages", group: "ลูกค้า", label: "ข้อความติดต่อจากหน้าเว็บ", desc: "1 แถวต่อ 1 ข้อความ",
    table: "contact_messages", select: "*", dateCol: "created_at", dateLabel: "วันที่ส่ง", order: { col: "created_at" }, perms: ["contact_messages"],
    cols: [
      created(),
      { key: "name", label: "ชื่อ", get: (r) => r.name, def: true },
      { key: "company", label: "บริษัท", get: (r) => r.company, def: true },
      { key: "phone", label: "เบอร์โทร", get: (r) => r.phone, def: true },
      { key: "email", label: "อีเมล", get: (r) => r.email, def: true },
      { key: "topic", label: "หัวข้อ", get: (r) => r.topic, def: true },
      { key: "message", label: "ข้อความ", get: (r) => r.message, def: true },
      { key: "status", label: "สถานะ", get: (r) => r.status },
    ],
  },
];

export const REPORT_GROUPS = [...new Set(REPORTS.map((r) => r.group))];

export function canOpenReport(def: ReportDef, isAdmin: boolean, can: (p: string) => boolean) {
  if (isAdmin) return true;
  return def.perms.length > 0 && def.perms.some((p) => can(p));
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------
const PAGE = 1000;
export const MAX_ROWS = 50000;

export interface ReportQuery { from?: string; to?: string; status?: string }

export async function loadReport(def: ReportDef, q: ReportQuery, onProgress?: (n: number) => void): Promise<{ rows: Row[]; lookups: Lookups; truncated: boolean }> {
  const rows: Row[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    let query = supabase.from(def.table).select(def.select);
    if (def.dateCol && q.from) query = query.gte(def.dateCol, q.from);
    if (def.dateCol && q.to) query = query.lte(def.dateCol, def.dateCol.endsWith("_at") ? `${q.to}T23:59:59.999+07:00` : q.to);
    if (def.statusCol && q.status) query = query.eq(def.statusCol, q.status);
    const { data, error } = await query.order(def.order.col, { ascending: def.order.asc ?? false }).range(start, start + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    onProgress?.(rows.length);
    if (!data || data.length < PAGE) return { rows, lookups: await loadLookups(def), truncated: false };
  }
  return { rows, lookups: await loadLookups(def), truncated: true };
}

let peopleCache: Map<string, Person> | null = null;
async function loadLookups(def: ReportDef): Promise<Lookups> {
  if (!def.needsPeople) return { people: new Map() };
  if (!peopleCache) {
    const m = new Map<string, Person>();
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, phone, company_name").range(start, start + PAGE - 1);
      if (error) break;
      for (const p of (data ?? []) as Person[]) m.set(p.id, p);
      if (!data || data.length < PAGE) break;
    }
    peopleCache = m;
  }
  return { people: peopleCache };
}

export function buildTable(def: ReportDef, cols: string[], rows: Row[], lookups: Lookups): { header: string[]; body: Cell[][]; numeric: boolean[] } {
  const chosen = cols.map((k) => def.cols.find((c) => c.key === k)).filter((c): c is ReportCol => !!c);
  return {
    header: chosen.map((c) => c.label),
    numeric: chosen.map((c) => !!c.num),
    body: rows.map((r) => chosen.map((c) => {
      const v = c.get(r, lookups);
      return v === undefined || v === "" ? null : v;
    })),
  };
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
export interface Sheet { name: string; header: string[]; body: Cell[][]; numeric: boolean[] }

/** Excel sheet names: max 31 chars, no []:*?/\ */
const sheetName = (s: string, used: Set<string>) => {
  const base = s.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name);
  return name;
};

export async function exportXlsx(fileName: string, sheets: Sheet[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const used = new Set<string>();
  const out = sheets.map((s) => ({
    sheet: sheetName(s.name, used),
    stickyRowsCount: 1,
    columns: s.header.map((h, i) => ({
      width: Math.min(60, Math.max(10, h.length + 2, ...s.body.slice(0, 200).map((r) => String(r[i] ?? "").length + 1))),
    })),
    data: [
      s.header.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#E2E8F0" })),
      ...s.body.map((r) => r.map((v, i) => (v === null ? null : s.numeric[i] && typeof v === "number" ? { value: v, type: Number } : { value: String(v), type: String }))),
    ],
  }));
  await writeXlsxFile(out).toFile(fileName);
}

export function exportCsv(fileName: string, s: Sheet) {
  const esc = (v: Cell) => {
    if (v === null) return "";
    const t = String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const text = [s.header, ...s.body].map((r) => r.map(esc).join(",")).join("\r\n");
  // BOM so Excel opens Thai text correctly
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
