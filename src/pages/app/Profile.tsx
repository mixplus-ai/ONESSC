import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, ButtonLink, Card, Field, Input, PageTitle } from "../../components/ui";
import { CLAIM_STATUS, fmtThai, type MyClaim } from "../../lib/claims";
import { useAuth } from "../../lib/auth";
import { errorMessage, supabase } from "../../lib/supabase";
import { COMPANY_STATUS_LABEL, DEPARTMENT_LABEL, ROLE_LABEL } from "../../lib/types";

/** Thai tax ID checksum (13 digits, mod 11). */
export function isValidThaiTaxId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;
  const sum = id.slice(0, 12).split("").reduce((s, d, i) => s + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/** หัวข้อ "งานเคลมของฉัน": เคลมที่ผู้ใช้แจ้งเอง (my_claims คืนเฉพาะของตัวเอง) */
function MyClaimsCard() {
  const [rows, setRows] = useState<MyClaim[] | null>(null);
  useEffect(() => {
    supabase.rpc("my_claims").then(({ data }) => setRows((data ?? []) as MyClaim[]));
  }, []);
  const open = rows?.filter((c) => !["closed", "rejected"].includes(c.status)).length ?? 0;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-navy-900">งานเคลม</h3>
        <ButtonLink to="/app/claims/new" variant="sun">+ แจ้งเคลม</ButtonLink>
      </div>
      {rows === null ? (
        <p className="mt-3 text-sm text-slate-500">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">ยังไม่มีเคลมที่คุณแจ้ง</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">แจ้งไว้ทั้งหมด {rows.length} รายการ · กำลังดำเนินการ {open} รายการ</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {rows.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-mono font-semibold text-navy-900">{c.claim_no}</p>
                  <p className="truncate text-xs text-slate-500">{c.model ?? "-"} · {fmtThai(c.created_at)}</p>
                </div>
                <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>
              </li>
            ))}
          </ul>
          <Link to="/app/claims" className="mt-2 inline-block text-sm font-semibold text-navy-700 hover:underline">ดูเคลมทั้งหมดและติดตามสถานะ →</Link>
        </>
      )}
    </Card>
  );
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
        <MyClaimsCard />
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
