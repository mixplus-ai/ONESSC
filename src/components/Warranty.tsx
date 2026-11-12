import { Badge } from "./ui";
import { daysUntil, fmtWarranty, formatDate } from "../lib/catalog";

/** "อยู่ในประกัน · เหลือ 3 ปี 2 เดือน" / "หมดประกันแล้ว" from the warranty end date. */
export function WarrantyBadge({ end, months }: { end: string | null; months: number | null }) {
  if (months == null) return <Badge tone="slate">ยังไม่ได้ตั้งระยะประกันของสินค้า</Badge>;
  if (!end) return <Badge tone="slate">ยังไม่เริ่มนับ (ยังไม่มี PI ขายออก)</Badge>;
  const d = daysUntil(end);
  if (d < 0) return <Badge tone="red">หมดประกันแล้ว</Badge>;
  const left = d >= 60 ? fmtWarranty(Math.floor(d / 30.44)) : `${d} วัน`;
  return <Badge tone={d <= 90 ? "amber" : "green"}>อยู่ในประกัน · เหลือ {left}</Badge>;
}

/** Purchase (PI) date, warranty length and end date as a small definition list. */
export function WarrantyFacts({ soldAt, piNo, months, end }: { soldAt: string | null; piNo?: string | null; months: number | null; end: string | null }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-xs text-slate-500">วันที่ซื้อ (ตาม PI)</dt><dd className="font-medium text-navy-900">{soldAt ? formatDate(soldAt) : "-"}{piNo ? <span className="ml-1 text-xs font-normal text-slate-500">{piNo}</span> : null}</dd></div>
      <div><dt className="text-xs text-slate-500">ระยะประกัน</dt><dd className="font-medium text-navy-900">{months != null ? fmtWarranty(months) : "-"}</dd></div>
      <div><dt className="text-xs text-slate-500">วันที่หมดประกัน</dt><dd className="font-medium text-navy-900">{end ? formatDate(end) : "-"}</dd></div>
    </dl>
  );
}
