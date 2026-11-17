import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AcademicIcon, ChevronLeftIcon, ClockIcon, FileIcon, GiftIcon, PinIcon, ShareIcon, StarIcon, UsersIcon } from "../../components/icons";
import { Badge, ButtonLink, Empty, Loading } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useRows } from "../../lib/content";
import { supabase, supabaseConfigured } from "../../lib/supabase";
import {
  cols, courseDetails, formatMoney, formatPoints, loadPointsConfig, loadSeats, loadTrainingSettings, openPrivateFile,
  SESSION_COLS, sessionDateText, sessionPrice, todayBkk,
  type Course, type Material, type PointsConfig, type Session, type TrainingSettings,
} from "../../lib/training";

type Sec = { id: string; label: string };

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
      <span>{children}</span>
    </li>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="scroll-mt-32 text-xl font-bold text-navy-900">{children}</h2>;
}

/** One upcoming session of this course, compact for the side column. */
function SessionRow({ s, course, booked }: { s: Session; course: Course; booked: number }) {
  const left = Math.max(s.capacity - booked, 0);
  const open = s.status === "open" && left > 0;
  const price = sessionPrice(s, course);
  const d = new Date(`${s.starts_on}T00:00:00`);
  return (
    <li className="flex gap-3 rounded-xl p-3 ring-1 ring-slate-200">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg py-2 text-white" style={{ background: course.color || "#16235a" }}>
        <span className="text-xl font-bold leading-none">{d.getDate()}</span>
        <span className="text-[11px]">{d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {s.title && <p className="font-semibold text-navy-900">{s.title}</p>}
        <p className="flex items-center gap-1 text-slate-600"><ClockIcon className="h-4 w-4 shrink-0" />{sessionDateText(s)}</p>
        {s.location && (
          <p className="flex items-center gap-1 text-slate-600">
            <PinIcon className="h-4 w-4 shrink-0" />
            {s.map_url ? <a href={s.map_url} target="_blank" rel="noreferrer" className="truncate hover:underline">{s.location}</a> : <span className="truncate">{s.location}</span>}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{price > 0 ? `${formatMoney(price)}${s.vat ? " +VAT" : ""}` : "ฟรี"} · เหลือ {left}/{s.capacity}</span>
          {open
            ? <Link to={`/app/training/book/${s.id}`} className="rounded-lg bg-sun-500 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-sun-400">จองรอบนี้</Link>
            : <Badge tone={left === 0 ? "red" : "amber"}>{left === 0 ? "เต็มแล้ว" : "ปิดรับสมัคร"}</Badge>}
        </div>
      </div>
    </li>
  );
}

export default function CourseDetail() {
  const { code = "" } = useParams();
  const { session } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [seats, setSeats] = useState<Map<string, number>>(new Map());
  const [settings, setSettings] = useState<TrainingSettings | null>(null);
  const [pc, setPc] = useState<PointsConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState("overview");

  useEffect(() => {
    if (!supabaseConfigured) return;
    setLoading(true);
    supabase.from("courses").select("*").eq("code", code.toUpperCase()).maybeSingle().then(({ data }) => {
      setCourse((data as Course) ?? null);
      setLoading(false);
    });
    loadSeats().then(setSeats);
    loadTrainingSettings().then(setSettings);
    loadPointsConfig().then(setPc);
  }, [code]);

  const sessions = useRows<Session>(() => {
    if (!course) return Promise.resolve({ data: [], error: null });
    return supabase
      .from("course_sessions")
      .select(cols(SESSION_COLS))
      .eq("course_id", course.id)
      .eq("is_archived", false)
      .neq("status", "cancelled")
      .gte("starts_on", todayBkk())
      .order("starts_on")
      .order("start_time");
  }, [course?.id]);
  // RLS returns only what this viewer may see: "ทุกคน" files for everyone, more after booking / check-in.
  const materials = useRows<Material>(() => {
    if (!course) return Promise.resolve({ data: [], error: null });
    return supabase.from("course_materials").select("*").eq("course_id", course.id).order("sort");
  }, [course?.id, session?.user.id]);

  const d = course ? courseDetails(course) : {};
  const topics = (d.topics ?? []).filter((t) => t.title?.trim());
  const instructors = (d.instructors ?? []).filter((i) => i.name?.trim());
  const faqs = (d.faqs ?? []).filter((f) => f.q?.trim());
  const gallery = (d.gallery ?? []).filter(Boolean);
  const list = (x?: string[]) => (x ?? []).map((s) => s.trim()).filter(Boolean);
  const objectives = list(d.objectives);
  const audience = list(d.audience);
  const prereq = list(d.prerequisites);
  const bring = list(d.bring);

  const points = course?.hours && pc ? Number(course.hours) * Number(pc.points_per_hour) : 0;
  const certMonths = settings?.cert_valid_months ?? 0;
  const includes = [
    ...list(d.includes),
    "ใบประกาศนียบัตร (ตรวจสอบออนไลน์ได้ด้วย QR)" + (certMonths ? ` อายุ ${certMonths} เดือน` : ""),
    ...(points > 0 ? [`สะสม ${formatPoints(points)} แต้ม เมื่อเช็กอินและเช็กเอาต์ครบ`] : []),
  ];

  const next = sessions.rows.find((s) => s.status === "open" && Math.max(s.capacity - (seats.get(s.id) ?? 0), 0) > 0);
  const price = course ? sessionPrice(next ?? { price: null }, course) : 0;

  const secs: Sec[] = useMemo(() => [
    { id: "overview", label: "ภาพรวม" },
    ...(topics.length ? [{ id: "topics", label: `หัวข้ออบรม (${topics.length})` }] : []),
    ...(instructors.length ? [{ id: "instructors", label: "วิทยากร" }] : []),
    { id: "sessions", label: "รอบที่เปิด" },
    ...(faqs.length ? [{ id: "faq", label: "คำถามที่พบบ่อย" }] : []),
  ], [topics.length, instructors.length, faqs.length]);

  // highlight the nav tab of the section in view
  useEffect(() => {
    const els = secs.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-130px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [secs, course?.id, sessions.loading]);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: course?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* user closed the share sheet */ }
  }

  if (loading) return <div className="container-x py-16"><Loading /></div>;
  if (!course) {
    return (
      <div className="container-x py-16">
        <Empty>ไม่พบหลักสูตรนี้ หรือหลักสูตรปิดแสดงแล้ว · <Link to="/training" className="underline">กลับไปปฏิทินอบรม</Link></Empty>
      </div>
    );
  }

  const color = course.color || "#16235a";
  const bookTo = next ? `/app/training/book/${next.id}` : null;
  const hasMore = objectives.length || audience.length || prereq.length;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: color }}>
        {course.cover_url && <img src={course.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/80 via-navy-950/50 to-transparent" />
        <div className="container-x relative py-10 sm:py-14">
          <Link to="/training" className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white"><ChevronLeftIcon className="h-4 w-4" /> ปฏิทินอบรม</Link>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-sun-400"><AcademicIcon className="h-5 w-5" /> หลักสูตร {course.code}{!course.is_active && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">ซ่อนอยู่ · เห็นเฉพาะพนักงาน</span>}</p>
          <h1 className="mt-2 max-w-3xl text-2xl font-bold leading-tight sm:text-4xl">{course.title}</h1>
          {course.subtitle && <p className="mt-3 max-w-3xl text-white/85">{course.subtitle}</p>}
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {course.hours ? <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><ClockIcon className="h-4 w-4" />{Number(course.hours)} ชั่วโมง</span> : null}
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><GiftIcon className="h-4 w-4" />{price > 0 ? formatMoney(price) : "ฟรี"}</span>
            {points > 0 && <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><StarIcon className="h-4 w-4" />{formatPoints(points)} แต้ม</span>}
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><AcademicIcon className="h-4 w-4" />มีใบประกาศ</span>
            {topics.length > 0 && <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><FileIcon className="h-4 w-4" />{topics.length} หัวข้อ</span>}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {bookTo
              ? <ButtonLink to={bookTo} variant="sun">จองรอบถัดไป · {new Date(`${next!.starts_on}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</ButtonLink>
              : <ButtonLink to="/contact?topic=training" variant="sun">สอบถามรอบถัดไป</ButtonLink>}
            <button onClick={share} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25">
              <ShareIcon className="h-4 w-4" /> {copied ? "คัดลอกลิงก์แล้ว" : "แชร์"}
            </button>
          </div>
        </div>
      </section>

      {/* In-page nav */}
      <nav className="sticky top-16 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="container-x flex gap-1 overflow-x-auto py-2 text-sm">
          {secs.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 font-medium ${active === s.id ? "bg-navy-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <section className="container-x pb-28 pt-8 lg:pb-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div className="min-w-0 space-y-10">
            {/* Overview */}
            <div className="space-y-6">
              <SectionTitle id="overview">ภาพรวมหลักสูตร</SectionTitle>
              {course.description
                ? <p className="whitespace-pre-line leading-relaxed text-slate-700">{course.description}</p>
                : !hasMore && <p className="text-slate-500">{course.subtitle || "รายละเอียดหลักสูตรกำลังอัปเดต สอบถามเพิ่มเติมได้ที่ฝ่ายอบรม"}</p>}
              {objectives.length > 0 && (
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h3 className="mb-3 font-semibold text-navy-900">สิ่งที่จะได้เรียนรู้</h3>
                  <ul className="grid gap-2.5 text-sm text-slate-700 sm:grid-cols-2">{objectives.map((o, i) => <Check key={i}>{o}</Check>)}</ul>
                </div>
              )}
              {(audience.length > 0 || prereq.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {audience.length > 0 && (
                    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-navy-900"><UsersIcon className="h-5 w-5 text-sun-600" /> เหมาะสำหรับ</h3>
                      <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">{audience.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                  {prereq.length > 0 && (
                    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-navy-900"><AcademicIcon className="h-5 w-5 text-sun-600" /> พื้นฐานที่ควรมี</h3>
                      <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">{prereq.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Topics / agenda */}
            {topics.length > 0 && (
              <div>
                <SectionTitle id="topics">หัวข้อการอบรม</SectionTitle>
                <p className="mt-1 text-sm text-slate-500">{topics.length} หัวข้อ{course.hours ? ` · รวม ${Number(course.hours)} ชั่วโมง` : ""}</p>
                <ol className="relative mt-5 space-y-4 border-l-2 border-slate-200 pl-6">
                  {topics.map((t, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[2.35rem] flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ring-4 ring-slate-50" style={{ background: color }}>{i + 1}</span>
                      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="font-semibold text-navy-900">{t.title}</h3>
                          {t.time && <span className="shrink-0 rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-medium text-navy-700">{t.time}</span>}
                        </div>
                        {t.detail && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{t.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Instructors */}
            {instructors.length > 0 && (
              <div>
                <SectionTitle id="instructors">วิทยากร</SectionTitle>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {instructors.map((p, i) => (
                    <div key={i} className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      {p.photo_url
                        ? <img src={p.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                        : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: color }}>{p.name.trim().replace(/^(คุณ|ดร\.|อ\.|Mr\.?|Ms\.?|Mrs\.?)\s*/i, "").charAt(0)}</span>}
                      <div className="min-w-0">
                        <p className="font-semibold text-navy-900">{p.name}</p>
                        {p.role && <p className="text-sm text-sun-700">{p.role}</p>}
                        {p.bio && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{p.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gallery */}
            {gallery.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-navy-900">บรรยากาศการอบรม</h2>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {gallery.map((g, i) => (
                    <a key={i} href={g} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                      <img src={g} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:scale-105" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Sessions (full list) */}
            <div>
              <SectionTitle id="sessions">รอบอบรมที่เปิดรับสมัคร</SectionTitle>
              <div className="mt-4">
                {sessions.loading ? <Loading /> : sessions.rows.length ? (
                  <ul className="grid gap-3 sm:grid-cols-2">{sessions.rows.map((s) => <SessionRow key={s.id} s={s} course={course} booked={seats.get(s.id) ?? 0} />)}</ul>
                ) : (
                  <Empty>ยังไม่มีรอบที่เปิดรับ · <Link to="/contact?topic=training" className="underline">แจ้งความสนใจ</Link> แล้วเราจะติดต่อกลับเมื่อเปิดรอบใหม่</Empty>
                )}
              </div>
            </div>

            {/* FAQ */}
            {faqs.length > 0 && (
              <div>
                <SectionTitle id="faq">คำถามที่พบบ่อย</SectionTitle>
                <div className="mt-4 divide-y divide-slate-200 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  {faqs.map((f, i) => (
                    <details key={i} className="group p-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-navy-900">
                        {f.q}
                        <span className="text-slate-400 transition group-open:rotate-45">＋</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{f.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Side column */}
          <aside className="space-y-4 lg:sticky lg:top-32">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">ค่าอบรม</p>
              <p className="text-2xl font-bold text-navy-900">{price > 0 ? formatMoney(price) : "ฟรี"}{price > 0 && next?.vat ? <span className="text-sm font-normal text-slate-500"> +VAT</span> : null}</p>
              {bookTo
                ? <ButtonLink to={bookTo} variant="sun" className="mt-3 w-full justify-center">จองรอบถัดไป</ButtonLink>
                : <ButtonLink to="/contact?topic=training" variant="secondary" className="mt-3 w-full justify-center">สอบถามรอบถัดไป</ButtonLink>}
              {next && <p className="mt-2 text-center text-xs text-slate-500">{sessionDateText(next)}</p>}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="mb-3 font-semibold text-navy-900">สิ่งที่ได้รับ</h3>
              <ul className="space-y-2 text-sm text-slate-700">{includes.map((x, i) => <Check key={i}>{x}</Check>)}</ul>
            </div>

            {bring.length > 0 && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-3 font-semibold text-navy-900">สิ่งที่ต้องเตรียม</h3>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">{bring.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="mb-2 font-semibold text-navy-900">เอกสารประกอบการอบรม</h3>
              {materials.rows.length > 0 && (
                <ul className="mb-2 space-y-1 text-sm">
                  {materials.rows.map((m) => (
                    <li key={m.id}>
                      {m.file_path
                        ? <button className="text-left text-navy-700 hover:underline" onClick={() => openPrivateFile("training-materials", m.file_path!)}>📄 {m.title}</button>
                        : <a href={m.url ?? "#"} target="_blank" rel="noreferrer" className="text-navy-700 hover:underline">{m.kind === "video" ? "🎬" : "🔗"} {m.title}</a>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500">เอกสารและวิดีโอสำหรับผู้เข้าอบรม ดาวน์โหลดได้หลังสแกนเช็กอินหน้างาน</p>
            </div>

            <p className="px-1 text-xs text-slate-500">
              มีคำถาม? <Link to="/contact?topic=training" className="underline">ติดต่อฝ่ายอบรม</Link> · <Link to="/verify" className="underline">ตรวจสอบใบประกาศ</Link>
            </p>
          </aside>
        </div>
      </section>

      {/* Mobile booking bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-navy-900">{price > 0 ? formatMoney(price) : "ฟรี"}</p>
            <p className="truncate text-xs text-slate-500">{next ? sessionDateText(next) : "ยังไม่มีรอบที่เปิด"}</p>
          </div>
          {bookTo
            ? <ButtonLink to={bookTo} variant="sun">จองเลย</ButtonLink>
            : <ButtonLink to="/contact?topic=training" variant="secondary">สอบถาม</ButtonLink>}
        </div>
      </div>
    </>
  );
}
