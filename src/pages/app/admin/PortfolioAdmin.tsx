import { useState, type FormEvent } from "react";
import { Gate } from "../../../components/AppLayout";
import { GalleryUpload, ImageUpload } from "../../../components/ImageUpload";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { PROJECT_TYPE_LABEL, type PortfolioProject } from "../../../lib/types";

const blank: Omit<PortfolioProject, "id"> = {
  title: "",
  project_type: "residential",
  size_kwp: null,
  province: "",
  year: new Date().getFullYear(),
  equipment: "",
  description: "",
  cover_url: "",
  images: [],
  is_published: true,
  sort: 0,
};

function Editor({ initial, onClose }: { initial: Partial<PortfolioProject>; onClose: (saved: boolean) => void }) {
  const [p, setP] = useState({ ...blank, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((x) => ({ ...x, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const row = {
      title: p.title.trim(),
      project_type: p.project_type,
      size_kwp: p.size_kwp,
      province: p.province || null,
      year: p.year,
      equipment: p.equipment || null,
      description: p.description || null,
      cover_url: p.cover_url || null,
      images: p.images,
      is_published: p.is_published,
      sort: p.sort,
    };
    const { error } = p.id
      ? await supabase.from("portfolio_projects").update(row).eq("id", p.id)
      : await supabase.from("portfolio_projects").insert(row);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onClose(true);
  }

  async function remove() {
    if (!p.id || !confirm(`ลบผลงาน “${p.title}”?`)) return;
    const { error } = await supabase.from("portfolio_projects").delete().eq("id", p.id);
    if (error) return setErr(errorMessage(error));
    onClose(true);
  }

  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><Field label="ชื่อโครงการ" required><Input value={p.title} onChange={(e) => set("title", e.target.value)} required /></Field></div>
        <Field label="ประเภท">
          <Select value={p.project_type} onChange={(e) => set("project_type", e.target.value as PortfolioProject["project_type"])}>
            {Object.entries(PROJECT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="ขนาดระบบ (kWp)"><Input type="number" step="0.01" min="0" value={p.size_kwp ?? ""} onChange={(e) => set("size_kwp", e.target.value ? Number(e.target.value) : null)} /></Field>
        <Field label="จังหวัด"><Input value={p.province ?? ""} onChange={(e) => set("province", e.target.value)} /></Field>
        <Field label="ปี (ค.ศ.)" hint={p.year ? `พ.ศ. ${p.year + 543}` : undefined}><Input type="number" min="2000" max="2100" value={p.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></Field>
        <div className="sm:col-span-2"><Field label="อุปกรณ์ที่ใช้"><Input value={p.equipment ?? ""} onChange={(e) => set("equipment", e.target.value)} placeholder="เช่น SolarEdge SE10K + Optimizer S440" /></Field></div>
        <div className="sm:col-span-2 lg:col-span-4"><Field label="รายละเอียด"><Textarea rows={3} value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="ภาพหน้าปก"><ImageUpload folder="portfolio" value={p.cover_url ?? ""} onChange={(v) => set("cover_url", v)} /></Field></div>
        <div className="sm:col-span-2"><Field label="แกลเลอรี"><GalleryUpload folder="portfolio" value={p.images} onChange={(v) => set("images", v)} /></Field></div>
        <Field label="ลำดับการแสดง" hint="เลขน้อยแสดงก่อน"><Input type="number" value={p.sort} onChange={(e) => set("sort", Number(e.target.value) || 0)} /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4" checked={p.is_published} onChange={(e) => set("is_published", e.target.checked)} /> แสดงบนหน้าเว็บ
        </label>
        {err && <div className="sm:col-span-2 lg:col-span-4"><Alert>{err}</Alert></div>}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" loading={busy}>บันทึก</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)}>ยกเลิก</Button>
          {p.id && <Button type="button" variant="danger" className="ml-auto" onClick={remove}>ลบ</Button>}
        </div>
      </form>
    </Card>
  );
}

export default function PortfolioAdmin() {
  const { can } = useAuth();
  const list = useRows<PortfolioProject>(() => supabase.from("portfolio_projects").select("*").order("sort").order("created_at", { ascending: false }));
  const [editing, setEditing] = useState<Partial<PortfolioProject> | null>(null);
  return (
    <Gate allow={can("site_content")}>
      <PageTitle title="ผลงาน" subtitle="โครงการที่ติดตั้ง แสดงบนหน้าแรกและหน้าผลงาน" actions={!editing && <Button onClick={() => setEditing({})}>+ เพิ่มผลงาน</Button>} />
      {editing && <Editor key={editing.id ?? "new"} initial={editing} onClose={(saved) => { setEditing(null); if (saved) list.reload(); }} />}
      {list.loading ? (
        <Loading />
      ) : list.rows.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.rows.map((p) => (
            <Card key={p.id} className="flex gap-4 !p-3">
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {(p.cover_url || p.images[0]) && <img src={p.cover_url || p.images[0]} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-900">{p.title}</p>
                <p className="text-sm text-slate-500">{[PROJECT_TYPE_LABEL[p.project_type], p.size_kwp && `${p.size_kwp} kWp`, p.province].filter(Boolean).join(" · ")}</p>
                <div className="mt-2 flex items-center gap-2">
                  {p.is_published ? <Badge tone="green">แสดงอยู่</Badge> : <Badge>ซ่อน</Badge>}
                  <button onClick={() => setEditing(p)} className="text-sm font-semibold text-navy-700 hover:underline">แก้ไข</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>ยังไม่มีผลงาน กด “เพิ่มผลงาน” เพื่อเริ่ม</Empty>
      )}
    </Gate>
  );
}
