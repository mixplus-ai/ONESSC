import { formatDate } from "../../../../lib/catalog";
import { esc, exportPrintPng, heading, note, openPrintDoc, preparePrintWindow, table, type Panel, type PrintDoc } from "../../../../lib/printdoc";
import {
  CONDITION_LABEL, DIR, DOC_LABEL, docRoute, DOC_STATUS_LABEL, FILE_KINDS, PARTNER_LABEL, REF_LABEL,
  type CountReport, type DocItem, type DocType, type StockCount, type StockDoc, type Warehouse,
} from "../../../../lib/stockdocs";

import { isImage, loadDocFiles } from "./DocFiles";

export const DOC_TITLE_EN: Record<DocType, string> = {
  OB: "OPENING BALANCE", GR: "GOODS RECEIPT (IMPORT)", GN: "GOODS RECEIPT (DOMESTIC)", RT: "GOODS RETURN", SO: "DELIVERY NOTE",
  BR: "CLAIM ISSUE", WD: "STOCK WITHDRAWAL / LOAN", WO: "STOCK WRITE-OFF", TR: "STOCK TRANSFER", RV: "STOCK RESERVATION",
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

/** Source → destination of a document, and when it was checked / approved. */
function routePanel(d: StockDoc, warehouses: Warehouse[]): Panel {
  const r = docRoute(d, (id: string | null | undefined) => warehouses.find((w) => w.id === id)?.name ?? "-");
  return { heading: "เส้นทางสินค้า", rows: [["ต้นทาง", r.from], ["ปลายทาง", r.to],
    ["ตรวจเมื่อ", d.checked_at ? formatDate(d.checked_at) : null], ["อนุมัติเมื่อ", d.posted_at ? formatDate(d.posted_at) : null]] };
}

/** Printable A4 stock document: letterhead, parties, totals per code, every SN, signatures. */
export function printStockDoc(d: StockDoc, items: DocItem[], warehouses: Warehouse[]) {
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
      { heading: partner, rows: [["ชื่อ", d.partner_name], ["เลขผู้เสียภาษี", d.partner_tax_id], ["PO ลูกค้า", d.customer_po], ["ชื่อโครงการ", d.site_name], ["กำหนดคืน", d.due_date ? formatDate(d.due_date) : null]] },
      routePanel(d, warehouses),
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

// ---------------------------------------------------------------------------
// Receipts and delivery notes (GR, GN, SO, BR) print as two separate PDFs:
//   1. the detail sheet: parties, totals per code, vehicle and driver, photos
//   2. the SN sheet: every serial, with the checker / receiver / approver signatures, referring to sheet 1's number
// ---------------------------------------------------------------------------
function groupItems(items: DocItem[]) {
  const groups = new Map<string, { description: string | null; sns: DocItem[] }>();
  items.forEach((i) => {
    const g = groups.get(i.sku) ?? { description: i.description, sns: [] };
    g.sns.push(i);
    groups.set(i.sku, g);
  });
  return [...groups.entries()];
}
/** Product rows for the detail sheet: the document's lines (wanted qty) plus codes that only have SNs. */
function lineRows(d: StockDoc, items: DocItem[]) {
  const g = new Map(groupItems(items));
  const rows = (d.lines ?? []).map((l) => ({ sku: l.sku, description: g.get(l.sku)?.description ?? l.description, qty: Math.max(Number(l.qty) || 0, g.get(l.sku)?.sns.length ?? 0), sns: g.get(l.sku)?.sns.length ?? 0 }));
  const seen = new Set(rows.map((r) => r.sku));
  g.forEach((v, sku) => { if (!seen.has(sku)) rows.push({ sku, description: v.description, qty: v.sns.length, sns: v.sns.length }); });
  return rows;
}
const watermarkOf = (d: StockDoc) => (d.status === "cancelled" ? "ยกเลิก" : d.status === "draft" ? "ร่าง" : null);
const vehiclePanel = (d: StockDoc): Panel => ({
  heading: DIR[d.doc_type] === "in" ? "รถที่มาส่ง" : "รถขนส่ง",
  rows: [["ทะเบียนรถ", d.vehicle_plate], ["คนขับ", d.driver_name], ["เบอร์โทร", d.driver_phone]],
});
const partnerPanel = (d: StockDoc): Panel => ({
  heading: PARTNER_LABEL[d.doc_type] ?? "ผู้ติดต่อ",
  rows: [["ชื่อ", d.partner_name], ["เลขผู้เสียภาษี", d.partner_tax_id], ["PO ลูกค้า", d.customer_po], ["ชื่อโครงการ", d.site_name]],
});

export async function printDeliveryDetail(d: StockDoc, items: DocItem[], warehouses: Warehouse[]) {
  const w = preparePrintWindow();
  if (!w) return;
  return openPrintDoc(await deliveryDetailDoc(d, items, warehouses), w);
}

/** Sheet 1: the delivery / receipt detail (parties, route, totals per code, vehicle, photos). */
export async function deliveryDetailDoc(d: StockDoc, items: DocItem[], warehouses: Warehouse[]): Promise<PrintDoc> {
  const lines = lineRows(d, items);
  const { list, urls } = await loadDocFiles(d.id, 7 * 24 * 3600);
  const photos = FILE_KINDS.map((k) => ({ ...k, files: list.filter((f) => (f.kind ?? "other") === k.kind && isImage(f.name) && urls[f.path]) }))
    .filter((k) => k.files.length);
  // one page: four fixed slots (plate, vehicle papers, driver papers, goods) + up to four extra photos in a smaller row
  const box = (label: string, url: string | undefined, h: number) =>
    `<figure style="margin:0;border:1px solid #cbd5e1;border-radius:6px;padding:3px;text-align:center;break-inside:avoid">${url
      ? `<img src="${esc(url)}" alt="" style="width:100%;height:${h}px;object-fit:contain;display:block">`
      : `<div style="height:${h}px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:8.5pt;border:1px dashed #cbd5e1;border-radius:4px">ไม่มีรูป</div>`}<figcaption style="font-size:8pt;color:#0f2a4a;font-weight:600;margin-top:2px">${esc(label)}</figcaption></figure>`;
  const byKind = (k: string) => photos.find((x) => x.kind === k)?.files ?? [];
  const main = FILE_KINDS.filter((k) => k.kind !== "other").map((k) => ({ label: k.label, url: byKind(k.kind)[0] ? urls[byKind(k.kind)[0].path] : undefined }));
  const extras = FILE_KINDS.flatMap((k) => (k.kind === "other" ? byKind(k.kind) : byKind(k.kind).slice(1)).map((f) => ({ label: k.label, url: urls[f.path] })));
  const shown = extras.slice(0, 4);
  const photoHtml = photos.length ? `<div style="break-inside:avoid">${heading("รูปประกอบ")}
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${main.map((c) => box(c.label, c.url, 88)).join("")}</div>
${shown.length ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px">${shown.map((c) => box(c.label, c.url, 62)).join("")}</div>` : ""}
${extras.length > shown.length ? `<p class="muted" style="font-size:8pt;margin:4px 0 0">มีรูปเพิ่มอีก ${extras.length - shown.length} รูป ดูได้ในระบบ</p>` : ""}</div>` : "";

  const body = [
    heading("รายการสินค้า"),
    table([["ลำดับ", "c"], ["รหัสสินค้า"], ["รายละเอียด"], ["จำนวน (ชิ้น)", "r"], ["SN", "r"]],
      lines.map((r, i) => [i + 1, r.sku, r.description, r.qty, r.sns]),
      { foot: ["", "", "รวมทั้งสิ้น", lines.reduce((a, r) => a + r.qty, 0), items.length], widths: ["44px", "24%", undefined, "86px", "60px"] }),
    note("รายการ Serial Number", `${items.length} รายการ แยกอยู่ในใบรายการ SN เลขที่ ${d.doc_no ?? "-"}-SN`),
    note("เหตุผล", d.reason),
    note("หมายเหตุ", d.note),
    d.status === "cancelled" ? note("ยกเลิกเอกสาร", `${d.cancel_reason ?? ""}${d.cancelled_at ? ` (${formatDate(d.cancelled_at)})` : ""}`) : "",
    photoHtml,
  ].join("");

  return {
    title: DOC_LABEL[d.doc_type], titleEn: DOC_TITLE_EN[d.doc_type], docNo: d.doc_no, date: formatDate(d.doc_date),
    extra: [["สถานะ", DOC_STATUS_LABEL[d.status]], [REF_LABEL[d.doc_type] ?? "อ้างอิง", d.ref_no]],
    watermark: watermarkOf(d),
    panels: [partnerPanel(d), routePanel(d, warehouses), vehiclePanel(d)],
    body,
    signatures: DIR[d.doc_type] === "in" ? ["ผู้ส่งสินค้า", "ผู้รับสินค้า", "ผู้อนุมัติ"] : ["ผู้เบิก", "ผู้รับ", "ผู้อนุมัติ"],
    fileName: `${DOC_LABEL[d.doc_type]} ${d.doc_no ?? ""}`,
  };
}

export function printDeliverySns(d: StockDoc, items: DocItem[], warehouses: Warehouse[]) {
  return openPrintDoc(deliverySnsDoc(d, items, warehouses));
}

/** Sheet 2: project name, document number and every SN, with signatures. */
export function deliverySnsDoc(d: StockDoc, items: DocItem[], warehouses: Warehouse[]): PrintDoc {
  const showCond = DIR[d.doc_type] === "in";
  const body = [
    heading(`รายการ Serial Number (${items.length} รายการ)`),
    ...groupItems(items).map(([sku, g]) => `<p style="margin:8px 0 4px;font-weight:700">${esc(sku)} <span class="muted" style="font-weight:400">${esc(g.description ?? "")} · ${g.sns.length} ชิ้น</span></p>${snGrid(g.sns, showCond)}`),
    note("อ้างอิง", `ใบนี้เป็นใบแนบของ${DOC_LABEL[d.doc_type]} เลขที่ ${d.doc_no ?? "-"}`),
  ].join("");
  return {
    title: "ใบรายการ Serial Number", titleEn: `SERIAL LIST · ${DOC_TITLE_EN[d.doc_type]}`, docNo: d.doc_no ? `${d.doc_no}-SN` : null, date: formatDate(d.doc_date),
    extra: [["อ้างอิงใบรายละเอียด", d.doc_no], ["ชื่อโครงการ", d.site_name || "-"], ["สถานะ", DOC_STATUS_LABEL[d.status]]],
    watermark: watermarkOf(d),
    panels: [{ heading: PARTNER_LABEL[d.doc_type] ?? "ผู้ติดต่อ", rows: [["ชื่อ", d.partner_name], ["ชื่อโครงการ", d.site_name]] }, routePanel(d, warehouses), vehiclePanel(d)],
    body,
    signatures: ["ผู้ตรวจ", DIR[d.doc_type] === "in" ? "ผู้รับสินค้าเข้าคลัง" : "ผู้รับสินค้า", "ผู้อนุมัติ"],
    fileName: `${d.doc_no ?? ""}-SN ใบรายการ Serial Number`,
  };
}

/** Both sheets as PNG pictures (one file each). */
export async function exportDeliveryPng(d: StockDoc, items: DocItem[], warehouses: Warehouse[], sheet: "detail" | "sn") {
  const name = `${d.doc_no ?? DOC_LABEL[d.doc_type]}${sheet === "sn" ? "-SN" : ""}`;
  return exportPrintPng(sheet === "detail" ? await deliveryDetailDoc(d, items, warehouses) : deliverySnsDoc(d, items, warehouses), name);
}

/** Excel with the same two sheets: รายละเอียด (header + totals per code) and Serial Number (one row per SN). */
export async function exportDeliveryXlsx(d: StockDoc, items: DocItem[], warehouses: Warehouse[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const r = docRoute(d, (id: string | null | undefined) => warehouses.find((w) => w.id === id)?.name ?? "-");
  const b = (v: string) => ({ value: v, fontWeight: "bold" as const });
  const cell = (v: string | number | null | undefined) => ({ value: v ?? "" });
  const info: [string, string | null | undefined][] = [
    ["เลขที่เอกสาร", d.doc_no], ["วันที่", formatDate(d.doc_date)], ["สถานะ", DOC_STATUS_LABEL[d.status]],
    [PARTNER_LABEL[d.doc_type] ?? "ผู้ติดต่อ", d.partner_name], ["เลขผู้เสียภาษี", d.partner_tax_id], ["ชื่อโครงการ", d.site_name],
    [REF_LABEL[d.doc_type] ?? "อ้างอิง", d.ref_no], ["PO ลูกค้า", d.customer_po], ["ต้นทาง", r.from], ["ปลายทาง", r.to],
    ["ทะเบียนรถ", d.vehicle_plate], ["คนขับ", d.driver_name], ["เบอร์โทรคนขับ", d.driver_phone], ["หมายเหตุ", d.note],
  ];
  const groups = groupItems(items);
  const sheet1 = [
    [b(`${DOC_LABEL[d.doc_type]} ${d.doc_no ?? ""}`)], [],
    ...info.filter(([, v]) => v).map(([k, v]) => [b(k), cell(v)]), [],
    [b("ลำดับ"), b("รหัสสินค้า"), b("ชื่อสินค้า"), b("จำนวน (ชิ้น)"), b("SN ที่ใส่")],
    ...lineRows(d, items).map((r, i) => [cell(i + 1), cell(r.sku), cell(r.description), cell(r.qty), cell(r.sns)]),
    [cell(""), cell(""), b("รวมทั้งสิ้น"), { value: lineRows(d, items).reduce((a, r) => a + r.qty, 0), fontWeight: "bold" as const }, { value: items.length, fontWeight: "bold" as const }],
  ];
  let n = 0;
  const sheet2 = [
    [b(`ใบรายการ Serial Number ${d.doc_no ? `${d.doc_no}-SN` : ""}`)], [],
    [b("อ้างอิงใบรายละเอียด"), cell(d.doc_no)], [b("ชื่อโครงการ"), cell(d.site_name || "-")], [b(PARTNER_LABEL[d.doc_type] ?? "ผู้ติดต่อ"), cell(d.partner_name)], [],
    [b("ลำดับ"), b("รหัสสินค้า"), b("ชื่อสินค้า"), b("Serial Number"), b("สภาพ")],
    ...groups.flatMap(([sku, g]) => g.sns.map((i) => [cell(++n), cell(sku), cell(g.description), cell(i.sn), cell(CONDITION_LABEL[i.condition])])),
  ];
  await writeXlsxFile([
    { sheet: "รายละเอียด", data: sheet1, columns: [{ width: 18 }, { width: 22 }, { width: 40 }, { width: 14 }, { width: 10 }] },
    { sheet: "Serial Number", data: sheet2, columns: [{ width: 8 }, { width: 20 }, { width: 36 }, { width: 26 }, { width: 8 }] },
  ]).toFile(`${d.doc_no ?? DOC_LABEL[d.doc_type]}.xlsx`);
}
