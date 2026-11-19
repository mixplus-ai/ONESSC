import { useState, type ReactNode } from "react";
import { IMAGE_SIZES, ImageUpload } from "../../../../components/ImageUpload";
import { Button, Field, Input, Textarea } from "../../../../components/ui";
import { uploadTrainingMedia, type CourseDetails, type CourseInstructor, type CourseTopic } from "../../../../lib/training";

/** Drops blank lines / rows before saving. */
export function cleanDetails(d: CourseDetails): CourseDetails {
  const lines = (x?: string[]) => (x ?? []).map((s) => s.trim()).filter(Boolean);
  return {
    objectives: lines(d.objectives),
    audience: lines(d.audience),
    prerequisites: lines(d.prerequisites),
    topics: (d.topics ?? []).filter((t) => t.title?.trim()).map((t) => ({ title: t.title.trim(), detail: t.detail?.trim() || undefined, time: t.time?.trim() || undefined })),
    instructors: (d.instructors ?? []).filter((i) => i.name?.trim()),
    includes: lines(d.includes),
    bring: lines(d.bring),
    faqs: (d.faqs ?? []).filter((f) => f.q?.trim()),
    gallery: (d.gallery ?? []).filter(Boolean),
  };
}

function Lines({ label, hint, value, onChange, rows = 4 }: { label: string; hint?: string; value?: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <Field label={label} hint={hint ?? "1 บรรทัด = 1 ข้อ"}>
      <Textarea rows={rows} value={(value ?? []).join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
    </Field>
  );
}

/** Up / down / remove buttons for a repeatable row. */
function RowTools({ i, n, move, remove }: { i: number; n: number; move: (from: number, to: number) => void; remove: (i: number) => void }) {
  const b = "rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30";
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-sm">
      <button type="button" className={b} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="เลื่อนขึ้น">↑</button>
      <button type="button" className={b} disabled={i === n - 1} onClick={() => move(i, i + 1)} aria-label="เลื่อนลง">↓</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50" onClick={() => remove(i)} aria-label="ลบ">✕</button>
    </span>
  );
}

function useList<T>(list: T[] | undefined, set: (v: T[]) => void) {
  const a = list ?? [];
  return {
    a,
    put: (i: number, v: Partial<T>) => set(a.map((x, j) => (j === i ? { ...x, ...v } : x))),
    add: (v: T) => set([...a, v]),
    remove: (i: number) => set(a.filter((_, j) => j !== i)),
    move: (from: number, to: number) => {
      const b = [...a];
      const [x] = b.splice(from, 1);
      b.splice(to, 0, x);
      set(b);
    },
  };
}

function Block({ title, hint, children, open = false }: { title: string; hint?: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-xl ring-1 ring-slate-200">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-navy-900">
        {title}{hint && <span className="ml-2 font-normal text-slate-500">{hint}</span>}
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

/** Editor for courses.details: everything shown on the public course page. */
export function CourseDetailsEditor({ value, onChange }: { value: CourseDetails; onChange: (v: CourseDetails) => void }) {
  const set = <K extends keyof CourseDetails>(k: K, v: CourseDetails[K]) => onChange({ ...value, [k]: v });
  const topics = useList<CourseTopic>(value.topics, (v) => set("topics", v));
  const people = useList<CourseInstructor>(value.instructors, (v) => set("instructors", v));
  const faqs = useList<{ q: string; a: string }>(value.faqs, (v) => set("faqs", v));
  const gallery = useList<string>(value.gallery, (v) => set("gallery", v));
  const [bulk, setBulk] = useState("");
  const n = (x?: unknown[]) => (x ?? []).length;

  function pasteTopics() {
    // "09:00-10:30 หัวข้อ" or just "หัวข้อ" per line
    const rows = bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2})\s+(.+)$/);
      return m ? { time: m[1].replace(/\s+/g, ""), title: m[2] } : { title: l.replace(/^\d+[.)]\s*/, "") };
    });
    if (rows.length) set("topics", [...topics.a, ...rows]);
    setBulk("");
  }

  return (
    <div className="space-y-3">
      <Block title="ภาพรวม" hint="สิ่งที่จะได้เรียนรู้ · เหมาะสำหรับ · พื้นฐาน" open>
        <Lines label="สิ่งที่จะได้เรียนรู้" value={value.objectives} onChange={(v) => set("objectives", v)} rows={5} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Lines label="เหมาะสำหรับ" value={value.audience} onChange={(v) => set("audience", v)} />
          <Lines label="พื้นฐานที่ควรมี" value={value.prerequisites} onChange={(v) => set("prerequisites", v)} />
        </div>
      </Block>

      <Block title="หัวข้อการอบรม / กำหนดการ" hint={n(value.topics) ? `${n(value.topics)} หัวข้อ` : undefined} open>
        {topics.a.map((t, i) => (
          <div key={i} className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 text-center text-sm font-bold text-slate-400">{i + 1}</span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[9rem_1fr]">
                <Input placeholder="เวลา เช่น 09:00-10:30" value={t.time ?? ""} onChange={(e) => topics.put(i, { time: e.target.value })} />
                <Input placeholder="ชื่อหัวข้อ" value={t.title} onChange={(e) => topics.put(i, { title: e.target.value })} />
                <div className="sm:col-span-2"><Textarea rows={2} placeholder="รายละเอียดหัวข้อ (ไม่บังคับ)" value={t.detail ?? ""} onChange={(e) => topics.put(i, { detail: e.target.value })} /></div>
              </div>
              <RowTools i={i} n={topics.a.length} move={topics.move} remove={topics.remove} />
            </div>
          </div>
        ))}
        <Button variant="secondary" onClick={() => topics.add({ title: "" })}>+ เพิ่มหัวข้อ</Button>
        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <p className="mb-1.5 text-xs text-slate-500">วางหลายหัวข้อพร้อมกัน: 1 บรรทัดต่อ 1 หัวข้อ ขึ้นต้นด้วยเวลาได้ เช่น “09:00-10:30 ภาพรวมระบบ SolarEdge”</p>
          <Textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <Button variant="ghost" className="mt-1" onClick={pasteTopics} disabled={!bulk.trim()}>เพิ่มจากข้อความ</Button>
        </div>
      </Block>

      <Block title="วิทยากร" hint={n(value.instructors) ? `${n(value.instructors)} คน` : undefined}>
        {people.a.map((p, i) => (
          <div key={i} className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Input placeholder="ชื่อวิทยากร" value={p.name} onChange={(e) => people.put(i, { name: e.target.value })} />
                <Input placeholder="ตำแหน่ง เช่น SolarEdge Certified Trainer" value={p.role ?? ""} onChange={(e) => people.put(i, { role: e.target.value })} />
                <div className="sm:col-span-2"><Textarea rows={2} placeholder="ประวัติย่อ / ประสบการณ์" value={p.bio ?? ""} onChange={(e) => people.put(i, { bio: e.target.value })} /></div>
                <div className="sm:col-span-2"><ImageUpload value={p.photo_url ?? ""} onChange={(u) => people.put(i, { photo_url: u })} folder="instructors" upload={uploadTrainingMedia} size={IMAGE_SIZES.person} label="รูปวิทยากร" /></div>
              </div>
              <RowTools i={i} n={people.a.length} move={people.move} remove={people.remove} />
            </div>
          </div>
        ))}
        <Button variant="secondary" onClick={() => people.add({ name: "" })}>+ เพิ่มวิทยากร</Button>
      </Block>

      <Block title="สิ่งที่ได้รับ / สิ่งที่ต้องเตรียม">
        <div className="grid gap-3 sm:grid-cols-2">
          <Lines label="สิ่งที่ได้รับ" hint="ใบประกาศและแต้ม ระบบแสดงให้อัตโนมัติ · 1 บรรทัด = 1 ข้อ" value={value.includes} onChange={(v) => set("includes", v)} />
          <Lines label="สิ่งที่ต้องเตรียม" value={value.bring} onChange={(v) => set("bring", v)} />
        </div>
      </Block>

      <Block title="คำถามที่พบบ่อย" hint={n(value.faqs) ? `${n(value.faqs)} ข้อ` : undefined}>
        {faqs.a.map((f, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
            <div className="grid min-w-0 flex-1 gap-2">
              <Input placeholder="คำถาม" value={f.q} onChange={(e) => faqs.put(i, { q: e.target.value })} />
              <Textarea rows={2} placeholder="คำตอบ" value={f.a} onChange={(e) => faqs.put(i, { a: e.target.value })} />
            </div>
            <RowTools i={i} n={faqs.a.length} move={faqs.move} remove={faqs.remove} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => faqs.add({ q: "", a: "" })}>+ เพิ่มคำถาม</Button>
      </Block>

      <Block title="รูปบรรยากาศ" hint={n(value.gallery) ? `${n(value.gallery)} รูป` : undefined}>
        {gallery.a.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><ImageUpload value={g} onChange={(u) => set("gallery", gallery.a.map((x, j) => (j === i ? u : x)))} folder="course-gallery" upload={uploadTrainingMedia} /></div>
            <RowTools i={i} n={gallery.a.length} move={gallery.move} remove={gallery.remove} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => gallery.add("")}>+ เพิ่มรูป</Button>
      </Block>
    </div>
  );
}
