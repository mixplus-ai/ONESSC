import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input } from "../../../../components/ui";
import { formatDate } from "../../../../lib/catalog";
import { supabase } from "../../../../lib/supabase";
import { SERIAL_STATUS_LABEL, snKey, type DocItem, type DocType, type Serial, type SerialStatus } from "../../../../lib/stockdocs";

/** Which SNs a document type may take from its source warehouse. */
const TAKES: Partial<Record<DocType, { statuses: SerialStatus[]; anyCondition?: boolean }>> = {
  SO: { statuses: ["in_stock", "reserved"] }, WD: { statuses: ["in_stock", "reserved"] }, BR: { statuses: ["in_stock"] },
  RV: { statuses: ["in_stock"] }, WO: { statuses: ["in_stock", "reserved"], anyCondition: true }, TR: { statuses: ["in_stock", "reserved"], anyCondition: true },
};

/**
 * Pick a product from the database, then tick its SNs that are in the source warehouse.
 * The scan box stays for typing / scanning SNs by hand.
 */
export function SnPicker({ type, warehouseId, sku, setSku, want, skus, existing, onAdd }: {
  type: DocType; warehouseId: string | null | undefined; sku: string; setSku: (s: string) => void; want?: number;
  skus: { sku: string; description: string | null }[]; existing: Set<string>; onAdd: (items: DocItem[]) => void;
}) {
  const rule = TAKES[type];
  const [rows, setRows] = useState<Serial[]>([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const code = sku.trim().toUpperCase();

  useEffect(() => {
    setPick(new Set());
    if (!rule || !warehouseId || !code) { setRows([]); return; }
    setLoading(true);
    let r = supabase.from("serials").select("*").eq("sku", code).eq("warehouse_id", warehouseId).in("status", rule.statuses);
    if (!rule.anyCondition) r = r.eq("condition", "good");
    r.order("status").order("first_in_at", { nullsFirst: true }).order("sn").limit(2000)
      .then(({ data }) => { setRows((data ?? []) as Serial[]); setLoading(false); });
  }, [code, warehouseId, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const free = useMemo(() => rows.filter((s) => !existing.has(s.sn_key) && !existing.has(snKey(s.sn))), [rows, existing]);
  const shown = useMemo(() => { const t = q.trim().toUpperCase(); return t ? free.filter((s) => s.sn.includes(t)) : free; }, [free, q]);
  const desc = skus.find((s) => s.sku === code)?.description;
  if (!rule) return null;

  // first in, first out: the oldest in-stock SNs first, reserved ones last
  const pickFirst = (n: number) => setPick(new Set(free.filter((s) => s.status === "in_stock").slice(0, n).map((s) => s.sn_key)));
  const add = () => {
    onAdd(free.filter((s) => pick.has(s.sn_key)).map((s) => ({ sku: s.sku, description: s.description ?? desc ?? null, sn: s.sn, condition: s.condition })));
    setPick(new Set());
  };

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[14rem] flex-1">
          <span className="text-xs font-medium text-slate-600">เลือกสินค้าจากฐานข้อมูล</span>
          <Input list="sd-pick-skus" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} placeholder="พิมพ์หรือเลือกรหัส / ชื่อสินค้า" />
          <datalist id="sd-pick-skus">{skus.map((r) => <option key={r.sku} value={r.sku}>{r.description}</option>)}</datalist>
        </label>
        {code && free.length > 0 && (
          <>
            {want != null && want > 0 && <Button variant="secondary" onClick={() => pickFirst(want)}>เลือก {want} ตัวแรก (เข้าก่อนออกก่อน)</Button>}
            <Button variant="secondary" onClick={() => setPick(new Set(shown.map((s) => s.sn_key)))}>เลือกทั้งหมด</Button>
            <Button onClick={add} disabled={!pick.size}>+ เพิ่ม {pick.size || ""} SN</Button>
          </>
        )}
      </div>
      {code && <p className="mt-1 text-xs text-slate-500">{desc ?? "ไม่พบรหัสนี้ในสต๊อก"} · ในคลังต้นทางที่ใช้ได้ {loading ? "…" : `${free.length} ชิ้น`}</p>}
      {code && free.length > 12 && <Input className="mt-2 max-w-xs" placeholder="ค้นหา SN" value={q} onChange={(e) => setQ(e.target.value)} />}
      {code && shown.length > 0 && (
        <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <label key={s.sn_key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 ring-1 ring-slate-200 hover:bg-slate-50">
              <input type="checkbox" checked={pick.has(s.sn_key)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(s.sn_key); else n.delete(s.sn_key); return n; })} />
              <span className="flex-1 truncate font-mono text-sm">{s.sn}</span>
              {s.status !== "in_stock" && <Badge tone="amber">{SERIAL_STATUS_LABEL[s.status]}{s.holder_name ? ` · ${s.holder_name}` : ""}</Badge>}
              {s.condition === "defective" && <Badge tone="red">เสีย</Badge>}
              {s.first_in_at && <span className="text-[10px] text-slate-400">{formatDate(s.first_in_at)}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
