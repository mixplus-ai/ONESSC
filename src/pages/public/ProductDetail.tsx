import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AddToList, NoImage, PriceTag, StockBadge, discountPct } from "../../components/catalog";
import { ExternalIcon, FileIcon, ShieldIcon, WrenchIcon } from "../../components/icons";
import { Alert, Loading } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatDateTime, productImage, usePricing, type PriceInfo, type Product, type Spec, fmtWarrantyPair } from "../../lib/catalog";
import { supabase, supabaseConfigured } from "../../lib/supabase";
import { PRODUCT_SELECT } from "./Products";

const TRUST = [
  { icon: ShieldIcon, label: "สินค้าแท้จากตัวแทนจำหน่าย" },
  { icon: FileIcon, label: "ขอใบเสนอราคาออนไลน์" },
  { icon: WrenchIcon, label: "แจ้งเคลมและติดตามในระบบ" },
];

export default function ProductDetail() {
  const { slug } = useParams();
  const { session, profile } = useAuth();
  const [p, setP] = useState<Product | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [img, setImg] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return;
    setLoading(true);
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("slug", slug ?? "")
      .maybeSingle()
      .then(({ data }) => {
        const prod = data as Product | null;
        if (prod) prod.product_variants = (prod.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku));
        setP(prod);
        setImg(prod ? productImage(prod) : "");
        setLoading(false);
      });
  }, [slug]);

  const variants = useMemo(() => p?.product_variants ?? [], [p]);
  const { price, stock } = usePricing(variants);
  const [slide, setSlide] = useState(0);

  if (loading) return <Loading />;
  if (!p)
    return (
      <div className="container-x py-20 text-center">
        <p className="text-slate-500">ไม่พบสินค้านี้</p>
        <Link to="/products" className="mt-4 inline-block font-semibold text-navy-700 hover:underline">กลับไปหน้าสินค้า</Link>
      </div>
    );

  const gallery = [p.cover_url, ...p.images].filter(Boolean) as string[];
  const single = variants.length === 1 ? variants[0] : null;
  const prices = variants.map((v) => price(v)).filter((x) => x.price != null);
  const lowest: PriceInfo | null = prices.length ? prices.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a)) : variants.length ? { price: null, base: null, kind: "ask" } : null;
  const off = discountPct(lowest);
  const synced = variants.map((v) => stock.get(v.sku)?.synced_at).find(Boolean);

  return (
    <div className="container-x py-4 sm:py-10">
      <nav className="mb-4 hidden text-sm sm:block text-slate-500" aria-label="breadcrumb">
        <Link to="/products" className="hover:text-navy-700">สินค้า</Link>
        {p.brands && <> / <Link to={`/products?brand=${p.brands.slug}`} className="hover:text-navy-700">{p.brands.name}</Link></>}
        {" / "}<span className="text-slate-700">{p.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          {/* phones: swipeable photos with dots */}
          <div className="relative -mx-4 sm:mx-0 lg:hidden">
            <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto bg-gradient-to-b from-slate-50 to-slate-100 sm:rounded-2xl" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
              {(gallery.length ? gallery : [""]).map((g, i) => (
                <div key={g + i} className="grid aspect-square w-full shrink-0 snap-center place-items-center">
                  {g ? <img src={g} alt={i ? "" : p.name} className="h-full w-full object-contain p-6" /> : <NoImage brand={p.brands} big />}
                </div>
              ))}
            </div>
            {off > 0 && <span className="absolute top-3 left-4 rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white">ลด {off}%</span>}
            {gallery.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {gallery.map((g, i) => <span key={g + i} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-navy-700" : "w-1.5 bg-navy-300"}`} />)}
              </div>
            )}
          </div>
          <div className="hidden lg:block">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              {img ? <img src={img} alt={p.name} className="h-full w-full object-contain p-6" /> : <NoImage brand={p.brands} big />}
            </div>
            {gallery.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {gallery.map((g) => (
                  <button key={g} onClick={() => setImg(g)} className={`h-16 w-16 overflow-hidden rounded-lg bg-white ring-2 ${g === img ? "ring-navy-600" : "ring-slate-200"}`}>
                    <img src={g} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold tracking-wide text-sun-600">{p.brands?.name}{p.product_categories && ` · ${p.product_categories.name}`}</p>
          <h1 className="mt-1 text-3xl font-bold text-navy-900">{p.name}</h1>
          {p.summary && <p className="mt-3 text-slate-600">{p.summary}</p>}
          {p.warranty_months || p.perf_warranty_months ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">รับประกัน {fmtWarrantyPair(p.warranty_months, p.perf_warranty_months)}</p> : null}
          {p.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{t}</span>)}</div>
          )}

          {lowest && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {variants.length > 1 && lowest.kind !== "ask" && <span className="text-sm text-slate-500">เริ่ม</span>}
              <PriceTag info={lowest} size="lg" />
              {single && <StockBadge info={stock.get(single.sku)} />}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            {TRUST.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl bg-navy-50/60 px-2 py-3 text-center text-[11px] leading-tight font-medium text-navy-800 ring-1 ring-navy-100 sm:text-xs">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy-600 ring-1 ring-navy-100"><Icon className="h-5 w-5" /></span>
                {label}
              </div>
            ))}
          </div>

          {!session && (
            <div className="mt-5"><Alert tone="navy">ราคาที่แสดงเป็นราคาปกติ <Link to="/login" state={{ from: `/products/${p.slug}` }} className="font-semibold underline">เข้าสู่ระบบ</Link> เพื่อดูราคาเฉพาะบริษัทและจำนวนคงเหลือ</Alert></div>
          )}
          {session && profile && profile.role === "user" && profile.company_status !== "approved" && (
            <div className="mt-5"><Alert tone="amber">ผูกบัญชีกับบริษัท (เลขผู้เสียภาษี) ใน <Link to="/app/profile" className="font-semibold underline">ข้อมูลส่วนตัว</Link> เพื่อดูราคาเฉพาะบริษัท</Alert></div>
          )}

          <div className="mt-6 scroll-mt-24 space-y-3" id="variants">
            <h2 className="text-sm font-semibold text-slate-700">{variants.length > 1 ? `เลือกรุ่น (${variants.length} รหัส)` : "รหัสสินค้า"}</h2>
            {variants.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรหัสสินค้าที่เปิดขาย สอบถามเซลล์ได้ทาง LINE</p>}
            {variants.map((v) => (
              <div key={v.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{v.name !== v.sku ? v.name : p.name}</p>
                    <p className="font-mono text-xs text-slate-500">{v.sku}</p>
                    {v.detail && <p className="mt-1 text-sm text-slate-600">{v.detail}</p>}
                  </div>
                  <StockBadge info={stock.get(v.sku)} />
                </div>
                {v.specs.length > 0 && <SpecTable specs={v.specs} className="mt-3" />}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <PriceTag info={price(v)} unit={v.unit} />
                  <AddToList line={{ kind: "variant", id: v.id, label: p.name, sku: v.sku, detail: v.name !== v.sku ? v.name : v.detail ?? undefined, image: productImage(p), href: `/products/${p.slug}` }} />
                </div>
              </div>
            ))}
            {synced && <p className="text-xs text-slate-400">สต๊อกอัปเดตล่าสุด {formatDateTime(synced)}</p>}
          </div>

          {(p.datasheet_url || p.manual_url || p.video_url) && (
            <div className="mt-6 flex flex-wrap gap-2">
              {p.datasheet_url && <DocLink href={p.datasheet_url}>Datasheet</DocLink>}
              {p.manual_url && <DocLink href={p.manual_url}>คู่มือ</DocLink>}
              {p.video_url && <DocLink href={p.video_url}>วิดีโอ</DocLink>}
            </div>
          )}
        </div>
      </div>

      {(p.description || p.specs.length > 0) && (
        <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-2 lg:gap-8">
          {p.description && (
            <details open className="group rounded-2xl bg-white p-4 ring-1 ring-slate-200 lg:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold text-navy-900">รายละเอียดสินค้า<span className="text-slate-400 transition group-open:rotate-180">⌄</span></summary>
              <p className="mt-3 whitespace-pre-line text-slate-700">{p.description}</p>
            </details>
          )}
          {p.specs.length > 0 && (
            <details open className="group rounded-2xl bg-white p-4 ring-1 ring-slate-200 lg:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold text-navy-900">สเปก<span className="text-slate-400 transition group-open:rotate-180">⌄</span></summary>
              <SpecTable specs={p.specs} className="mt-3" />
            </details>
          )}
        </div>
      )}

      {/* phones: sticky action bar (the bottom tab bar steps aside on this page) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {single ? (
          <AddToList big line={{ kind: "variant", id: single.id, label: p.name, sku: single.sku, detail: single.name !== single.sku ? single.name : single.detail ?? undefined, image: productImage(p), href: `/products/${p.slug}` }} />
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">{lowest && <PriceTag info={lowest} size="sm" />}</div>
            <a href="#variants" className="rounded-xl bg-navy-700 px-6 py-3 text-sm font-semibold text-white">เลือกรุ่น ({variants.length})</a>
          </div>
        )}
      </div>
    </div>
  );
}

function SpecTable({ specs, className }: { specs: Spec[]; className?: string }) {
  return (
    <dl className={`divide-y divide-slate-100 overflow-hidden rounded-lg bg-white text-sm ring-1 ring-slate-200 ${className ?? ""}`}>
      {specs.map((s, i) => (
        <div key={i} className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2">
          <dt className="text-slate-500">{s.label}</dt>
          <dd className="text-slate-800">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-navy-700 ring-1 ring-slate-300 hover:bg-slate-50">
      {children} <ExternalIcon className="h-4 w-4" />
    </a>
  );
}
