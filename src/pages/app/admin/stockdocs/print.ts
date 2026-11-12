import { formatDate } from "../../../../lib/catalog";
import { esc, heading, note, openPrintDoc, table, type PrintDoc } from "../../../../lib/printdoc";
import {
  CONDITION_LABEL, DIR, DOC_LABEL, DOC_STATUS_LABEL, PARTNER_LABEL, REF_LABEL,
  type CountReport, type DocItem, type DocType, type StockCount, type StockDoc, type Warehouse,
} from "../../../../lib/stockdocs";

export const DOC_TITLE_EN: Record<DocType, string> = {
  OB: "OPENING BALANCE", GR: "GOODS RECEIPT (PO)", GN: "GOODS RECEIPT (DELIVERY NOTE)", RT: "GOODS RETURN", SO: "DELIVERY / SALES ISSUE",
  BR: "LOAN NOTE", WD: "STOCK WITHDRAWAL", WO: "STOCK WRITE-OFF", TR: "STOCK TRANSFER", RV: "STOCK RESERVATION",
};

/** SN list: four "no. | serial" pairs per row so a long list stays on few pages. */
function snGrid(sns: DocItem[], showCond: boolean) {
  const per = 4;
  const rows: string[][] = [];
  for (let i = 0; i < sns.length; i += per) {
    rows.push(Array.from({ length: per }, (_, j) => {
      const s = sns[i + j];
      return s ? `<span class="muted">${i + j + 1}.</span> ${esc(s.sn)}${showCond && s.condition !== "good" ? ` <b style="color:#b91c1c">(${CONDITION_LABEL[s.condition]})</b>` : ""}` : "";
    }));
  }
  return table(Array.from({ length: per }, () => ["Serial Number", "m"] as [string, string]), rows, { small: true, raw: true, fixed: true });
}

/** Printable A4 stock document: letterhead, parties, totals per code, every SN, signatures. */
export function printStockDoc(d: StockDoc, items: DocItem[], warehouses: Warehouse[]) {
  const wh = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? "";
  const groups = new Map<string, { description: string | null; sns: DocItem[] }>();
  items.forEach((i) => {
    const g = groups.get(i.sku) ?? { description: i.description, sns: [] };
    g.sns.push(i);
    groups.set(i.sku, g);
  });
  const dir = DIR[d.doc_type];
  const showCond = d.doc_type === "RT" || dir === "in";
  const partner = PARTNER_LABEL[d.doc_type] ?? "ผู้ติดต่อ";

  const body = [
    heading("รายการสินค้า"),
    table([["ลำดับ", "c"], ["รหัสสินค้า"], ["รายละเอียด"], ["จำนวน (ชิ้น)", "r"]],
      [...groups.entries()].map(([sku, g], i) => [i + 1, sku, g.description, g.sns.length]),
      { foot: ["", "", "รวมทั้งสิ้น", items.length], widths: ["44px", "26%", undefined, "90px"] }),
    heading(`รายการ Serial Number (${items.length} รายการ)`),
    ...[...groups.entries()].map(([sku, g]) => `<p style="margin:8px 0 4px;font-weight:700">${esc(sku)} <span class="muted" style="font-weight:400">${esc(g.description ?? "")} · ${g.sns.length} ชิ้น</span></p>${snGrid(g.sns, showCond)}`),
    note("เหตุผล", d.reason),
    note("หมายเหตุ", d.note),
    d.status === "cancelled" ? note("ยกเลิกเอกสาร", `${d.cancel_reason ?? ""}${d.cancelled_at ? ` (${formatDate(d.cancelled_at)})` : ""}`) : "",
  ].join("");

  const doc: PrintDoc = {
    title: DOC_LABEL[d.doc_type], titleEn: DOC_TITLE_EN[d.doc_type], docNo: d.doc_no, date: formatDate(d.doc_date),
    extra: [["สถานะ", DOC_STATUS_LABEL[d.status]], [REF_LABEL[d.doc_type] ?? "อ้างอิง", d.ref_no]],
    watermark: d.status === "cancelled" ? "ยกเลิก" : d.status === "draft" ? "ร่าง" : null,
    panels: [
      { heading: partner, rows: [["ชื่อ", d.partner_name], ["เลขผู้เสียภาษี", d.partner_tax_id], ["PO ลูกค้า", d.customer_po], ["สถานที่ / ไซต์", d.site_name], ["กำหนดคืน", d.due_date ? formatDate(d.due_date) : null]] },
      { heading: "คลังสินค้า", rows: [[d.doc_type === "TR" ? "จากคลัง" : "คลัง", wh(d.warehouse_id)], ["ไปคลัง", d.doc_type === "TR" ? wh(d.to_warehouse_id) : null],
        ["ทิศทาง", dir === "in" ? "รับเข้าคลัง" : dir === "out" ? "จ่ายออกจากคลัง" : d.doc_type === "TR" ? "โอนระหว่างคลัง" : "จอง (ยังไม่ตัดสต๊อก)"],
        ["ยืนยันเมื่อ", d.posted_at ? formatDate(d.posted_at) : null]] },
    ],
    body,
    signatures: [
      "ผู้จัดทำ",
      dir === "in" ? "ผู้ส่งสินค้า" : d.doc_type === "TR" ? "ผู้รับโอน" : d.doc_type === "WO" ? "ผู้ตรวจสอบ" : "ผู้รับสินค้า",
      ...(d.checked_at ? ["ผู้ตรวจ (ชั้นที่ 1)"] : []),
      "ผู้อนุมัติ",
    ],
  };
  return openPrintDoc(doc);
}

/** Stock count result: totals per code, missing and extra SNs, signatures of the counters. */
export function printStockCount(c: StockCount, r: CountReport, warehouse: string) {
  const body = [
    heading("สรุปตามรหัสสินค้า"),
    table([["ลำดับ", "c"], ["รหัสสินค้า"], ["ยอดในระบบ", "r"], ["นับได้", "r"], ["ผลต่าง", "r"]],
      r.by_sku.map((s, i) => [i + 1, s.sku, s.expected, s.counted, s.counted - s.expected || "-"]),
      { foot: ["", "รวม", r.expected, r.matched, r.matched - r.expected || "-"], widths: ["44px"] }),
    heading(`ไม่พบในการนับ (${r.missing.length})`),
    r.missing.length ? table([["ลำดับ", "c"], ["Serial Number", "m"], ["รหัสสินค้า"], ["สถานะในระบบ"]],
      r.missing.map((m, i) => [i + 1, m.sn, m.sku, m.status === "reserved" ? "จอง" : "ในคลัง"]), { small: true, widths: ["44px"] }) : `<p class="muted">พบครบทุกชิ้น</p>`,
    heading(`พบเกิน / ไม่ตรงกับระบบ (${r.extra.length})`),
    r.extra.length ? table([["ลำดับ", "c"], ["Serial Number", "m"], ["รหัสสินค้า"], ["ผล"]],
      r.extra.map((x, i) => [i + 1, x.sn, x.sku ?? "-", ({ other_wh: `ในระบบอยู่คลัง ${x.warehouse ?? "อื่น"}`, out: "ในระบบออกจากคลังแล้ว", other_sku: "รหัสอื่น", unknown: "ไม่มีในระบบ", ok: "ตรง" } as Record<string, string>)[x.result ?? "unknown"]]),
      { small: true, widths: ["44px"] }) : `<p class="muted">ไม่มี</p>`,
    r.docs?.length ? note("เอกสารปรับยอดที่สร้าง", r.docs.map((d) => `${d.doc_no} ${DOC_LABEL[d.doc_type]} (${d.n} ชิ้น)`).join(", ")) : "",
    note("หมายเหตุ", c.note),
  ].join("");
  return openPrintDoc({
    title: "ใบสรุปผลการตรวจนับสต๊อก", titleEn: "STOCK COUNT REPORT", docNo: c.count_no, date: formatDate(c.started_at),
    extra: [["สถานะ", c.status === "open" ? "กำลังนับ" : c.status === "closed" ? "ปิดแล้ว" : "ยกเลิก"]],
    watermark: c.status === "cancelled" ? "ยกเลิก" : null,
    panels: [
      { heading: "ขอบเขตการนับ", rows: [["คลัง", warehouse], ["รหัสสินค้า", c.skus?.join(", ") ?? "ทุกรหัส"], ["เริ่มนับ", formatDate(c.started_at)], ["ปิดใบ", c.closed_at ? formatDate(c.closed_at) : "-"]] },
      { heading: "ผลการนับ", rows: [["ยอดในระบบ", `${r.expected} ชิ้น`], ["นับได้ตรงกับระบบ", `${r.matched} ชิ้น`], ["ไม่พบ", `${r.missing.length} ชิ้น`], ["เกิน / ไม่ตรง", `${r.extra.length} ชิ้น`]] },
    ],
    body,
    signatures: ["ผู้ตรวจนับ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"],
  });
}
