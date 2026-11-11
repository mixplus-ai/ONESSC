import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdSlot, PageBanner } from "../../components/banners";
import { AddToList, PackagePrice, PriceTag, StockBadge } from "../../components/catalog";
import { BoxIcon } from "../../components/icons";
import { Empty, Loading } from "../../components/ui";
import { formatDate, formatQty, packageFullPrice, productImage, usePricing, type Package, type Product, type Promotion, type Variant } from "../../lib/catalog";
import { useRows } from "../../lib/content";
import { supabase, supabaseConfigured } from "../../lib/supabase";

type VariantWithProduct = Variant & { products: Pick<Product, "id" | "name" | "slug" | "cover_url" | "images"> };
const VARIANT_SELECT = "*, products!inner(id, name, slug, cover_url, images, is_published)";

function period(x: { starts_at: string | null; ends_at: string | null }) {
  if (!x.starts_at && !x.ends_at) return null;
  if (!x.ends_at) return `ตั้งแต่ ${formatDate(x.starts_at)}`;
  return `${x.starts_at ? formatDate(x.starts_at) + " – " : "ถึง "}${formatDate(x.ends_at)}`;
}

export default function Promotions() {
  const promos = useRows<Promotion>(() => supabase.from("promotions").select("*, promotion_items(variant_id, promo_price)").eq("is_published", true).order("sort").order("created_at", { ascending: false }));
  const packages = useRows<Package>(() => supabase.from("packages").select("*, package_items(variant_id, qty, sort, product_variants(base_price, show_price))").eq("is_published", true).order("sort").order("name"));
  const variantIds = useMemo(() => [...new Set(promos.rows.flatMap((p) => (p.promotion_items ?? []).map((i) => i.variant_id)))], [promos.rows]);
  const variants = useRows<VariantWithProduct>(
    () => (variantIds.length ? supabase.from("product_variants").select(VARIANT_SELECT).in("id", variantIds) : Promise.resolve({ data: [], error: null })),
    [variantIds.join(",")],
  );
  const byId = useMemo(() => new Map(variants.rows.map((v) => [v.id, v])), [variants.rows]);
  const { price, stock } = usePricing(variants.rows);

  return (
    <>
      <PageBanner page="promotions" />
      <AdSlot placement="promotions" className="mt-6" />
      <div className="container-x pt-2 pb-10">

      {promos.loading ? (
        <Loading />
      ) : (
        <div className="mt-8 space-y-10">
          {promos.rows.map((pr) => (
            <section key={pr.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              {pr.banner_url && <img src={pr.banner_url} alt="" className="max-h-72 w-full object-cover" />}
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold text-navy-900">{pr.title}</h2>
                  {period(pr) && <span className="text-sm font-medium text-red-600">{period(pr)}</span>}
                </div>
                {pr.description && <p className="mt-2 whitespace-pre-line text-slate-600">{pr.description}</p>}
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {(pr.promotion_items ?? []).map((it) => {
                    const v = byId.get(it.variant_id);
                    if (!v) return null;
                    return (
                      <div key={it.variant_id} className="flex gap-3 rounded-xl p-3 ring-1 ring-slate-200">
                        <Link to={`/products/${v.products.slug}`} className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                          {productImage(v.products) ? <img src={productImage(v.products)} alt="" className="h-full w-full object-contain p-1" /> : <BoxIcon className="text-slate-300" />}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link to={`/products/${v.products.slug}`} className="font-semibold text-navy-900 hover:underline">{v.products.name}</Link>
                          <p className="font-mono text-xs text-slate-500">{v.sku}{v.name !== v.sku && ` · ${v.name}`}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <PriceTag info={price(v)} size="sm" unit={v.unit} />
                            <StockBadge info={stock.get(v.sku)} />
                          </div>
                          <div className="mt-2">
                            <AddToList compact line={{ kind: "variant", id: v.id, label: v.products.name, sku: v.sku, detail: v.name !== v.sku ? v.name : undefined, image: productImage(v.products), href: `/products/${v.products.slug}` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}

          <section>
            <h2 className="text-2xl font-bold text-navy-900">แพ็กเกจ</h2>
            {packages.loading ? (
              <Loading />
            ) : packages.rows.length ? (
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {packages.rows.map((pk) => (
                  <Link key={pk.id} to={`/packages/${pk.slug}`} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:shadow-md">
                    <div className="grid aspect-[16/9] place-items-center bg-slate-100">
                      {pk.cover_url ? <img src={pk.cover_url} alt="" className="h-full w-full object-cover" /> : <BoxIcon className="h-10 w-10 text-slate-300" />}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      {pk.code && <p className="font-mono text-xs text-slate-500">{pk.code}</p>}
                      <h3 className="font-semibold text-navy-900">{pk.name}</h3>
                      {pk.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{pk.summary}</p>}
                      <div className="mt-auto pt-3">
                        <PackagePrice price={pk.price} full={packageFullPrice((pk.package_items ?? []).map((i) => ({ qty: i.qty, base_price: i.product_variants?.base_price, show_price: i.product_variants?.show_price })))} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4"><Empty>ยังไม่มีแพ็กเกจในขณะนี้</Empty></div>
            )}
          </section>

          {!promos.rows.length && <Empty>ยังไม่มีโปรโมชั่นในขณะนี้ ติดตามข่าวสารได้ทาง LINE</Empty>}
        </div>
      )}
    </div>
    </>
  );
}

export function PackageDetail() {
  const { slug } = useParams();
  const [pk, setPk] = useState<Package | null>(null);
  const [items, setItems] = useState<(VariantWithProduct & { qty: number })[]>([]);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      const { data } = await supabase.from("packages").select("*, package_items(variant_id, qty, sort)").eq("slug", slug ?? "").maybeSingle();
      const p = data as Package | null;
      setPk(p);
      const ids = (p?.package_items ?? []).map((i) => i.variant_id);
      if (ids.length) {
        const { data: vs } = await supabase.from("product_variants").select(VARIANT_SELECT).in("id", ids);
        const m = new Map(((vs ?? []) as VariantWithProduct[]).map((v) => [v.id, v]));
        setItems(
          [...(p?.package_items ?? [])]
            .sort((a, b) => a.sort - b.sort)
            .flatMap((i) => (m.get(i.variant_id) ? [{ ...(m.get(i.variant_id) as VariantWithProduct), qty: Number(i.qty) }] : [])),
        );
      }
      setLoading(false);
    })();
  }, [slug]);

  const { stock } = usePricing(items);
  // full price of the items bought one by one, to show the saving (only when every item has a price)
  const sumBase = packageFullPrice(items);

  if (loading) return <Loading />;
  if (!pk) return <div className="container-x py-20 text-center text-slate-500">ไม่พบแพ็กเกจนี้</div>;
  return (
    <div className="container-x py-10">
      <nav className="mb-6 text-sm text-slate-500"><Link to="/promotions" className="hover:text-navy-700">โปรโมชั่นและแพ็กเกจ</Link> / <span className="text-slate-700">{pk.name}</span></nav>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {pk.cover_url ? <img src={pk.cover_url} alt={pk.name} className="h-full w-full object-cover" /> : <BoxIcon className="h-16 w-16 text-slate-300" />}
        </div>
        <div>
          {pk.code && <p className="font-mono text-sm text-slate-500">รหัส {pk.code}</p>}
          <h1 className="text-3xl font-bold text-navy-900">{pk.name}</h1>
          {period(pk) && <p className="mt-1 text-sm font-medium text-red-600">{period(pk)}</p>}
          {pk.summary && <p className="mt-3 text-slate-600">{pk.summary}</p>}
          <div className="mt-4"><PackagePrice price={pk.price} full={sumBase} size="lg" /></div>
          <p className="mt-1 text-sm text-slate-500">ราคาเดียวทั้งชุด</p>
          <div className="mt-4">
            <AddToList line={{ kind: "package", id: pk.id, label: `แพ็กเกจ ${pk.name}`, sku: pk.code ?? undefined, image: pk.cover_url ?? undefined, href: `/packages/${pk.slug}` }} />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-slate-700">ในแพ็กเกจประกอบด้วย</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {items.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link to={`/products/${v.products.slug}`} className="font-medium text-navy-900 hover:underline">{v.products.name}</Link>
                  <p className="font-mono text-xs text-slate-500">{v.sku}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StockBadge info={stock.get(v.sku)} />
                  <span className="font-semibold">× {formatQty(v.qty)} {v.unit}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {pk.description && <p className="mt-10 whitespace-pre-line text-slate-700">{pk.description}</p>}
    </div>
  );
}
