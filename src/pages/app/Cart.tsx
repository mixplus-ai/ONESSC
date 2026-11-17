import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FitBadge, PriceTag, QtyInput, RankBadge, StockAsOfNote, discountPct } from "../../components/catalog";
import { BoxIcon, CartIcon, TrashIcon } from "../../components/icons";
import { Alert, Button, Card, Empty, Field, Input, PageTitle, Textarea } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { FIT_LABEL, formatBaht, loadStockFit, stockAsOf, usePricing, useMyRank, type StockFit } from "../../lib/catalog";
import { mySalesContact, printShopDoc } from "../../lib/shopdocs";
import { preparePrintWindow } from "../../lib/printdoc";
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
  type PriceRow = { id: string; base_price: number | null; show_price?: boolean; special_price?: number | null; special_ends_at?: string | null };
  const [basePrices, setBasePrices] = useState<Map<string, PriceRow>>(new Map());
  const { price } = usePricing(variants);
  const rank = useMyRank();
  // quantity-aware stock status per line (มีสินค้า / มีสินค้าบางส่วน / ไม่มีสินค้า); customers never get the number
  const fitKey = variantLines.map((l) => `${l.sku}:${l.qty}`).join(",");
  const [fits, setFits] = useState<Map<string, { fit: StockFit; synced_at: string | null }>>(new Map());
  useEffect(() => {
    const items = variantLines.filter((l) => l.sku).map((l) => ({ sku: l.sku as string, qty: l.qty }));
    let alive = true;
    const t = setTimeout(() => loadStockFit(items).then((m) => alive && setFits(m)), 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  const fitOf = (l: (typeof lines)[number]) => (l.sku ? fits.get(l.sku)?.fit : undefined);
  const asOf = stockAsOf(fits.values());

  // base prices for the price tag (the cart only stores ids)
  useEffect(() => {
    if (!variants.length) return;
    supabase
      .from("product_variants")
      .select("*")
      .in("id", variants.map((v) => v.id))
      .then(({ data }) => setBasePrices(new Map(((data ?? []) as PriceRow[]).map((r) => [r.id, r]))));
  }, [variants]);

  const total = variantLines.reduce((sum, l) => {
    const p = price(basePrices.get(l.id) ?? { id: l.id, base_price: null }).price;
    return p == null ? sum : sum + p * l.qty;
  }, 0);
  const hasPackage = lines.some((l) => l.kind === "package");
  // not enough stock for the asked quantity → cannot be held from stock, goes through a quote instead
  const noStock = (l: (typeof lines)[number]) => { const f = fitOf(l); return f === "none" || f === "partial" || f === "unknown"; };
  const reservable = variantLines.filter((l) => !noStock(l));
  const waiting = variantLines.length - reservable.length;
  const partial = variantLines.filter((l) => fitOf(l) === "partial").length;

  async function exportPdf() {
    const w = preparePrintWindow();
    if (!w) return;
    const sales = await mySalesContact().catch(() => null);
    await printShopDoc(
      {
        kind: "cart",
        lines: lines.map((l) => ({
          variant_id: l.kind === "variant" ? l.id : null,
          sku: l.sku,
          label: l.kind === "package" ? `แพ็กเกจ · ${l.label}` : l.label,
          qty: l.qty,
          unit_price: l.kind === "variant" ? price(basePrices.get(l.id) ?? { id: l.id, base_price: null }).price : null,
          status: l.kind === "variant" ? (fitOf(l) ? FIT_LABEL[fitOf(l) as StockFit].label : null) : "ขอใบเสนอราคา",
        })),
        customer: { name: contactName || profile?.full_name, email: profile?.email, phone: contactPhone || profile?.phone, company: profile?.company_name, taxId: profile?.tax_id },
        billing: profile?.billing ?? null,
        rank,
        note,
        stockAsOf: asOf,
        sales,
      },
      w,
    );
  }

  async function submit(kind: "quote" | "reserve") {
    setBusy(kind);
    setErr("");
    const items = (kind === "reserve" ? reservable : lines).map((l) => (l.kind === "variant" ? { variant_id: l.id, qty: l.qty } : { package_id: l.id, qty: l.qty }));
    const { data, error } =
      kind === "quote"
        ? await supabase.rpc("create_quote_request", { p_items: items, p_note: note, p_contact_name: contactName || null, p_contact_phone: contactPhone || null })
        : await supabase.rpc("create_reservation", { p_items: items, p_note: note });
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    if (kind === "reserve") reservable.forEach((l) => remove("variant", l.id));
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
              const info = l.kind === "variant" ? price(basePrices.get(l.id) ?? { id: l.id, base_price: null }) : null;
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
                      {l.kind === "variant" && l.sku && <FitBadge fit={fitOf(l)} />}
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
            {rank && <p className="flex items-center gap-2 text-sm text-slate-600">ราคาตาม Rank บริษัท <RankBadge rank={rank} /></p>}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">ยอดประมาณการ (สินค้ารายตัว)</span>
              <span className="text-xl font-bold text-navy-900">{formatBaht(total)}</span>
            </div>
            <p className="text-xs text-slate-500">ราคายังไม่รวม VAT และค่าขนส่ง ราคาสุดท้ายยืนยันในใบเสนอราคา</p>
            {variantLines.length > 0 && <StockAsOfNote at={asOf} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200" />}
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
            <Button className="w-full" variant="sun" onClick={() => submit("reserve")} loading={busy === "reserve"} disabled={!!busy || !reservable.length}>
              จองสินค้าจากสต๊อก{waiting > 0 && reservable.length > 0 ? ` (${reservable.length} รายการ)` : ""}
            </Button>
            <p className="text-xs text-slate-500">
              การจองจะกันสินค้าไว้ให้ชั่วคราวจนกว่าเจ้าหน้าที่ยืนยันและบันทึกเข้าระบบสต๊อก{hasPackage && " (แพ็กเกจจองไม่ได้ จะคงอยู่ในรายการ)"}
            </p>
            {waiting > 0 && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                {waiting} รายการมีสินค้าไม่พอ{partial > 0 ? ` (${partial} รายการมีสินค้าบางส่วน)` : ""} กด “ขอใบเสนอราคา” เพื่อสั่งจอง หรือลดจำนวนให้พอกับสต๊อกแล้วจอง เจ้าหน้าที่จะแจ้งราคาและวันที่ของเข้า
              </p>
            )}
            <Button variant="secondary" className="w-full" onClick={exportPdf}>ส่งออก PDF (ใบเสนอราคาเบื้องต้น)</Button>
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
