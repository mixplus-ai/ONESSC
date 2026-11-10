import { useEffect, useState } from "react";
import { Gate } from "../../../../components/AppLayout";
import { Alert, Button, Card, Field, Input, Loading, PageTitle, Textarea } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { loadTrainingSettings, type TrainingSettings } from "../../../../lib/training";
import { Tabs } from "../../MyRequests";
import CoursesTab from "./Courses";
import PromoCodesTab from "./PromoCodes";
import SessionsTab from "./Sessions";
import TemplatesTab from "./Templates";

function SettingsTab() {
  const { isAdmin } = useAuth();
  const [s, setS] = useState<TrainingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  useEffect(() => {
    loadTrainingSettings().then(setS);
  }, []);
  if (!s) return <Loading />;
  const set = <K extends keyof TrainingSettings>(k: K, v: TrainingSettings[K]) => setS({ ...s, [k]: v });
  const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("training_settings").update({ ...s }).eq("id", 1);
    setBusy(false);
    setMsg(error ? { tone: "red", text: errorMessage(error) } : { tone: "green", text: "บันทึกแล้ว" });
  }
  const numField = (k: keyof TrainingSettings, label: string, hint?: string) => (
    <Field label={label} hint={hint}><Input type="number" min={0} value={Number(s[k])} disabled={!isAdmin} onChange={(e) => set(k, Number(e.target.value) as never)} /></Field>
  );
  const boolField = (k: keyof TrainingSettings, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(s[k])} disabled={!isAdmin} onChange={(e) => set(k, e.target.checked as never)} /> {label}</label>
  );

  return (
    <Card>
      {!isAdmin && <div className="mb-4"><Alert tone="amber">เฉพาะ Admin แก้ไขกติกาได้</Alert></div>}
      <h3 className="font-semibold text-navy-900">กติกาการจอง</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {numField("max_active_bookings", "จองล่วงหน้าได้สูงสุด (รอบ)")}
        {numField("change_days_before", "เลื่อน/ยกเลิกได้ถึงกี่วันก่อนอบรม")}
        {numField("strike_limit", "เลื่อน/ยกเลิก/ไม่มาได้กี่ครั้งต่อปี", "เกินนี้ = ยกเลิกทุกการจองและระงับสิทธิ์ถึงสิ้นปี")}
        {numField("checkin_open_minutes", "เปิดเช็กอินก่อนเริ่ม (นาที)")}
        {numField("checkin_radius_m", "รัศมี GPS (เมตร)", "0 = ไม่ตรวจตำแหน่ง")}
        <div className="flex flex-col justify-end gap-2">{boolField("auto_no_show", "รอบที่จบแล้วแต่ไม่เช็กอิน นับเป็น “ไม่มา”")}</div>
      </div>
      <h3 className="mt-6 font-semibold text-navy-900">ใบประกาศ</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="รูปแบบเลขที่" hint="{CODE} {YYYY} {YY} {MM} {RUN}"><Input value={s.cert_format} disabled={!isAdmin} onChange={(e) => set("cert_format", e.target.value)} /></Field>
        {numField("cert_run_digits", "จำนวนหลักเลขรัน")}
        {numField("cert_valid_months", "อายุใบประกาศ (เดือน)", "0 = ไม่มีวันหมดอายุ")}
        <div className="sm:col-span-3">{boolField("cert_requires_evaluation", "ต้องทำแบบประเมินก่อนรับใบประกาศ")}</div>
        <div className="sm:col-span-3"><Field label="คำถามแบบประเมิน (บรรทัดละข้อ ให้คะแนน 1–5)"><Textarea rows={4} disabled={!isAdmin} value={(s.evaluation_questions ?? []).join("\n")} onChange={(e) => set("evaluation_questions", lines(e.target.value))} /></Field></div>
      </div>
      <h3 className="mt-6 font-semibold text-navy-900">อีเมลแจ้งผู้ลงทะเบียน</h3>
      <p className="text-sm text-slate-500">ระบบส่งอีเมลจาก Gmail ของบริษัท ทุกชั่วโมง ใช้ได้หลังตั้งค่า Gmail ใน Supabase แล้ว</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col justify-end gap-2">
          {boolField("email_enabled", "เปิดส่งอีเมล")}
          {boolField("confirm_email", "ส่งอีเมลยืนยันหลังจอง")}
        </div>
        {numField("reminder_days_before", "เตือนก่อนวันอบรม (วัน)", "ผู้ที่จองภายในช่วงนี้จะได้แค่อีเมลยืนยัน")}
        <div className="sm:col-span-3"><Field label="ข้อความท้ายอีเมล" hint="เช่น สิ่งที่ต้องเตรียมมา เบอร์ติดต่อทีมงาน"><Textarea rows={2} disabled={!isAdmin} value={s.email_note ?? ""} onChange={(e) => set("email_note", e.target.value || null)} /></Field></div>
      </div>
      <h3 className="mt-6 font-semibold text-navy-900">การชำระเงินและแบบฟอร์ม</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {numField("vat_rate", "VAT (%)")}
        {numField("wht_rate", "หัก ณ ที่จ่าย (%)")}
        <div className="flex flex-col justify-end">{boolField("person_no_vat", "บุคคลเลือก “ไม่รับใบกำกับภาษี” ได้")}</div>
        <div className="sm:col-span-3"><Field label="ข้อมูลบัญชีสำหรับโอน"><Textarea rows={2} disabled={!isAdmin} value={s.pay_info ?? ""} onChange={(e) => set("pay_info", e.target.value)} /></Field></div>
        <div className="sm:col-span-3"><Field label="ข้อมูลผู้รับเงินสำหรับออก 50 ทวิ"><Textarea rows={2} disabled={!isAdmin} value={s.wht_payee_info ?? ""} onChange={(e) => set("wht_payee_info", e.target.value)} /></Field></div>
        <div className="sm:col-span-3 grid gap-4 sm:grid-cols-2">
          <Field label="รายชื่อ Sale ที่เชิญ (บรรทัดละคน)"><Textarea rows={6} disabled={!isAdmin} value={s.sales_list.join("\n")} onChange={(e) => set("sales_list", lines(e.target.value))} /></Field>
          <Field label="ช่องทางที่รู้จัก (บรรทัดละช่องทาง ระบบเพิ่ม “อื่นๆ” ให้)"><Textarea rows={6} disabled={!isAdmin} value={s.source_list.join("\n")} onChange={(e) => set("source_list", lines(e.target.value))} /></Field>
        </div>
      </div>
      {msg && <div className="mt-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {isAdmin && <Button className="mt-4" onClick={save} loading={busy}>บันทึก</Button>}
    </Card>
  );
}

export default function TrainingAdmin() {
  const { isStaff, can } = useAuth();
  const [tab, setTab] = useState<"sessions" | "promos" | "courses" | "templates" | "settings">("sessions");
  return (
    <Gate allow={isStaff}>
      <PageTitle title="อบรมและกิจกรรม" subtitle={can("courses") ? "รอบอบรม รายชื่อ เช็กอิน การชำระเงิน ใบประกาศ" : "ดูอย่างเดียว · ขอสิทธิ์ “อบรมและกิจกรรม” จาก Admin เพื่อแก้ไข"} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: "sessions", label: "รอบอบรมและรายชื่อ" },
        { key: "promos", label: "โค้ดโปรโมชั่น" },
        { key: "courses", label: "หลักสูตร" },
        { key: "templates", label: "แม่แบบใบประกาศ" },
        { key: "settings", label: "ตั้งค่า" },
      ]} />
      {tab === "sessions" && <SessionsTab />}
      {tab === "promos" && <PromoCodesTab />}
      {tab === "courses" && <CoursesTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "settings" && <SettingsTab />}
    </Gate>
  );
}
