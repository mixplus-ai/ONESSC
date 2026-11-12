// Phase 4: service & warranty claims. Types, labels, the 5-step model from ssccare, progress, audit checks,
// paste/import parsing and exports. Pure helpers except the small Supabase wrappers at the bottom.
import { supabase } from "./supabase";

type Tone = "slate" | "green" | "amber" | "red" | "navy";

export type ProductType = "inverter" | "optimizer" | "accessory" | "panel" | "battery" | "other";
export type ClaimStatus = "submitted" | "in_progress" | "done" | "returned" | "closed" | "rejected";
export type FileKind = "customer" | "receive" | "issue" | "claim_doc" | "other" | "ship_receipt" | "ship_slip";

export const PRODUCT_TYPES: { key: ProductType; label: string }[] = [
  { key: "inverter", label: "Inverter" },
  { key: "optimizer", label: "Optimizer" },
  { key: "accessory", label: "Accessories" },
  { key: "panel", label: "Solar Panel" },
  { key: "battery", label: "Battery" },
  { key: "other", label: "อื่นๆ" },
];
export const productTypeLabel = (t: string | null | undefined) => PRODUCT_TYPES.find((p) => p.key === t)?.label ?? "-";

/** What the customer sees (3 steps + closed / rejected). */
export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: Tone; step: 1 | 2 | 3 | 4 }> = {
  submitted: { label: "กรอกแบบฟอร์มแล้ว", tone: "navy", step: 1 },
  in_progress: { label: "กำลังดำเนินการ", tone: "amber", step: 2 },
  done: { label: "ดำเนินการเสร็จ", tone: "green", step: 2 },
  returned: { label: "ส่งของเคลมกลับแล้ว", tone: "navy", step: 3 },
  closed: { label: "ปิดงาน", tone: "green", step: 4 },
  rejected: { label: "ไม่อนุมัติ / ยกเลิก", tone: "red", step: 1 },
};
export type ShipStatus = "unpaid" | "slip" | "paid" | "rejected";
export const SHIP_STATUS: Record<ShipStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "รอชำระค่าส่ง", tone: "amber" },
  slip: { label: "สลิปค่าส่งรอตรวจ", tone: "navy" },
  paid: { label: "ชำระค่าส่งแล้ว", tone: "green" },
  rejected: { label: "สลิปไม่ถูกต้อง แนบใหม่", tone: "red" },
};
export const fmtBaht = (n: number | null | undefined) => (n == null ? "-" : `${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`);
export const FILE_KIND: Record<FileKind, string> = {
  customer: "ไฟล์จากลูกค้า",
  receive: "รับของเคลมจากลูกค้า",
  issue: "ส่งของให้ลูกค้า",
  claim_doc: "ใบเคลมสินค้า",
  other: "เอกสารภายใน",
  ship_receipt: "ใบเสร็จค่าจัดส่ง",
  ship_slip: "สลิปโอนค่าจัดส่ง",
};

export interface Claim {
  id: string;
  claim_no: string;
  legacy_ref: string | null;
  source: "customer" | "staff" | "import";
  user_id: string | null;
  company_id: string | null;
  company_name: string | null;
  brand_id: string | null;
  product_type: ProductType | null;
  model: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  installer_name: string | null;
  site_name: string | null;
  details: ClaimDetails;
  symptom: string | null;
  reported_sns: string[];
  delivery_type: "pickup" | "shipping";
  delivery_address: string | null;
  voucher_no: string | null;
  voucher_date: string | null;
  case_id: string | null;
  site_id: string | null;
  pickup_on: string | null;
  sales_code: string | null;
  qty: number;
  status: ClaimStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  claim_doc_path: string | null;
  customer_note: string | null;
  returned_sns: string[] | null;
  returned_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  ship_fee: number | null;
  ship_carrier: string | null;
  ship_tracking: string | null;
  ship_status: ShipStatus | null;
  ship_receipt_path: string | null;
  ship_slip_path: string | null;
  ship_note: string | null;
  ship_slip_at: string | null;
  ship_paid_at: string | null;
  ship_set_at: string | null;
  ship_checked_by: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}
export interface ClaimDetails {
  bad_sn?: string;
  manager_sn?: string;
  case_no?: string;
  /** inverter: issue title + description from the Engineer case */
  issue?: string;
  description?: string;
  ref_inv_sn?: string;
  qty?: number;
  sn?: string;
  items?: { model: string; qty: number; bad_sn?: string; ref_inv_sn?: string }[];
  /** claim form v2: one row per S/N with its own symptom (optimizer: measured V and resistance) */
  units?: { model?: string; sn?: string; symptom?: string; volt?: string; ohm?: string }[];
  po_no?: string;
}

export interface ClaimUnit {
  id: number;
  claim_id: string;
  seq: number;
  pcode: string | null;
  iss_doc: string | null; iss_date: string | null; iss_sn: string | null;
  ret_pcode: string | null; ret_doc: string | null; ret_date: string | null; ret_sn: string | null; ret_note: string | null;
  rcv_pcode: string | null; rcv_doc: string | null; rcv_date: string | null; rcv_sn: string | null;
  ok_pcode: string | null; ok_doc: string | null; ok_date: string | null; ok_sn: string | null;
  updated_at: string;
  updated_by: string | null;
}
export type UnitField = Exclude<keyof ClaimUnit, "id" | "claim_id" | "seq" | "updated_at" | "updated_by">;

export interface ClaimFile {
  id: string;
  claim_id: string;
  kind: FileKind;
  path: string;
  file_name: string | null;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
}
export interface ClaimEvent { id: number; claim_id: string; status: ClaimStatus; note: string | null; actor_id: string | null; created_at: string }

/** Row returned by my_claims() (customer view, no internal fields). */
export interface MyClaim {
  id: string;
  claim_no: string;
  legacy_ref: string | null;
  status: ClaimStatus;
  product_type: ProductType | null;
  model: string | null;
  brand: string | null;
  qty: number;
  company_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  installer_name: string | null;
  site_name: string | null;
  symptom: string | null;
  details: ClaimDetails;
  reported_sns: string[];
  returned_sns: string[] | null;
  delivery_type: "pickup" | "shipping";
  delivery_address: string | null;
  case_id: string | null;
  customer_note: string | null;
  claim_doc_path: string | null;
  returned_at: string | null;
  closed_at: string | null;
  ship_fee: number | null;
  ship_carrier: string | null;
  ship_tracking: string | null;
  ship_status: ShipStatus | null;
  ship_receipt_path: string | null;
  ship_slip_path: string | null;
  ship_note: string | null;
  ship_slip_at: string | null;
  ship_paid_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  mine: boolean;
  handler: string | null;
  files: { id: string; kind: FileKind; path: string; file_name: string | null; created_at: string }[];
  events: { status: ClaimStatus; note: string | null; at: string }[];
}

export interface ClaimModel { id: string; product_type: ProductType; brand_id: string | null; model: string; note: string | null; sort: number; is_active: boolean }
export interface BrandRule {
  brand_id: string;
  enabled: boolean;
  warranty_text: string | null;
  terms: string | null;
  required_docs: string | null;
  require_fields: string[];
}
export interface ClaimSettings {
  id: 1;
  email_enabled: boolean;
  email_from: string | null;
  email_from_name: string;
  staff_notify_emails: string | null;
  pickup_label: string;
  shipping_label: string;
  form_note: string | null;
  email_note: string | null;
  ship_bank_info: string | null;
}
export const REQUIRE_FIELD_LABEL: Record<string, string> = {
  installer_name: "ผู้ติดตั้ง (EPC)",
  site_name: "ชื่อไซต์งาน",
  case_no: "หมายเลข Case (Inverter)",
  manager_sn: "S/N Manager (Inverter)",
  ref_inv_sn: "อ้างอิง S/N Inverter",
  attachment: "แนบรูป / ไฟล์",
};

// ---------------------------------------------------------------------------
// The 5 internal steps (ssccare columns A–Z)
// ---------------------------------------------------------------------------
export interface StepField { key: UnitField | HeaderField; label: string; col: string; type?: "date" | "number" | "sn" }
export type HeaderField = "pcode" | "voucher_no" | "voucher_date" | "case_id" | "site_id" | "claim_no" | "company_name" | "pickup_on" | "sales_code" | "qty";
export interface StepDef { n: 1 | 2 | 3 | 4 | 5; name: string; short: string; dir: string; sub: string; fields: StepField[]; sn?: UnitField; optional?: boolean }

export const STEPS: StepDef[] = [
  {
    n: 1, name: "รายละเอียดในใบเคลมสินค้างานเคลม", short: "รายละเอียดใบเคลม", dir: "ลูกค้า → SSC", sub: "รายละเอียดใบเคลม",
    fields: [
      { key: "pcode", label: "รหัสสินค้า", col: "A" },
      { key: "voucher_no", label: "เลขใบสำคัญ", col: "B" },
      { key: "voucher_date", label: "วันที่ใบสำคัญ", col: "C", type: "date" },
      { key: "case_id", label: "Case ID", col: "D" },
      { key: "site_id", label: "เลข SiteID", col: "E" },
      { key: "claim_no", label: "เลขเคลม", col: "F" },
      { key: "company_name", label: "ชื่อบริษัท", col: "G" },
      { key: "pickup_on", label: "วันนัดรับ", col: "H" },
      { key: "sales_code", label: "รหัสเซลล์", col: "I" },
      { key: "qty", label: "จำนวน", col: "J", type: "number" },
    ],
  },
  {
    n: 2, name: "ส่วนรายละเอียดในการเบิกสินค้างานเคลม", short: "เบิกสินค้าให้ลูกค้า", dir: "SSC → ลูกค้า", sub: "รายการรับจาก SIAM SOLAR", sn: "iss_sn",
    fields: [
      { key: "iss_doc", label: "เลขที่เบิก MAC5", col: "K" },
      { key: "iss_date", label: "วันที่เบิก", col: "L", type: "date" },
      { key: "iss_sn", label: "SN เบิก", col: "M", type: "sn" },
    ],
  },
  {
    n: 3, name: "ส่วนของการคืนสินค้างานเคลม", short: "ลูกค้าคืนของเสีย", dir: "ลูกค้า → SSC", sub: "รายการคืนของเสีย ของดีเคลมให้ SIAM", sn: "ret_sn",
    fields: [
      { key: "ret_pcode", label: "รหัสสินค้า", col: "N" },
      { key: "ret_doc", label: "เลขที่เบิก", col: "O" },
      { key: "ret_date", label: "วันที่", col: "P", type: "date" },
      { key: "ret_sn", label: "SN คืน", col: "Q", type: "sn" },
      { key: "ret_note", label: "หมายเหตุ", col: "R" },
    ],
  },
  {
    n: 4, name: "ส่วนการรับของเคลมกับ SolarEdge", short: "รับของเคลมจากผู้ผลิต", dir: "ผู้ผลิต → SSC", sub: "รายการรับจาก AWOT", sn: "rcv_sn",
    fields: [
      { key: "rcv_pcode", label: "รหัสสินค้า", col: "S" },
      { key: "rcv_doc", label: "เลขที่เบิก", col: "T" },
      { key: "rcv_date", label: "วันที่", col: "U", type: "date" },
      { key: "rcv_sn", label: "SN รับ", col: "V", type: "sn" },
    ],
  },
  {
    n: 5, name: "รายการของเสียส่งคืน SolarEdge", short: "ส่งของเสียคืนผู้ผลิต", dir: "SSC → ผู้ผลิต", sub: "รายการคืนของเสียให้ AWOT", sn: "ok_sn", optional: true,
    fields: [
      { key: "ok_pcode", label: "รหัสสินค้า", col: "W" },
      { key: "ok_doc", label: "เลขที่เบิก", col: "X" },
      { key: "ok_date", label: "วันที่", col: "Y", type: "date" },
      { key: "ok_sn", label: "SN จ่าย", col: "Z", type: "sn" },
    ],
  },
];
export const UNIT_STEP_FIELDS: UnitField[] = STEPS.slice(1).flatMap((s) => s.fields.map((f) => f.key as UnitField));
export const STEP_DOC: Record<2 | 3 | 4 | 5, { doc: UnitField; date: UnitField; pcode?: UnitField }> = {
  2: { doc: "iss_doc", date: "iss_date" },
  3: { doc: "ret_doc", date: "ret_date", pcode: "ret_pcode" },
  4: { doc: "rcv_doc", date: "rcv_date", pcode: "rcv_pcode" },
  5: { doc: "ok_doc", date: "ok_date", pcode: "ok_pcode" },
};

// ---------------------------------------------------------------------------
// Progress and internal status (same rules as ssccare)
// ---------------------------------------------------------------------------
export type StepState = "none" | "partial" | "full" | "over";
export interface StepProgress { n: number; count: number; qty: number; state: StepState }
export type BoardStatus = "done" | "problem" | "open";
export const BOARD_STATUS: Record<BoardStatus, { label: string; tone: Tone }> = {
  open: { label: "กำลังดำเนินการ", tone: "amber" },
  done: { label: "ปิดครบ", tone: "green" },
  problem: { label: "ต้องตรวจสอบ", tone: "red" },
};
export const STEP_STATE_LABEL: Record<StepState, string> = { none: "ยังไม่เริ่ม", partial: "ยังไม่ครบ", full: "ครบ", over: "เกินจำนวน" };

const filled = (s: string | null | undefined) => Boolean(s && s.trim());

export function stepProgress(claim: Pick<Claim, "qty">, units: ClaimUnit[]): StepProgress[] {
  const qty = Math.max(1, claim.qty || 1);
  const state = (count: number): StepState => (count === 0 ? "none" : count < qty ? "partial" : count === qty ? "full" : "over");
  return STEPS.map((s) => {
    const count = s.n === 1 ? units.length : units.filter((u) => filled(u[s.sn!] as string | null)).length;
    return { n: s.n, count, qty, state: s.n === 5 ? (count ? "full" : "none") : state(count) };
  });
}

export function boardStatus(claim: Pick<Claim, "qty">, units: ClaimUnit[], dupIssue = false): BoardStatus {
  const p = stepProgress(claim, units);
  if (p.slice(0, 4).some((x) => x.state === "over") || dupIssue) return "problem";
  if (p.slice(0, 4).every((x) => x.state === "full")) return "done";
  return "open";
}

/** Year of a claim: from the number prefix (25-0123 → 2025), else the voucher / created date. */
export function claimYear(c: Pick<Claim, "claim_no" | "voucher_date" | "created_at">): number {
  const m = /^(\d{2})-\d+/.exec(c.claim_no);
  if (m) return 2000 + Number(m[1]);
  return new Date(c.voucher_date ?? c.created_at).getFullYear();
}

export const snKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s\-_./]/g, "").replace(/O/g, "0");
export const splitSns = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Audit report (the 14 ssccare checks; dates are real dates now, so "wrong date format" only shows for imports)
// ---------------------------------------------------------------------------
export type AuditKind =
  | "no_claim_no" | "no_voucher" | "no_issue_sn" | "issued_not_returned" | "returned_not_received" | "skipped_step"
  | "dup_sn" | "ok_sn_mismatch" | "sn_typo" | "ok_sn_swapped" | "sn_text" | "sn_spaces" | "qty_mismatch" | "bad_date";
export const AUDIT_LABEL: Record<AuditKind, string> = {
  no_claim_no: "ไม่มีเลขเคลม",
  no_voucher: "ไม่มีเลขใบสำคัญ",
  no_issue_sn: "ยังไม่มี SN เบิก",
  issued_not_returned: "เบิกแล้ว ยังไม่คืน",
  returned_not_received: "คืนแล้ว ยังไม่ได้รับ",
  skipped_step: "ข้ามขั้นตอน",
  dup_sn: "SN ซ้ำ",
  ok_sn_mismatch: "SN จ่าย ไม่ตรงกับ SN คืน",
  sn_typo: "SN น่าจะพิมพ์ผิด",
  ok_sn_swapped: "SN จ่ายสลับแถว",
  sn_text: "ช่อง SN เป็นข้อความ",
  sn_spaces: "SN มีช่องว่างเกิน",
  qty_mismatch: "จำนวนแถวไม่ตรงกับจำนวนในใบเคลม",
  bad_date: "วันที่ผิดรูปแบบ",
};
export interface AuditIssue { kind: AuditKind; claim: Claim; unit?: ClaimUnit; detail: string }

const SN_FIELDS: UnitField[] = ["iss_sn", "ret_sn", "rcv_sn", "ok_sn"];
const SN_LABEL: Record<string, string> = { iss_sn: "SN เบิก", ret_sn: "SN คืน", rcv_sn: "SN รับ", ok_sn: "SN จ่าย" };

export function auditClaims(claims: Claim[], unitsBy: Map<string, ClaimUnit[]>): AuditIssue[] {
  const out: AuditIssue[] = [];
  // duplicate SN per column across all claims
  const seen = new Map<string, { claim: Claim; unit: ClaimUnit }[]>();
  for (const c of claims) {
    for (const u of unitsBy.get(c.id) ?? []) {
      for (const f of SN_FIELDS) {
        const v = u[f] as string | null;
        if (!filled(v)) continue;
        const k = `${f}:${snKey(v)}`;
        const list = seen.get(k) ?? [];
        list.push({ claim: c, unit: u });
        seen.set(k, list);
      }
    }
  }
  for (const [k, list] of seen) {
    if (list.length < 2) continue;
    const [f, sn] = k.split(":");
    for (const { claim, unit } of list)
      out.push({ kind: "dup_sn", claim, unit, detail: `${SN_LABEL[f]} ${sn} ซ้ำ ${list.length} แถว (${[...new Set(list.map((x) => x.claim.claim_no))].join(", ")})` });
  }

  for (const c of claims) {
    const units = unitsBy.get(c.id) ?? [];
    if (!filled(c.claim_no)) out.push({ kind: "no_claim_no", claim: c, detail: "ไม่มีเลขเคลม" });
    if (!filled(c.voucher_no) && c.source !== "customer") out.push({ kind: "no_voucher", claim: c, detail: "ไม่มีเลขใบสำคัญ (B)" });
    if (units.length !== c.qty) out.push({ kind: "qty_mismatch", claim: c, detail: `มี ${units.length} แถว แต่ใบเคลมระบุ ${c.qty}` });
    const okRet: { unit: ClaimUnit; ok: string; ret: string }[] = [];
    for (const u of units) {
      const iss = filled(u.iss_sn), ret = filled(u.ret_sn), rcv = filled(u.rcv_sn), ok = filled(u.ok_sn);
      if (!iss && (c.status === "in_progress" || c.status === "done" || c.source !== "customer")) out.push({ kind: "no_issue_sn", claim: c, unit: u, detail: `แถว ${u.seq}: ยังไม่มี SN เบิก` });
      if (iss && !ret) out.push({ kind: "issued_not_returned", claim: c, unit: u, detail: `แถว ${u.seq}: เบิก ${u.iss_sn} แล้ว ยังไม่คืน` });
      if (ret && !rcv) out.push({ kind: "returned_not_received", claim: c, unit: u, detail: `แถว ${u.seq}: คืน ${u.ret_sn} แล้ว ยังไม่ได้รับจากผู้ผลิต` });
      const chain = [iss, ret, rcv, ok];
      const last = chain.lastIndexOf(true);
      if (last > 0 && chain.slice(0, Math.min(last, 3)).some((x) => !x)) out.push({ kind: "skipped_step", claim: c, unit: u, detail: `แถว ${u.seq}: มีข้อมูลขั้นหลังแต่ขั้นก่อนหน้าว่าง` });
      if (ok && ret) okRet.push({ unit: u, ok: snKey(u.ok_sn), ret: snKey(u.ret_sn) });
      for (const f of SN_FIELDS) {
        const v = u[f] as string | null;
        if (!filled(v)) continue;
        if (/\s{2,}|^\s|\s$/.test(v!)) out.push({ kind: "sn_spaces", claim: c, unit: u, detail: `แถว ${u.seq}: ${SN_LABEL[f]} "${v}" มีช่องว่างเกิน` });
        if (/[ก-๙]/.test(v!) || /^[A-Za-z\s]+$/.test(v!.trim()) || v!.trim().length < 4) out.push({ kind: "sn_text", claim: c, unit: u, detail: `แถว ${u.seq}: ${SN_LABEL[f]} "${v}" ไม่ใช่ SN` });
        else if (/\s/.test(v!.trim()) || /[Oo](?=\d)|(?<=\d)[Oo]/.test(v!)) out.push({ kind: "sn_typo", claim: c, unit: u, detail: `แถว ${u.seq}: ${SN_LABEL[f]} "${v}" น่าจะพิมพ์ผิด (เว้นวรรค หรือ O กับ 0)` });
      }
    }
    // step 5: SN จ่าย should be the returned faulty unit
    for (const x of okRet) {
      if (x.ok === x.ret) continue;
      const other = okRet.find((y) => y !== x && y.ret === x.ok);
      if (other) out.push({ kind: "ok_sn_swapped", claim: c, unit: x.unit, detail: `แถว ${x.unit.seq}: SN จ่าย ${x.unit.ok_sn} ตรงกับ SN คืนของแถว ${other.unit.seq}` });
      else out.push({ kind: "ok_sn_mismatch", claim: c, unit: x.unit, detail: `แถว ${x.unit.seq}: SN จ่าย ${x.unit.ok_sn} ≠ SN คืน ${x.unit.ret_sn}` });
    }
  }
  return out;
}

/** issue SNs used more than once (makes a claim "ต้องตรวจสอบ" like ssccare). */
export function duplicateIssueClaims(units: ClaimUnit[]): Set<string> {
  const by = new Map<string, Set<string>>();
  for (const u of units) {
    if (!filled(u.iss_sn)) continue;
    const k = snKey(u.iss_sn);
    const s = by.get(k) ?? new Set();
    s.add(u.claim_id + ":" + u.id);
    by.set(k, s);
  }
  const out = new Set<string>();
  for (const s of by.values()) if (s.size > 1) for (const x of s) out.add(x.split(":")[0]);
  return out;
}

// ---------------------------------------------------------------------------
// Dates: dd/mm/yyyy (also พ.ศ.), yyyy-mm-dd, Excel serial → ISO date
// ---------------------------------------------------------------------------
export function parseDate(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += y >= 50 ? 2500 : 2000; // 68 → พ.ศ. 2568, 25 → ค.ศ. 2025
  } else if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const dt = new Date(Math.round((Number(s) - 25569) * 86400000));
    return isNaN(dt.getTime()) ? undefined : dt.toISOString().slice(0, 10);
  } else return undefined;
  if (y > 2400) y -= 543; // พ.ศ.
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** dd/mm/yyyy (ค.ศ.) like the old sheet */
export const fmtDmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export const fmtThai = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "-";
export const fmtThaiTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
export const todayIso = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Paste / import (tab-separated from Excel or Google Sheets)
// ---------------------------------------------------------------------------
export interface ImportClaim {
  claim_no: string;
  pcode: string;
  voucher_no: string;
  voucher_date: string | null;
  case_id: string;
  site_id: string;
  company_name: string;
  pickup_on: string;
  sales_code: string;
  qty: number;
  status?: ClaimStatus;
  units?: Partial<ClaimUnit>[];
}
export interface ParseResult { claims: ImportClaim[]; skipped: { line: number; reason: string }[]; warnings: { line: number; reason: string }[]; rows: number }

const COL_KEYS: (UnitField | HeaderField)[] = STEPS.flatMap((s) => s.fields.map((f) => f.key));
const DATE_KEYS = new Set(STEPS.flatMap((s) => s.fields.filter((f) => f.type === "date").map((f) => f.key)));

function splitTsv(text: string): string[][] {
  // handles quoted cells with tabs/new lines, as Google Sheets / Excel copy them
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * mode "header": columns A–J, one line per claim (ssccare "วางใบเคลมจาก Excel"); perUnit → qty rows per claim.
 * mode "full": columns A–Z, one line per unit (the whole old sheet); lines with the same claim number become one claim.
 */
export function parseClaimPaste(text: string, mode: "header" | "full", perUnit = true): ParseResult {
  const lines = splitTsv(text);
  const skipped: ParseResult["skipped"] = [];
  const warnings: ParseResult["warnings"] = [];
  const byNo = new Map<string, ImportClaim>();
  const order: string[] = [];
  lines.forEach((cells, idx) => {
    const line = idx + 1;
    const get = (i: number) => (cells[i] ?? "").trim();
    // header row: no digits in the qty column and a Thai label in the claim-number column
    if (/เลขเคลม|claim/i.test(get(5)) || /รหัสสินค้า/.test(get(0))) return skipped.push({ line, reason: "หัวตาราง" });
    const no = get(5);
    if (!no) return skipped.push({ line, reason: "ไม่มีเลขเคลม (F)" });
    const qtyRaw = get(9).replace(/,/g, "");
    let qty = qtyRaw === "" ? 1 : Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 1) {
      if (mode === "header") return skipped.push({ line, reason: `จำนวน (J) "${get(9)}" ไม่ใช่ตัวเลข` });
      qty = 1;
    }
    if (qty > 200) return skipped.push({ line, reason: "จำนวนเกิน 200" });
    const vd = parseDate(get(2));
    if (vd === undefined) warnings.push({ line, reason: `วันที่ใบสำคัญ "${get(2)}" อ่านไม่ได้ (เว้นว่างไว้)` });
    let c = byNo.get(no);
    if (!c) {
      c = {
        claim_no: no, pcode: get(0), voucher_no: get(1), voucher_date: vd ?? null, case_id: get(3), site_id: get(4),
        company_name: get(6), pickup_on: get(7), sales_code: get(8), qty, units: mode === "full" ? [] : undefined,
      };
      byNo.set(no, c);
      order.push(no);
    } else if (mode === "header") {
      return skipped.push({ line, reason: `เลขเคลม ${no} ซ้ำในข้อมูลที่วาง` });
    }
    if (mode === "full") {
      const u: Partial<ClaimUnit> = { pcode: get(0) || null };
      COL_KEYS.forEach((k, i) => {
        if (i < 10) return;
        const raw = get(i);
        if (DATE_KEYS.has(k)) {
          const d = parseDate(raw);
          if (d === undefined) warnings.push({ line, reason: `คอลัมน์ ${String.fromCharCode(65 + i)} วันที่ "${raw}" อ่านไม่ได้` });
          (u as Record<string, unknown>)[k] = d ?? null;
        } else (u as Record<string, unknown>)[k] = raw || null;
      });
      c.units!.push(u);
    } else if (!perUnit) c.qty = 1;
  });
  const claims = order.map((n) => byNo.get(n)!);
  if (mode === "full") {
    for (const c of claims) {
      // qty from column J of the first row; the sheet has one row per unit
      c.qty = Math.max(c.qty, c.units!.length);
      const fake = { qty: c.qty } as Claim;
      const st = boardStatus(fake, c.units as ClaimUnit[]);
      c.status = st === "done" ? "closed" : "in_progress";
    }
  }
  return { claims, skipped, warnings, rows: lines.length };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
export function download(name: string, content: BlobPart, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const SHEET_HEADER = STEPS.flatMap((s) => s.fields.map((f) => `${f.col} ${f.label}`));
/** One line per unit in the old sheet layout A–Z (dates as dd/mm/yyyy). */
export function sheetRows(claims: Claim[], unitsBy: Map<string, ClaimUnit[]>): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const c of claims) {
    const units = unitsBy.get(c.id) ?? [];
    for (const u of units.length ? units : [null]) {
      const head: Record<HeaderField, string | number> = {
        pcode: u?.pcode ?? "", voucher_no: c.voucher_no ?? "", voucher_date: fmtDmy(c.voucher_date), case_id: c.case_id ?? "",
        site_id: c.site_id ?? "", claim_no: c.claim_no, company_name: c.company_name ?? "", pickup_on: c.pickup_on ?? "",
        sales_code: c.sales_code ?? "", qty: c.qty,
      };
      const rest = UNIT_STEP_FIELDS.map((k) => {
        const v = u ? (u[k] as string | null) : null;
        return DATE_KEYS.has(k) ? fmtDmy(v) : v ?? "";
      });
      rows.push([...STEPS[0].fields.map((f) => head[f.key as HeaderField]), ...rest]);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
/** Reads every row of a query in pages of 1000 (PostgREST caps a single response). */
/**
 * Reads every row page by page. The page size follows what the API actually returns (Supabase caps a
 * response at its "max rows" setting, which may be lower than 1000), and stops only once the exact
 * row count has been read, so a lower cap can never silently cut the list short.
 */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>): Promise<T[]> {
  // first page tells the total and the real page size; the rest are fetched at the same time
  const first = await build(0, 999);
  if (first.error) throw first.error;
  const out: T[] = [...(first.data ?? [])];
  const size = out.length;
  const total = typeof first.count === "number" ? first.count : null;
  if (!size || (total !== null ? size >= total : size < 1000)) return out;
  if (total !== null) {
    const starts: number[] = [];
    for (let a = size; a < total; a += size) starts.push(a);
    const pages = await Promise.all(starts.map((a) => build(a, a + size - 1)));
    for (const pg of pages) {
      if (pg.error) throw pg.error;
      out.push(...(pg.data ?? []));
    }
  }
  // no count, or rows were added while loading: read on until a short page
  while (out.length % size === 0) {
    const { data, error } = await build(out.length, out.length + size - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

/** Last board read in this tab, so coming back to the claims page shows it at once while it refreshes. */
export let boardCache: { claims: Claim[]; units: ClaimUnit[]; at: Date } | null = null;

export async function loadBoard(): Promise<{ claims: Claim[]; units: ClaimUnit[] }> {
  const [claims, units] = await Promise.all([
    fetchAll<Claim>((a, b) => supabase.from("claims").select("*", { count: "exact" }).order("claim_no").range(a, b)),
    fetchAll<ClaimUnit>((a, b) => supabase.from("claim_units").select("*", { count: "exact" }).order("claim_id").order("seq").range(a, b)),
  ]);
  boardCache = { claims, units, at: new Date() };
  return { claims, units };
}

export function groupUnits(units: ClaimUnit[]): Map<string, ClaimUnit[]> {
  const m = new Map<string, ClaimUnit[]>();
  for (const u of units) {
    const l = m.get(u.claim_id) ?? [];
    l.push(u);
    m.set(u.claim_id, l);
  }
  for (const l of m.values()) l.sort((a, b) => a.seq - b.seq);
  return m;
}

export const MAX_FILE_MB = 10;
export async function uploadClaimFile(claimId: string, kind: FileKind, file: File) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`ไฟล์ ${file.name} ใหญ่เกิน ${MAX_FILE_MB} MB`);
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const path = `${claimId}/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage.from("claim-files").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  const { data, error: e2 } = await supabase.rpc("add_claim_file", {
    p_claim: claimId, p_kind: kind, p_path: path, p_name: file.name, p_size: file.size, p_type: file.type || null,
  });
  if (e2) throw e2;
  return data as ClaimFile;
}
export async function claimFileUrl(path: string, downloadName?: string): Promise<string | null> {
  const { data } = await supabase.storage.from("claim-files").createSignedUrl(path, 600, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}
export async function openClaimFile(path: string) {
  const url = await claimFileUrl(path);
  if (url) window.open(url, "_blank", "noopener");
}
export const isImage = (f: { file_name?: string | null; content_type?: string | null; path: string }) =>
  (f.content_type ?? "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(f.file_name ?? f.path);

// ---------------------------------------------------------------------------
// SN correction requests (customer asks, staff approve) · migration 20
// ---------------------------------------------------------------------------
export type SnChangeReason = "typo" | "wrong_unit" | "wrong_product" | "other";
export const SN_REASON: Record<SnChangeReason, string> = {
  typo: "พิมพ์ SN ผิด",
  wrong_unit: "ใส่ SN ผิดตัว",
  wrong_product: "แจ้งสินค้าผิด",
  other: "อื่น ๆ (ระบุ)",
};
export interface SnChange {
  id: string;
  claim_id: string;
  user_id: string | null;
  old_sn: string;
  new_sn: string;
  reason: SnChangeReason;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  staff_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}
export const SN_CHANGE_STATUS: Record<SnChange["status"], { label: string; tone: Tone }> = {
  pending: { label: "รออนุมัติ", tone: "amber" },
  approved: { label: "อนุมัติแล้ว", tone: "green" },
  rejected: { label: "ไม่อนุมัติ", tone: "red" },
};
