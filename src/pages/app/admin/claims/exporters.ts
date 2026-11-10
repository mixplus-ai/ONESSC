// "ใบสรุปรายละเอียดงานเคลม": print / PDF (browser print), PNG and Excel, like ssccare.
import { STEPS, fmtDmy, productTypeLabel, stepProgress, STEP_STATE_LABEL, type Claim, type ClaimUnit, type UnitField } from "../../../../lib/claims";
import type { BrandOpt } from "./shared";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function summaryHtml(c: Claim, units: ClaimUnit[], brands: BrandOpt[]): string {
  const p = stepProgress(c, units);
  const head: [string, string][] = [
    ["เลขเคลม", c.claim_no], ["บริษัท", c.company_name ?? "-"], ["แบรนด์ / ประเภท", [brands.find((b) => b.id === c.brand_id)?.name, c.product_type && productTypeLabel(c.product_type)].filter(Boolean).join(" · ") || "-"],
    ["เลขใบสำคัญ", c.voucher_no ?? "-"], ["วันที่ใบสำคัญ", fmtDmy(c.voucher_date) || "-"], ["Case ID", c.case_id ?? "-"], ["SiteID", c.site_id ?? "-"],
    ["วันนัดรับ", c.pickup_on ?? "-"], ["รหัสเซลล์", c.sales_code ?? "-"], ["จำนวน", String(c.qty)],
  ];
  const cols = STEPS.slice(1).flatMap((s) => s.fields);
  return `<div style="font-family:Tahoma,'Noto Sans Thai',sans-serif;color:#0f172a;padding:24px;background:#fff;width:1100px">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #16235a;padding-bottom:8px">
    <div><div style="font-size:20px;font-weight:bold">ใบสรุปรายละเอียดงานเคลม</div><div style="font-size:12px;color:#64748b">SSC · Service &amp; Warranty Claim</div></div>
    <div style="font-size:24px;font-weight:bold;font-family:monospace">${esc(c.claim_no)}</div>
  </div>
  <table style="width:100%;font-size:12px;margin-top:10px;border-collapse:collapse">
    ${Array.from({ length: Math.ceil(head.length / 2) }, (_, i) => head.slice(i * 2, i * 2 + 2))
      .map((pair) => `<tr>${pair.map(([k, v]) => `<td style="padding:3px 6px;color:#64748b;width:14%">${esc(k)}</td><td style="padding:3px 6px;width:36%">${esc(v)}</td>`).join("")}</tr>`).join("")}
  </table>
  <div style="display:flex;gap:6px;margin-top:10px;font-size:11px">
    ${STEPS.map((s, i) => `<div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:6px"><b>ขั้น ${s.n}</b> ${esc(s.short)}<br><span style="color:#64748b">${esc(s.dir)}</span><br>${s.n === 5 ? (p[i].count ? `${p[i].count} รายการ` : "ไม่มีรายการ") : `${p[i].count}/${p[i].qty} · ${STEP_STATE_LABEL[p[i].state]}`}</div>`).join("")}
  </div>
  <table style="width:100%;font-size:10px;margin-top:10px;border-collapse:collapse">
    <tr style="background:#f1f5f9"><th style="border:1px solid #e2e8f0;padding:3px">#</th><th style="border:1px solid #e2e8f0;padding:3px">รหัสสินค้า</th>
      ${cols.map((f) => `<th style="border:1px solid #e2e8f0;padding:3px">${esc(f.col)} ${esc(f.label)}</th>`).join("")}</tr>
    ${units.map((u) => `<tr><td style="border:1px solid #e2e8f0;padding:3px">${u.seq}</td><td style="border:1px solid #e2e8f0;padding:3px">${esc(u.pcode)}</td>
      ${cols.map((f) => { const v = u[f.key as UnitField] as string | null; return `<td style="border:1px solid #e2e8f0;padding:3px${f.type === "sn" ? ";font-family:monospace" : ""}">${esc(f.type === "date" ? fmtDmy(v) : v)}</td>`; }).join("")}</tr>`).join("")}
  </table>
  <div style="margin-top:10px;font-size:10px;color:#94a3b8">พิมพ์เมื่อ ${esc(new Date().toLocaleString("th-TH"))}</div>
</div>`;
}

export function printClaim(c: Claim, units: ClaimUnit[], brands: BrandOpt[]) {
  const w = window.open("", "_blank", "width=1200,height=800");
  if (!w) return alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ใบเคลม ${esc(c.claim_no)}</title>
    <style>@page{size:A4 landscape;margin:10mm}body{margin:0}</style></head><body>${summaryHtml(c, units, brands)}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export async function exportClaimImage(c: Claim, units: ClaimUnit[], brands: BrandOpt[]) {
  const { toPng } = await import("html-to-image");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0";
  host.innerHTML = summaryHtml(c, units, brands);
  document.body.appendChild(host);
  try {
    const url = await toPng(host.firstElementChild as HTMLElement, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `claim-${c.claim_no}.png`;
    a.click();
  } finally {
    host.remove();
  }
}

export async function exportClaimXlsx(c: Claim, units: ClaimUnit[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = ["#", ...STEPS.flatMap((s) => s.fields.map((f) => `${f.col} ${f.label}`))];
  const rows = units.map((u) => [
    u.seq, u.pcode ?? "", c.voucher_no ?? "", fmtDmy(c.voucher_date), c.case_id ?? "", c.site_id ?? "", c.claim_no, c.company_name ?? "",
    c.pickup_on ?? "", c.sales_code ?? "", c.qty,
    ...STEPS.slice(1).flatMap((s) => s.fields.map((f) => { const v = u[f.key as UnitField] as string | null; return f.type === "date" ? fmtDmy(v) : v ?? ""; })),
  ]);
  const data = [
    [{ value: `ใบสรุปรายละเอียดงานเคลม ${c.claim_no}`, fontWeight: "bold" as const }],
    [],
    header.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((v) => ({ value: v }))),
  ];
  await writeXlsxFile(data).toFile(`claim-${c.claim_no}.xlsx`);
}

export async function exportSheetXlsx(name: string, header: string[], rows: (string | number)[][]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile([header.map((h) => ({ value: h, fontWeight: "bold" as const })), ...rows.map((r) => r.map((v) => ({ value: v })))]).toFile(name);
}
