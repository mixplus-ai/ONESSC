import { useState } from "react";
import { ImageUpload } from "../../../../components/ImageUpload";
import { Alert, Button, Card, Empty, Field, Input, Loading, Select } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { DEFAULT_CERT_CONFIG, uploadTrainingMedia, type CertConfig, type CertField, type CertFieldKey, type CertTemplate } from "../../../../lib/training";
import { CertificateView } from "../../training/Certificate";

const FIELD_LABEL: Record<CertFieldKey, string> = {
  name: "ชื่อผู้อบรม", nameEn: "ชื่อภาษาอังกฤษ", course: "ชื่อหลักสูตร", certNo: "เลขที่ใบประกาศ", date: "วันที่อบรม", expires: "วันหมดอายุ", qr: "QR ตรวจสอบ",
};

function TemplateForm({ value, onSaved, onClose }: { value: Partial<CertTemplate>; onSaved: () => void; onClose: () => void }) {
  const [name, setName] = useState(value.name ?? "");
  const [image, setImage] = useState(value.image_url ?? "");
  const [cfg, setCfg] = useState<CertConfig>({ ...DEFAULT_CERT_CONFIG, ...(value.config ?? {}), fields: { ...DEFAULT_CERT_CONFIG.fields, ...(value.config?.fields ?? {}) } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setField = (k: CertFieldKey, patch: Partial<CertField>) => setCfg((c) => ({ ...c, fields: { ...c.fields, [k]: { ...(c.fields?.[k] as CertField), ...patch } } }));
  const external = image && !image.includes(".supabase.co/");

  async function save() {
    if (!name.trim()) return setErr("กรุณาตั้งชื่อแม่แบบ");
    setBusy(true);
    const row = { name: name.trim(), image_url: image || null, config: cfg };
    const { error } = value.id ? await supabase.from("cert_templates").update(row).eq("id", value.id) : await supabase.from("cert_templates").insert(row);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }

  return (
    <Card className="mb-4">
      <h3 className="mb-4 font-semibold text-navy-900">{value.id ? "แก้ไขแม่แบบใบประกาศ" : "เพิ่มแม่แบบใบประกาศ"}</h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="ชื่อแม่แบบ" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">รูปพื้นหลัง (แนวนอน A4 แนะนำ 3508×2480 px)</p>
            <ImageUpload value={image} onChange={setImage} folder="cert-templates" upload={uploadTrainingMedia} />
            {external && <p className="mt-1 text-xs text-amber-700">รูปนี้อยู่นอกระบบ (ย้ายมาจาก cerssc) ลูกค้าอาจดาวน์โหลดใบประกาศไม่ได้ กรุณาอัปโหลดรูปเดิมใหม่อีกครั้ง</p>}
          </div>
          <Field label="ภาษาวันที่">
            <Select value={cfg.dateLang ?? "en"} onChange={(e) => setCfg({ ...cfg, dateLang: e.target.value as "th" | "en" })}>
              <option value="en">อังกฤษ (10 November 2026)</option>
              <option value="th">ไทย (10 พฤศจิกายน 2569)</option>
            </Select>
          </Field>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="py-1 pr-2 font-medium">ช่อง</th><th className="px-1 font-medium">แสดง</th><th className="px-1 font-medium">X</th><th className="px-1 font-medium">Y</th><th className="px-1 font-medium">ขนาด</th><th className="px-1 font-medium">สี</th><th className="px-1 font-medium">จัด</th></tr>
              </thead>
              <tbody>
                {(Object.keys(FIELD_LABEL) as CertFieldKey[]).map((k) => {
                  const f = cfg.fields?.[k] as CertField;
                  return (
                    <tr key={k}>
                      <td className="py-1 pr-2">{FIELD_LABEL[k]}</td>
                      <td className="px-1"><input type="checkbox" checked={f?.show ?? false} onChange={(e) => setField(k, { show: e.target.checked })} /></td>
                      {(["x", "y", "size"] as const).map((p) => (
                        <td key={p} className="px-1"><input type="number" step="0.005" min={0} max={1} value={f?.[p] ?? 0} onChange={(e) => setField(k, { [p]: Number(e.target.value) })} className="w-20 rounded border border-slate-300 px-1 py-0.5" /></td>
                      ))}
                      <td className="px-1"><input type="color" value={f?.color ?? "#111111"} onChange={(e) => setField(k, { color: e.target.value })} /></td>
                      <td className="px-1">
                        {k !== "qr" && (
                          <select value={f?.align ?? "left"} onChange={(e) => setField(k, { align: e.target.value as CanvasTextAlign })} className="rounded border border-slate-300 py-0.5">
                            <option value="left">ซ้าย</option><option value="center">กลาง</option><option value="right">ขวา</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-500">X, Y, ขนาด เป็นสัดส่วนของความกว้าง/สูงรูป (0–1) เช่น X 0.5 = กึ่งกลาง</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">ตัวอย่าง</p>
          <CertificateView template={{ image_url: image || null, config: cfg }} data={{ name: "นายสมชาย ใจดี", nameEn: "Mr. Somchai Jaidee", course: "SolarEdge O&M (Operation & Maintenance)", certNo: "SSC-OM-2026-0001", date: "2026-11-19", expires: "2027-11-19" }} />
        </div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy}>บันทึก</Button><Button variant="ghost" onClick={onClose}>ปิด</Button></div>
    </Card>
  );
}

export default function TemplatesTab() {
  const { can } = useAuth();
  const edit = can("courses");
  const rows = useRows<CertTemplate>(() => supabase.from("cert_templates").select("id, name, image_url, config").order("name"));
  const [form, setForm] = useState<Partial<CertTemplate> | null>(null);
  return (
    <div>
      {edit && <div className="mb-4 flex justify-end"><Button onClick={() => setForm({})}>เพิ่มแม่แบบ</Button></div>}
      {form && <TemplateForm key={form.id ?? "new"} value={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); rows.reload(); }} />}
      {rows.loading ? <Loading /> : rows.rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.rows.map((t) => (
            <Card key={t.id} className="!p-3">
              <div className="aspect-[1.414] overflow-hidden rounded-lg bg-slate-100">{t.image_url && <img src={t.image_url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="mt-2 flex items-center justify-between">
                <p className="font-medium text-navy-900">{t.name}</p>
                {edit && <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => setForm(t)}>แก้ไข</button>}
              </div>
            </Card>
          ))}
        </div>
      ) : <Empty>ยังไม่มีแม่แบบ ใบประกาศจะใช้แบบพื้นฐาน</Empty>}
    </div>
  );
}
