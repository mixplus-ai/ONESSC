import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** One line in the customer's list (ใช้ได้ทั้งขอใบเสนอราคาและจองสินค้า). */
export interface CartLine {
  kind: "variant" | "package";
  id: string;
  qty: number;
  label: string; // product name
  sku?: string;
  detail?: string;
  image?: string;
  href?: string;
}

interface CartState {
  lines: CartLine[];
  count: number;
  add: (line: CartLine) => void;
  setQty: (kind: CartLine["kind"], id: string, qty: number) => void;
  remove: (kind: CartLine["kind"], id: string) => void;
  clear: () => void;
}

const KEY = "onessc.cart.v1";
const CartContext = createContext<CartState | null>(null);

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && l.id && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* private mode: keep in memory only */
    }
  }, [lines]);

  const add = useCallback((line: CartLine) => {
    setLines((cur) => {
      const i = cur.findIndex((l) => l.kind === line.kind && l.id === line.id);
      if (i < 0) return [...cur, line];
      const next = [...cur];
      next[i] = { ...next[i], ...line, qty: next[i].qty + line.qty };
      return next;
    });
  }, []);
  const setQty = useCallback((kind: CartLine["kind"], id: string, qty: number) => {
    setLines((cur) => cur.map((l) => (l.kind === kind && l.id === id ? { ...l, qty: Math.max(1, qty) } : l)));
  }, []);
  const remove = useCallback((kind: CartLine["kind"], id: string) => {
    setLines((cur) => cur.filter((l) => !(l.kind === kind && l.id === id)));
  }, []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => ({ lines, count: lines.length, add, setQty, remove, clear }), [lines, add, setQty, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
