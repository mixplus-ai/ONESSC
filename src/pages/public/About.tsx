import { SectionHeading } from "../../components/cards";
import { useSiteSettings } from "../../lib/content";

export default function About() {
  const { about, company } = useSiteSettings();
  return (
    <div className="container-x py-16">
      <SectionHeading eyebrow="เกี่ยวกับเรา" title={company.name_th} subtitle={company.tagline} />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <h3 className="font-semibold text-navy-900">ประวัติบริษัท</h3>
            <p className="mt-2 whitespace-pre-line text-slate-600">{about.history}</p>
          </div>
          <div>
            <h3 className="font-semibold text-navy-900">วิสัยทัศน์</h3>
            <p className="mt-2 whitespace-pre-line text-slate-600">{about.vision}</p>
          </div>
        </div>
        <div className="space-y-6">
          {about.brands.length > 0 && (
            <div className="rounded-2xl bg-navy-900 p-6 text-white">
              <h3 className="font-semibold">แบรนด์ที่เป็นตัวแทนจำหน่าย</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {about.brands.map((b) => <span key={b} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">{b}</span>)}
              </div>
            </div>
          )}
          {about.certificates.length > 0 && (
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-semibold text-navy-900">ใบรับรอง</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {about.certificates.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
