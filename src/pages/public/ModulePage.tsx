import type { ComponentType, SVGProps } from "react";
import { AcademicIcon, ExternalIcon, WrenchIcon } from "../../components/icons";
import { ButtonLink } from "../../components/ui";
import { LEGACY } from "../../lib/types";

interface ModuleInfo {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  text: string;
  phase: string;
  link?: { href: string; label: string };
  secondary?: { href: string; label: string };
}

const MODULES: Record<string, ModuleInfo> = {
  training: {
    icon: AcademicIcon,
    title: "อบรมและกิจกรรม",
    text: "ปฏิทินอบรม การจองรอบ ใบประกาศ และแต้มสะสมจะรวมเข้ากับบัญชี One App ระหว่างนี้ใช้งานได้ที่ SSC Training Portal ตามเดิม",
    phase: "เฟส 3",
    link: { href: LEGACY.training, label: "ไปที่ SSC Training Portal" },
  },
  claims: {
    icon: WrenchIcon,
    title: "แจ้งเคลม",
    text: "แจ้งเคลมสินค้าทุกแบรนด์และติดตามสถานะได้จากแดชบอร์ดของคุณ ระหว่างนี้ติดต่อฝ่ายบริการผ่านแบบฟอร์มหรือ LINE OA",
    phase: "เฟส 4",
    secondary: { href: "/contact?topic=service", label: "ติดต่อฝ่ายบริการ" },
  },
};

export default function ModulePage({ module }: { module: keyof typeof MODULES }) {
  const m = MODULES[module];
  const Icon = m.icon;
  return (
    <div className="container-x py-20">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200 sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sun-500/15 text-sun-600"><Icon className="h-7 w-7" /></span>
        <h1 className="mt-5 text-2xl font-bold text-navy-900">{m.title}</h1>
        <p className="mt-1 text-xs font-semibold tracking-wide text-sun-600">กำลังย้ายเข้า One App · {m.phase}</p>
        <p className="mt-4 text-slate-600">{m.text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {m.link && <ButtonLink to={m.link.href}>{m.link.label}<ExternalIcon className="h-4 w-4" /></ButtonLink>}
          {m.secondary && <ButtonLink to={m.secondary.href} variant="secondary">{m.secondary.label}</ButtonLink>}
        </div>
      </div>
    </div>
  );
}
