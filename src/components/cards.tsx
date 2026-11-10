import { Link } from "react-router-dom";
import type { PortfolioProject, TeamMember } from "../lib/types";
import { DEPARTMENT_LABEL, PROJECT_TYPE_LABEL } from "../lib/types";
import { ChatIcon, ImageIcon, MailIcon, PhoneIcon, UserIcon } from "./icons";
import { Badge } from "./ui";

export function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      {eyebrow && <p className="mb-2 text-sm font-semibold text-sun-600">{eyebrow}</p>}
      <h2 className="text-2xl font-bold text-navy-900 sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-slate-600">{subtitle}</p>}
    </div>
  );
}

export function PortfolioCard({ p }: { p: PortfolioProject }) {
  const cover = p.cover_url || p.images[0];
  return (
    <Link
      to={`/portfolio/${p.id}`}
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-[4/3] overflow-hidden bg-navy-50">
        {cover ? (
          <img src={cover} alt={p.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center text-navy-200"><ImageIcon className="h-10 w-10" /></div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone="navy">{PROJECT_TYPE_LABEL[p.project_type]}</Badge>
          {p.size_kwp != null && <Badge tone="amber">{Number(p.size_kwp).toLocaleString("th-TH")} kWp</Badge>}
        </div>
        <h3 className="font-semibold text-navy-900">{p.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{[p.province, p.year && `ปี ${p.year + 543}`].filter(Boolean).join(" · ")}</p>
      </div>
    </Link>
  );
}

export function TeamCard({ m }: { m: TeamMember }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-navy-50">
        {m.photo_url ? (
          <img src={m.photo_url} alt={m.full_name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-navy-200"><UserIcon className="h-8 w-8" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy-900">{m.full_name}</p>
        <p className="text-sm text-slate-500">{[m.position, DEPARTMENT_LABEL[m.department]].filter(Boolean).join(" · ")}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {m.phone && (
            <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-navy-700 hover:underline">
              <PhoneIcon className="h-4 w-4" />{m.phone}
            </a>
          )}
          {m.line_id && (
            <span className="inline-flex items-center gap-1 text-emerald-700"><ChatIcon className="h-4 w-4" />{m.line_id}</span>
          )}
          {m.email && (
            <a href={`mailto:${m.email}`} className="inline-flex min-w-0 items-center gap-1 text-navy-700 hover:underline">
              <MailIcon className="h-4 w-4 shrink-0" /><span className="truncate">{m.email}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
