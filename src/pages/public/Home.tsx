import { Link } from "react-router-dom";
import { PortfolioCard, SectionHeading, TeamCard } from "../../components/cards";
import { AcademicIcon, ArrowRightIcon, BoxIcon, ShieldIcon, SunIcon, WrenchIcon } from "../../components/icons";
import { ButtonLink, Empty } from "../../components/ui";
import { usePublishedPortfolio, usePublishedTeam, useSiteSettings } from "../../lib/content";
import { LEGACY } from "../../lib/types";
import { sessionDateText } from "../../lib/training";
import { useUpcomingSessions } from "./Training";
import { ContactBlock } from "./Contact";

const MODULES = [
  { icon: BoxIcon, title: "สินค้าและโปรโมชั่น", text: "แคตตาล็อกอุปกรณ์ ราคา แพคเกจ และขอใบเสนอราคาออนไลน์", to: "/products" },
  { icon: AcademicIcon, title: "อบรมและกิจกรรม", text: "จองรอบอบรม รับใบประกาศ และสะสมแต้มแลกของรางวัล", to: "/training" },
  { icon: WrenchIcon, title: "งานบริการและเคลม", text: "แจ้งเคลมสินค้าและติดตามสถานะได้จากบัญชีของคุณ", to: "/claims" },
  { icon: ShieldIcon, title: "บัญชีเดียวใช้ได้ทุกส่วน", text: "ล็อกอินครั้งเดียว เห็นการจอง แต้ม และเคลมของคุณและบริษัท", to: "/register" },
];

export default function Home() {
  const { hero, about } = useSiteSettings();
  const portfolio = usePublishedPortfolio(6);
  const team = usePublishedTeam();

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        {hero.image_url && (
          <img src={hero.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sun-500/20 blur-3xl" aria-hidden />
        <div className="container-x relative grid items-center gap-10 py-20 md:grid-cols-[1.3fr_1fr] md:py-28">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sun-300 ring-1 ring-white/15">
              <SunIcon className="h-4 w-4" /> ตัวแทนจำหน่ายอุปกรณ์โซลาร์
            </p>
            <h1 className="text-3xl leading-tight font-bold sm:text-5xl sm:leading-tight">{hero.title}</h1>
            <p className="mt-5 max-w-xl text-lg text-navy-100">{hero.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to={hero.cta_primary_href} variant="sun">{hero.cta_primary_label}<ArrowRightIcon className="h-4 w-4" /></ButtonLink>
              <ButtonLink to={hero.cta_secondary_href} variant="secondary">{hero.cta_secondary_label}</ButtonLink>
            </div>
          </div>
          {about.brands.length > 0 && (
            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <p className="text-sm font-medium text-navy-200">แบรนด์ที่เราเป็นตัวแทน</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {about.brands.map((b) => (
                  <span key={b} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">{b}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Modules */}
      <section className="container-x -mt-10 relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map(({ icon: Icon, title, text, to }) => (
          <Link key={title} to={to} className="group rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-200 transition hover:-translate-y-0.5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><Icon className="h-6 w-6" /></span>
            <h3 className="mt-4 font-semibold text-navy-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </Link>
        ))}
      </section>

      {/* About */}
      <section className="container-x grid gap-10 py-20 md:grid-cols-2">
        <SectionHeading eyebrow="เกี่ยวกับเรา" title="พลังงานสะอาด เริ่มที่อุปกรณ์คุณภาพ" />
        <div className="space-y-4 text-slate-600">
          <p>{about.history}</p>
          <p className="border-l-4 border-sun-500 pl-4 font-medium text-navy-800">{about.vision}</p>
          <Link to="/about" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
            อ่านเพิ่มเติม <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Coming modules teaser */}
      <section className="bg-white py-16">
        <div className="container-x grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-navy-50 p-6">
            <h3 className="font-semibold text-navy-900">สินค้าแนะนำและโปรโมชั่น</h3>
            <p className="mt-2 text-sm text-slate-600">ระหว่างย้ายแคตตาล็อกเข้ามาใน One App ดูสินค้าทั้งหมดได้ที่แคตตาล็อกเดิม</p>
            <ButtonLink to={LEGACY.catalog} variant="secondary" className="mt-4">เปิดแคตตาล็อกสินค้า</ButtonLink>
          </div>
          <UpcomingTraining />
        </div>
      </section>

      {/* Portfolio */}
      <section className="container-x py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="ผลงาน" title="โครงการที่เราติดตั้ง" subtitle="ตัวอย่างงานบ้านพักอาศัย โรงงาน และอาคารพาณิชย์" />
          <Link to="/portfolio" className="mb-8 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
            ดูผลงานทั้งหมด <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        {portfolio.rows.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.rows.map((p) => <PortfolioCard key={p.id} p={p} />)}
          </div>
        ) : (
          <Empty>ผลงานจะแสดงที่นี่เมื่อ Admin เพิ่มโครงการจากหลังบ้าน</Empty>
        )}
      </section>

      {/* Team */}
      <section className="bg-white py-20">
        <div className="container-x">
          <SectionHeading eyebrow="ทีมงาน" title="ติดต่อพนักงานได้โดยตรง" subtitle="ฝ่ายขาย ฝ่ายบริการ และฝ่ายประสานงาน พร้อมช่วยเหลือคุณ" />
          {team.rows.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {team.rows.slice(0, 6).map((m) => <TeamCard key={m.id} m={m} />)}
            </div>
          ) : (
            <Empty>รายชื่อทีมงานจะแสดงที่นี่เมื่อ Admin เพิ่มจากหลังบ้าน</Empty>
          )}
          {team.rows.length > 6 && (
            <Link to="/team" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
              ดูทีมงานทั้งหมด <ArrowRightIcon className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>

      <ContactBlock />
    </>
  );
}

function UpcomingTraining() {
  const { rows, seats } = useUpcomingSessions(3);
  return (
    <div className="rounded-2xl bg-sun-500/10 p-6">
      <h3 className="font-semibold text-navy-900">อบรมและกิจกรรมที่กำลังจะมาถึง</h3>
      {rows.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((s) => (
            <li key={s.id}>
              <Link to={`/app/training/book/${s.id}`} className="block rounded-lg bg-white/70 px-3 py-2 hover:bg-white">
                <span className="block font-medium text-navy-900">{s.courses.title}</span>
                <span className="block text-xs text-slate-600">{sessionDateText(s)} · เหลือ {Math.max(s.capacity - (seats.get(s.id) ?? 0), 0)} ที่</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-600">ยังไม่มีรอบที่เปิดรับสมัคร</p>
      )}
      <ButtonLink to="/training" variant="secondary" className="mt-4">ดูปฏิทินอบรม</ButtonLink>
    </div>
  );
}
