import { useState, type FormEvent } from "react";
import { Gate } from "../../../components/AppLayout";
import { ImageUpload } from "../../../components/ImageUpload";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { DEPARTMENT_LABEL, type TeamMember } from "../../../lib/types";

const blank: Omit<TeamMember, "id"> = {
  full_name: "",
  position: "",
  department: "sales",
  phone: "",
  line_id: "",
  email: "",
  photo_url: "",
  is_published: true,
  sort: 0,
};

function Editor({ initial, onClose }: { initial: Partial<TeamMember>; onClose: (saved: boolean) => void }) {
  const [m, setM] = useState({ ...blank, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof m>(k: K, v: (typeof m)[K]) => setM((x) => ({ ...x, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const row = {
      full_name: m.full_name.trim(),
      position: m.position || null,
      department: m.department,
      phone: m.phone || null,
      line_id: m.line_id || null,
      email: m.email || null,
      photo_url: m.photo_url || null,
      is_published: m.is_published,
      sort: m.sort,
    };
    const { error } = m.id ? await supabase.from("team_members").update(row).eq("id", m.id) : await supabase.from("team_members").insert(row);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onClose(true);
  }

  async function remove() {
    if (!m.id || !confirm(`ลบ “${m.full_name}” ออกจากทีมงาน?`)) return;
    const { error } = await supabase.from("team_members").delete().eq("id", m.id);
    if (error) return setErr(errorMessage(error));
    onClose(true);
  }

  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="ชื่อ-นามสกุล" required><Input value={m.full_name} onChange={(e) => set("full_name", e.target.value)} required /></Field>
        <Field label="ตำแหน่ง"><Input value={m.position ?? ""} onChange={(e) => set("position", e.target.value)} /></Field>
        <Field label="แผนก">
          <Select value={m.department} onChange={(e) => set("department", e.target.value as TeamMember["department"])}>
            {Object.entries(DEPARTMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="เบอร์โทร"><Input type="tel" value={m.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="LINE ID"><Input value={m.line_id ?? ""} onChange={(e) => set("line_id", e.target.value)} /></Field>
        <Field label="อีเมล"><Input type="email" value={m.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="รูป"><ImageUpload folder="team" value={m.photo_url ?? ""} onChange={(v) => set("photo_url", v)} /></Field></div>
        <div className="space-y-3">
          <Field label="ลำดับการแสดง"><Input type="number" value={m.sort} onChange={(e) => set("sort", Number(e.target.value) || 0)} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4" checked={m.is_published} onChange={(e) => set("is_published", e.target.checked)} /> แสดงบนหน้าเว็บ
          </label>
        </div>
        {err && <div className="sm:col-span-2 lg:col-span-3"><Alert>{err}</Alert></div>}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" loading={busy}>บันทึก</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)}>ยกเลิก</Button>
          {m.id && <Button type="button" variant="danger" className="ml-auto" onClick={remove}>ลบ</Button>}
        </div>
      </form>
    </Card>
  );
}

export default function TeamAdmin() {
  const { can } = useAuth();
  const list = useRows<TeamMember>(() => supabase.from("team_members").select("*").order("sort").order("full_name"));
  const [editing, setEditing] = useState<Partial<TeamMember> | null>(null);
  return (
    <Gate allow={can("site_content")}>
      <PageTitle title="ทีมงาน" subtitle="รายชื่อพนักงานที่แสดงในหน้าทีมงานและหน้าติดต่อ" actions={!editing && <Button onClick={() => setEditing({})}>+ เพิ่มพนักงาน</Button>} />
      {editing && <Editor key={editing.id ?? "new"} initial={editing} onClose={(saved) => { setEditing(null); if (saved) list.reload(); }} />}
      {list.loading ? (
        <Loading />
      ) : list.rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.rows.map((m) => (
            <Card key={m.id} className="flex items-center gap-3 !p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">{m.photo_url && <img src={m.photo_url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-900">{m.full_name}</p>
                <p className="truncate text-sm text-slate-500">{[m.position, DEPARTMENT_LABEL[m.department]].filter(Boolean).join(" · ")}</p>
                <div className="mt-1 flex items-center gap-2">
                  {!m.is_published && <Badge>ซ่อน</Badge>}
                  <button onClick={() => setEditing(m)} className="text-sm font-semibold text-navy-700 hover:underline">แก้ไข</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>ยังไม่มีรายชื่อทีมงาน</Empty>
      )}
    </Gate>
  );
}
