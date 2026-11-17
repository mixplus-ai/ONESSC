import { useEffect, useMemo, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { RankBadge } from "../../../components/catalog";
import { ImageUpload } from "../../../components/ImageUpload";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { formatBaht, formatDateTime, type PriceRank, type Variant } from "../../../lib/catalog";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import type { Company } from "../../../lib/types";

type Row = Variant & { products: { name: string; brands: { name: string } | null } };
interface PriceRow { variant_id: string; price: number; updated_at: string }
type Mode = "rank" | "company";

const rankPrice = (rank: PriceRank | undefined, rp: Map<string, PriceRow>, v: Pick<Variant, "id" | "base_price">): number | null => {
  const own = rp.get(v.id);
  if (own) return Number(own.price);
  if (rank?.discount_pct != null && v.base_price != null) return Math.round(Number(v.base_price) * (100 - Number(rank.discount_pct))) / 100;
  return null;
};

/** Rank settings: name, colour, logo, default % off the normal price. */
function RankSettings({ rank, onSaved }: { rank: PriceRank; onSaved: () => void }) {
  const [f, setF] = useState(rank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setF(rank), [rank]);
  async function save() {
    setBusy(true);
    setErr("");
    const { error } = await supabase
      .from("price_ranks")
      .update({ name: f.name.trim(), color: f.color, logo_url: f.logo_url || null, discount_pct: f.discount_pct === null || (f.discount_pct as unknown) === "" ? null : Number(f.discount_pct), sort: f.sort, is_active: f.is_active })
      .eq("code", rank.code);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }
  return (
    <div className="grid gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="ชื่อ Rank"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="สีป้าย"><Input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="!h-10 !p-1" /></Field>
      <Field label="ส่วนลดจากราคาปกติ (%)" hint="ใช้กับรหัสที่ยังไม่ได้ตั้งราคา Rank ไว้ ว่าง = ราคาปกติ">
        <Input type="number" min="0" max="99" step="0.5" value={f.discount_pct ?? ""} onChange={(e) => setF({ ...f, discount_pct: e.target.value === "" ? null : Number(e.target.value) })} />
      </Field>
      <Field label="ตัวอย่างป้าย">
        <div className="flex h-10 items-center gap-2"><RankBadge rank={{ ...f, plus: false }} size="md" /><RankBadge rank={{ ...f, plus: true }} size="md" /></div>
      </Field>
      <div className="sm:col-span-2"><Field label="โลโก้ Rank (ไม่บังคับ)"><ImageUpload folder="ranks" value={f.logo_url ?? ""} onChange={(v) => setF({ ...f, logo_url: v })} /></Field></div>
      <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> เปิดใช้ Rank นี้</label>
      <div className="flex items-end"><Button onClick={save} loading={busy}>บันทึก Rank</Button></div>
      {err && <div className="sm:col-span-2 lg:col-span-4"><Alert>{err}</Alert></div>}
    </div>
  );
}

/**
 * Prices by rank (Silver / Gold / Platinum / Diamond): every company in the rank follows the rank's prices.
 * A company can still get its own price per SKU, shown to staff and customers as "Gold+".
 */
export default function Pricing() {
  const { can } = useAuth();
  const ranks = useRows<PriceRank>(() => supabase.from("price_ranks").select("*").order("sort"));
  const companies = useRows<Company>(() => supabase.from("companies").select("*").order("name"));
  const variants = useRows<Row>(() => supabase.from("product_variants").select("*, products(name, brands(name))").order("sku"));
  const plusCompanies = useRows<{ company_id: string }>(() => supabase.from("company_prices").select("company_id"));
  const plusSet = useMemo(() => new Set(plusCompanies.rows.map((r) => r.company_id)), [plusCompanies.rows]);
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).get("company") ? "company" : "rank"));
  const [rankCode, setRankCode] = useState("gold");
  const [companyId, setCompanyId] = useState(() => new URLSearchParams(location.search).get("company") ?? "");
  const [prices, setPrices] = useState<Map<string, PriceRow>>(new Map());
  const [rankRows, setRankRows] = useState<Map<string, PriceRow>>(new Map());
  const [draft, setDraft] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const company = companies.rows.find((c) => c.id === companyId);
  // the rank whose prices are on screen: the chosen rank, or the company's rank
  const activeRankCode = mode === "rank" ? rankCode : company?.price_rank ?? "";
  const activeRank = ranks.rows.find((r) => r.code === activeRankCode);

  async function loadRankPrices(code: string) {
    if (!code) return setRankRows(new Map());
    const { data } = await supabase.from("rank_prices").select("variant_id, price, updated_at").eq("rank_code", code);
    setRankRows(new Map(((data ?? []) as PriceRow[]).map((r) => [r.variant_id, r])));
  }
  async function loadCompanyPrices(id: string) {
    if (!id) return setPrices(new Map());
    const { data } = await supabase.from("company_prices").select("variant_id, price, updated_at").eq("company_id", id);
    setPrices(new Map(((data ?? []) as PriceRow[]).map((r) => [r.variant_id, r])));
  }
  useEffect(() => {
    setDraft(new Map());
    setMsg("");
    loadRankPrices(activeRankCode);
    if (mode === "company") loadCompanyPrices(companyId);
  }, [mode, activeRankCode, companyId]);

  // the editable column: rank prices in rank mode, the company's own prices in company mode
  const editing = mode === "rank" ? rankRows : prices;
  const editable = mode === "rank" ? !!activeRank : !!companyId;

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return variants.rows.filter(
      (v) =>
        (!onlySet || editing.has(v.id) || draft.has(v.id)) &&
        (!n || [v.sku, v.name, v.products?.name, v.products?.brands?.name].join(" ").toLowerCase().includes(n)),
    );
  }, [variants.rows, q, onlySet, editing, draft]);

  const value = (id: string) => (draft.has(id) ? (draft.get(id) as string) : editing.get(id)?.price?.toString() ?? "");
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

  async function changeCompanyRank(code: string) {
    if (!company) return;
    setErr("");
    const { error } = await supabase.rpc("set_company_rank", { p_company_id: company.id, p_rank: code });
    if (error) return setErr(errorMessage(error));
    setMsg(`ตั้ง ${company.name} เป็น ${ranks.rows.find((r) => r.code === code)?.name ?? "ราคาปกติ (ไม่มี Rank)"} แล้ว`);
    companies.reload();
  }

  async function save() {
    if (!editable) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const table = mode === "rank" ? "rank_prices" : "company_prices";
    const keyCol = mode === "rank" ? "rank_code" : "company_id";
    const key = mode === "rank" ? rankCode : companyId;
    const upserts: Record<string, string | number>[] = [];
    const deletes: string[] = [];
    for (const [id, raw] of draft) {
      if (raw.trim() === "") {
        if (editing.has(id)) deletes.push(id);
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          setBusy(false);
          return setErr(`ราคาไม่ถูกต้อง: ${raw}`);
        }
        upserts.push({ [keyCol]: key, variant_id: id, price: n });
      }
    }
    try {
      if (upserts.length) {
        const { error } = await supabase.from(table).upsert(upserts, { onConflict: `${keyCol},variant_id` });
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await supabase.from(table).delete().eq(keyCol, key).in("variant_id", deletes);
        if (error) throw error;
      }
      const who = mode === "rank" ? `Rank ${activeRank?.name} (ทุกบริษัทใน Rank นี้เปลี่ยนตาม)` : company?.name;
      setMsg(`บันทึก ${upserts.length} ราคา${deletes.length ? ` ลบ ${deletes.length} ราคา` : ""} ของ ${who} แล้ว`);
      setDraft(new Map());
      if (mode === "rank") await loadRankPrices(rankCode);
      else {
        await loadCompanyPrices(companyId);
        plusCompanies.reload();
      }
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  const inRank = (code: string) => companies.rows.filter((c) => c.price_rank === code);
  const companyRankInfo = company && activeRank ? { ...activeRank, plus: plusSet.has(company.id) || prices.size > 0 } : null;

  return (
    <Gate allow={can("pricing")}>
      <PageTitle
        title="ราคาตาม Rank / บริษัท"
        subtitle="ตั้งราคาเป็น Rank แล้วทุกบริษัทใน Rank เปลี่ยนตาม แก้ราคาเฉพาะบริษัทได้ (แสดงเป็น Rank+) โปรโมชั่นที่กำลังใช้งานจะแสดงแทนเสมอ"
      />
      <div className="mb-4 inline-flex rounded-lg bg-slate-200/60 p-1">
        {(["rank", "company"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cx("rounded-md px-4 py-1.5 text-sm font-medium", mode === m ? "bg-white text-navy-900 shadow-sm" : "text-slate-600")}>
            {m === "rank" ? "ราคาตาม Rank" : "ราคาเฉพาะบริษัท (Rank+)"}
          </button>
        ))}
      </div>

      {mode === "rank" ? (
        <Card className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {ranks.rows.map((r) => (
              <button
                key={r.code}
                onClick={() => setRankCode(r.code)}
                className={cx("flex items-center gap-2 rounded-xl px-3 py-2 ring-1 transition", rankCode === r.code ? "bg-navy-50 ring-navy-300" : "bg-white ring-slate-200 hover:ring-slate-300", !r.is_active && "opacity-50")}
              >
                <RankBadge rank={{ ...r, plus: false }} />
                <span className="text-xs text-slate-500">{inRank(r.code).length} บริษัท</span>
              </button>
            ))}
            {activeRank && (
              <button onClick={() => setShowSettings((s) => !s)} className="ml-auto text-sm font-semibold text-navy-700 hover:underline">
                {showSettings ? "ปิดการตั้งค่า" : `ตั้งค่า ${activeRank.name} (ชื่อ สี โลโก้ % ส่วนลด)`}
              </button>
            )}
          </div>
          {showSettings && activeRank && <RankSettings rank={activeRank} onSaved={() => { ranks.reload(); setMsg("บันทึก Rank แล้ว"); }} />}
          {activeRank && inRank(activeRank.code).length > 0 && (
            <p className="text-xs text-slate-500">บริษัทใน Rank นี้: {inRank(activeRank.code).map((c) => c.name + (plusSet.has(c.id) ? " (+)" : "")).join(", ")}</p>
          )}
          <Input type="search" placeholder="ค้นหารหัส / ชื่อสินค้า / แบรนด์" value={q} onChange={(e) => setQ(e.target.value)} />
        </Card>
      ) : (
        <Card className="mb-4 grid gap-3 md:grid-cols-[1fr_14rem_1fr]">
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="เลือกบริษัท">
            <option value="">เลือกบริษัทลูกค้า</option>
            {companies.rows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.tax_id}{c.price_rank ? ` · ${ranks.rows.find((r) => r.code === c.price_rank)?.name ?? c.price_rank}${plusSet.has(c.id) ? "+" : ""}` : ""}
              </option>
            ))}
          </Select>
          <Select value={company?.price_rank ?? ""} onChange={(e) => changeCompanyRank(e.target.value)} disabled={!company} aria-label="Rank ของบริษัท">
            <option value="">ไม่มี Rank (ราคาปกติ)</option>
            {ranks.rows.filter((r) => r.is_active || r.code === company?.price_rank).map((r) => <option key={r.code} value={r.code}>Rank {r.name}</option>)}
          </Select>
          <Input type="search" placeholder="ค้นหารหัส / ชื่อสินค้า / แบรนด์" value={q} onChange={(e) => setQ(e.target.value)} />
          {company && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600 md:col-span-3">
              ลูกค้าบริษัทนี้เห็นป้าย {companyRankInfo ? <RankBadge rank={companyRankInfo} /> : <Badge>ไม่มี Rank</Badge>}
              <span className="text-xs text-slate-500">ช่องที่ใส่ราคา = ราคาเฉพาะบริษัท (ทำให้เป็น +) · ว่าง = ใช้ราคา Rank</span>
            </p>
          )}
        </Card>
      )}

      {editable && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} /> แสดงเฉพาะที่ตั้งราคาแล้ว ({editing.size})</label>
          <span className="ml-auto flex items-center gap-2 text-sm">
            ลดจากราคาปกติ <Input className="!w-20" type="number" min="1" max="99" value={pct} onChange={(e) => setPct(e.target.value)} /> %
            <Button variant="secondary" onClick={applyPercent} disabled={!pct}>ใส่ให้รายการที่แสดง</Button>
          </span>
        </div>
      )}

      {msg && <div className="mb-4"><Alert tone="green">{msg}</Alert></div>}
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      {!editable ? (
        <Empty>{mode === "rank" ? "เลือก Rank เพื่อตั้งราคา" : "เลือกบริษัทเพื่อตั้ง Rank หรือราคาเฉพาะบริษัท (บริษัทจะถูกสร้างเมื่ออนุมัติการผูกบริษัทในหน้า “บริษัทลูกค้า”)"}</Empty>
      ) : variants.loading ? (
        <Loading />
      ) : (
        <>
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="p-3">รหัส / สินค้า</th>
                  <th className="p-3 text-right">ราคาปกติ</th>
                  {mode === "company" && <th className="p-3 text-right">ราคา Rank {activeRank?.name ?? "-"}</th>}
                  <th className="p-3">{mode === "rank" ? `ราคา Rank ${activeRank?.name}` : `ราคาเฉพาะ ${company?.name}`}</th>
                  <th className="p-3">แก้ไขล่าสุด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((v) => {
                  const changed = draft.has(v.id) && draft.get(v.id) !== (editing.get(v.id)?.price?.toString() ?? "");
                  const rp = rankPrice(activeRank, rankRows, v);
                  const placeholder = mode === "rank"
                    ? (activeRank?.discount_pct != null && v.base_price != null ? `${formatBaht(rp)} (−${activeRank.discount_pct}%)` : "ใช้ราคาปกติ")
                    : rp != null ? `ใช้ราคา Rank ${formatBaht(rp)}` : "ใช้ราคาปกติ";
                  return (
                    <tr key={v.id} className={changed ? "bg-sun-300/20" : undefined}>
                      <td className="p-3">
                        <p className="font-mono text-xs text-slate-500">{v.sku}</p>
                        <p className="font-medium text-navy-900">{v.products?.name}{v.name !== v.sku && ` · ${v.name}`}</p>
                      </td>
                      <td className="p-3 text-right">{formatBaht(v.base_price)}</td>
                      {mode === "company" && <td className="p-3 text-right text-slate-600">{rp != null ? formatBaht(rp) : "-"}</td>}
                      <td className="p-3"><Input type="number" min="0" step="0.01" className="!w-48" value={value(v.id)} onChange={(e) => setValue(v.id, e.target.value)} placeholder={placeholder} /></td>
                      <td className="p-3 text-xs text-slate-500">{editing.get(v.id) ? formatDateTime(editing.get(v.id)?.updated_at) : "-"}</td>
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
