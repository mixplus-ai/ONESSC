import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PriceTag, QtyInput, StockBadge, discountPct } from "../../components/catalog";
import { BoxIcon, CartIcon, TrashIcon } from "../../components/icons";
import { Alert, Button, Card, Empty, Field, Input, PageTitle, Textarea } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatBaht, usePricing } from "../../lib/catalog";
import { useCart } from "../../lib/cart";
import { errorMessage, supabase } from "../../lib/supabase";

export default function Cart() {
  const { lines, setQty, remove, clear } = useCart();
  const { profile } = useAuth();
  const nav = useNavigate();
  const [note, setNote] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [busy, setBusy] = useState<"quote" | "reserve" | null>(null);
  const [err, setErr] = useState("");

  const variantLines = lines.filter((l) => l.kind === "variant");
  const idKey = variantLines.map((l) => l.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const variants = useMemo(() => variantLines.map((l) => ({ id: l.id, sku: l.sku ?? "" })), [idKey]);
  const [basePrices, setBasePrices] = useState<Map<string, number | null>>(new Map());
  const { price, stock } = usePricing(variants);

  // base prices for the price tag (the cart only stores ids)
  useEffect(() => {
    if (!variants.length) return;
    supabase
      .from("product_variants")
      .select("id, base_price")
      .in("id", variants.map((v) => v.id))
      .then(({ data }) => setBasePrices(new Map((data ?? []).map((r: { id: string; base_price: number | null }) => [r.id, r.base_price]))));
  }, [variants]);

  const total = variantLines.reduce((sum, l) => {
    const p = price({ id: l.id, base_price: basePrices.get(l.id) ?? null }).price;
    return p == null ? sum : sum + p * l.qty;
  }, 0);
  const hasPackage = lines.some((l) => l.kind === "package");

  async function submit(kind: "quote" | "reserve") {
    setBusy(kind);
    setErr("");
    const items = (kind === "reserve" ? variantLines : lines).map((l) => (l.kind === "variant" ? { variant_id: l.id, qty: l.qty } : { package_id: l.id, qty: l.qty }));
    const { data, error } =
      kind === "quote"
        ? await supabase.rpc("create_quote_request", { p_items: items, p_note: note, p_contact_name: contactName || null, p_contact_phone: contactPhone || null })
        : await supabase.rpc("create_reservation", { p_items: items, p_note: note });
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    if (kind === "reserve") variantLines.forEach((l) => remove("variant", l.id));
    else clear();
    nav("/app/requests", { state: { created: (data as { code: string }).code, kind } });
  }

  return (
    <>
      <div className="hidden lg:block">
        <PageTitle title="ตะกร้า" subtitle="ส่งเป็นคำขอใบเสนอราคา หรือจองสินค้าจากสต๊อกที่มีอยู่" actions={<Link to="/products" className="text-sm font-semibold text-navy-700 hover:underline">+ เลือกสินค้าเพิ่ม</Link>} />
      </div>
      <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-navy-50 to-sky-100 p-5 ring-1 ring-navy-100 lg:hidden">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-navy-700 shadow-sm"><CartIcon className="h-6 w-6" /></span>
          <div>
            <p className="text-lg font-bold text-navy-900">ตะกร้าของคุณ</p>
            <p className="text-sm text-slate-600">{lines.length} รายการ · <Link to="/products" className="font-semibold text-navy-700">+ เลือกสินค้าเพิ่ม</Link></p>
          </div>
        </div>
      </div>
      {!lines.length ? (
        <Empty>
          ยังไม่มีสินค้าในรายการ <Link to="/products" className="font-semibold text-navy-700 underline">ไปเลือกสินค้า</Link>
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-3">
            {lines.map((l) => {
              const info = l.kind === "variant" ? price({ id: l.id, base_price: basePrices.get(l.id) ?? null }) : null;
              const off = discountPct(info);
              return (
                <div key={l.kind + l.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:gap-4 sm:p-4">
                  <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-24">
                    {l.image ? <img src={l.image} alt="" className="h-full w-full object-contain p-1.5" /> : <BoxIcon className="text-slate-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {l.href ? <Link to={l.href} className="line-clamp-2 text-sm font-semibold text-navy-900 hover:underline sm:text-base">{l.label}</Link> : <p className="text-sm font-semibold text-navy-900 sm:text-base">{l.label}</p>}
                        {l.sku && <p className="truncate font-mono text-[11px] text-slate-500">{l.sku}{l.detail && ` · ${l.detail}`}</p>}
                      </div>
                      <button onClick={() => remove(l.kind, l.id)} className="-mt-1 -mr-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="ลบออกจากรายการ">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {info && <PriceTag size="sm" info={info} />}
                      {off > 0 && <span className="rounded-full px-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-300">ลด {off}%</span>}
                      {l.kind === "variant" && l.sku && <StockBadge info={stock.get(l.sku)} />}
                      {l.kind === "package" && <span className="text-xs text-slate-500">แพ็กเกจ (ขอใบเสนอราคาเท่านั้น)</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QtyInput value={l.qty} onChange={(n) => setQty(l.kind, l.id, n)} />
                      {info?.price != null && <span className="font-bold text-navy-900">{formatBaht(info.price * l.qty)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="h-fit space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">ยอดประมาณการ (สินค้ารายตัว)</span>
              <span className="text-xl font-bold text-navy-900">{formatBaht(total)}</span>
            </div>
            <p className="text-xs text-slate-500">ราคายังไม่รวม VAT และค่าขนส่ง ราคาสุดท้ายยืนยันในใบเสนอราคา</p>
            <Field label="รายละเอียดโครงการ / หมายเหตุ">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ขนาดระบบ สถานที่ติดตั้ง วันที่ต้องการรับของ" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อผู้ติดต่อ"><Input value={contactName} placeholder={profile?.full_name ?? ""} onChange={(e) => setContactName(e.target.value)} /></Field>
              <Field label="เบอร์โทร"><Input value={contactPhone} placeholder={profile?.phone ?? ""} onChange={(e) => setContactPhone(e.target.value)} /></Field>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
              {profile?.billing?.name ? (
                <>
                  <p>ออกใบเสนอราคา/ใบจองในนาม <span className="font-semibold text-navy-900">{profile.billing.name}</span>{profile.billing.tax_id ? ` (${profile.billing.tax_id})` : ""}</p>
                  <Link to="/app/profile" className="font-medium text-navy-700 underline">แก้ข้อมูลออกเอกสาร</Link>
                </>
              ) : (
                <p>ต้องการเอกสารในนามบริษัท? <Link to="/app/profile" className="font-medium text-navy-700 underline">กรอกข้อมูลออกใบเสร็จ/ใบกำกับภาษี</Link> ในข้อมูลส่วนตัวก่อนส่งคำขอ</p>
              )}
            </div>
            {err && <Alert>{err}</Alert>}
            <Button className="hidden w-full lg:flex" onClick={() => submit("quote")} loading={busy === "quote"} disabled={!!busy}>ขอใบเสนอราคา</Button>
            <Button className="w-full" variant="sun" onClick={() => submit("reserve")} loading={busy === "reserve"} disabled={!!busy || !variantLines.length}>
              จองสินค้าจากสต๊อก
            </Button>
            <p className="text-xs text-slate-500">
              การจองจะกันสินค้าไว้ให้ชั่วคราวจนกว่าเจ้าหน้าที่ยืนยันและบันทึกเข้าระบบสต๊อก{hasPackage && " (แพ็กเกจจองไม่ได้ จะคงอยู่ในรายการ)"}
            </p>
          </Card>
        </div>
      )}
      {lines.length > 0 && <div className="h-28 lg:hidden" aria-hidden />}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-slate-500">ยอดประมาณการ</span>
            <span className="text-lg font-bold text-navy-900">{formatBaht(total)}</span>
          </div>
          <Button className="w-full !rounded-xl !py-3" onClick={() => submit("quote")} loading={busy === "quote"} disabled={!!busy}>ขอใบเสนอราคา</Button>
        </div>
      )}
    </>
  );
}
