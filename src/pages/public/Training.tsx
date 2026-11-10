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

const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const ym = (d: string) => d.slice(0, 7);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
function shiftMonth(m: string, by: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Month grid; days with a session are marked in the course colour and can be clicked. */
function Calendar({ month, onMonth, day, onDay, sessions }: {
  month: string;
  onMonth: (m: string) => void;
  day: string;
  onDay: (d: string) => void;
  sessions: (Session & { courses: Course })[];
}) {
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const byDay = new Map<string, (Session & { courses: Course })[]>();
  for (const s of sessions) {
    const end = s.ends_on && s.ends_on > s.starts_on ? s.ends_on : s.starts_on;
    for (let d = new Date(`${s.starts_on}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
  }
  const today = todayBkk();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="เดือนก่อน" onClick={() => onMonth(shiftMonth(month, -1))} className="rounded-lg px-2.5 py-1 text-lg text-slate-600 hover:bg-slate-100">‹</button>
        <p className="font-semibold text-navy-900">{monthLabel(month)}</p>
        <button type="button" aria-label="เดือนถัดไป" onClick={() => onMonth(shiftMonth(month, 1))} className="rounded-lg px-2.5 py-1 text-lg text-slate-600 hover:bg-slate-100">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
        {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const list = byDay.get(d) ?? [];
          const has = list.length > 0;
          const selected = d === day;
          return (
            <button
              key={d}
              type="button"
              disabled={!has}
              onClick={() => onDay(selected ? "" : d)}
              title={list.map((s) => s.courses.title).join(", ")}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg ${selected ? "bg-navy-800 font-semibold text-white" : has ? "font-semibold text-navy-900 hover:bg-navy-50" : d < today ? "text-slate-300" : "text-slate-500"} ${d === today && !selected ? "ring-1 ring-sun-400" : ""}`}
            >
              {Number(d.slice(8))}
              {has && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {list.slice(0, 3).map((s) => <span key={s.id} className="h-1.5 w-1.5 rounded-full" style={{ background: selected ? "#fff" : s.courses.color || "#16235a" }} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">วันที่มีจุดสีคือวันที่มีรอบอบรม กดเพื่อดูรอบของวันนั้น</p>
    </div>
  );
}

export default function Training() {
  const { session } = useAuth();
  const { rows, loading, seats } = useUpcomingSessions();
  const courses = useRows<Course>(() => supabase.from("courses").select("*").eq("is_active", true).order("sort").order("title"));
  const [course, setCourse] = useState<string>("");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(""); // "" = ทุกเดือน
  const [day, setDay] = useState("");
  const [calMonth, setCalMonth] = useState(ym(todayBkk()));
  const months = useMemo(() => [...new Set(rows.map((s) => ym(s.starts_on)))], [rows]);
  useEffect(() => {
    // open the calendar on the first month that has a session
    if (!month && months.length && !months.includes(calMonth)) setCalMonth(months[0]);
  }, [months]); // eslint-disable-line react-hooks/exhaustive-deps

  const byCourse = useMemo(() => (course ? rows.filter((s) => s.course_id === course) : rows), [rows, course]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return byCourse.filter((s) => {
      if (day && !(s.starts_on <= day && (s.ends_on ?? s.starts_on) >= day)) return false;
      if (!day && month && ym(s.starts_on) !== month) return false;
      if (!term) return true;
      return [s.courses.title, s.courses.code, s.courses.subtitle, s.title, s.location].some((x) => x?.toLowerCase().includes(term));
    });
  }, [byCourse, q, month, day]);

  function pickMonth(m: string) {
    setMonth(m);
    setDay("");
    if (m) setCalMonth(m);
  }
  function pickDay(d: string) {
    setDay(d);
    if (d) setMonth(ym(d));
  }
  const filtered = Boolean(q || month || day || course);

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
        <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:items-start">
          <aside className="space-y-4 lg:sticky lg:top-20">
            <Calendar month={calMonth} onMonth={(m) => { setCalMonth(m); pickMonth(m); }} day={day} onDay={pickDay} sessions={byCourse} />
            {courses.rows.length > 1 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="mb-2 text-sm font-semibold text-navy-900">หลักสูตร</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setCourse("")} className={`rounded-full px-3 py-1 text-sm ring-1 ${!course ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300"}`}>ทั้งหมด</button>
                  {courses.rows.map((c) => (
                    <button key={c.id} onClick={() => setCourse(c.id)} className={`rounded-full px-3 py-1 text-sm ring-1 ${course === c.id ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300"}`}>{c.code}</button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <div className="min-w-0">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาหลักสูตร รหัส หรือสถานที่"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              />
              <select
                value={month}
                onChange={(e) => pickMonth(e.target.value)}
                aria-label="เลือกเดือน"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-navy-500 focus:outline-none"
              >
                <option value="">ทุกเดือน</option>
                {[...new Set([...months, ...(month ? [month] : [])])].sort().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            {filtered && (
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                พบ {shown.length} รอบ
                {day && <span>· วันที่ {new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</span>}
                {!day && month && <span>· {monthLabel(month)}</span>}
                <button className="text-navy-700 underline" onClick={() => { setQ(""); setMonth(""); setDay(""); setCourse(""); }}>ล้างตัวกรอง</button>
              </p>
            )}
            {loading ? (
              <Loading />
            ) : shown.length ? (
              <div className="grid gap-4">
                {shown.map((s) => <SessionCard key={s.id} s={s} booked={seats.get(s.id) ?? 0} />)}
              </div>
            ) : rows.length ? (
              <Empty>ไม่มีรอบอบรมตามที่เลือก ลองเลือกเดือนอื่นหรือล้างตัวกรอง</Empty>
            ) : (
              <Empty>ยังไม่มีรอบอบรมที่เปิดรับสมัคร ติดตามข่าวสารได้ทาง LINE OA หรือ <Link to="/contact?topic=training" className="underline">ติดต่อเรา</Link></Empty>
            )}
          </div>
        </div>

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
