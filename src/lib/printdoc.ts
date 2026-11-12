// One look for every printed / PDF document in the app (stock documents, claim summary, reports, stock count):
// company letterhead, a titled document box, bordered info panels, navy table headers, signature blocks,
// "page x / y" footer. Opens a print window; "Save as PDF" in that window gives the PDF.
import { loadSettings } from "./content";
import type { CompanySettings } from "./types";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Panel { heading: string; rows: [string, string | null | undefined][] }
export interface PrintDoc {
  title: string;                 // ใบรับสินค้า
  titleEn?: string;              // GOODS RECEIPT
  docNo?: string | null;
  date?: string | null;          // already formatted
  extra?: [string, string | null | undefined][];   // more lines in the title box (e.g. status, ref no)
  watermark?: string | null;     // ร่าง / ยกเลิก
  panels?: Panel[];              // info boxes under the letterhead (1–3)
  body: string;                  // HTML built with table() / heading() / note()
  signatures?: string[];         // roles under each signature line
  landscape?: boolean;
  fileName?: string;             // window title = default PDF file name
}

/** Letterhead fields: legal name, address and tax ID for documents, falling back to the web contact info. */
export function letterhead(c: CompanySettings) {
  const lines = (c.doc_address || c.address || c.locations?.[0]?.address || "").split("\n").map((s) => s.trim()).filter(Boolean);
  // the stored address often starts with the company's legal name: use it as the name line
  const first = lines[0] ?? "";
  const nameFromAddress = /^(บริษัท|ห้างหุ้นส่วน|หจก)/.test(first) ? first.replace(/\s*\(\s*/g, " (").replace(/\s*\)/g, ")") : "";
  const name = c.legal_name_th || nameFromAddress || c.name_th;
  const address = (nameFromAddress && !c.doc_address ? lines.slice(1) : lines).join(" ");
  return {
    name, nameEn: c.legal_name_en || (c.name_en !== c.name_th ? c.name_en : ""), address,
    contact: [c.phone && `โทร ${c.phone}`, c.email && `อีเมล ${c.email}`, c.website_url].filter(Boolean).join(" · "),
    taxId: c.tax_id || "", logo: c.logo_url || "",
  };
}

const SUN = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#f5a524" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="#fde68a"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>`;

const CSS = (landscape: boolean, footerLeft: string) => `
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm 12mm 16mm;
  @bottom-left { content: "${footerLeft.replace(/"/g, "'")}"; font: 8pt Sarabun, sans-serif; color: #64748b; }
  @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font: 8pt Sarabun, sans-serif; color: #64748b; } }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: "Sarabun", "Noto Sans Thai", Tahoma, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.45;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.lh { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.co { display: flex; gap: 12px; align-items: flex-start; max-width: 58%; }
.co img { max-height: 56px; max-width: 120px; object-fit: contain; }
.co .n { font-size: 13pt; font-weight: 700; color: #0f2a4a; line-height: 1.25; }
.co .ne { font-size: 8.5pt; font-weight: 600; letter-spacing: .06em; color: #475569; text-transform: uppercase; }
.co .a { font-size: 8.5pt; color: #475569; margin-top: 2px; }
.tb { min-width: 270px; max-width: 330px; border: 1.5px solid #0f2a4a; border-radius: 6px; overflow: hidden; }
.tb .t { background: #0f2a4a; color: #fff; padding: 6px 12px; text-align: center; }
.tb .t b { display: block; font-size: 14pt; line-height: 1.2; }
.tb .t span { font-size: 8pt; letter-spacing: .14em; color: #cbd5e1; }
.tb table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
.tb td { padding: 3px 12px; border-top: 1px solid #e2e8f0; }
.tb td:first-child { color: #64748b; white-space: nowrap; width: 1%; }
.tb td.no { font-weight: 700; font-family: ui-monospace, Menlo, monospace; font-size: 10.5pt; }
.rule { height: 3px; background: linear-gradient(90deg, #0f2a4a 0 70%, #f5a524 70% 100%); margin: 10px 0 12px; border-radius: 2px; }
.panels { display: grid; gap: 10px; margin-bottom: 12px; }
.panel { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px 8px; break-inside: avoid; }
.panel h4 { margin: 0 0 4px; font-size: 8.5pt; letter-spacing: .04em; color: #0f2a4a; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
.panel table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
.panel td { padding: 1.5px 0; vertical-align: top; }
.panel td:first-child { color: #64748b; width: 36%; padding-right: 8px; }
h3.sec { font-size: 10.5pt; color: #0f2a4a; margin: 14px 0 6px; padding-left: 8px; border-left: 3px solid #f5a524; break-after: avoid; }
table.grid { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table.grid thead { display: table-header-group; }
table.grid th { background: #0f2a4a; color: #fff; font-weight: 600; padding: 5px 7px; text-align: left; border: 1px solid #0f2a4a; }
table.grid td { padding: 4px 7px; border: 1px solid #cbd5e1; vertical-align: top; }
table.grid tbody tr:nth-child(even) td { background: #f8fafc; }
table.grid tr { break-inside: avoid; }
table.grid .r { text-align: right; } table.grid .c { text-align: center; }
table.grid .m { font-family: ui-monospace, Menlo, monospace; font-size: 9pt; }
table.grid tfoot td { background: #eef2f7; font-weight: 700; border-top: 1.5px solid #0f2a4a; }
table.grid.sm { font-size: 8.5pt; } table.grid.sm th, table.grid.sm td { padding: 3px 5px; }
.note { border: 1px dashed #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 9.5pt; margin-top: 10px; }
.note b { color: #0f2a4a; }
.muted { color: #64748b; }
.sig { display: grid; gap: 18px; justify-content: space-between; margin-top: 34px; break-inside: avoid; }
.sig > div { text-align: center; font-size: 9.5pt; }
.sig .ln { border-bottom: 1px dotted #475569; height: 34px; margin: 0 6px; }
.sig .nm { margin-top: 4px; color: #475569; }
.sig .role { font-weight: 700; color: #0f2a4a; margin-top: 2px; }
.sig .dt { margin-top: 6px; color: #475569; }
.wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
.wm span { font-size: 96pt; font-weight: 700; color: rgba(185, 28, 28, .09); transform: rotate(-28deg); letter-spacing: .1em; }
.printed { margin-top: 14px; font-size: 7.5pt; color: #94a3b8; text-align: right; }
@media screen { body { background: #e2e8f0; } .page { background: #fff; width: ${landscape ? "297mm" : "210mm"}; min-height: ${landscape ? "210mm" : "297mm"};
  margin: 12px auto; padding: 12mm; box-shadow: 0 2px 12px rgba(15,23,42,.18); position: relative; } }
`;

/** Table with a navy header. cols: [label, class] where class is "", "r" (right), "c" (centre), "m" (mono) or combos. */
export function table(cols: [string, string?][], rows: (string | number | null | undefined)[][], opts: { foot?: (string | number)[]; small?: boolean; widths?: (string | undefined)[]; raw?: boolean; fixed?: boolean } = {}) {
  const cell = (v: unknown, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${opts.raw ? String(v ?? "") : esc(v)}</td>`;
  return `<table class="grid${opts.small ? " sm" : ""}"${opts.fixed ? ' style="table-layout:fixed"' : ""}><thead><tr>${cols.map(([l, c], i) => `<th${c ? ` class="${c}"` : ""}${opts.widths?.[i] ? ` style="width:${opts.widths[i]}"` : ""}>${esc(l)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((v, i) => cell(v, cols[i]?.[1])).join("")}</tr>`).join("")}</tbody>
${opts.foot ? `<tfoot><tr>${opts.foot.map((v, i) => cell(v, cols[i]?.[1])).join("")}</tr></tfoot>` : ""}</table>`;
}
export const heading = (s: string) => `<h3 class="sec">${esc(s)}</h3>`;
export const note = (label: string, text: string | null | undefined) => (text ? `<div class="note"><b>${esc(label)}:</b> ${esc(text)}</div>` : "");

/** A blank print window opened inside the click (pop-up blockers allow that), to fill after data has loaded. */
export function preparePrintWindow(): Window | null {
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up สำหรับเว็บนี้"); return null; }
  w.document.write(`<p style="font-family:sans-serif;padding:24px;color:#475569">กำลังเตรียมเอกสาร…</p>`);
  return w;
}

/** Open (or fill a prepared) print window with the document; its print dialog offers "Save as PDF". */
export async function openPrintDoc(doc: PrintDoc, prepared?: Window | null) {
  const w = prepared === undefined ? preparePrintWindow() : prepared;
  if (!w || w.closed) return;
  const html = await printHtml(doc);
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

/** The full HTML page of a document (also used to render sample PDFs). */
export async function printHtml(doc: PrintDoc, settings?: CompanySettings): Promise<string> {
  const co = letterhead(settings ?? (await loadSettings()).company);
  const panels = doc.panels?.filter((p) => p.rows.some(([, v]) => v)) ?? [];
  const sigs = doc.signatures ?? [];
  const titleRows: [string, string | null | undefined][] = [["เลขที่ / No.", doc.docNo], ["วันที่ / Date", doc.date], ...(doc.extra ?? [])];
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(doc.fileName ?? [doc.title, doc.docNo].filter(Boolean).join(" "))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS(!!doc.landscape, [co.name, doc.docNo].filter(Boolean).join(" · "))}</style></head><body><div class="page">
${doc.watermark ? `<div class="wm"><span>${esc(doc.watermark)}</span></div>` : ""}
<div class="lh">
  <div class="co">${co.logo ? `<img src="${esc(co.logo)}" alt="">` : SUN}<div>
    <div class="n">${esc(co.name)}</div>${co.nameEn ? `<div class="ne">${esc(co.nameEn)}</div>` : ""}
    ${co.address ? `<div class="a">${esc(co.address)}</div>` : ""}
    ${co.contact ? `<div class="a">${esc(co.contact)}</div>` : ""}
    ${co.taxId ? `<div class="a">เลขประจำตัวผู้เสียภาษี ${esc(co.taxId)}</div>` : ""}
  </div></div>
  <div class="tb"><div class="t"><b>${esc(doc.title)}</b>${doc.titleEn ? `<span>${esc(doc.titleEn)}</span>` : ""}</div>
    <table>${titleRows.filter(([, v]) => v).map(([k, v], i) => `<tr><td>${esc(k)}</td><td${i === 0 ? ' class="no"' : ""}>${esc(v)}</td></tr>`).join("")}</table></div>
</div>
<div class="rule"></div>
${panels.length ? `<div class="panels" style="grid-template-columns:repeat(${panels.length},1fr)">${panels.map((p) => `<div class="panel"><h4>${esc(p.heading)}</h4><table>${p.rows.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>`).join("")}</div>` : ""}
${doc.body}
${sigs.length ? `<div class="sig" style="grid-template-columns:repeat(${sigs.length},minmax(0,230px))">${sigs.map((r) => `<div><div class="ln"></div><div class="nm">( ....................................... )</div><div class="role">${esc(r)}</div><div class="dt">วันที่ ........../........../..........</div></div>`).join("")}</div>` : ""}
<div class="printed">พิมพ์จากระบบ One App เมื่อ ${esc(new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }))}</div>
</div>
<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 250); });</script>
</body></html>`;
}
