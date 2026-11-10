// Parses the company stock workbook ("สต๊อครวม") into rows for public.apply_stock_sync.
// Shared by the stock-sync edge function (Deno) and the back-office upload (browser),
// so it takes plain 2-D arrays and has no dependencies.
//
// Expected layout (sheet "รวม"):
//   วันที่ 30/10/2026
//   No | สโตร์ | รหัสสินค้า | กลุ่ม | รายละเอียด | สต๊อค | หักจอง | คงเหลือ | ค้างรับ
// The header row is found by looking for "รหัสสินค้า", so extra title rows are fine.
// Sheet "ค้างส่ง" (optional): No | รหัสสินค้า | เลขใบสำคัญ | ใบสำคัญ | วันที่ | เลขที่ pi | ลูกค้า | วันนัดส่งของ | เซลล์ | จำนวน

export type Cell = string | number | boolean | Date | null | undefined;
export type Grid = Cell[][];

export interface StockRow {
  sku: string;
  store: string | null;
  group: string | null;
  description: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  incoming: number;
}

export interface BackorderRow {
  sku: string;
  doc_no: string | null;
  doc_type: string | null;
  doc_date: string | null; // yyyy-mm-dd
  pi_no: string | null;
  customer: string | null;
  delivery_note: string | null;
  sales: string | null;
  qty: number;
}

export interface ParsedStock {
  sheet: string;
  sheetDate: string | null;
  rows: StockRow[];
  backorders: BackorderRow[] | null;
  warnings: string[];
}

const norm = (v: Cell) => String(v ?? "").replace(/\s+/g, " ").trim();
const key = (v: Cell) => norm(v).toLowerCase().replace(/[็๊]/g, "๊").replace(/\s/g, "");

export function toNumber(v: Cell): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean" || v == null || v instanceof Date) return 0;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "-") return 0;
  const n = Number(s.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : 0;
}

function text(v: Cell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = norm(v);
  return s ? s : null;
}

/** Excel serial, Date, "dd/mm/yyyy" (ค.ศ. or พ.ศ.), or "yyyy-mm-dd" → "yyyy-mm-dd" */
export function toIsoDate(v: Cell): string | null {
  if (v == null || v === "") return null;
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && v > 20000 && v < 80000) d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  else {
    const s = norm(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  let y = d.getUTCFullYear();
  if (y > 2400) y -= 543; // พ.ศ.
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function findSheet(sheets: Record<string, Grid>, wanted: string, mustHave: string[]): string | null {
  const names = Object.keys(sheets);
  const exact = names.find((n) => key(n) === key(wanted));
  if (exact) return exact;
  // fall back to the first sheet whose header row has all required columns
  for (const n of names) if (findHeader(sheets[n], mustHave) >= 0) return n;
  return null;
}

function findHeader(grid: Grid, mustHave: string[]): number {
  const need = mustHave.map(key);
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const cells = (grid[i] ?? []).map(key);
    if (need.every((k) => cells.includes(k))) return i;
  }
  return -1;
}

function colIndex(header: Cell[], ...names: string[]): number {
  const cells = header.map(key);
  for (const n of names) {
    const i = cells.indexOf(key(n));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseStockWorkbook(
  sheets: Record<string, Grid>,
  opts: { sheetName?: string; backorderSheet?: string } = {},
): ParsedStock {
  const warnings: string[] = [];
  const sheetName = findSheet(sheets, opts.sheetName || "รวม", ["รหัสสินค้า"]);
  if (!sheetName) throw new Error(`ไม่พบแท็บ "${opts.sheetName || "รวม"}" หรือแท็บที่มีหัวคอลัมน์ "รหัสสินค้า"`);
  const grid = sheets[sheetName];
  const h = findHeader(grid, ["รหัสสินค้า"]);
  if (h < 0) throw new Error(`แท็บ "${sheetName}" ไม่มีหัวคอลัมน์ "รหัสสินค้า"`);
  const header = grid[h];

  const c = {
    sku: colIndex(header, "รหัสสินค้า"),
    store: colIndex(header, "สโตร์"),
    group: colIndex(header, "กลุ่ม"),
    description: colIndex(header, "รายละเอียด"),
    on_hand: colIndex(header, "สต๊อค", "สต็อค", "สต๊อก", "สต็อก", "ยอดคงเหลือ"),
    reserved: colIndex(header, "หักจอง", "จอง", "ยอดสั่งขาย"),
    available: colIndex(header, "คงเหลือ", "ยอดคงเหลือ เพื่อขาย/เบิก", "ยอดคงเหลือเพื่อขาย/เบิก"),
    incoming: colIndex(header, "ค้างรับ", "ยอดสั่งซื้อ"),
  };
  if (c.on_hand < 0 && c.available < 0) throw new Error(`แท็บ "${sheetName}" ไม่มีคอลัมน์จำนวน (สต๊อค / คงเหลือ)`);
  if (c.available < 0) warnings.push('ไม่พบคอลัมน์ "คงเหลือ" ใช้ สต๊อค − หักจอง แทน');

  let sheetDate: string | null = null;
  for (let i = 0; i < h && !sheetDate; i++) {
    for (const cell of grid[i] ?? []) {
      const s = norm(cell);
      if (/วันที่/.test(s)) {
        sheetDate = s;
        break;
      }
    }
  }

  const rows: StockRow[] = [];
  const seen = new Set<string>();
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const sku = norm(r[c.sku]);
    if (!sku) continue;
    if (seen.has(sku)) {
      warnings.push(`รหัส ${sku} ซ้ำ ใช้แถวแรก`);
      continue;
    }
    seen.add(sku);
    const on_hand = c.on_hand >= 0 ? toNumber(r[c.on_hand]) : toNumber(r[c.available]);
    const reserved = c.reserved >= 0 ? toNumber(r[c.reserved]) : 0;
    rows.push({
      sku,
      store: c.store >= 0 ? text(r[c.store]) : null,
      group: c.group >= 0 ? text(r[c.group]) : null,
      description: c.description >= 0 ? text(r[c.description]) : null,
      on_hand,
      reserved,
      available: c.available >= 0 ? toNumber(r[c.available]) : on_hand - reserved,
      incoming: c.incoming >= 0 ? toNumber(r[c.incoming]) : 0,
    });
  }
  if (!rows.length) throw new Error(`แท็บ "${sheetName}" ไม่มีแถวสินค้า`);

  // ค้างส่ง (optional)
  let backorders: BackorderRow[] | null = null;
  const boName = Object.keys(sheets).find((n) => key(n) === key(opts.backorderSheet || "ค้างส่ง"));
  if (boName) {
    const g = sheets[boName];
    const bh = findHeader(g, ["รหัสสินค้า", "จำนวน"]);
    if (bh < 0) warnings.push(`แท็บ "${boName}" ไม่มีหัวคอลัมน์ รหัสสินค้า/จำนวน จึงข้ามไป`);
    else {
      const H = g[bh];
      const b = {
        sku: colIndex(H, "รหัสสินค้า"),
        doc_no: colIndex(H, "เลขใบสำคัญ"),
        doc_type: colIndex(H, "ใบสำคัญ"),
        doc_date: colIndex(H, "วันที่"),
        pi_no: colIndex(H, "เลขที่ pi", "pi"),
        customer: colIndex(H, "ลูกค้า"),
        delivery_note: colIndex(H, "วันนัดส่งของ", "วันนัดส่ง"),
        sales: colIndex(H, "เซลล์", "พนักงานขาย"),
        qty: colIndex(H, "จำนวน"),
      };
      const at = (r: Cell[], i: number) => (i >= 0 ? r[i] : null);
      backorders = [];
      for (let i = bh + 1; i < g.length; i++) {
        const r = g[i] ?? [];
        const sku = norm(at(r, b.sku));
        if (!sku) continue;
        backorders.push({
          sku,
          doc_no: text(at(r, b.doc_no)),
          doc_type: text(at(r, b.doc_type)),
          doc_date: toIsoDate(at(r, b.doc_date)),
          pi_no: text(at(r, b.pi_no)),
          customer: text(at(r, b.customer)),
          delivery_note: text(at(r, b.delivery_note)),
          sales: text(at(r, b.sales)),
          qty: toNumber(at(r, b.qty)),
        });
      }
    }
  }

  return { sheet: sheetName, sheetDate, rows, backorders, warnings };
}

/** Minimal RFC-4180 CSV reader (quotes, escaped quotes, CRLF). */
export function parseCsv(input: string): Grid {
  const out: Grid = [];
  let row: Cell[] = [];
  let field = "";
  let q = false;
  const s = input.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

/** Turns a Google Sheets / Drive share link into the file id. */
export function googleFileId(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}
