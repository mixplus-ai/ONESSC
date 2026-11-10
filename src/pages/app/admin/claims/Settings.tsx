import { useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "../../../../components/ui";
import { PRODUCT_TYPES, REQUIRE_FIELD_LABEL, productTypeLabel, type BrandRule, type ClaimModel, type ClaimSettings, type ProductType } from "../../../../lib/claims";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { useBoard } from "./shared";

function General() {
  const [s, setS] = useState<ClaimSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { supabase.from("claim_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => setS(data as ClaimSettings)); }, []);
  if (!s) return null;
  const set = <K extends keyof ClaimSettings>(k: K, v: ClaimSettings[K]) => setS({ ...s, [k]: v });
  async function save() {
    setBusy(true);
    const { id, ...rest } = s!;
    const { error } = await supabase.from("claim_settings").update({ ...rest, email_from: rest.email_from || null, staff_notify_emails: rest.staff_notify_emails || null }).eq("id", id);
    setBusy(false);
    setMsg(error ? { ok: false, text: errorMessage(error) } : { ok: true, text: "บันทึกแล้ว" });
  }
  return (
    <Card>
      <h3 className="mb-4 font-semibold text-navy-900">ฟอร์มและอีเมลแจ้งเตือน</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={s.email_enabled} onChange={(e) => set("email_enabled", e.target.checked)} />ส่งอีเมลแจ้งสถานะเคลมให้ลูกค้า และแจ้งเคลมใหม่ให้ทีมงาน</label>
        <Field label="อีเมลผู้ส่ง (Gmail ของบริษัท)"><Input type="email" value={s.email_from ?? ""} onChange={(e) => set("email_from", e.target.value)} /></Field>
        <Field label="ชื่อผู้ส่ง"><Input value={s.email_from_name} onChange={(e) => set("email_from_name", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="อีเมลทีมบริการที่รับแจ้งเคลมใหม่" hint="คั่นด้วยจุลภาค"><Input value={s.staff_notify_emails ?? ""} onChange={(e) => set("staff_notify_emails", e.target.value)} /></Field></div>
        <Field label="ตัวเลือกรับเอง"><Input value={s.pickup_label} onChange={(e) => set("pickup_label", e.target.value)} /></Field>
        <Field label="ตัวเลือกจัดส่ง"><Input value={s.shipping_label} onChange={(e) => set("shipping_label", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="ข้อความบนฟอร์มแจ้งเคลม"><Textarea rows={2} value={s.form_note ?? ""} onChange={(e) => set("form_note", e.target.value || null)} /></Field></div>
        <div className="sm:col-span-2"><Field label="ข้อความท้ายอีเมล"><Textarea rows={2} value={s.email_note ?? ""} onChange={(e) => set("email_note", e.target.value || null)} /></Field></div>
      </div>
      {msg && <div className="mt-3"><Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert></div>}
      <Button className="mt-4" onClick={save} loading={busy}>บันทึก</Button>
    </Card>
  );
}

function BrandRules() {
  const { brands } = useBoard();
  const rules = useRows<BrandRule>(() => supabase.from("claim_brand_rules").select("*"));
  const [edit, setEdit] = useState<BrandRule | null>(null);
  const [err, setErr] = useState("");
  const ruleOf = (id: string): BrandRule => rules.rows.find((r) => r.brand_id === id) ?? { brand_id: id, enabled: true, warranty_text: null, terms: null, required_docs: null, require_fields: [] };
  async function save() {
    if (!edit) return;
    const { error } = await supabase.from("claim_brand_rules").upsert(edit);
    if (error) return setErr(errorMessage(error));
    setEdit(null);
    rules.reload();
  }
  return (
    <Card>
      <h3 className="mb-1 font-semibold text-navy-900">เงื่อนไขการเคลมรายแบรนด์</h3>
      <p className="mb-4 text-sm text-slate-500">เพิ่มแบรนด์ได้ที่เมนูสินค้า แบรนด์ใหม่เปิดรับเคลมอัตโนมัติจนกว่าจะปิด</p>
      <ul className="divide-y divide-slate-100">
        {brands.map((b) => {
          const r = ruleOf(b.id);
          const open = edit?.brand_id === b.id;
          return (
            <li key={b.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-navy-900">{b.name} {!r.enabled && <span className="text-xs text-red-600">(ปิดรับเคลม)</span>}</p>
                  <p className="text-xs text-slate-500">{r.warranty_text || "ยังไม่ระบุระยะรับประกัน"}{r.require_fields.length ? ` · บังคับ: ${r.require_fields.map((k) => REQUIRE_FIELD_LABEL[k]).join(", ")}` : ""}</p>
                </div>
                <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => { setErr(""); setEdit(open ? null : r); }}>{open ? "ปิด" : "แก้ไข"}</button>
              </div>
              {open && edit && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />เปิดให้ลูกค้าแจ้งเคลมแบรนด์นี้</label>
                  <Field label="ระยะรับประกัน"><Input value={edit.warranty_text ?? ""} onChange={(e) => setEdit({ ...edit, warranty_text: e.target.value || null })} placeholder="เช่น Inverter 12 ปี · Optimizer 25 ปี" /></Field>
                  <Field label="เอกสารที่ต้องแนบ"><Input value={edit.required_docs ?? ""} onChange={(e) => setEdit({ ...edit, required_docs: e.target.value || null })} /></Field>
                  <div className="sm:col-span-2"><Field label="เงื่อนไข (แสดงบนฟอร์ม)"><Textarea rows={3} value={edit.terms ?? ""} onChange={(e) => setEdit({ ...edit, terms: e.target.value || null })} /></Field></div>
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-sm font-medium text-slate-700">ช่องที่ต้องกรอก</p>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(REQUIRE_FIELD_LABEL).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-1 text-sm">
                          <input type="checkbox" checked={edit.require_fields.includes(k)} onChange={(e) => setEdit({ ...edit, require_fields: e.target.checked ? [...edit.require_fields, k] : edit.require_fields.filter((x) => x !== k) })} />{label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {err && <div className="sm:col-span-2"><Alert>{err}</Alert></div>}
                  <div className="sm:col-span-2"><Button onClick={save}>บันทึก</Button></div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Models() {
  const { brands } = useBoard();
  const models = useRows<ClaimModel>(() => supabase.from("claim_models").select("*").order("product_type").order("sort").order("model"));
  const [type, setType] = useState<ProductType>("inverter");
  const [brand, setBrand] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const list = models.rows.filter((m) => m.product_type === type && (!brand || m.brand_id === brand));
  async function add() {
    const names = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const base = list.length ? Math.max(...list.map((m) => m.sort)) : 0;
    const { error } = await supabase.from("claim_models").insert(names.map((model, i) => ({ product_type: type, brand_id: brand || null, model, sort: base + (i + 1) * 10 })));
    if (error) return setErr(errorMessage(error));
    setText("");
    setErr("");
    models.reload();
  }
  async function toggle(m: ClaimModel) {
    await supabase.from("claim_models").update({ is_active: !m.is_active }).eq("id", m.id);
    models.reload();
  }
  async function remove(m: ClaimModel) {
    if (!confirm(`ลบรุ่น ${m.model}?`)) return;
    await supabase.from("claim_models").delete().eq("id", m.id);
    models.reload();
  }
  return (
    <Card>
      <h3 className="mb-1 font-semibold text-navy-900">รายชื่อรุ่นในฟอร์มแจ้งเคลม</h3>
      <p className="mb-4 text-sm text-slate-500">ลูกค้าเลือก "อื่นๆ" แล้วพิมพ์เองได้เสมอ</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select className="!w-auto" value={type} onChange={(e) => setType(e.target.value as ProductType)}>{PRODUCT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
        <Select className="!w-auto" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">ทุกแบรนด์</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
      </div>
      <ul className="mb-4 flex flex-wrap gap-2">
        {list.map((m) => (
          <li key={m.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ring-1 ${m.is_active ? "bg-white ring-slate-200" : "bg-slate-100 text-slate-400 ring-slate-200 line-through"}`}>
            {m.model} <span className="text-slate-400">{brands.find((b) => b.id === m.brand_id)?.name ?? ""}</span>
            <button onClick={() => toggle(m)} title={m.is_active ? "ซ่อน" : "แสดง"}>{m.is_active ? "◉" : "○"}</button>
            <button onClick={() => remove(m)} className="text-red-500" title="ลบ">✕</button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-slate-500">ยังไม่มีรุ่นของ {productTypeLabel(type)}</li>}
      </ul>
      <Field label={`เพิ่มรุ่น ${productTypeLabel(type)}${brand ? ` · ${brands.find((b) => b.id === brand)?.name}` : " (ทุกแบรนด์)"}`} hint="หนึ่งรุ่นต่อบรรทัด">
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
      <Button className="mt-3" variant="secondary" onClick={add}>เพิ่ม</Button>
    </Card>
  );
}

export default function ClaimSettingsTab() {
  return <div className="space-y-4"><General /><BrandRules /><Models /></div>;
}
