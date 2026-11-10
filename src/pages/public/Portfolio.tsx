import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PortfolioCard, SectionHeading } from "../../components/cards";
import { Badge, Empty, Loading, cx } from "../../components/ui";
import { usePublishedPortfolio } from "../../lib/content";
import { PROJECT_TYPE_LABEL, type PortfolioProject } from "../../lib/types";

export default function Portfolio() {
  const { rows, loading } = usePublishedPortfolio();
  const [type, setType] = useState<"all" | PortfolioProject["project_type"]>("all");
  const shown = useMemo(() => (type === "all" ? rows : rows.filter((r) => r.project_type === type)), [rows, type]);
  return (
    <div className="container-x py-16">
      <SectionHeading eyebrow="ผลงาน" title="โครงการที่เราติดตั้ง" />
      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", "residential", "factory", "commercial", "other"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-medium ring-1",
              type === t ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-600 ring-slate-300 hover:ring-navy-600",
            )}
          >
            {t === "all" ? "ทั้งหมด" : PROJECT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : shown.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((p) => <PortfolioCard key={p.id} p={p} />)}</div>
      ) : (
        <Empty>ยังไม่มีผลงานในหมวดนี้</Empty>
      )}
    </div>
  );
}

export function PortfolioDetail() {
  const { id } = useParams();
  const { rows, loading } = usePublishedPortfolio();
  const p = rows.find((r) => r.id === id);
  const [active, setActive] = useState(0);
  if (loading) return <Loading />;
  if (!p)
    return (
      <div className="container-x py-16">
        <Empty>ไม่พบผลงานนี้ <Link to="/portfolio" className="font-semibold text-navy-700 underline">กลับไปหน้าผลงาน</Link></Empty>
      </div>
    );
  const images = [p.cover_url, ...p.images].filter((x): x is string => Boolean(x));
  const facts = [
    ["ประเภท", PROJECT_TYPE_LABEL[p.project_type]],
    ["ขนาดระบบ", p.size_kwp != null ? `${Number(p.size_kwp).toLocaleString("th-TH")} kWp` : null],
    ["จังหวัด", p.province],
    ["ปีที่ติดตั้ง", p.year ? String(p.year + 543) : null],
    ["อุปกรณ์ที่ใช้", p.equipment],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <div className="container-x py-12">
      <Link to="/portfolio" className="text-sm font-medium text-navy-700 hover:underline">← ผลงานทั้งหมด</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {images.length > 0 && (
            <>
              <img src={images[active]} alt={p.title} className="aspect-[16/10] w-full rounded-2xl object-cover" />
              {images.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {images.map((src, i) => (
                    <button key={src + i} onClick={() => setActive(i)} className={cx("h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2", i === active ? "ring-sun-500" : "ring-transparent")}>
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <Badge tone="navy">{PROJECT_TYPE_LABEL[p.project_type]}</Badge>
          <h1 className="mt-3 text-2xl font-bold text-navy-900">{p.title}</h1>
          <dl className="mt-6 divide-y divide-slate-200 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-slate-200">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-navy-900">{v}</dd>
              </div>
            ))}
          </dl>
          {p.description && <p className="mt-6 whitespace-pre-line text-slate-600">{p.description}</p>}
        </div>
      </div>
    </div>
  );
}
