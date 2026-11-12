import { formatDate } from "../../../../lib/catalog";
import { CONDITION_LABEL, DIR, DOC_LABEL, DOC_STATUS_LABEL, PARTNER_LABEL, REF_LABEL, type DocItem, type StockDoc, type Warehouse } from "../../../../lib/stockdocs";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Opens a printable A4 page of the document: header, totals per code, every SN, signature boxes. */
export function printStockDoc(d: StockDoc, items: DocItem[], warehouses: Warehouse[]) {
  const wh = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? "";
  const groups = new Map<string, { description: string | null; sns: DocItem[] }>();
  items.forEach((i) => {
    const g = groups.get(i.sku) ?? { description: i.description, sns: [] };
    g.sns.push(i);
    groups.set(i.sku, g);
  });
  const showCond = d.doc_type === "RT" || DIR[d.doc_type] === "in";
  const rows: [string, string | null][] = [
    ["วันที่", formatDate(d.doc_date)],
    [d.doc_type === "TR" ? "จากคลัง" : "คลัง", wh(d.warehouse_id)],
    ...(d.doc_type === "TR" ? [["ไปคลัง", wh(d.to_warehouse_id)] as [string, string]] : []),
    [PARTNER_LABEL[d.doc_type] ?? "ผู้ติดต่อ", d.partner_name],
    ["เลขผู้เสียภาษี", d.partner_tax_id],
    [REF_LABEL[d.doc_type] ?? "อ้างอิง", d.ref_no],
    ["PO ลูกค้า", d.customer_po],
    ["ไซต์", d.site_name],
    ["กำหนดคืน", d.due_date ? formatDate(d.due_date) : null],
    ["เหตุผล", d.reason],
    ["หมายเหตุ", d.note],
  ];
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(d.doc_no)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: "Sarabun", "Noto Sans Thai", system-ui, sans-serif; color: #0f172a; font-size: 12px; }
  h1 { font-size: 20px; margin: 0; } .muted { color: #64748b; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f2a4a; padding-bottom: 8px; }
  .no { font-family: ui-monospace, monospace; font-size: 16px; font-weight: 700; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  .meta td { border: 0; padding: 2px 6px; } .meta td:first-child { color: #64748b; width: 120px; }
  .sns { font-family: ui-monospace, monospace; font-size: 11px; columns: 3; column-gap: 16px; }
  .sns div { break-inside: avoid; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px; text-align: center; }
  .sign div { border-top: 1px solid #94a3b8; padding-top: 4px; }
  .void { color: #b91c1c; font-weight: 700; font-size: 16px; }
</style></head><body>
<div class="top"><div><h1>${esc(DOC_LABEL[d.doc_type])}</h1><div class="muted">สถานะ: ${esc(DOC_STATUS_LABEL[d.status])}</div>
${d.status === "cancelled" ? `<div class="void">ยกเลิกแล้ว: ${esc(d.cancel_reason)}</div>` : ""}</div>
<div class="no">${esc(d.doc_no)}</div></div>
<table class="meta">${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
<table><thead><tr><th style="width:30px">#</th><th>รหัสสินค้า</th><th>รายละเอียด</th><th style="width:60px;text-align:right">จำนวน</th></tr></thead><tbody>
${[...groups.entries()].map(([sku, g], i) => `<tr><td>${i + 1}</td><td>${esc(sku)}</td><td>${esc(g.description)}</td><td style="text-align:right">${g.sns.length}</td></tr>`).join("")}
<tr><th colspan="3" style="text-align:right">รวม</th><th style="text-align:right">${items.length}</th></tr></tbody></table>
<h3 style="margin-top:16px">Serial Number</h3>
${[...groups.entries()].map(([sku, g]) => `<p><b>${esc(sku)}</b> (${g.sns.length})</p><div class="sns">${g.sns.map((s, i) => `<div>${i + 1}. ${esc(s.sn)}${showCond && s.condition !== "good" ? ` (${CONDITION_LABEL[s.condition]})` : ""}</div>`).join("")}</div>`).join("")}
<div class="sign"><div>ผู้จัดทำ</div><div>${DIR[d.doc_type] === "in" ? "ผู้ส่งของ" : "ผู้รับของ"}</div><div>ผู้อนุมัติ</div></div>
<script>window.onload = () => window.print();</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up");
  w.document.write(html);
  w.document.close();
}
