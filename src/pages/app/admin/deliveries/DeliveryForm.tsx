import { Alert, Button, Field, Input, Select, Textarea } from "../../../../components/ui";
import { DELIVERY_STATUS, sumQty, sumWatt, type DeliveryDraft, type DeliveryItem, type DeliveryStatus } from "../../../../lib/deliveries";

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** Editable delivery: used both to review a scanned PDF and to edit a saved delivery. */
export default function DeliveryForm({ d, onChange }: { d: DeliveryDraft; onChange: (d: DeliveryDraft) => void }) {
  const set = <K extends keyof DeliveryDraft>(k: K, v: DeliveryDraft[K]) => onChange({ ...d, [k]: v });
  const setItem = (n: number, patch: Partial<DeliveryItem>) => {
    const items = d.delivery_items.map((it, i) => {
      if (i !== n) return it;
      const next = { ...it, ...patch };
      // keep total watt in step when watt/pc or pcs change
      if (("qty" in patch || "unit_watt" in patch) && next.unit_watt != null) next.total_watt = Math.round(next.unit_watt * (next.qty || 0) * 100) / 100;
      return next;
    });
    set("delivery_items", items);
  };
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="space-y-5">
      {d.warnings.length > 0 && (
        <Alert tone="amber">
          <ul className="list-disc space-y-0.5 pl-4">{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="วันส่ง / วันที่รับสินค้า" required>
          <Input type="date" value={d.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} required />
        </Field>
        <Field label="สถานะ">
          <Select value={d.status} onChange={(e) => set("status", e.target.value as DeliveryStatus)}>
            {(Object.keys(DELIVERY_STATUS) as DeliveryStatus[]).map((k) => <option key={k} value={k}>{DELIVERY_STATUS[k].label}</option>)}
          </Select>
        </Field>
        <Field label="คลัง"><Input value={d.warehouse ?? ""} onChange={(e) => set("warehouse", e.target.value)} placeholder="เช่น คลัง BGL 4" /></Field>
        <Field label="เลขที่เอกสาร (PI NO.)"><Input value={d.doc_no ?? ""} onChange={(e) => set("doc_no", e.target.value)} /></Field>
        <Field label="วันที่เอกสาร"><Input type="date" value={d.doc_date ?? ""} onChange={(e) => set("doc_date", e.target.value || null)} /></Field>
        <Field label="ผู้ขาย / เซลล์"><Input value={d.sales_name ?? ""} onChange={(e) => set("sales_name", e.target.value)} /></Field>
      </div>

      <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <p className="mb-3 text-sm font-semibold text-navy-900">ลูกค้า (The Buyer)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="ชื่อลูกค้า" required><Input value={d.customer_name} onChange={(e) => set("customer_name", e.target.value)} required /></Field></div>
          <div className="sm:col-span-2"><Field label="ที่อยู่"><Textarea rows={2} value={d.customer_address ?? ""} onChange={(e) => set("customer_address", e.target.value)} /></Field></div>
          <Field label="เลขผู้เสียภาษี"><Input value={d.customer_tax_id ?? ""} onChange={(e) => set("customer_tax_id", e.target.value.replace(/\D/g, "").slice(0, 13))} inputMode="numeric" /></Field>
          <Field label="ผู้ติดต่อ (Attn)"><Input value={d.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></Field>
          <Field label="โทร"><Input value={d.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} /></Field>
          <Field label="อีเมล"><Input value={d.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="โครงการ / สถานที่ติดตั้ง"><Input value={d.site ?? ""} onChange={(e) => set("site", e.target.value)} /></Field></div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-navy-900">รายการสินค้า</p>
          <Button variant="ghost" type="button" onClick={() => set("delivery_items", [...d.delivery_items, { model: "", description: "", unit_watt: null, qty: 0, total_watt: null }])}>+ เพิ่มรายการ</Button>
        </div>
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">รุ่น / รายละเอียด</th>
                <th className="w-28 px-3 py-2 text-right">วัตต์/แผ่น</th>
                <th className="w-24 px-3 py-2 text-right">จำนวน (PCS)</th>
                <th className="w-32 px-3 py-2 text-right">รวมวัตต์</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {d.delivery_items.map((it, n) => (
                <tr key={n} className="border-t border-slate-100 align-top">
                  <td className="space-y-1 px-3 py-2">
                    <Input value={it.model} onChange={(e) => setItem(n, { model: e.target.value })} placeholder="รุ่นสินค้า" />
                    <Input value={it.description} onChange={(e) => setItem(n, { description: e.target.value })} placeholder="รายละเอียด" className="text-xs" />
                  </td>
                  <td className="px-3 py-2"><Input type="number" step="any" className="text-right" value={it.unit_watt ?? ""} onChange={(e) => setItem(n, { unit_watt: numOrNull(e.target.value) })} /></td>
                  <td className="px-3 py-2"><Input type="number" step="any" className="text-right" value={it.qty || ""} onChange={(e) => setItem(n, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="px-3 py-2"><Input type="number" step="any" className="text-right" value={it.total_watt ?? ""} onChange={(e) => setItem(n, { total_watt: numOrNull(e.target.value) })} /></td>
                  <td className="px-1 py-2">
                    <button type="button" className="rounded p-2 text-red-600 hover:bg-red-50" aria-label="ลบรายการ" onClick={() => set("delivery_items", d.delivery_items.filter((_, i) => i !== n))}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold text-navy-900">
              <tr>
                <td className="px-3 py-2">รวม</td>
                <td />
                <td className="px-3 py-2 text-right">{fmt(sumQty(d.delivery_items))}</td>
                <td className="px-3 py-2 text-right">{fmt(sumWatt(d.delivery_items))} W</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="หมายเหตุจากเอกสาร" hint="บรรทัดละ 1 ข้อ"><Textarea rows={3} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        <Field label="บันทึกภายใน" hint="เห็นเฉพาะ Staff/Admin เช่น ทะเบียนรถ คนขับ"><Textarea rows={3} value={d.internal_note ?? ""} onChange={(e) => set("internal_note", e.target.value)} /></Field>
      </div>
    </div>
  );
}
