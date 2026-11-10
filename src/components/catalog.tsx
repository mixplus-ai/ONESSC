import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatBaht, formatQty, productImage, STOCK_LABEL, type PriceInfo, type Product, type StockInfo } from "../lib/catalog";
import { useCart, type CartLine } from "../lib/cart";
import { BoxIcon } from "./icons";
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

export function ProductCard({ p, price, stockSummary }: { p: Product; price?: PriceInfo | null; stockSummary?: StockInfo }) {
  const img = productImage(p);
  const n = p.product_variants?.length ?? 0;
  return (
    <Link to={`/products/${p.slug}`} className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-slate-100">
        {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-contain p-3 transition group-hover:scale-105" /> : <BoxIcon className="h-10 w-10 text-slate-300" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-semibold tracking-wide text-sun-600">{p.brands?.name ?? ""}{p.product_categories ? ` · ${p.product_categories.name}` : ""}</p>
        <h3 className="line-clamp-2 font-semibold text-navy-900">{p.name}</h3>
        {p.summary && <p className="line-clamp-2 text-sm text-slate-500">{p.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          {price ? (
            <span className="text-sm">
              {n > 1 && price.kind !== "ask" && <span className="mr-1 text-xs text-slate-500">เริ่ม</span>}
              <PriceTag info={price} size="sm" />
            </span>
          ) : (
            <span />
          )}
          {n > 1 && <span className="text-xs text-slate-500">{n} รุ่น</span>}
          {stockSummary && n <= 1 && <StockBadge info={stockSummary} />}
        </div>
      </div>
    </Link>
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
export function AddToList({ line, compact }: { line: Omit<CartLine, "qty">; compact?: boolean }) {
  const { add } = useCart();
  const { session } = useAuth();
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
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
