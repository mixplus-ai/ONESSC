import { useEffect, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { ImageUpload } from "../../../components/ImageUpload";
import { Alert, Button, Card, Field, Input, PageTitle, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { DEFAULT_SETTINGS, loadSettings } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import type { SiteSettings } from "../../../lib/types";

export default function Content() {
  const { can, session } = useAuth();
  const [s, setS] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  useEffect(() => {
    loadSettings(true).then((x) => setS(structuredClone(x)));
  }, []);

  const set = <K extends keyof SiteSettings>(k: K, field: keyof SiteSettings[K], v: unknown) =>
    setS((prev) => ({ ...prev, [k]: { ...prev[k], [field]: v } }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const rows = (Object.keys(s) as (keyof SiteSettings)[]).map((key) => ({
      key,
      value: s[key],
      updated_at: new Date().toISOString(),
      updated_by: session?.user.id ?? null,
    }));
    const { error } = await supabase.from("site_settings").upsert(rows);
    setBusy(false);
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    await loadSettings(true);
    setMsg({ tone: "green", text: "บันทึกแล้ว หน้าเว็บอัปเดตทันที" });
  }

  const lines = (arr: string[]) => arr.join("\n");
  const toArr = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

  return (
    <Gate allow={can("site_content")}>
      <PageTitle title="เนื้อหาหน้าเว็บ" subtitle="ข้อมูลบริษัท แบนเนอร์หน้าแรก และหน้าเกี่ยวกับเรา" actions={<Button onClick={save} loading={busy}>บันทึกทั้งหมด</Button>} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="space-y-6">
        <Card>
          <h3 className="mb-4 font-semibold text-navy-900">ข้อมูลบริษัท</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อบริษัท (ไทย)"><Input value={s.company.name_th} onChange={(e) => set("company", "name_th", e.target.value)} /></Field>
            <Field label="ชื่อบริษัท (อังกฤษ)"><Input value={s.company.name_en} onChange={(e) => set("company", "name_en", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="สโลแกน"><Input value={s.company.tagline} onChange={(e) => set("company", "tagline", e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label="ที่อยู่"><Textarea rows={2} value={s.company.address} onChange={(e) => set("company", "address", e.target.value)} /></Field></div>
            <Field label="เบอร์โทร"><Input value={s.company.phone} onChange={(e) => set("company", "phone", e.target.value)} /></Field>
            <Field label="อีเมล"><Input type="email" value={s.company.email} onChange={(e) => set("company", "email", e.target.value)} /></Field>
            <Field label="ลิงก์ LINE OA" hint="ใช้กับปุ่ม “คุยกับเซลล์”"><Input value={s.company.line_oa_url} onChange={(e) => set("company", "line_oa_url", e.target.value)} /></Field>
            <Field label="ลิงก์ Facebook"><Input value={s.company.facebook_url} onChange={(e) => set("company", "facebook_url", e.target.value)} /></Field>
            <Field label="เวลาทำการ"><Input value={s.company.office_hours} onChange={(e) => set("company", "office_hours", e.target.value)} /></Field>
            <Field label="ลิงก์ฝังแผนที่ Google Maps" hint="Google Maps → แชร์ → ฝังแผนที่ → คัดลอกค่า src ของ iframe">
              <Input value={s.company.map_embed_url} onChange={(e) => set("company", "map_embed_url", e.target.value)} placeholder="https://www.google.com/maps/embed?..." />
            </Field>
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 font-semibold text-navy-900">แบนเนอร์หน้าแรก (Hero)</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="ข้อความหลัก"><Input value={s.hero.title} onChange={(e) => set("hero", "title", e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label="ข้อความรอง"><Textarea rows={2} value={s.hero.subtitle} onChange={(e) => set("hero", "subtitle", e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label="ภาพพื้นหลัง"><ImageUpload folder="hero" value={s.hero.image_url} onChange={(v) => set("hero", "image_url", v)} /></Field></div>
            <Field label="ปุ่มหลัก: ข้อความ"><Input value={s.hero.cta_primary_label} onChange={(e) => set("hero", "cta_primary_label", e.target.value)} /></Field>
            <Field label="ปุ่มหลัก: ลิงก์"><Input value={s.hero.cta_primary_href} onChange={(e) => set("hero", "cta_primary_href", e.target.value)} /></Field>
            <Field label="ปุ่มรอง: ข้อความ"><Input value={s.hero.cta_secondary_label} onChange={(e) => set("hero", "cta_secondary_label", e.target.value)} /></Field>
            <Field label="ปุ่มรอง: ลิงก์"><Input value={s.hero.cta_secondary_href} onChange={(e) => set("hero", "cta_secondary_href", e.target.value)} /></Field>
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 font-semibold text-navy-900">เกี่ยวกับเรา</h3>
          <div className="grid gap-4">
            <Field label="ประวัติบริษัท"><Textarea rows={4} value={s.about.history} onChange={(e) => set("about", "history", e.target.value)} /></Field>
            <Field label="วิสัยทัศน์"><Textarea rows={2} value={s.about.vision} onChange={(e) => set("about", "vision", e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="แบรนด์ที่เป็นตัวแทน" hint="บรรทัดละ 1 แบรนด์"><Textarea rows={4} value={lines(s.about.brands)} onChange={(e) => set("about", "brands", toArr(e.target.value))} /></Field>
              <Field label="ใบรับรอง" hint="บรรทัดละ 1 รายการ"><Textarea rows={4} value={lines(s.about.certificates)} onChange={(e) => set("about", "certificates", toArr(e.target.value))} /></Field>
            </div>
          </div>
        </Card>
        <div className="flex justify-end"><Button onClick={save} loading={busy}>บันทึกทั้งหมด</Button></div>
      </div>
    </Gate>
  );
}
