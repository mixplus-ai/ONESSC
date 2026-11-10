// stock-sync: downloads the stock workbook from the Google Sheet / Drive link saved in
// public.stock_config and replaces the stock mirror (public.apply_stock_sync).
//
// Called two ways:
//   1. Admin presses "ซิงก์ตอนนี้" in the back office → Authorization: Bearer <user JWT>
//   2. pg_cron (see supabase/cron/stock_sync_schedule.sql) → header x-cron-secret: <CRON_SECRET>
//
// The sheet must be shared as "Anyone with the link can view".
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { googleFileId, parseStockWorkbook, type Grid } from "../_shared/stock_parser.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function download(url: string): Promise<{ bytes: Uint8Array; name: string }> {
  const id = googleFileId(url);
  const candidates = id
    ? [
        // native Google Sheet
        `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
        // .xlsx file stored in Drive
        `https://drive.google.com/uc?export=download&id=${id}`,
      ]
    : [url];
  let lastErr = "";
  for (const u of candidates) {
    const res = await fetch(u, { redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && !type.includes("text/html")) {
      return { bytes: new Uint8Array(await res.arrayBuffer()), name: id ?? u };
    }
    lastErr = `${res.status} ${type}`;
  }
  throw new Error(`ดาวน์โหลดไฟล์สต๊อกไม่ได้ (${lastErr}) ตรวจว่าแชร์ลิงก์เป็น "ทุกคนที่มีลิงก์ดูได้"`);
}

function workbookToGrids(bytes: Uint8Array): Record<string, Grid> {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const out: Record<string, Grid> = {};
  for (const name of wb.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as Grid;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // who is calling?
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  let db = service;
  if (!isCron) {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "ต้องเข้าสู่ระบบ" }, 401);
    db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: isAdmin } = await db.rpc("is_admin");
    if (!isAdmin) return json({ error: "เฉพาะ Admin เท่านั้น" }, 403);
  }
  const source = isCron ? "cron" : "url";

  const { data: cfg, error: cfgErr } = await service.from("stock_config").select("*").eq("id", 1).single();
  if (cfgErr || !cfg?.source_url) return json({ error: "ยังไม่ได้ตั้งลิงก์ Google Sheet ของสต๊อก" }, 400);

  try {
    const file = await download(cfg.source_url);
    const parsed = parseStockWorkbook(workbookToGrids(file.bytes), {
      sheetName: cfg.sheet_name,
      backorderSheet: cfg.backorder_sheet,
    });
    const { data, error } = await db.rpc("apply_stock_sync", {
      p_source: source,
      p_file_name: file.name,
      p_sheet_date: parsed.sheetDate,
      p_rows: parsed.rows,
      p_backorders: parsed.backorders,
    });
    if (error) throw new Error(error.message);
    return json({ sync: data, sheet: parsed.sheet, warnings: parsed.warnings.slice(0, 20) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.rpc("log_stock_sync_error", { p_source: source, p_file_name: cfg.source_url, p_error: msg });
    return json({ error: msg }, 500);
  }
});
