import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatBaht, formatQty, productImage, STOCK_LABEL, type PriceInfo, type Product, type StockInfo } from "../lib/catalog";
import { useCart, type CartLine } from "../lib/cart";
import { BoxIcon, CartIcon } from "./icons";
import { Badge, cx } from "./ui";

export function PriceTag({ info, unit, size = "md" }: { info: PriceInfo; unit?: string; size?: "sm" | "md" | "lg" }) {
  const big = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";
  if (info.kind === "ask") return <span className={cx("font-semibold text-slate-500", size === "sm" ? "text-sm" : "text-base")}>สอบถามราคา</span>;
  const showBase = info.base != null && info.price != null && info.price < info.base;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={cx("font-bold", big, info.kind === "promo" ? "text-red-600" : "text-navy-900")}>{formatBaht(info.price)}</span>
      {unit && <span className="text-xs text-slate-500">/{unit}</span>}
      {showBase && <span className="text-sm text-slate-400 line-through">{formatBaht(info.base)}</span>}
      {info.kind === "promo" && <Badge tone="red">โปรโมชั่น</Badge>}
      {info.kind === "company" && <Badge tone="navy">ราคาบริษัทคุณ</Badge>}
    </span>
  );
}

export function StockBadge({ info }: { info?: StockInfo }) {
  if (!info) return <Badge>กำลังโหลดสต๊อก</Badge>;
  const s = STOCK_LABEL[info.status];
  return (
    <Badge tone={s.tone}>
      {s.label}
      {info.available != null && info.status !== "unknown" && ` · ${formatQty(info.available)}`}
    </Badge>
  );
}

/** Discount in % when a promo/company price is below the base price. */
export const discountPct = (info?: PriceInfo | null) =>
  info && info.price != null && info.base != null && info.price < info.base ? Math.round((1 - info.price / info.base) * 100) : 0;

export function ProductCard({ p, price, stockSummary }: { p: Product; price?: PriceInfo | null; stockSummary?: StockInfo }) {
  const img = productImage(p);
  const alt = (p.images ?? []).find((u) => u && u !== img);
  const vs = p.product_variants ?? [];
  const n = vs.length;
  const off = discountPct(price);
  const href = `/products/${p.slug}`;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="absolute top-2 left-2 z-10 flex flex-wrap items-start gap-1 pr-2">
        {off > 0 && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">ลด {off}%</span>}
        {p.is_featured && <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">แนะนำ</span>}
      </div>
      <Link to={href} className="grid aspect-square place-items-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 sm:aspect-[4/3]">
        {img ? (
          <span className="relative h-full w-full">
            <img src={img} alt="" loading="lazy" className={cx("absolute inset-0 h-full w-full object-contain p-3 transition duration-300 group-hover:scale-105", alt && "lg:group-hover:opacity-0")} />
            {alt && <img src={alt} alt="" loading="lazy" className="absolute inset-0 hidden h-full w-full object-contain p-3 opacity-0 transition duration-300 group-hover:scale-105 lg:block lg:group-hover:opacity-100" />}
          </span>
        ) : <BoxIcon className="h-10 w-10 text-slate-300" />}
      </Link>
      <div className="flex flex-1 flex-col gap-0.5 p-3 sm:gap-1 sm:p-4">
        <p className="truncate text-[11px] font-semibold tracking-wide text-sun-600 sm:text-xs">{p.brands?.name ?? ""}{p.product_categories ? ` · ${p.product_categories.name}` : ""}</p>
        <Link to={href} className="line-clamp-2 text-sm font-semibold text-navy-900 hover:underline sm:text-base">{p.name}</Link>
        {p.summary && <p className="line-clamp-1 text-xs text-slate-500 sm:line-clamp-2 sm:text-sm">{p.summary}</p>}
        <div className="mt-auto pt-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            {price ? (
              <span className="text-sm">
                {n > 1 && price.kind !== "ask" && <span className="mr-1 text-xs text-slate-500">เริ่ม</span>}
                <PriceTag info={price} size="sm" />
              </span>
            ) : <span />}
            {n > 1 && <span className="text-[11px] text-slate-500">{n} รุ่น</span>}
          </div>
          {stockSummary && n <= 1 && <div className="mt-1"><StockBadge info={stockSummary} /></div>}
          {n === 1 ? (
            <QuickAdd line={{ kind: "variant", id: vs[0].id, label: p.name, sku: vs[0].sku, detail: vs[0].name !== vs[0].sku ? vs[0].name : vs[0].detail ?? undefined, image: img, href }} />
          ) : (
            <Link to={href} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-navy-50 py-2 text-xs font-semibold text-navy-800 ring-1 ring-navy-100 hover:bg-navy-100 sm:text-sm">
              {n ? "เลือกรุ่น" : "ดูรายละเอียด"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** One-tap "ใส่ตะกร้า" for cards (qty 1). */
export function QuickAdd({ line }: { line: Omit<CartLine, "qty"> }) {
  const { add } = useCart();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        add({ ...line, qty: 1 });
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={cx("mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition sm:text-sm", done ? "bg-emerald-600 text-white" : "bg-navy-700 text-white hover:bg-navy-600")}
    >
      {done ? "เพิ่มแล้ว ✓" : <><CartIcon className="h-4 w-4" /> ใส่ตะกร้า</>}
    </button>
  );
}

export function QtyInput({ value, onChange, max }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-lg ring-1 ring-slate-300">
      <button type="button" className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50" onClick={() => onChange(Math.max(1, value - 1))} aria-label="ลดจำนวน">−</button>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        className="w-14 border-0 bg-transparent p-1 text-center text-sm focus:ring-0"
        aria-label="จำนวน"
      />
      <button type="button" className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50" onClick={() => onChange(value + 1)} aria-label="เพิ่มจำนวน">+</button>
    </div>
  );
}

/** Qty + "เพิ่มในรายการ" button. Lines are later sent as a quote request or a reservation. */
export function AddToList({ line, compact, big }: { line: Omit<CartLine, "qty">; compact?: boolean; big?: boolean }) {
  const { add } = useCart();
  const { session } = useAuth();
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
  if (big)
    return (
      <div className="flex items-center gap-3">
        <QtyInput value={qty} onChange={setQty} />
        <button
          type="button"
          onClick={() => {
            add({ ...line, qty });
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          }}
          className={cx("flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition", done ? "bg-emerald-600" : "bg-navy-700 hover:bg-navy-600")}
        >
          {done ? "เพิ่มแล้ว ✓" : <><CartIcon className="h-5 w-5" /> ใส่ตะกร้า</>}
        </button>
        {done && <Link to={session ? "/app/cart" : "/login"} state={session ? undefined : { from: "/app/cart" }} className="text-sm font-semibold text-navy-700">ดูตะกร้า</Link>}
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QtyInput value={qty} onChange={setQty} />
      <button
        type="button"
        onClick={() => {
          add({ ...line, qty });
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }}
        className={cx(
          "rounded-lg px-3 py-2 text-sm font-semibold transition",
          done ? "bg-emerald-600 text-white" : "bg-sun-500 text-navy-950 hover:bg-sun-400",
        )}
      >
        {done ? "เพิ่มแล้ว ✓" : compact ? "เพิ่ม" : "เพิ่มในรายการ"}
      </button>
      {done && (
        <Link to={session ? "/app/cart" : "/login"} state={session ? undefined : { from: "/app/cart" }} className="text-sm font-semibold text-navy-700 hover:underline">
          ดูรายการ
        </Link>
      )}
    </div>
  );
}
