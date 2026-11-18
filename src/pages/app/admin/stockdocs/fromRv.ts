import { supabase } from "../../../../lib/supabase";
import type { StockDoc } from "../../../../lib/stockdocs";

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** The reservation warehouse: a warehouse whose name or code says "จอง" / reserve. */
export const isReserveWarehouse = (w: { code: string; name: string }) => /จอง|RSV|RESERV/i.test(`${w.code} ${w.name}`);

/**
 * Sold after a reservation (RV): make the delivery note (SO) draft for it, with every SN that is still
 * reserved under that RV, cut from the warehouse the SNs sit in (the reservation warehouse).
 * Returns the SO id; an SO already made from this RV (not cancelled) is reused.
 */
export async function soFromRv(rvId: string): Promise<string> {
  const ex = await supabase.from("stock_docs").select("id").eq("doc_type", "SO").eq("return_of", rvId).neq("status", "cancelled").limit(1);
  if (ex.error) throw ex.error;
  if (ex.data?.[0]) return ex.data[0].id as string;

  const [d, s] = await Promise.all([
    supabase.from("stock_docs").select("*").eq("id", rvId).single(),
    supabase.from("serials").select("sn, sku, description, warehouse_id").eq("last_doc_id", rvId).eq("status", "reserved"),
  ]);
  if (d.error) throw d.error;
  if (s.error) throw s.error;
  const rv = d.data as StockDoc;
  const sns = (s.data ?? []) as { sn: string; sku: string; description: string | null; warehouse_id: string | null }[];
  if (!sns.length) throw new Error(`ไม่มี SN ที่ยังจองอยู่ในใบจอง ${rv.doc_no}`);
  // the warehouse most of the reserved SNs are in now (normally the reservation warehouse)
  const count = new Map<string, number>();
  sns.forEach((x) => x.warehouse_id && count.set(x.warehouse_id, (count.get(x.warehouse_id) ?? 0) + 1));
  const wh = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? rv.to_warehouse_id ?? rv.warehouse_id;

  const so = await supabase.rpc("save_stock_doc", {
    p_id: null,
    p_doc: {
      doc_type: "SO", doc_date: today(), warehouse_id: wh, partner_name: rv.partner_name, partner_tax_id: rv.partner_tax_id,
      company_id: rv.company_id, ref_no: rv.ref_no, site_name: rv.site_name, return_of: rv.id, note: `จากใบจอง ${rv.doc_no}`,
    },
    p_items: sns.filter((x) => x.warehouse_id === wh).map((x) => ({ sku: x.sku, description: x.description, sn: x.sn, condition: "good" })),
  });
  if (so.error) throw so.error;
  const id = (so.data as StockDoc).id;
  if (rv.reservation_id) {
    const r = await supabase.rpc("save_stock_doc_reservation", { p_id: id, p_reservation: rv.reservation_id });
    if (r.error) throw r.error;
  }
  return id;
}

/** A posted RV for a web reservation (RS-…), newest first, if any. */
export async function postedRvFor(reservationId: string): Promise<string | null> {
  const { data } = await supabase.from("stock_docs").select("id").eq("doc_type", "RV").eq("reservation_id", reservationId).eq("status", "posted")
    .order("posted_at", { ascending: false }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}
