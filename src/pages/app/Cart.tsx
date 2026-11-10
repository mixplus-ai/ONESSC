import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PriceTag, QtyInput, StockBadge } from "../../components/catalog";
import { BoxIcon, XIcon } from "../../components/icons";
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
      <PageTitle title="รายการสินค้าของฉัน" subtitle="ส่งเป็นคำขอใบเสนอราคา หรือจองสินค้าจากสต๊อกที่มีอยู่" actions={<Link to="/products" className="text-sm font-semibold text-navy-700 hover:underline">+ เลือกสินค้าเพิ่ม</Link>} />
      {!lines.length ? (
        <Empty>
          ยังไม่มีสินค้าในรายการ <Link to="/products" className="font-semibold text-navy-700 underline">ไปเลือกสินค้า</Link>
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card className="!p-0">
            <ul className="divide-y divide-slate-100">
              {lines.map((l) => (
                <li key={l.kind + l.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                    {l.image ? <img src={l.image} alt="" className="h-full w-full object-contain p-1" /> : <BoxIcon className="text-slate-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {l.href ? <Link to={l.href} className="font-semibold text-navy-900 hover:underline">{l.label}</Link> : <p className="font-semibold text-navy-900">{l.label}</p>}
                    {l.sku && <p className="font-mono text-xs text-slate-500">{l.sku}{l.detail && ` · ${l.detail}`}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {l.kind === "variant" && <PriceTag size="sm" info={price({ id: l.id, base_price: basePrices.get(l.id) ?? null })} />}
                      {l.kind === "variant" && l.sku && <StockBadge info={stock.get(l.sku)} />}
                      {l.kind === "package" && <span className="text-xs text-slate-500">แพ็กเกจ (ขอใบเสนอราคาเท่านั้น)</span>}
                    </div>
                  </div>
                  <QtyInput value={l.qty} onChange={(n) => setQty(l.kind, l.id, n)} />
                  <button onClick={() => remove(l.kind, l.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="ลบออกจากรายการ">
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

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
            {err && <Alert>{err}</Alert>}
            <Button className="w-full" onClick={() => submit("quote")} loading={busy === "quote"} disabled={!!busy}>ขอใบเสนอราคา</Button>
            <Button className="w-full" variant="sun" onClick={() => submit("reserve")} loading={busy === "reserve"} disabled={!!busy || !variantLines.length}>
              จองสินค้าจากสต๊อก
            </Button>
            <p className="text-xs text-slate-500">
              การจองจะกันสินค้าไว้ให้ชั่วคราวจนกว่าเจ้าหน้าที่ยืนยันและบันทึกเข้าระบบสต๊อก{hasPackage && " (แพ็กเกจจองไม่ได้ จะคงอยู่ในรายการ)"}
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
