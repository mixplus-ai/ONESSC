import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdSlot } from "../../components/banners";
import { ProductCard, discountPct } from "../../components/catalog";
import { ArrowRightIcon, BoxIcon, FileIcon, SearchIcon, ShieldIcon, TagIcon, WrenchIcon, XIcon } from "../../components/icons";
import { Empty, Loading, cx } from "../../components/ui";
import { usePricing, type Brand, type Category, type PriceInfo, type Product, type StockInfo } from "../../lib/catalog";
import { useRows, useSiteSettings } from "../../lib/content";
import { supabase } from "../../lib/supabase";

export const PRODUCT_SELECT = "*, brands(id, name, slug, logo_url), product_categories(id, name, slug), product_variants(*)";

const SORTS = [
  { v: "", label: "แนะนำ" },
  { v: "price_asc", label: "ราคาต่ำ → สูง" },
  { v: "price_desc", label: "ราคาสูง → ต่ำ" },
  { v: "discount", label: "ส่วนลดมากสุด" },
  { v: "new", label: "มาใหม่" },
  { v: "name", label: "ชื่อ A–Z" },
] as const;

const PAGE = 24;

type Row = Product & { lowest: PriceInfo | null; off: number; inStock: boolean; stockOne?: StockInfo };

export default function Products() {
  const [params, setParams] = useSearchParams();
  const brand = params.get("brand") ?? "";
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "";
  const promoOnly = params.get("promo") === "1";
  const stockOnly = params.get("stock") === "1";
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const brands = useRows<Brand>(() => supabase.from("brands").select("*").eq("is_published", true).order("sort").order("name"));
  const categories = useRows<Category>(() => supabase.from("product_categories").select("*").order("sort").order("name"));
  const products = useRows<Product>(() =>
    supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("is_featured", { ascending: false }).order("sort").order("name"),
  );

  const all = useMemo(
    () => products.rows.map((p) => ({ ...p, product_variants: (p.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku)) })),
    [products.rows],
  );
  const variants = useMemo(() => all.flatMap((p) => p.product_variants ?? []), [all]);
  const { price, stock } = usePricing(variants);

  // price + stock per product, computed once for filters, sort and cards
  const rows: Row[] = useMemo(
    () =>
      all.map((p) => {
        const vs = p.product_variants ?? [];
        const prices = vs.map((v) => price(v)).filter((x) => x.price != null);
        const lowest: PriceInfo | null = prices.length
          ? prices.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a))
          : vs.length
            ? { price: null, base: null, kind: "ask" }
            : null;
        const inStock = vs.some((v) => ["in_stock", "low"].includes(stock.get(v.sku)?.status ?? ""));
        return { ...p, lowest, off: Math.max(0, ...vs.map((v) => discountPct(price(v)))), inStock, stockOne: vs.length === 1 ? stock.get(vs[0].sku) : undefined };
      }),
    [all, price, stock],
  );

  const needle = q.trim().toLowerCase();
  const matchQ = (p: Row) =>
    !needle ||
    [p.name, p.summary, p.brands?.name, p.product_categories?.name, ...p.tags, ...(p.product_variants ?? []).flatMap((v) => [v.sku, v.name, v.detail])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  const base = rows.filter((p) => matchQ(p) && (!promoOnly || p.off > 0) && (!stockOnly || p.inStock));
  const visible = useMemo(() => {
    const list = base.filter((p) => (!brand || p.brands?.slug === brand) && (!category || p.product_categories?.slug === category));
    const pr = (p: Row) => p.lowest?.price ?? null;
    const by: Record<string, (a: Row, b: Row) => number> = {
      price_asc: (a, b) => (pr(a) ?? Infinity) - (pr(b) ?? Infinity),
      price_desc: (a, b) => (pr(b) ?? -Infinity) - (pr(a) ?? -Infinity),
      discount: (a, b) => b.off - a.off,
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name, "th"),
    };
    return by[sort] ? [...list].sort(by[sort]) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, brand, category, needle, sort, promoOnly, stockOnly]);

  useEffect(() => setShown(PAGE), [brand, category, needle, sort, promoOnly, stockOnly]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  // counts reflect the other active filters, like an online store
  const catCount = (id: string) => base.filter((p) => p.category_id === id && (!brand || p.brands?.slug === brand)).length;
  const brandCount = (id: string) => base.filter((p) => p.brand_id === id && (!category || p.product_categories?.slug === category)).length;
  const usedCategories = categories.rows.filter((c) => rows.some((p) => p.category_id === c.id));
  const usedBrands = brands.rows.filter((b) => rows.some((p) => p.brand_id === b.id));
  const deals = rows.filter((p) => p.off > 0).sort((a, b) => b.off - a.off).slice(0, 10);
  const filtering = !!(brand || category || needle || promoOnly || stockOnly);
  const activeCount = [brand, category, promoOnly, stockOnly].filter(Boolean).length;

  const pills = [
    category && { k: "category", label: usedCategories.find((c) => c.slug === category)?.name ?? category },
    brand && { k: "brand", label: usedBrands.find((b) => b.slug === brand)?.name ?? brand },
    promoOnly && { k: "promo", label: "เฉพาะโปรโมชั่น" },
    stockOnly && { k: "stock", label: "มีสินค้าพร้อมส่ง" },
    needle && { k: "q", label: `“${q}”` },
  ].filter(Boolean) as { k: string; label: string }[];

  const filters = (
    <Filters
      categories={usedCategories.map((c) => ({ key: c.slug, label: c.name, n: catCount(c.id) }))}
      brands={usedBrands.map((b) => ({ key: b.slug, label: b.name, n: brandCount(b.id), logo: b.logo_url }))}
      category={category}
      brand={brand}
      promoOnly={promoOnly}
      stockOnly={stockOnly}
      set={set}
    />
  );

  return (
    <>
      <ShopHero q={q} onSearch={(v) => set("q", v)} productCount={rows.length} brandCount={usedBrands.length} />
      <AdSlot placement="products" className="mt-6" />

      <div className="container-x pb-12">
        {/* deals row */}
        {deals.length > 0 && !filtering && (
          <section className="mt-8 overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 via-red-500 to-orange-500 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20"><TagIcon className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-lg font-bold sm:text-xl">ดีลโปรโมชั่น</h2>
                  <p className="text-xs text-white/80 sm:text-sm">ราคาพิเศษช่วงนี้ ลดสูงสุด {deals[0].off}%</p>
                </div>
              </div>
              <button type="button" onClick={() => set("promo", "1")} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 sm:text-sm">
                ดูทั้งหมด <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
              {deals.map((p) => (
                <div key={p.id} className="w-44 shrink-0 snap-start sm:w-56">
                  <ProductCard p={p} price={p.lowest} stockSummary={p.stockOne} />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200">{filters}</div>
          </aside>

          <div className="min-w-0">
            {/* category chips (mobile/tablet) */}
            {usedCategories.length > 0 && (
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden" role="group" aria-label="เลือกหมวดหมู่">
                <Chip active={!category} onClick={() => set("category", "")}>ทั้งหมด</Chip>
                {usedCategories.map((c) => <Chip key={c.id} active={category === c.slug} onClick={() => set("category", category === c.slug ? "" : c.slug)}>{c.name}</Chip>)}
              </div>
            )}

            {/* toolbar */}
            <div className="sticky top-16 z-20 -mx-4 mt-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 backdrop-blur lg:static lg:mx-0 lg:mt-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
              <button type="button" onClick={() => setSheet(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-navy-800 ring-1 ring-slate-200 lg:hidden">
                <FilterIcon /> ตัวกรอง{activeCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sun-500 px-1 text-[11px] text-navy-950">{activeCount}</span>}
              </button>
              <p className="hidden text-sm text-slate-500 sm:block">
                {products.loading ? "กำลังโหลด…" : <>พบ <b className="text-navy-900">{visible.length.toLocaleString("th-TH")}</b> รายการ</>}
              </p>
              <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-500">
                <span className="hidden sm:inline">เรียงตาม</span>
                <select value={sort} onChange={(e) => set("sort", e.target.value)} className="rounded-lg border-0 bg-white py-2 pr-8 pl-3 text-sm font-medium text-navy-800 ring-1 ring-slate-200 focus:ring-2 focus:ring-navy-500">
                  {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {pills.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {pills.map((p) => (
                  <button key={p.k} type="button" onClick={() => set(p.k, "")} className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-800 ring-1 ring-navy-100 hover:bg-navy-100">
                    {p.label} <XIcon className="h-3.5 w-3.5" />
                  </button>
                ))}
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-red-600 hover:underline">ล้างทั้งหมด</button>
              </div>
            )}

            <div className="mt-4">
              {products.loading ? (
                <Loading />
              ) : visible.length ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
                    {visible.slice(0, shown).map((p) => <ProductCard key={p.id} p={p} price={p.lowest} stockSummary={p.stockOne} />)}
                  </div>
                  {shown < visible.length && (
                    <div className="mt-8 text-center">
                      <p className="mb-3 text-sm text-slate-500">แสดง {shown} จาก {visible.length} รายการ</p>
                      <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-navy-800 ring-1 ring-slate-300 hover:ring-navy-600">
                        ดูสินค้าเพิ่มเติม
                      </button>
                    </div>
                  )}
                </>
              ) : products.rows.length ? (
                <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
                  <SearchIcon className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-semibold text-navy-900">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>
                  <p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนคำค้นหรือล้างตัวกรอง หรือทักเซลล์ให้ช่วยหาให้</p>
                  <button type="button" onClick={clearAll} className="mt-4 rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-600">ล้างตัวกรอง</button>
                </div>
              ) : (
                <Empty>กำลังย้ายข้อมูลสินค้าเข้าระบบ สอบถามสินค้าได้ทาง LINE หรือแบบฟอร์มติดต่อ</Empty>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* mobile filter sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="ตัวกรอง">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="ปิด" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-900">ตัวกรอง</h2>
              <button type="button" onClick={clearAll} className="text-sm font-semibold text-red-600">ล้าง</button>
            </div>
            {filters}
            <button type="button" onClick={() => setSheet(false)} className="mt-6 w-full rounded-xl bg-navy-700 py-3 text-sm font-semibold text-white">
              ดูสินค้า {visible.length.toLocaleString("th-TH")} รายการ
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ShopHero({ q, onSearch, productCount, brandCount }: { q: string; onSearch: (v: string) => void; productCount: number; brandCount: number }) {
  const page = useSiteSettings().pages.products;
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  // search as you type, but don't rewrite the URL on every key
  useEffect(() => {
    const t = setTimeout(() => text !== q && onSearch(text), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <section className="relative overflow-hidden bg-navy-900 text-white">
      {page.image_url ? (
        <img src={page.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
      ) : (
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-sun-500/25 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950/85 via-navy-900/60 to-navy-900/20" aria-hidden />
      <div className="container-x relative py-10 sm:py-14">
        <p className="text-sm font-semibold text-sun-300">{page.eyebrow || "ร้านค้าออนไลน์"}</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{page.title || "สินค้า"}</h1>
        {page.subtitle && <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-navy-100 sm:text-base">{page.subtitle}</p>}
        <form
          className="relative mt-6 max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(text);
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า รุ่น หรือรหัสสินค้า"
            className="w-full rounded-2xl border-0 bg-white py-3.5 pr-28 pl-12 text-navy-900 shadow-lg ring-0 placeholder:text-slate-400 focus:ring-2 focus:ring-sun-400"
          />
          <button type="submit" className="absolute top-1.5 right-1.5 bottom-1.5 rounded-xl bg-sun-500 px-5 text-sm font-semibold text-navy-950 hover:bg-sun-400">ค้นหา</button>
        </form>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-navy-100 sm:text-sm">
          {productCount > 0 && <span className="inline-flex items-center gap-1.5"><BoxIcon className="h-4 w-4 text-sun-300" /> {productCount.toLocaleString("th-TH")} สินค้า · {brandCount} แบรนด์</span>}
          <span className="inline-flex items-center gap-1.5"><ShieldIcon className="h-4 w-4 text-sun-300" /> ของแท้จากตัวแทนจำหน่าย</span>
          <span className="inline-flex items-center gap-1.5"><FileIcon className="h-4 w-4 text-sun-300" /> ขอใบเสนอราคาออนไลน์</span>
          <span className="inline-flex items-center gap-1.5"><WrenchIcon className="h-4 w-4 text-sun-300" /> บริการเคลมหลังการขาย</span>
        </div>
        <Link to="/promotions" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20">
          <TagIcon className="h-4 w-4 text-sun-300" /> โปรโมชั่นและแพ็กเกจ <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

type Opt = { key: string; label: string; n: number; logo?: string | null };

function Filters({ categories, brands, category, brand, promoOnly, stockOnly, set }: { categories: Opt[]; brands: Opt[]; category: string; brand: string; promoOnly: boolean; stockOnly: boolean; set: (k: string, v: string) => void }) {
  return (
    <div className="space-y-6">
      {categories.length > 0 && (
        <FilterGroup title="หมวดหมู่">
          <OptRow active={!category} onClick={() => set("category", "")} label="ทั้งหมด" />
          {categories.map((c) => <OptRow key={c.key} active={category === c.key} onClick={() => set("category", category === c.key ? "" : c.key)} label={c.label} n={c.n} />)}
        </FilterGroup>
      )}
      {brands.length > 0 && (
        <FilterGroup title="แบรนด์">
          <OptRow active={!brand} onClick={() => set("brand", "")} label="ทุกแบรนด์" />
          {brands.map((b) => <OptRow key={b.key} active={brand === b.key} onClick={() => set("brand", brand === b.key ? "" : b.key)} label={b.label} n={b.n} logo={b.logo} />)}
        </FilterGroup>
      )}
      <FilterGroup title="ตัวเลือก">
        <Toggle on={promoOnly} onClick={() => set("promo", promoOnly ? "" : "1")} label="เฉพาะสินค้าโปรโมชั่น" />
        <Toggle on={stockOnly} onClick={() => set("stock", stockOnly ? "" : "1")} label="มีสินค้าพร้อมส่ง" />
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function OptRow({ active, onClick, label, n, logo }: { active: boolean; onClick: () => void; label: string; n?: number; logo?: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition", active ? "bg-navy-700 font-semibold text-white" : "text-slate-700 hover:bg-slate-100")}
    >
      {logo && <img src={logo} alt="" className="h-4 w-auto" />}
      <span className="flex-1 truncate">{label}</span>
      {n != null && <span className={cx("text-xs", active ? "text-navy-100" : "text-slate-400")}>{n}</span>}
    </button>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100">
      {label}
      <span className={cx("relative h-5 w-9 rounded-full transition", on ? "bg-sun-500" : "bg-slate-300")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ring-1 transition",
        active ? "bg-navy-700 text-white ring-navy-700" : "bg-white text-slate-700 ring-slate-200 hover:ring-navy-600",
      )}
    >
      {children}
    </button>
  );
}
