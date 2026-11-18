import { supabase } from "../../../../lib/supabase";
import type { DocItem, StockDoc } from "../../../../lib/stockdocs";

/** A document a stock document can be filled from: quotation, web reservation, or a posted RV. */
export type SourceKind = "quote" | "reservation" | "rv";
export const SOURCE_LABEL: Record<SourceKind, string> = { quote: "ใบเสนอราคา", reservation: "ใบจองจากเว็บ", rv: "ใบจองในคลัง (RV)" };
export interface PlanLine { sku: string; label: string; qty: number }
export interface SourcePick {
  kind: SourceKind; id: string; code: string;
  partner_name: string | null; partner_tax_id: string | null; company_id: string | null;
  lines: PlanLine[];
  sns?: DocItem[]; warehouse_id?: string | null;   // rv: the SNs still reserved, and where they are
}
export interface SourceOption { id: string; label: string }

type Party = { companies: { name: string; tax_id: string } | null; profiles: { full_name: string | null; email: string } | null };
const partyName = (r: Party & { contact_name?: string | null }) => r.companies?.name ?? r.contact_name ?? r.profiles?.full_name ?? r.profiles?.email ?? null;

const sumLines = (l: PlanLine[]) => {
  const m = new Map<string, PlanLine>();
  l.forEach((x) => { const k = x.sku.toUpperCase(); const c = m.get(k); if (c) c.qty += x.qty; else m.set(k, { ...x, sku: k }); });
  return [...m.values()];
};

export async function listSources(kind: SourceKind): Promise<SourceOption[]> {
  if (kind === "quote") {
    const { data } = await supabase.from("quote_requests").select("id, code, status, created_at, contact_name, companies(name, tax_id), profiles(full_name, email)")
      .not("status", "in", "(lost,cancelled)").order("created_at", { ascending: false }).limit(300);
    return ((data ?? []) as unknown as (Party & { id: string; code: string; contact_name: string | null })[]).map((r) => ({ id: r.id, label: `${r.code} · ${partyName(r) ?? ""}` }));
  }
  if (kind === "reservation") {
    const { data } = await supabase.from("reservations").select("id, code, status, companies(name, tax_id), profiles(full_name, email)")
      .in("status", ["pending", "confirmed"]).order("created_at", { ascending: false }).limit(300);
    return ((data ?? []) as unknown as (Party & { id: string; code: string })[]).map((r) => ({ id: r.id, label: `${r.code} · ${partyName(r) ?? ""}` }));
  }
  const { data } = await supabase.from("stock_docs").select("id, doc_no, partner_name, doc_date").eq("doc_type", "RV").eq("status", "posted").order("doc_date", { ascending: false }).limit(300);
  return ((data ?? []) as Pick<StockDoc, "id" | "doc_no" | "partner_name">[]).map((d) => ({ id: d.id, label: `${d.doc_no} · ${d.partner_name ?? ""}` }));
}

export async function loadSource(kind: SourceKind, id: string): Promise<SourcePick | null> {
  if (kind === "quote") {
    const { data } = await supabase.from("quote_requests")
      .select("id, code, company_id, contact_name, companies(name, tax_id), profiles(full_name, email), quote_request_items(label, qty, product_variants(sku), packages(name, package_items(qty, product_variants(sku, name))))")
      .eq("id", id).single();
    if (!data) return null;
    type V = { sku: string; name?: string | null } | null;
    const q = data as unknown as Party & { id: string; code: string; company_id: string | null; contact_name: string | null;
      quote_request_items: { label: string; qty: number; product_variants: V; packages: { name: string; package_items: { qty: number; product_variants: V }[] } | null }[] };
    const lines: PlanLine[] = [];
    for (const i of q.quote_request_items) {
      if (i.product_variants?.sku) lines.push({ sku: i.product_variants.sku, label: i.label, qty: Number(i.qty) });
      else for (const p of i.packages?.package_items ?? []) if (p.product_variants?.sku)
        lines.push({ sku: p.product_variants.sku, label: `${p.product_variants.sku} · ${p.product_variants.name ?? ""} (แพ็กเกจ ${i.packages!.name})`, qty: Number(p.qty) * Number(i.qty) });
    }
    return { kind, id: q.id, code: q.code, partner_name: partyName(q), partner_tax_id: q.companies?.tax_id ?? null, company_id: q.company_id, lines: sumLines(lines) };
  }
  if (kind === "reservation") {
    const { data } = await supabase.from("reservations").select("id, code, company_id, companies(name, tax_id), profiles(full_name, email), reservation_items(sku, label, qty)").eq("id", id).single();
    if (!data) return null;
    const r = data as unknown as Party & { id: string; code: string; company_id: string | null; reservation_items: PlanLine[] };
    return { kind, id: r.id, code: r.code, partner_name: partyName(r), partner_tax_id: r.companies?.tax_id ?? null, company_id: r.company_id,
      lines: sumLines(r.reservation_items.map((i) => ({ ...i, qty: Number(i.qty) }))) };
  }
  const [d, it, s] = await Promise.all([
    supabase.from("stock_docs").select("*").eq("id", id).single(),
    supabase.from("stock_doc_items").select("sku, description").eq("doc_id", id),
    supabase.from("serials").select("sn, sku, description, condition, warehouse_id").eq("last_doc_id", id).eq("status", "reserved"),
  ]);
  if (!d.data) return null;
  const rv = d.data as StockDoc;
  const lines = sumLines(((it.data ?? []) as { sku: string; description: string | null }[]).map((x) => ({ sku: x.sku, label: `${x.sku} · ${x.description ?? ""}`, qty: 1 })));
  const sns = (s.data ?? []) as { sn: string; sku: string; description: string | null; condition: "good" | "defective"; warehouse_id: string | null }[];
  const count = new Map<string, number>();
  sns.forEach((x) => x.warehouse_id && count.set(x.warehouse_id, (count.get(x.warehouse_id) ?? 0) + 1));
  const wh = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { kind, id: rv.id, code: rv.doc_no ?? "", partner_name: rv.partner_name, partner_tax_id: rv.partner_tax_id, company_id: rv.company_id, lines,
    warehouse_id: wh, sns: sns.filter((x) => x.warehouse_id === wh).map((x) => ({ sku: x.sku, description: x.description, sn: x.sn, condition: x.condition })) };
}
