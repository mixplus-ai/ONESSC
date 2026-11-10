import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AddToList, PriceTag, StockBadge } from "../../components/catalog";
import { BoxIcon, ExternalIcon } from "../../components/icons";
import { Alert, Loading } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatDateTime, productImage, usePricing, type Product, type Spec } from "../../lib/catalog";
import { supabase, supabaseConfigured } from "../../lib/supabase";
import { PRODUCT_SELECT } from "./Products";

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

  if (loading) return <Loading />;
  if (!p)
    return (
      <div className="container-x py-20 text-center">
        <p className="text-slate-500">ไม่พบสินค้านี้</p>
        <Link to="/products" className="mt-4 inline-block font-semibold text-navy-700 hover:underline">กลับไปหน้าสินค้า</Link>
      </div>
    );

  const gallery = [p.cover_url, ...p.images].filter(Boolean) as string[];
  const synced = variants.map((v) => stock.get(v.sku)?.synced_at).find(Boolean);

  return (
    <div className="container-x py-10">
      <nav className="mb-6 text-sm text-slate-500" aria-label="breadcrumb">
        <Link to="/products" className="hover:text-navy-700">สินค้า</Link>
        {p.brands && <> / <Link to={`/products?brand=${p.brands.slug}`} className="hover:text-navy-700">{p.brands.name}</Link></>}
        {" / "}<span className="text-slate-700">{p.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {img ? <img src={img} alt={p.name} className="h-full w-full object-contain p-6" /> : <BoxIcon className="h-16 w-16 text-slate-300" />}
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

        <div>
          <p className="text-sm font-semibold tracking-wide text-sun-600">{p.brands?.name}{p.product_categories && ` · ${p.product_categories.name}`}</p>
          <h1 className="mt-1 text-3xl font-bold text-navy-900">{p.name}</h1>
          {p.summary && <p className="mt-3 text-slate-600">{p.summary}</p>}
          {p.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{t}</span>)}</div>
          )}

          {!session && (
            <div className="mt-5"><Alert tone="navy">ราคาที่แสดงเป็นราคาปกติ <Link to="/login" state={{ from: `/products/${p.slug}` }} className="font-semibold underline">เข้าสู่ระบบ</Link> เพื่อดูราคาเฉพาะบริษัทและจำนวนคงเหลือ</Alert></div>
          )}
          {session && profile && profile.role === "user" && profile.company_status !== "approved" && (
            <div className="mt-5"><Alert tone="amber">ผูกบัญชีกับบริษัท (เลขผู้เสียภาษี) ใน <Link to="/app/profile" className="font-semibold underline">ข้อมูลส่วนตัว</Link> เพื่อดูราคาเฉพาะบริษัท</Alert></div>
          )}

          <div className="mt-6 space-y-3">
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
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {p.description && (
            <section>
              <h2 className="text-xl font-bold text-navy-900">รายละเอียด</h2>
              <p className="mt-3 whitespace-pre-line text-slate-700">{p.description}</p>
            </section>
          )}
          {p.specs.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-navy-900">สเปก</h2>
              <SpecTable specs={p.specs} className="mt-3" />
            </section>
          )}
        </div>
      )}
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
