import { useRef, useState } from "react";
import { ImageUpload } from "../../../../components/ImageUpload";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Select, Textarea } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { formatMoney, openPrivateFile, uploadCourseMaterial, uploadTrainingMedia, type CertTemplate, type Course } from "../../../../lib/training";

interface Material { id: string; course_id: string | null; kind: string; title: string; url: string | null; file_path: string | null; visibility: string; sort: number }
const VIS: Record<string, string> = { attended: "หลังเช็กอิน", registered: "ผู้ลงทะเบียน", public: "ทุกคน" };

function Materials({ course }: { course: Course }) {
  const rows = useRows<Material>(() => supabase.from("course_materials").select("*").eq("course_id", course.id).order("sort"), [course.id]);
  const [f, setF] = useState({ kind: "file", title: "", url: "", visibility: "attended" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function add() {
    if (!f.title.trim() && !file) return setErr("กรอกชื่อเอกสาร");
    if (f.kind === "file" && !file) return setErr("เลือกไฟล์ที่จะอัปโหลด");
    if (f.kind !== "file" && !/^https?:\/\//.test(f.url)) return setErr("กรอกลิงก์ (https://…)");
    if (file && file.size > 50 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 50 MB");
    setBusy(true);
    setErr("");
    try {
      const file_path = f.kind === "file" && file ? await uploadCourseMaterial(course.id, file) : null;
      const { error } = await supabase.from("course_materials").insert({
        course_id: course.id, kind: f.kind, title: f.title.trim() || file!.name, visibility: f.visibility, sort: rows.rows.length,
        url: f.kind === "file" ? null : f.url, file_path,
      });
      if (error) {
        if (file_path) await supabase.storage.from("training-materials").remove([file_path]);
        throw error;
      }
      setF({ ...f, title: "", url: "" });
      setFile(null);
      rows.reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(m: Material) {
    if (!confirm("ลบเอกสารนี้?")) return;
    await supabase.from("course_materials").delete().eq("id", m.id);
    if (m.file_path) await supabase.storage.from("training-materials").remove([m.file_path]);
    rows.reload();
  }
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-navy-900">เอกสารอบรม / วิดีโอ</p>
      <p className="mb-2 text-xs text-slate-500">อัปโหลดไฟล์ให้ลูกค้าดาวน์โหลด ตั้ง “หลังเช็กอิน” = ลูกค้าโหลดได้เมื่อเช็กอินที่สถานที่อบรมแล้ว</p>
      <ul className="mb-3 space-y-1 text-sm">
        {rows.rows.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            {m.file_path
              ? <button className="text-left text-navy-700 hover:underline" onClick={() => openPrivateFile("training-materials", m.file_path!)}>📄 {m.title}</button>
              : <a href={m.url ?? "#"} target="_blank" rel="noreferrer" className="text-navy-700 hover:underline">{m.kind === "video" ? "🎬" : "🔗"} {m.title}</a>}
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">{VIS[m.visibility]} <button className="text-red-600" onClick={() => remove(m)}>ลบ</button></span>
          </li>
        ))}
        {!rows.loading && rows.rows.length === 0 && <li className="text-xs text-slate-400">ยังไม่มีเอกสาร</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr_9rem_auto]">
        <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="file">ไฟล์</option><option value="video">วิดีโอ (ลิงก์)</option><option value="link">ลิงก์</option></Select>
        <Input placeholder="ชื่อเอกสาร" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        {f.kind === "file" ? (
          <>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} className="truncate">{file ? file.name : "เลือกไฟล์ (PDF, PPT, ZIP…)"}</Button>
            <input ref={fileRef} type="file" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </>
        ) : (
          <Input placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        )}
        <Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}>{Object.entries(VIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button onClick={add} loading={busy}>{f.kind === "file" ? "อัปโหลด" : "เพิ่ม"}</Button>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function CourseForm({ value, templates, onSaved, onClose }: { value: Partial<Course>; templates: CertTemplate[]; onSaved: () => void; onClose: () => void }) {
  const [f, setF] = useState<Partial<Course>>(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Course>(k: K, v: Course[K] | null) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(f.code ?? "")) return setErr("รหัสหลักสูตรใช้ A-Z 0-9 - _ ไม่เกิน 20 ตัว (ใช้ในเลขใบประกาศ)");
    if (!f.title?.trim()) return setErr("กรุณากรอกชื่อหลักสูตร");
    setBusy(true);
    const row = {
      code: f.code, title: f.title, subtitle: f.subtitle || null, description: f.description || null, hours: f.hours ?? null, price: f.price ?? null,
      color: f.color || null, cover_url: f.cover_url || null, cert_template_id: f.cert_template_id || null, is_active: f.is_active ?? true, sort: f.sort ?? 0,
    };
    const { error } = f.id ? await supabase.from("courses").update(row).eq("id", f.id) : await supabase.from("courses").insert(row);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Card className="mb-4">
      <h3 className="mb-4 font-semibold text-navy-900">{f.id ? "แก้ไขหลักสูตร" : "เพิ่มหลักสูตร"}</h3>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="รหัส" required hint="เช่น OM, BSD"><Input value={f.code ?? ""} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
        <div className="sm:col-span-3"><Field label="ชื่อหลักสูตร" required><Input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field></div>
        <div className="sm:col-span-4"><Field label="คำโปรย"><Input value={f.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} /></Field></div>
        <div className="sm:col-span-4"><Field label="รายละเอียด"><Textarea rows={3} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <Field label="ชั่วโมง (= แต้ม)"><Input type="number" min={0} step="0.5" value={f.hours ?? ""} onChange={(e) => set("hours", num(e.target.value))} /></Field>
        <Field label="ราคา (บาท ก่อน VAT)" hint="ว่าง/0 = ฟรี"><Input type="number" min={0} value={f.price ?? ""} onChange={(e) => set("price", num(e.target.value))} /></Field>
        <Field label="สี"><Input type="color" value={f.color ?? "#16235a"} onChange={(e) => set("color", e.target.value)} className="h-10 !p-1" /></Field>
        <Field label="ลำดับ"><Input type="number" value={f.sort ?? 0} onChange={(e) => set("sort", Number(e.target.value))} /></Field>
        <div className="sm:col-span-2">
          <Field label="แม่แบบใบประกาศ">
            <Select value={f.cert_template_id ?? ""} onChange={(e) => set("cert_template_id", e.target.value || null)}>
              <option value="">— แบบพื้นฐาน —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.is_active ?? true} onChange={(e) => set("is_active", e.target.checked)} /> เปิดแสดง</label>
        <div className="sm:col-span-4"><p className="mb-1.5 text-sm font-medium text-slate-700">รูปปก</p><ImageUpload value={f.cover_url ?? ""} onChange={(u) => set("cover_url", u)} folder="courses" upload={uploadTrainingMedia} /></div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy}>บันทึก</Button><Button variant="ghost" onClick={onClose}>ปิด</Button></div>
    </Card>
  );
}

export default function CoursesTab() {
  const { can } = useAuth();
  const edit = can("courses");
  const courses = useRows<Course>(() => supabase.from("courses").select("*").order("sort").order("title"));
  const templates = useRows<CertTemplate>(() => supabase.from("cert_templates").select("id, name, image_url, config").order("name"));
  const [form, setForm] = useState<Partial<Course> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {edit && <div className="mb-4 flex justify-end"><Button onClick={() => setForm({ is_active: true, sort: courses.rows.length + 1 })}>เพิ่มหลักสูตร</Button></div>}
      {form && <CourseForm key={form.id ?? "new"} value={form} templates={templates.rows} onClose={() => setForm(null)} onSaved={() => { setForm(null); courses.reload(); }} />}
      {courses.loading ? <Loading /> : courses.rows.length ? (
        <div className="space-y-3">
          {courses.rows.map((c) => (
            <Card key={c.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="mt-1 h-10 w-2 rounded-full" style={{ background: c.color || "#16235a" }} />
                  <div>
                    <p className="text-xs font-semibold text-sun-600">{c.code}</p>
                    <p className="font-semibold text-navy-900">{c.title}</p>
                    <p className="text-sm text-slate-500">{c.hours ?? 0} ชั่วโมง · {Number(c.price ?? 0) > 0 ? formatMoney(c.price) : "ฟรี"} · ใบประกาศ: {templates.rows.find((t) => t.id === c.cert_template_id)?.name ?? "แบบพื้นฐาน"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {!c.is_active && <Badge>ซ่อน</Badge>}
                  {edit && <button className="font-semibold text-navy-700 hover:underline" onClick={() => setForm(c)}>แก้ไข</button>}
                  {edit && <button className="font-semibold text-navy-700 hover:underline" onClick={() => setOpen(open === c.id ? null : c.id)}>เอกสาร</button>}
                </div>
              </div>
              {open === c.id && <Materials course={c} />}
            </Card>
          ))}
        </div>
      ) : <Empty>ยังไม่มีหลักสูตร</Empty>}
    </div>
  );
}
