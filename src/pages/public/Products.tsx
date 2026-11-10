import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProductCard } from "../../components/catalog";
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
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">สินค้า</h1>
          <p className="mt-1 text-slate-500">ราคาและสต๊อกอัปเดตจากระบบคลังสินค้า เข้าสู่ระบบเพื่อดูราคาเฉพาะบริษัทของคุณ</p>
        </div>
        <div className="flex gap-2">
          <Link to="/promotions" className="rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100">โปรโมชั่นและแพ็กเกจ</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
        <Input type="search" placeholder="ค้นหาชื่อสินค้า รุ่น หรือรหัสสินค้า" value={q} onChange={(e) => set("q", e.target.value)} />
        {usedCategories.length > 0 && (
          <select value={category} onChange={(e) => set("category", e.target.value)} className="rounded-lg border-0 px-3 py-2.5 text-sm ring-1 ring-slate-300 ring-inset">
            <option value="">ทุกหมวดหมู่</option>
            {usedCategories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        )}
      </div>

      {usedBrands.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="เลือกแบรนด์">
          <Chip active={!brand} onClick={() => set("brand", "")}>ทุกแบรนด์</Chip>
          {usedBrands.map((b) => (
            <Chip key={b.id} active={brand === b.slug} onClick={() => set("brand", brand === b.slug ? "" : b.slug)}>
              {b.logo_url && <img src={b.logo_url} alt="" className="h-4 w-auto" />}
              {b.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-8">
        {products.loading ? (
          <Loading />
        ) : visible.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition",
        active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:ring-navy-600",
      )}
    >
      {children}
    </button>
  );
}
