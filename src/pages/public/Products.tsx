import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdSlot, PageBanner } from "../../components/banners";
import { ProductCard } from "../../components/catalog";
import { SearchIcon } from "../../components/icons";
import { Empty, Input, Loading, cx } from "../../components/ui";
import { usePricing, type Brand, type Category, type PriceInfo, type Product } from "../../lib/catalog";
import { useRows } from "../../lib/content";
import { supabase } from "../../lib/supabase";

export const PRODUCT_SELECT = "*, brands(id, name, slug), product_categories(id, name, slug), product_variants(*)";

export default function Products() {
  const [params, setParams] = useSearchParams();
  const brand = params.get("brand") ?? "";
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";

  const brands = useRows<Brand>(() => supabase.from("brands").select("*").eq("is_published", true).order("sort").order("name"));
  const categories = useRows<Category>(() => supabase.from("product_categories").select("*").order("sort").order("name"));
  const products = useRows<Product>(() =>
    supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("is_featured", { ascending: false }).order("sort").order("name"),
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.rows
      .map((p) => ({ ...p, product_variants: (p.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku)) }))
      .filter((p) => (!brand || p.brands?.slug === brand) && (!category || p.product_categories?.slug === category))
      .filter((p) => {
        if (!needle) return true;
        const hay = [p.name, p.summary, p.brands?.name, ...p.tags, ...(p.product_variants ?? []).flatMap((v) => [v.sku, v.name, v.detail])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
  }, [products.rows, brand, category, q]);

  const variants = useMemo(() => visible.flatMap((p) => p.product_variants ?? []), [visible]);
  const { price, stock } = usePricing(variants);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const usedCategories = categories.rows.filter((c) => products.rows.some((p) => p.category_id === c.id));
  const usedBrands = brands.rows.filter((b) => products.rows.some((p) => p.brand_id === b.id));

  return (
    <>
      <PageBanner page="products">
        <Link to="/promotions" className="inline-flex rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100">โปรโมชั่นและแพ็กเกจ</Link>
      </PageBanner>
      <AdSlot placement="products" className="mt-6" />
      <div className="container-x pb-10">

      <div className="sticky top-16 z-20 -mx-4 mt-4 bg-slate-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input type="search" className="!rounded-xl !py-3 !pl-11" placeholder="ค้นหาชื่อสินค้า รุ่น หรือรหัสสินค้า" value={q} onChange={(e) => set("q", e.target.value)} />
        </div>
        {usedCategories.length > 0 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto sm:flex-wrap" role="group" aria-label="เลือกหมวดหมู่">
            <Chip active={!category} onClick={() => set("category", "")}>ทั้งหมด</Chip>
            {usedCategories.map((c) => <Chip key={c.id} active={category === c.slug} onClick={() => set("category", category === c.slug ? "" : c.slug)}>{c.name}</Chip>)}
          </div>
        )}
      </div>

      {usedBrands.length > 0 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto sm:flex-wrap" role="group" aria-label="เลือกแบรนด์">
          <Chip active={!brand} onClick={() => set("brand", "")} soft>ทุกแบรนด์</Chip>
          {usedBrands.map((b) => (
            <Chip key={b.id} active={brand === b.slug} onClick={() => set("brand", brand === b.slug ? "" : b.slug)} soft>
              {b.logo_url && <img src={b.logo_url} alt="" className="h-4 w-auto" />}
              {b.name}
            </Chip>
          ))}
        </div>
      )}

      {!products.loading && <p className="mt-5 text-sm text-slate-500">พบ {visible.length.toLocaleString("th-TH")} รายการ</p>}

      <div className="mt-3">
        {products.loading ? (
          <Loading />
        ) : visible.length ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const vs = p.product_variants ?? [];
              const prices = vs.map((v) => price(v)).filter((x) => x.price != null);
              const lowest: PriceInfo | null = prices.length
                ? prices.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a))
                : vs.length
                  ? { price: null, base: null, kind: "ask" }
                  : null;
              return <ProductCard key={p.id} p={p} price={lowest} stockSummary={vs.length === 1 ? stock.get(vs[0].sku) : undefined} />;
            })}
          </div>
        ) : (
          <Empty>{products.rows.length ? "ไม่พบสินค้าที่ตรงกับเงื่อนไข" : "กำลังย้ายข้อมูลสินค้าเข้าระบบ สอบถามสินค้าได้ทาง LINE หรือแบบฟอร์มติดต่อ"}</Empty>
        )}
      </div>
    </div>
    </>
  );
}

function Chip({ active, onClick, children, soft }: { active: boolean; onClick: () => void; children: React.ReactNode; soft?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ring-1 transition",
        active ? (soft ? "bg-sun-500 text-navy-950 ring-sun-500" : "bg-navy-700 text-white ring-navy-700") : "bg-white text-slate-700 ring-slate-200 hover:ring-navy-600",
      )}
    >
      {children}
    </button>
  );
}
