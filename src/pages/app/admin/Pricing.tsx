import { useEffect, useMemo, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Alert, Button, Card, Empty, Input, Loading, PageTitle, Select } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { formatBaht, formatDateTime, type Variant } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import type { Company } from "../../../lib/types";

type Row = Variant & { products: { name: string; brands: { name: string } | null } };
interface PriceRow { variant_id: string; price: number; note: string | null; updated_at: string }

/** Staff sets a price per customer company; customers of that company see it after logging in. */
export default function Pricing() {
  const { can } = useAuth();
  const companies = useRows<Company>(() => supabase.from("companies").select("*").order("name"));
  const variants = useRows<Row>(() => supabase.from("product_variants").select("*, products(name, brands(name))").order("sku"));
  const [companyId, setCompanyId] = useState("");
  const [prices, setPrices] = useState<Map<string, PriceRow>>(new Map());
  const [draft, setDraft] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function loadPrices(id: string) {
    setDraft(new Map());
    if (!id) return setPrices(new Map());
    const { data } = await supabase.from("company_prices").select("variant_id, price, note, updated_at").eq("company_id", id);
    setPrices(new Map(((data ?? []) as PriceRow[]).map((r) => [r.variant_id, r])));
  }
  useEffect(() => {
    loadPrices(companyId);
  }, [companyId]);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return variants.rows.filter(
      (v) =>
        (!onlySet || prices.has(v.id) || draft.has(v.id)) &&
        (!n || [v.sku, v.name, v.products?.name, v.products?.brands?.name].join(" ").toLowerCase().includes(n)),
    );
  }, [variants.rows, q, onlySet, prices, draft]);

  const value = (id: string) => (draft.has(id) ? (draft.get(id) as string) : prices.get(id)?.price?.toString() ?? "");
  const setValue = (id: string, v: string) => setDraft((d) => new Map(d).set(id, v));

  function applyPercent() {
    const p = Number(pct);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) return setErr("ใส่ส่วนลดเป็น % ระหว่าง 1–99");
    setErr("");
    setDraft((d) => {
      const next = new Map(d);
      for (const v of rows) if (v.base_price != null) next.set(v.id, (Math.round(Number(v.base_price) * (100 - p)) / 100).toFixed(2));
      return next;
    });
  }

  async function save() {
    if (!companyId) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const upserts: { company_id: string; variant_id: string; price: number }[] = [];
    const deletes: string[] = [];
    for (const [id, raw] of draft) {
      if (raw.trim() === "") {
        if (prices.has(id)) deletes.push(id);
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          setBusy(false);
          return setErr(`ราคาไม่ถูกต้อง: ${raw}`);
        }
        upserts.push({ company_id: companyId, variant_id: id, price: n });
      }
    }
    try {
      if (upserts.length) {
        const { error } = await supabase.from("company_prices").upsert(upserts, { onConflict: "company_id,variant_id" });
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await supabase.from("company_prices").delete().eq("company_id", companyId).in("variant_id", deletes);
        if (error) throw error;
      }
      setMsg(`บันทึก ${upserts.length} ราคา${deletes.length ? ` ลบ ${deletes.length} ราคา` : ""} แล้ว`);
      await loadPrices(companyId);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  const company = companies.rows.find((c) => c.id === companyId);

  return (
    <Gate allow={can("pricing")}>
      <PageTitle title="ราคาเฉพาะบริษัท" subtitle="ราคาที่ลูกค้าของบริษัทนั้นเห็นเมื่อเข้าสู่ระบบ (โปรโมชั่นที่กำลังใช้งานจะแสดงแทน)" />
      <Card className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr]">
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="เลือกบริษัท">
          <option value="">เลือกบริษัทลูกค้า</option>
          {companies.rows.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.tax_id}</option>)}
        </Select>
        <Input type="search" placeholder="ค้นหารหัส / ชื่อสินค้า / แบรนด์" value={q} onChange={(e) => setQ(e.target.value)} />
        {companyId && (
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} /> แสดงเฉพาะที่ตั้งราคาแล้ว ({prices.size})</label>
            <span className="ml-auto flex items-center gap-2 text-sm">
              ลดจากราคาปกติ <Input className="!w-20" type="number" min="1" max="99" value={pct} onChange={(e) => setPct(e.target.value)} /> %
              <Button variant="secondary" onClick={applyPercent} disabled={!pct}>ใส่ให้รายการที่แสดง</Button>
            </span>
          </div>
        )}
      </Card>

      {msg && <div className="mb-4"><Alert tone="green">{msg}</Alert></div>}
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      {!companyId ? (
        <Empty>เลือกบริษัทเพื่อตั้งราคา (บริษัทจะถูกสร้างเมื่ออนุมัติการผูกบริษัทในหน้า “บริษัทลูกค้า”)</Empty>
      ) : variants.loading ? (
        <Loading />
      ) : (
        <>
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="p-3">รหัส / สินค้า</th><th className="p-3 text-right">ราคาปกติ</th><th className="p-3">ราคา {company?.name}</th><th className="p-3">แก้ไขล่าสุด</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((v) => {
                  const changed = draft.has(v.id) && draft.get(v.id) !== (prices.get(v.id)?.price?.toString() ?? "");
                  return (
                    <tr key={v.id} className={changed ? "bg-sun-300/20" : undefined}>
                      <td className="p-3">
                        <p className="font-mono text-xs text-slate-500">{v.sku}</p>
                        <p className="font-medium text-navy-900">{v.products?.name}{v.name !== v.sku && ` · ${v.name}`}</p>
                      </td>
                      <td className="p-3 text-right">{formatBaht(v.base_price)}</td>
                      <td className="p-3"><Input type="number" min="0" step="0.01" className="!w-36" value={value(v.id)} onChange={(e) => setValue(v.id, e.target.value)} placeholder="ใช้ราคาปกติ" /></td>
                      <td className="p-3 text-xs text-slate-500">{prices.get(v.id) ? formatDateTime(prices.get(v.id)?.updated_at) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="sticky bottom-4 mt-4 flex justify-end">
            <Button onClick={save} loading={busy} disabled={!draft.size} className="shadow-lg">บันทึกราคา ({draft.size})</Button>
          </div>
        </>
      )}
    </Gate>
  );
}
