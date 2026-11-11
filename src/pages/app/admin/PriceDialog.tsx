import { useState } from "react";
import { Alert, Button, Field, Input, Modal } from "../../../components/ui";
import { formatBaht, type Product, type Variant } from "../../../lib/catalog";
import { errorMessage, supabase } from "../../../lib/supabase";

type Row = { id: string; sku: string; name: string; base: string; special: string };
const toLocalInput = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const round = (n: number) => Math.round(n * 100) / 100;

/** ราคาและส่วนลด of one product: show/hide price, normal price and ราคาพิเศษ (by amount or % off) per SKU, with an end date. */
export function PriceDialog({ product, onClose }: { product: Product; onClose: (saved: boolean) => void }) {
  const vs = (product.product_variants ?? []).slice().sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku));
  const [show, setShow] = useState(vs.every((v) => v.show_price !== false));
  const [rows, setRows] = useState<Row[]>(vs.map((v) => ({ id: v.id, sku: v.sku, name: v.name, base: v.base_price?.toString() ?? "", special: v.special_price?.toString() ?? "" })));
  const [ends, setEnds] = useState(toLocalInput(vs.find((v) => v.special_ends_at)?.special_ends_at));
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function applyPct() {
    const p = Number(pct);
    if (!(p > 0 && p < 100)) return setErr("ใส่ส่วนลดเป็น % ระหว่าง 1–99");
    setErr("");
    setRows((rs) => rs.map((r) => (num(r.base) != null ? { ...r, special: String(round((num(r.base) as number) * (1 - p / 100))) } : r)));
  }

  async function save(clearSpecial = false) {
    setBusy(true);
    setErr("");
    try {
      for (const r of rows) {
        const base = num(r.base);
        const special = clearSpecial ? null : num(r.special);
        if (special != null && base != null && special >= base) throw new Error(`${r.sku}: ราคาพิเศษต้องต่ำกว่าราคาปกติ`);
        const { error } = await supabase
          .from("product_variants")
          .update({
            show_price: show,
            base_price: base,
            special_price: special,
            special_ends_at: special != null && ends ? new Date(`${ends}T23:59:59`).toISOString() : null,
          } satisfies Partial<Variant>)
          .eq("id", r.id);
        if (error) throw new Error(`${r.sku}: ${errorMessage(error)}`);
      }
      onClose(true);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  const hasSpecial = rows.some((r) => r.special.trim() !== "");
  return (
    <Modal
      open
      wide
      onClose={() => onClose(false)}
      title={`ราคาและส่วนลด · ${product.name}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {hasSpecial && <Button variant="secondary" onClick={() => save(true)} disabled={busy}>ยกเลิกราคาพิเศษ</Button>}
          <Button onClick={() => save()} loading={busy}>บันทึก</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <input type="checkbox" className="mt-1" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>
            <span className="block text-sm font-semibold text-navy-900">แสดงราคาบนหน้าเว็บ</span>
            <span className="block text-xs text-slate-500">ไม่ติ๊ก = ลูกค้าเห็นคำว่า “สอบถามราคา” แทน (ยังส่งคำขอใบเสนอราคาได้ตามปกติ)</span>
          </span>
        </label>

        {!vs.length ? (
          <p className="text-sm text-slate-500">สินค้านี้ยังไม่มีรหัสสินค้า เพิ่มรหัสในหน้าแก้ไขก่อน</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
              <div className="w-32"><Field label="ลดทุกรหัส (%)"><Input type="number" min="1" max="99" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="เช่น 10" /></Field></div>
              <Button type="button" variant="secondary" onClick={applyPct} disabled={!pct}>คำนวณราคาพิเศษ</Button>
              <div className="w-44"><Field label="ราคาพิเศษถึงวันที่" hint="ว่าง = ไม่มีวันหมด"><Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></Field></div>
            </div>
            <div className="space-y-2">
              {rows.map((r) => {
                const base = num(r.base);
                const sp = num(r.special);
                const off = base && sp != null && sp < base ? Math.round((1 - sp / base) * 100) : 0;
                return (
                  <div key={r.id} className="grid items-end gap-2 rounded-xl p-3 ring-1 ring-slate-200 sm:grid-cols-[1fr_9rem_9rem_5rem]">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-slate-500">{r.sku}</p>
                      <p className="truncate text-sm font-medium text-navy-900">{r.name}</p>
                    </div>
                    <Field label="ราคาปกติ" hint="ว่าง = สอบถามราคา"><Input type="number" min="0" step="0.01" value={r.base} onChange={(e) => set(r.id, { base: e.target.value })} /></Field>
                    <Field label="ราคาพิเศษ"><Input type="number" min="0" step="0.01" value={r.special} onChange={(e) => set(r.id, { special: e.target.value })} placeholder="-" /></Field>
                    <p className="pb-2 text-sm font-semibold text-red-600">{off > 0 ? `ลด ${off}%` : ""}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              ราคาพิเศษทุกคนเห็นเหมือนกัน ขึ้นป้ายสีแดง “ราคาพิเศษ” และขีดฆ่าราคาปกติ {rows[0]?.base && `เช่น ${formatBaht(num(rows[0].base))}`} ถ้ามีโปรโมชั่นที่ถูกกว่า ระบบใช้ราคาที่ถูกที่สุด
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
