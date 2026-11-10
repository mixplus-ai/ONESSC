import { useRef, useState, type FormEvent } from "react";
import { Avatar } from "../../components/Avatar";
import { Alert, Badge, Button, Card, Field, Input, PageTitle, Spinner, Textarea } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import { BILLING_TYPE, type Billing } from "../../lib/training";
import { COMPANY_STATUS_LABEL, DEPARTMENT_LABEL, ROLE_LABEL } from "../../lib/types";

/** Thai tax ID checksum (13 digits, mod 11). */
export function isValidThaiTaxId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;
  const sum = id.slice(0, 12).split("").reduce((s, d, i) => s + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export default function Profile() {
  const { profile, refresh, isStaff } = useAuth();
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  if (!profile) return null;
  const tone = { none: "slate", pending: "amber", approved: "green", rejected: "red" } as const;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const taxId = String(f.get("tax_id") || "").replace(/\D/g, "");
    const companyName = String(f.get("company_name") || "").trim();
    if (taxId && !isValidThaiTaxId(taxId)) return setMsg({ tone: "red", text: "เลขผู้เสียภาษีไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลัก)" });
    if (taxId && !companyName) return setMsg({ tone: "red", text: "กรุณากรอกชื่อบริษัทคู่กับเลขผู้เสียภาษี" });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: String(f.get("full_name") || "").trim() || null,
        phone: String(f.get("phone") || "").trim() || null,
        line_id: String(f.get("line_id") || "").trim() || null,
        position: String(f.get("position") || "").trim() || null,
        name_en: String(f.get("name_en") || "").trim() || null,
        tax_id: taxId || null,
        company_name: companyName || null,
        pdpa_consent_at: profile!.pdpa_consent_at ?? new Date().toISOString(),
      })
      .eq("id", profile!.id);
    setBusy(false);
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    await refresh();
    const changedCompany = taxId !== (profile!.tax_id ?? "") || companyName !== (profile!.company_name ?? "");
    setMsg({ tone: "green", text: changedCompany && taxId && !isStaff ? "บันทึกแล้ว ข้อมูลบริษัทส่งให้ทีมงานตรวจสอบ" : "บันทึกแล้ว" });
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const password = String(f.get("password"));
    if (password.length < 8) return setPwMsg({ tone: "red", text: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    if (password !== String(f.get("password2"))) return setPwMsg({ tone: "red", text: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" });
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (error) return setPwMsg({ tone: "red", text: errorMessage(error) });
    form.reset();
    setPwMsg({ tone: "green", text: "เปลี่ยนรหัสผ่านแล้ว" });
  }

  return (
    <>
      <PageTitle title="ข้อมูลส่วนตัว" subtitle={`${profile.email} · ${ROLE_LABEL[profile.role]}${profile.department ? ` · ${DEPARTMENT_LABEL[profile.department]}` : ""}`} />
      <AvatarCard />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อ-นามสกุล"><Input name="full_name" defaultValue={profile.full_name ?? ""} autoComplete="name" /></Field>
            <Field label="เบอร์โทร"><Input name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" /></Field>
            <Field label="LINE ID"><Input name="line_id" defaultValue={profile.line_id ?? ""} /></Field>
            <Field label="ตำแหน่ง"><Input name="position" defaultValue={profile.position ?? ""} /></Field>
            <Field label="ชื่อภาษาอังกฤษ (บนใบประกาศ)"><Input name="name_en" defaultValue={profile.name_en ?? ""} placeholder="Mr. Somchai Jaidee" /></Field>
            <div className="border-t border-slate-200 pt-4 sm:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-navy-900">บริษัทที่สังกัด</h3>
                <Badge tone={tone[profile.company_status]}>{COMPANY_STATUS_LABEL[profile.company_status]}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">ผู้ใช้ที่กรอกเลขผู้เสียภาษีเดียวกันจะอยู่บริษัทเดียวกัน และเห็นแต้มบริษัทก้อนเดียวกันหลังทีมงานอนุมัติ การแก้เลขหรือชื่อบริษัทจะต้องรออนุมัติใหม่</p>
            </div>
            <Field label="เลขประจำตัวผู้เสียภาษี (13 หลัก)">
              <Input name="tax_id" inputMode="numeric" maxLength={17} defaultValue={profile.tax_id ?? ""} placeholder="0105xxxxxxxxx" />
            </Field>
            <Field label="ชื่อบริษัท"><Input name="company_name" defaultValue={profile.company_name ?? ""} autoComplete="organization" /></Field>
            {msg && <div className="sm:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
            <div className="sm:col-span-2"><Button type="submit" loading={busy}>บันทึก</Button></div>
          </form>
        </Card>
        <div className="space-y-6">
        <BillingCard />
        <Card>
          <h3 className="font-semibold text-navy-900">เปลี่ยนรหัสผ่าน</h3>
          <form onSubmit={changePassword} className="mt-4 space-y-4">
            <Field label="รหัสผ่านใหม่"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <Field label="ยืนยันรหัสผ่านใหม่"><Input name="password2" type="password" required autoComplete="new-password" /></Field>
            {pwMsg && <Alert tone={pwMsg.tone}>{pwMsg.text}</Alert>}
            <Button type="submit" variant="secondary" loading={pwBusy}>เปลี่ยนรหัสผ่าน</Button>
          </form>
        </Card>
        </div>
      </div>
    </>
  );
}

function AvatarCard() {
  const { profile, refresh } = useAuth();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!profile) return null;

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return setErr("กรุณาเลือกไฟล์รูปภาพ");
    if (file.size > 3 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 3 MB");
    setBusy(true);
    setErr("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${profile!.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "31536000", contentType: file.type });
      if (up.error) throw up.error;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const old = profile!.avatar_url?.split("/avatars/")[1];
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile!.id);
      if (error) throw error;
      if (old) await supabase.storage.from("avatars").remove([decodeURIComponent(old)]);
      await refresh();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    const old = profile!.avatar_url?.split("/avatars/")[1];
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile!.id);
    if (error) return setErr(errorMessage(error));
    if (old) await supabase.storage.from("avatars").remove([decodeURIComponent(old)]);
    await refresh();
  }

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative">
          <Avatar url={profile.avatar_url} name={profile.full_name || profile.email} className="h-20 w-20 text-2xl" />
          {busy && <span className="absolute inset-0 grid place-items-center rounded-full bg-white/70"><Spinner className="h-6 w-6" /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy-900">{profile.full_name || profile.email}</p>
          <p className="text-sm text-slate-500">{profile.company_name || "ยังไม่ได้ระบุบริษัท"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" type="button" onClick={() => ref.current?.click()} disabled={busy}>{profile.avatar_url ? "เปลี่ยนรูป" : "อัปโหลดรูปโปรไฟล์"}</Button>
            {profile.avatar_url && <Button variant="ghost" type="button" onClick={removePhoto} disabled={busy}>ลบรูป</Button>}
          </div>
          <p className="mt-1 text-xs text-slate-500">JPG หรือ PNG ไม่เกิน 3 MB แนะนำรูปสี่เหลี่ยมจัตุรัส</p>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
    </Card>
  );
}

const EMPTY_BILLING: Billing = { type: "company", name: "", tax_id: "", branch: "สำนักงานใหญ่", address: "", phone: "", email: "" };

/** Saved receipt / tax-invoice details used for paid courses, quotations and reservations. */
function BillingCard() {
  const { profile, refresh } = useAuth();
  const [b, setB] = useState<Billing>({ ...EMPTY_BILLING, ...(profile?.billing ?? {}) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  if (!profile) return null;
  const set = (patch: Partial<Billing>) => setB((x) => ({ ...x, ...patch }));

  function fromCompany() {
    set({ type: "company", name: profile!.company_name ?? "", tax_id: profile!.tax_id ?? "", phone: b.phone || profile!.phone || "", email: b.email || profile!.email });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!b.name.trim()) return setMsg({ tone: "red", text: "กรุณากรอกชื่อสำหรับออกใบเสร็จ" });
    if (b.type === "company" && !isValidThaiTaxId(b.tax_id ?? "")) return setMsg({ tone: "red", text: "เลขผู้เสียภาษีไม่ถูกต้อง (ตัวเลข 13 หลัก)" });
    if (b.type === "person" && b.tax_id && !/^\d{13}$/.test(b.tax_id)) return setMsg({ tone: "red", text: "เลขประจำตัวผู้เสียภาษี/บัตรประชาชนต้องมี 13 หลัก" });
    if (b.type !== "person_no_vat" && !b.address?.trim()) return setMsg({ tone: "red", text: "กรุณากรอกที่อยู่สำหรับออกใบกำกับภาษี" });
    setBusy(true);
    setMsg(null);
    const clean: Billing = {
      type: b.type,
      name: b.name.trim(),
      tax_id: b.type === "person_no_vat" ? "" : (b.tax_id ?? "").trim(),
      branch: b.type === "company" ? (b.branch ?? "").trim() || "สำนักงานใหญ่" : "",
      address: (b.address ?? "").trim(),
      phone: (b.phone ?? "").trim(),
      email: (b.email ?? "").trim(),
    };
    const { error } = await supabase.from("profiles").update({ billing: clean }).eq("id", profile!.id);
    setBusy(false);
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    await refresh();
    setMsg({ tone: "green", text: "บันทึกแล้ว ระบบจะใช้ข้อมูลนี้กับการจองอบรม ขอใบเสนอราคา และจองสินค้า" });
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-4">
        <div>
          <h3 className="font-semibold text-navy-900">ข้อมูลออกใบเสร็จ / ใบกำกับภาษี</h3>
          <p className="mt-1 text-xs text-slate-500">ใช้กับหลักสูตรที่มีค่าใช้จ่าย และแนบไปกับใบเสนอราคาและใบจองสินค้า เพื่อให้ทีมงานออกเอกสารในนามบริษัทของคุณ</p>
        </div>
        {profile.tax_id && (
          <button type="button" onClick={fromCompany} className="text-sm font-medium text-navy-700 underline">ใช้ข้อมูลบริษัทที่สังกัด ({profile.company_name})</button>
        )}
        <div className="grid gap-2">
          {(Object.keys(BILLING_TYPE) as Billing["type"][]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input type="radio" checked={b.type === t} onChange={() => set({ type: t })} /> {BILLING_TYPE[t]}
            </label>
          ))}
        </div>
        <Field label={b.type === "company" ? "ชื่อบริษัท (ตามหนังสือรับรอง)" : "ชื่อ-นามสกุล"} required>
          <Input value={b.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        {b.type !== "person_no_vat" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={b.type === "company" ? "เลขประจำตัวผู้เสียภาษี" : "เลขบัตรประชาชน / ผู้เสียภาษี"} required={b.type === "company"}>
              <Input inputMode="numeric" maxLength={13} value={b.tax_id ?? ""} onChange={(e) => set({ tax_id: e.target.value.replace(/\D/g, "") })} />
            </Field>
            {b.type === "company" && (
              <Field label="สำนักงานใหญ่ / สาขา" hint="เช่น สำนักงานใหญ่ หรือ สาขาที่ 00001">
                <Input value={b.branch ?? ""} onChange={(e) => set({ branch: e.target.value })} />
              </Field>
            )}
          </div>
        )}
        <Field label="ที่อยู่ออกใบกำกับภาษี" required={b.type !== "person_no_vat"}>
          <Textarea rows={3} value={b.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เบอร์โทร (สำหรับเอกสาร)"><Input type="tel" value={b.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="อีเมลรับเอกสาร"><Input type="email" value={b.email ?? ""} onChange={(e) => set({ email: e.target.value })} placeholder={profile.email} /></Field>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" loading={busy}>บันทึกข้อมูลออกใบเสร็จ</Button>
      </form>
    </Card>
  );
}
