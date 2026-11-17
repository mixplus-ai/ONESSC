// PDF (print window) of a web quotation / reservation for the customer: items at the website price, the customer's
// billing details, their sales contact, and the note that this is based on the website and is not an invoice.
import { formatDate, rankLabel, type RankInfo } from "./catalog";
import { esc, heading, openPrintDoc, preparePrintWindow, table, type Panel } from "./printdoc";
import { supabase } from "./supabase";
import { BILLING_TYPE, type Billing } from "./training";

export interface ShopDocLine {
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
