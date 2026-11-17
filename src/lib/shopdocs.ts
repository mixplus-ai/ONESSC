// PDF (print window) of a web quotation / reservation for the customer: items at the website price, the customer's
// billing details, their sales contact, and the note that this is based on the website and is not an invoice.
import { formatDate, rankLabel, type RankInfo } from "./catalog";
import { esc, heading, openPrintDoc, preparePrintWindow, table, type Panel } from "./printdoc";
import { supabase } from "./supabase";
import { BILLING_TYPE, qrDataUrl, type Billing } from "./training";

export interface ShopDocLine {
  /** product code id: used to add the product's datasheet QR at the bottom */
  variant_id?: string | null;
  sku?: string | null;
  label: string;
  qty: number;
  unit_price: number | null;
  unit?: string | null;
  /** stock status shown on a reservation / cart line (มีสินค้า …) */
  status?: string | null;
}

export interface ShopDoc {
  kind: "quote" | "reservation" | "cart";
  code?: string | null;
  date?: string | null;
  status?: string | null;
  expires_at?: string | null;
  lines: ShopDocLine[];
  customer: { name?: string | null; email?: string | null; phone?: string | null; company?: string | null; taxId?: string | null };
  billing?: Billing | null;
  rank?: RankInfo | null;
  note?: string | null;
  staffNote?: string | null;
  stockAsOf?: string | null;
  sales?: { full_name: string; phone?: string | null; email?: string | null; line_id?: string | null } | null;
}

/** Name in the signature box at the end of the document (owner's wording, 17 Nov 2026). */
const SELLER = "บริษัท สยาม โซล่าร์ เซลล์ จำกัด";

const money = (n: number | null | undefined) => (n == null ? "สอบถามราคา" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** The signed-in customer's sales person (care team). */
export async function mySalesContact(): Promise<ShopDoc["sales"]> {
  const { data } = await supabase.rpc("my_care_team");
  const s = ((data ?? []) as { role: string; full_name: string; phone: string | null; email: string | null; line_id: string | null }[]).find((r) => r.role === "sales");
  return s ?? null;
}

export function shopDocTitle(kind: ShopDoc["kind"]) {
  return kind === "reservation" ? { title: "ใบจองสินค้า", en: "RESERVATION" } : { title: "ใบเสนอราคา", en: "QUOTATION" };
}

/** QR codes of the datasheets of the products on the document (one per product, same file once). */
async function datasheetBlock(lines: ShopDocLine[]): Promise<string> {
  const ids = [...new Set(lines.map((l) => l.variant_id).filter(Boolean))] as string[];
  if (!ids.length) return "";
  const { data } = await supabase.from("product_variants").select("id, sku, products(name, datasheet_url)").in("id", ids);
  const seen = new Map<string, { name: string; skus: string[] }>();
  for (const id of ids) {
    const v = ((data ?? []) as unknown as { id: string; sku: string; products: { name: string; datasheet_url: string | null } | null }[]).find((x) => x.id === id);
    const url = v?.products?.datasheet_url?.trim();
    if (!v || !url) continue;
    const cur = seen.get(url);
    if (cur) cur.skus.push(v.sku);
    else seen.set(url, { name: v.products?.name ?? v.sku, skus: [v.sku] });
  }
  if (!seen.size) return "";
  const cards = await Promise.all(
    [...seen].map(async ([url, p]) => {
      const qr = await qrDataUrl(url, 200, "#0f2a4a").catch(() => "");
      return `<div class="ds"><img src="${qr}" alt=""><div><b>${esc(p.name)}</b><span>${esc(p.skus.join(", "))}</span></div></div>`;
    }),
  );
  return `<div class="dsw"><style>
.dsw { margin-top: 14px; border-top: 1.5px solid #0f2a4a; padding-top: 8px; break-inside: avoid; }
.dsw h4 { margin: 0 0 6px; font-size: 9.5pt; color: #0f2a4a; }
.dsg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ds { display: flex; gap: 6px; align-items: center; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px; break-inside: avoid; }
.ds img { width: 22mm; height: 22mm; }
.ds b { display: block; font-size: 8pt; line-height: 1.25; color: #0f2a4a; }
.ds span { display: block; font-size: 7pt; color: #64748b; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
</style><h4>Datasheet สินค้า · สแกน QR เพื่อเปิดเอกสาร</h4><div class="dsg">${cards.join("")}</div></div>`;
}

/** Opens the print window ("บันทึกเป็น PDF"). Call inside the click; pass a prepared window when data loads first. */
export async function printShopDoc(doc: ShopDoc, prepared?: Window | null) {
  const w = prepared === undefined ? preparePrintWindow() : prepared;
  const t = shopDocTitle(doc.kind);
  const priced = doc.lines.filter((l) => l.unit_price != null);
  const total = priced.reduce((s, l) => s + Number(l.unit_price) * Number(l.qty), 0);
  const anyAsk = priced.length < doc.lines.length;
  const showStatus = doc.lines.some((l) => l.status);

  const cols: [string, string?][] = [["#", "c"], ["รหัสสินค้า", "m"], ["รายการ"], ...(showStatus ? [["สถานะสินค้า"] as [string]] : []), ["จำนวน", "r"], ["ราคา/หน่วย", "r"], ["จำนวนเงิน", "r"]];
  const rows = doc.lines.map((l, i) => [
    i + 1, l.sku ?? "", l.label, ...(showStatus ? [l.status ?? ""] : []),
    `${Number(l.qty).toLocaleString("th-TH")}${l.unit ? ` ${l.unit}` : ""}`, money(l.unit_price), l.unit_price == null ? "-" : money(Number(l.unit_price) * Number(l.qty)),
  ]);
  const foot = [...Array(cols.length - 2).fill(""), "รวม (ยังไม่รวม VAT)", money(total)];
  foot[0] = "";

  const b = doc.billing;
  const panels: Panel[] = [
    {
      heading: "ลูกค้า / Customer",
      rows: [
        ["ออกเอกสารในนาม", b?.name || doc.customer.company || doc.customer.name],
        ["ประเภท", b?.type ? BILLING_TYPE[b.type] ?? b.type : null],
        ["เลขผู้เสียภาษี", b?.tax_id || doc.customer.taxId],
        ["สาขา", b?.branch],
        ["ที่อยู่", b?.address],
        ["ผู้ติดต่อ", doc.customer.name],
        ["โทร / อีเมล", [doc.customer.phone || b?.phone, doc.customer.email || b?.email].filter(Boolean).join(" · ")],
        ["Rank ราคา", doc.rank ? rankLabel(doc.rank) : null],
      ],
    },
    {
      heading: "พนักงานขาย / Sales",
      rows: doc.sales
        ? [["ชื่อ", doc.sales.full_name], ["โทร", doc.sales.phone], ["LINE", doc.sales.line_id], ["อีเมล", doc.sales.email]]
        : [["ติดต่อ", "ทีมขาย (ดูช่องทางติดต่อบนเว็บไซต์)"]],
    },
  ];

  const refNote =
    doc.kind === "reservation"
      ? "ใบจองนี้อ้างอิงราคาและสถานะสินค้าตามเว็บไซต์ ณ วันที่จอง การจองจะสมบูรณ์เมื่อพนักงานขายยืนยัน เอกสารนี้ไม่ใช่ใบแจ้งหนี้ สามารถติดต่อเซลล์เพื่อขอใบแจ้งหนี้"
      : "ใบเสนอราคานี้อ้างอิงราคาสินค้าตามเว็บไซต์ ณ วันที่ออกเอกสาร ราคายังไม่รวม VAT และค่าขนส่ง เอกสารนี้ไม่ใช่ใบแจ้งหนี้ สามารถติดต่อเซลล์เพื่อขอใบแจ้งหนี้";
  const body = [
    heading("รายการสินค้า"),
    table(cols, rows, { foot, widths: ["5%", "16%", undefined, ...(showStatus ? ["14%"] : []), "10%", "13%", "14%"] }),
    anyAsk ? `<div class="note muted">รายการที่ขึ้น “สอบถามราคา” พนักงานขายจะแจ้งราคาให้</div>` : "",
    doc.note ? `<div class="note"><b>หมายเหตุลูกค้า:</b> ${esc(doc.note)}</div>` : "",
    doc.staffNote ? `<div class="note"><b>ข้อความจากพนักงานขาย:</b> ${esc(doc.staffNote)}</div>` : "",
    `<div class="note"><b>หมายเหตุ:</b> ${esc(refNote)}${doc.stockAsOf ? ` · สถานะสินค้าอ้างอิงตามสต๊อก ณ วันที่ ${esc(formatDate(doc.stockAsOf))} กรุณาจองหรือติดต่อพนักงานขาย` : ""}</div>`,
    await datasheetBlock(doc.lines).catch(() => ""),
    `<div style="display:flex;justify-content:flex-end;margin-top:26px;break-inside:avoid"><div style="text-align:center;min-width:250px;font-size:10pt">
      <div style="font-weight:700;color:#0f2a4a">${doc.kind === "reservation" ? "ผู้รับจอง" : "ผู้เสนอราคา"}</div>
      <div style="margin-top:4px">${esc(SELLER)}</div>
      <div style="border-bottom:1px dotted #475569;height:34px;margin:0 10px"></div>
      <div style="margin-top:6px;color:#475569">วันที่ ${esc(formatDate(doc.date ?? new Date().toISOString()))}</div>
    </div></div>`,
  ].join("");

  await openPrintDoc(
    {
      title: t.title,
      titleEn: t.en,
      docNo: doc.code ?? (doc.kind === "cart" ? "ร่างจากตะกร้า" : null),
      date: formatDate(doc.date ?? new Date().toISOString()),
      extra: [["สถานะ", doc.status], ["กันสินค้าถึง", doc.expires_at ? formatDate(doc.expires_at) : null]],
      watermark: doc.status === "ยกเลิก" ? "ยกเลิก" : null,
      panels,
      body,
      fileName: [t.title, doc.code].filter(Boolean).join(" "),
    },
    w,
  );
}
