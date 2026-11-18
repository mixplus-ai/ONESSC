import { useMemo, useState } from "react";
import { Input } from "../../../../components/ui";

/** Search the product list by code or name and pick one (a list under the box, works the same on every browser). */
export function ProductSearch({ products, value, onChange, onPick, placeholder, className }: {
  products: { sku: string; description: string | null }[]; value: string; onChange: (v: string) => void; onPick: (sku: string) => void;
  placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? products.filter((p) => p.sku.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)) : products;
    return list.slice(0, 12);
  }, [products, value]);
  return (
    <div className={`relative ${className ?? ""}`}>
      <Input value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const exact = products.find((p) => p.sku === value.trim().toUpperCase()); onPick(exact?.sku ?? hits[0]?.sku ?? value.trim().toUpperCase()); setOpen(false); } }} />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-[20rem] overflow-y-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200">
          {hits.map((p) => (
            <li key={p.sku}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(p.sku); setOpen(false); }}
                className="flex w-full gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                <span className="font-mono font-semibold text-navy-900">{p.sku}</span>
                <span className="truncate text-slate-500">{p.description}</span>
              </button>
            </li>
          ))}
          {products.length > hits.length && <li className="px-3 py-1 text-xs text-slate-400">พิมพ์เพื่อค้นหาเพิ่ม ({products.length} รายการ)</li>}
        </ul>
      )}
    </div>
  );
}
