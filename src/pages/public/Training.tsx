import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AcademicIcon, ClockIcon, PinIcon } from "../../components/icons";
import { Badge, ButtonLink, Empty, Loading } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useRows } from "../../lib/content";
import { supabase } from "../../lib/supabase";
import { formatMoney, loadSeats, cols,
  SESSION_COLS, sessionDateText, sessionPrice, todayBkk, type Course, type Session } from "../../lib/training";

/** Upcoming sessions grouped by course — public calendar (ปฏิทินอบรม). */
export function useUpcomingSessions(limit?: number) {
  const sessions = useRows<Session & { courses: Course }>(() => {
    let q = supabase
      .from("course_sessions")
      .select(cols(`${SESSION_COLS}, courses!inner(*)`))
      .eq("is_archived", false)
      .neq("status", "cancelled")
      .gte("starts_on", todayBkk())
      .eq("courses.is_active", true)
      .order("starts_on")
      .order("start_time");
    if (limit) q = q.limit(limit);
    return q;
  }, [limit]);
  const [seats, setSeats] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    loadSeats().then(setSeats);
  }, [sessions.rows.length]);
  return { ...sessions, seats };
}

export function SessionCard({ s, booked }: { s: Session & { courses: Course }; booked: number }) {
  const left = Math.max(s.capacity - booked, 0);
  const price = sessionPrice(s, s.courses);
  const open = s.status === "open" && left > 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col items-center justify-center rounded-xl px-4 py-3 text-white sm:w-24" style={{ background: s.courses.color || "#16235a" }}>
        <span className="text-2xl font-bold leading-none">{new Date(`${s.starts_on}T00:00:00`).getDate()}</span>
        <span className="text-xs">{new Date(`${s.starts_on}T00:00:00`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-sun-600">{s.courses.code}</p>
        <h3 className="font-semibold text-navy-900">{s.courses.title}</h3>
        {s.title && <p className="text-sm text-slate-600">{s.title}</p>}
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><ClockIcon className="h-4 w-4 shrink-0" />{sessionDateText(s)}</p>
        {s.location && (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <PinIcon className="h-4 w-4 shrink-0" />
            {s.map_url ? <a href={s.map_url} target="_blank" rel="noreferrer" className="hover:underline">{s.location}</a> : s.location}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
        <div className="text-right">
          <p className="font-semibold text-navy-900">{price > 0 ? formatMoney(price) : "ฟรี"}</p>
          <p className="text-xs text-slate-500">{price > 0 && s.vat ? "+VAT · " : ""}เหลือ {left}/{s.capacity} ที่</p>
        </div>
        {open ? (
          <ButtonLink to={`/app/training/book/${s.id}`} variant="sun">จองรอบนี้</ButtonLink>
        ) : (
          <Badge tone={left === 0 ? "red" : "amber"}>{left === 0 ? "เต็มแล้ว" : "ปิดรับสมัคร"}</Badge>
        )}
      </div>
    </div>
  );
}

export default function Training() {
  const { session } = useAuth();
  const { rows, loading, seats } = useUpcomingSessions();
  const courses = useRows<Course>(() => supabase.from("courses").select("*").eq("is_active", true).order("sort").order("title"));
  const [course, setCourse] = useState<string>("");
  const shown = useMemo(() => (course ? rows.filter((s) => s.course_id === course) : rows), [rows, course]);

  return (
    <>
      <section className="bg-navy-900 py-14 text-white">
        <div className="container-x">
          <p className="flex items-center gap-2 text-sm font-semibold text-sun-400"><AcademicIcon className="h-5 w-5" /> อบรมและกิจกรรม</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">ปฏิทินอบรม</h1>
          <p className="mt-3 max-w-2xl text-navy-100">
            เลือกหลักสูตรและรอบที่สะดวก จองได้ทันทีด้วยบัญชี One App เข้าอบรมรับแต้มสะสมชั่วโมงละ 1 แต้ม และรับใบประกาศหลังทำแบบประเมิน
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {session ? (
              <ButtonLink to="/app/training" variant="sun">การอบรมของฉัน</ButtonLink>
            ) : (
              <ButtonLink to="/login" variant="sun">เข้าสู่ระบบเพื่อจอง</ButtonLink>
            )}
            <ButtonLink to="/verify" variant="secondary">ตรวจสอบใบประกาศ</ButtonLink>
          </div>
        </div>
      </section>

      <section className="container-x py-12">
        {courses.rows.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button onClick={() => setCourse("")} className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${!course ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300"}`}>ทุกหลักสูตร</button>
            {courses.rows.map((c) => (
              <button key={c.id} onClick={() => setCourse(c.id)} className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${course === c.id ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300"}`}>
                {c.title}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <Loading />
        ) : shown.length ? (
          <div className="grid gap-4">
            {shown.map((s) => <SessionCard key={s.id} s={s} booked={seats.get(s.id) ?? 0} />)}
          </div>
        ) : (
          <Empty>ยังไม่มีรอบอบรมที่เปิดรับสมัคร ติดตามข่าวสารได้ทาง LINE OA หรือ <Link to="/contact?topic=training" className="underline">ติดต่อเรา</Link></Empty>
        )}

        {courses.rows.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-bold text-navy-900">หลักสูตรทั้งหมด</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {courses.rows.map((c) => (
                <div key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  {c.cover_url ? <img src={c.cover_url} alt="" className="h-36 w-full object-cover" /> : <div className="h-2" style={{ background: c.color || "#16235a" }} />}
                  <div className="p-5">
                    <p className="text-xs font-semibold text-sun-600">{c.code}{c.hours ? ` · ${c.hours} ชั่วโมง` : ""}</p>
                    <h3 className="mt-1 font-semibold text-navy-900">{c.title}</h3>
                    {c.subtitle && <p className="mt-1 text-sm text-slate-600">{c.subtitle}</p>}
                    {c.description && <p className="mt-2 line-clamp-3 text-sm text-slate-500">{c.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
