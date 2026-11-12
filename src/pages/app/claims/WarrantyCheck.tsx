import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, ButtonLink, Card, Input, PageTitle } from "../../../components/ui";
import { ScanButton } from "../../../components/SnScanner";
import { WarrantyBadge, WarrantyFacts } from "../../../components/Warranty";
import { daysUntil } from "../../../lib/catalog";
import { errorMessage, supabase } from "../../../lib/supabase";

interface Result { sn: string; sku: string; product_name: string | null; brand: string | null; sold_at: string; warranty_months: number | null; warranty_end: string | null; perf_months?: number | null; perf_end?: string | null }

/** Customer: type or scan an S/N → model, purchase (PI) date and warranty end. */
export default function WarrantyCheck() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null | undefined>(undefined);

  async function check(sn: string) {
    if (sn.replace(/[^a-z0-9]/gi, "").length < 6) return setErr("กรุณากรอก Serial Number ให้ครบ");
    setBusy(true); setErr(""); setRes(undefined);
    const { data, error } = await supabase.rpc("warranty_check", { p_sn: sn });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setRes(((data ?? []) as Result[])[0] ?? null);
  }
  const submit = (e: FormEvent) => { e.preventDefault(); check(q.trim()); };
  const inWarranty = res?.warranty_end ? daysUntil(res.warranty_end) >= 0 : false;

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="ตรวจสอบประกันสินค้า" subtitle="กรอกหรือสแกน Serial Number เพื่อดูวันที่ซื้อและวันหมดประกัน" />
      <Card>
        <form onSubmit={submit} className="flex gap-2">
          <Input className="font-mono" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial Number (S/N)" autoFocus />
          <ScanButton onScan={(sn) => { setQ(sn); check(sn); }} />
          <Button type="submit" className="shrink-0 whitespace-nowrap" loading={busy}>ตรวจสอบ</Button>
        </form>
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      </Card>

      {res === null && (
        <div className="mt-4"><Alert tone="amber">ไม่พบข้อมูลการขายของ S/N นี้ในระบบ หากซื้อก่อนเริ่มใช้ระบบเอกสารคลัง หรือคิดว่าข้อมูลไม่ถูกต้อง กรุณาติดต่อทีมบริการพร้อมเลขที่ใบกำกับ/PI</Alert></div>
      )}
      {res && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold text-navy-900">{res.sn}</p>
              <p className="text-sm text-slate-600">{[res.brand, res.product_name].filter(Boolean).join(" · ")}<span className="ml-1 font-mono text-xs text-slate-500">{res.sku}</span></p>
            </div>
            <WarrantyBadge end={res.warranty_end} months={res.warranty_months} />
          </div>
          <div className="mt-4"><WarrantyFacts soldAt={res.sold_at} months={res.warranty_months} end={res.warranty_end} perfMonths={res.perf_months} perfEnd={res.perf_end} /></div>
          {inWarranty && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <ButtonLink to="/app/claims/new" variant="sun">แจ้งเคลมสินค้านี้</ButtonLink>
              <Link to="/claims" className="text-sm text-navy-700 underline">เงื่อนไขการเคลม</Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
