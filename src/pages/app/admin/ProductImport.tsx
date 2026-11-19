import { useRef, useState } from "react";
import { Alert, Button, Card } from "../../../components/ui";
import type { Brand, Category, Product } from "../../../lib/catalog";
import { applyImport, planImport, readProductSheet, type ImportPlan } from "../../../lib/productSheet";
import { errorMessage } from "../../../lib/supabase";

/** Upload the filled template → preview what will change → apply. */
export function ProductImport({ products, brands, categories, onClose }: { products: Product[]; brands: Brand[]; categories: Category[]; onClose: (changed: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ ok: number; failed: number; log: string[] } | null>(null);

  async function pick(f: File) {
    setErr(""); setPlan(null); setResult(null); setFile(f.name);
    try {
      const rows = await readProductSheet(f);
      if (!rows.length) return setErr("ไม่พบแถวข้อมูลในไฟล์");
      setPlan(planImport(rows, products, brands, categories));
    } catch (x) {
      setErr(errorMessage(x));
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true); setErr("");
    try {
      setResult(await applyImport(plan, products, brands, categories, (d, t) => setProgress(`${d.toLocaleString("th-TH")} / ${t.toLocaleString("th-TH")}`)));
    } catch (x) {
      setErr(errorMessage(x));
    }
    setBusy(false);
  }

  const n = (x: number) => x.toLocaleString("th-TH");
  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-navy-900">นำเข้าสินค้าจาก Excel</h3>
          <p className="text-xs text-slate-500">ใช้ไฟล์จาก “ส่งออกสินค้าทั้งหมด” หรือ “Template เปล่า” · รหัสเดิมจะถูกอัปเดต รหัสใหม่จะถูกเพิ่ม · ช่องว่าง = ไม่เปลี่ยนค่าเดิม · ไม่ลบสินค้าที่ไม่มีในไฟล์</p>
        </div>
        <Button variant="ghost" onClick={() => onClose(!!result?.ok)}>ปิด</Button>
      </div>
      <input ref={fileRef} type="file" hidden accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }} />
      {!result && <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>{file ? `เลือกไฟล์ใหม่ (ตอนนี้: ${file})` : "เลือกไฟล์ .xlsx"}</Button>}
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      {plan && !result && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[["สินค้าใหม่", plan.newProducts], ["อัปเดตสินค้าเดิม", plan.updProducts], ["รหัสใหม่", plan.newSkus], ["อัปเดตรหัสเดิม", plan.updSkus], ["ย้ายรหัสมารุ่นอื่น", plan.moveSkus], ["แบรนด์/หมวดใหม่", plan.newBrands.length + plan.newCategories.length]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">{k}</p><p className="text-lg font-bold text-navy-900">{n(v as number)}</p></div>
            ))}
          </div>
          {(plan.newBrands.length > 0 || plan.newCategories.length > 0) && (
            <Alert tone="amber">
              {plan.newBrands.length > 0 && <p>จะสร้างแบรนด์ใหม่: {plan.newBrands.join(", ")}</p>}
              {plan.newCategories.length > 0 && <p>จะสร้างหมวดหมู่ใหม่: {plan.newCategories.join(", ")}</p>}
              <p className="mt-1 text-xs">ถ้าพิมพ์ชื่อผิด (เช่น “Solaredge ” แทน “SolarEdge”) ให้แก้ในไฟล์ก่อน</p>
            </Alert>
          )}
          {plan.errors.length > 0 ? (
            <Alert>
              <p className="font-semibold">แก้ในไฟล์ก่อน {n(plan.errors.length)} จุด แล้วเลือกไฟล์ใหม่</p>
              <ul className="mt-1 list-disc pl-5">{plan.errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}</ul>
              {plan.errors.length > 30 && <p>…และอีก {n(plan.errors.length - 30)} จุด</p>}
            </Alert>
          ) : (
            <div className="flex items-center gap-3">
              <Button onClick={apply} loading={busy}>นำเข้าเลย</Button>
              {busy && <span className="text-slate-500">กำลังบันทึก {progress}</span>}
            </div>
          )}
        </div>
      )}
      {result && (
        <div className="mt-2 space-y-2 text-sm">
          <Alert tone={result.failed ? "amber" : "green"}>นำเข้าสำเร็จ {n(result.ok)} สินค้า{result.failed ? ` · ไม่สำเร็จ ${n(result.failed)}` : ""}</Alert>
          {result.log.length > 0 && <Alert><ul className="list-disc pl-5">{result.log.map((l) => <li key={l}>{l}</li>)}</ul></Alert>}
          <Button onClick={() => onClose(true)}>เสร็จ</Button>
        </div>
      )}
    </Card>
  );
}
