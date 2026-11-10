import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScanButton } from "../../../components/SnScanner";
import { Alert, Button, Card, Field, Input, PageTitle, Select, Textarea, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { MAX_FILE_MB, PRODUCT_TYPES, uploadClaimFile, type ClaimModel, type ClaimSettings, type ProductType } from "../../../lib/claims";
import { errorMessage, supabase } from "../../../lib/supabase";

interface BrandOpt { id: string; name: string; warranty_text: string | null; terms: string | null; required_docs: string | null; require_fields: string[] }
interface OptItem { model: string; other: string; qty: number; bad_sn: string; ref_inv_sn: string }
const OTHER = "__other";
const emptyItem = (): OptItem => ({ model: "", other: "", qty: 1, bad_sn: "", ref_inv_sn: "" });
const appendSn = (cur: string, sn: string) => (cur.trim() ? `${cur.trim()}\n${sn}` : sn);

function ModelSelect({ models, value, other, onChange, onOther, label }: { models: ClaimModel[]; value: string; other: string; onChange: (v: string) => void; onOther: (v: string) => void; label: string }) {
  return (
    <div className="grid gap-2">
      <Field label={label} required>
        <Select value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="">— เลือกรุ่น —</option>
          {models.map((m) => <option key={m.id} value={m.model}>{m.model}</option>)}
          <option value={OTHER}>อื่นๆ (พิมพ์เอง)</option>
        </Select>
      </Field>
      {value === OTHER && <Input placeholder="ระบุรุ่น" value={other} onChange={(e) => onOther(e.target.value)} required />}
    </div>
  );
}

function SnInput({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="flex gap-2">
      <Textarea rows={rows} className="font-mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <ScanButton multi onScan={(sn) => onChange(appendSn(value, sn))} />
    </div>
  );
}

export default function NewClaim() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [models, setModels] = useState<ClaimModel[]>([]);
  const [cfg, setCfg] = useState<ClaimSettings | null>(null);
  const [brandId, setBrandId] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [f, setF] = useState({
    contact_name: "", contact_phone: "", company_name: "", installer_name: "", site_name: "",
    model: "", model_other: "", bad_sn: "", manager_sn: "", case_no: "", ref_inv_sn: "", symptom: "",
    qty: 1, sn: "", delivery_type: "pickup" as "pickup" | "shipping", delivery_address: "",
  });
  const [items, setItems] = useState<OptItem[]>([emptyItem()]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.rpc("claim_brands").then(({ data }) => {
      const list = (data ?? []) as BrandOpt[];
      setBrands(list);
      const se = list.find((b) => /solaredge/i.test(b.name));
      if (se) setBrandId(se.id);
    });
    supabase.from("claim_models").select("*").eq("is_active", true).order("sort").order("model").then(({ data }) => setModels((data ?? []) as ClaimModel[]));
    supabase.from("claim_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => setCfg(data as ClaimSettings));
  }, []);
  useEffect(() => {
    if (!profile) return;
    setF((x) => ({ ...x, contact_name: x.contact_name || profile.full_name || "", contact_phone: x.contact_phone || profile.phone || "", company_name: x.company_name || profile.company_name || "" }));
  }, [profile]);

  const brand = brands.find((b) => b.id === brandId);
  const req = new Set(brand?.require_fields ?? []);
  const typeModels = useMemo(() => models.filter((m) => m.product_type === type && (!m.brand_id || m.brand_id === brandId)), [models, type, brandId]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const modelValue = f.model === OTHER ? f.model_other.trim() : f.model;

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const add = [...list];
    const big = add.find((x) => x.size > MAX_FILE_MB * 1024 * 1024);
    if (big) return setErr(`ไฟล์ ${big.name} ใหญ่เกิน ${MAX_FILE_MB} MB`);
    setFiles((cur) => [...cur, ...add].slice(0, 10));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!type) return setErr("กรุณาเลือกประเภทสินค้า");
    if (req.has("attachment") && files.length === 0) return setErr("แบรนด์นี้ต้องแนบรูปหรือไฟล์ประกอบ");
    const details: Record<string, unknown> = {};
    if (type === "inverter") Object.assign(details, { bad_sn: f.bad_sn, manager_sn: f.manager_sn, case_no: f.case_no });
    else if (type === "optimizer") details.items = items.map((i) => ({ model: i.model === OTHER ? i.other.trim() : i.model, qty: i.qty, bad_sn: i.bad_sn, ref_inv_sn: i.ref_inv_sn }));
    else if (type === "accessory") Object.assign(details, { ref_inv_sn: f.ref_inv_sn, bad_sn: f.bad_sn });
    else Object.assign(details, { qty: f.qty, sn: f.sn });
    if (req.has("ref_inv_sn") && (type === "accessory" ? !f.ref_inv_sn.trim() : type === "optimizer" && items.some((i) => !i.ref_inv_sn.trim())))
      return setErr("กรุณากรอกอ้างอิง S/N Inverter");
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_claim", {
      p: {
        brand_id: brandId || null, product_type: type, model: type === "optimizer" ? null : modelValue,
        contact_name: f.contact_name, contact_phone: f.contact_phone, company_name: f.company_name,
        installer_name: f.installer_name, site_name: f.site_name, symptom: f.symptom,
        delivery_type: f.delivery_type, delivery_address: f.delivery_address, details,
      },
    });
    if (error) {
      setBusy(false);
      return setErr(errorMessage(error));
    }
    const row = (data as { id: string; claim_no: string }[])[0];
    const failed: string[] = [];
    for (const file of files) {
      try {
        await uploadClaimFile(row.id, "customer", file);
      } catch {
        failed.push(file.name);
      }
    }
    setBusy(false);
    nav("/app/claims", { state: { created: row.claim_no, failed } });
  }

  return (
    <>
      <PageTitle title="แจ้งเคลมสินค้า" subtitle="กรอกข้อมูลให้ครบ ส่งแล้วได้เลขเคลมทันที และติดตามสถานะได้ที่หน้าเคลมของฉัน" actions={<Link to="/app/claims" className="text-sm font-semibold text-navy-700 hover:underline">เคลมของฉัน</Link>} />
      {cfg?.form_note && <div className="mb-4"><Alert tone="navy"><span className="whitespace-pre-line">{cfg.form_note}</span></Alert></div>}
      <form onSubmit={submit} className="space-y-5">
        <Card>
          <h2 className="mb-4 font-semibold text-navy-900">ข้อมูลผู้ติดต่อ</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อผู้ติดต่อ" required><Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} required /></Field>
            <Field label="เบอร์โทรศัพท์" required><Input type="tel" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} required /></Field>
            <Field label="ชื่อบริษัท / ผู้ซื้อ" hint={profile?.company_status === "approved" ? "ใช้บริษัทที่ผูกกับบัญชี" : undefined}>
              <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} disabled={profile?.company_status === "approved"} />
            </Field>
            <Field label="ผู้ติดตั้ง (EPC)" required={req.has("installer_name")}><Input value={f.installer_name} onChange={(e) => set("installer_name", e.target.value)} required={req.has("installer_name")} /></Field>
            <div className="sm:col-span-2"><Field label="ชื่อไซต์งาน (Site Name)" required={req.has("site_name")}><Input value={f.site_name} onChange={(e) => set("site_name", e.target.value)} required={req.has("site_name")} /></Field></div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-navy-900">ข้อมูลสินค้า</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="แบรนด์" required>
              <Select value={brandId} onChange={(e) => { setBrandId(e.target.value); set("model", ""); setItems([emptyItem()]); }} required>
                <option value="">— เลือกแบรนด์ —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="ประเภทสินค้า" required>
              <Select value={type} onChange={(e) => { setType(e.target.value as ProductType); set("model", ""); }} required>
                <option value="">— เลือกประเภท —</option>
                {PRODUCT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
          </div>
          {brand && (brand.warranty_text || brand.terms || brand.required_docs) && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              {brand.warranty_text && <p><span className="font-medium">ระยะรับประกัน:</span> {brand.warranty_text}</p>}
              {brand.required_docs && <p className="mt-1"><span className="font-medium">เอกสารที่ต้องแนบ:</span> {brand.required_docs}</p>}
              {brand.terms && <p className="mt-1 whitespace-pre-line">{brand.terms}</p>}
            </div>
          )}

          {type === "inverter" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ModelSelect label="รุ่น Inverter" models={typeModels} value={f.model} other={f.model_other} onChange={(v) => set("model", v)} onOther={(v) => set("model_other", v)} />
              <Field label="S/N ตัวที่เสีย" required><SnInput rows={1} value={f.bad_sn} onChange={(v) => set("bad_sn", v)} /></Field>
              <Field label="อ้างอิง S/N Manager Inverter" required={req.has("manager_sn")}><SnInput rows={1} value={f.manager_sn} onChange={(v) => set("manager_sn", v)} /></Field>
              <Field label="หมายเลข Case (จาก Engineer)" required={req.has("case_no")}><Input value={f.case_no} onChange={(e) => set("case_no", e.target.value)} required={req.has("case_no")} /></Field>
            </div>
          )}

          {type === "optimizer" && (
            <div className="mt-4 space-y-3">
              {items.map((it, i) => {
                const upd = (patch: Partial<OptItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="rounded-xl ring-1 ring-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-navy-900">Optimizer #{i + 1}</p>
                      {items.length > 1 && <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>ลบ</button>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                      <ModelSelect label="รุ่น" models={typeModels} value={it.model} other={it.other} onChange={(v) => upd({ model: v })} onOther={(v) => upd({ other: v })} />
                      <Field label="จำนวน" required><Input type="number" min={1} max={200} value={it.qty} onChange={(e) => upd({ qty: Math.max(1, Number(e.target.value) || 1) })} /></Field>
                      <Field label="S/N ตัวเสีย" hint="หลายตัวคั่นด้วยขึ้นบรรทัดใหม่ ถ้าเยอะแนบ Excel"><SnInput value={it.bad_sn} onChange={(v) => upd({ bad_sn: v })} /></Field>
                      <Field label="อ้างอิง S/N Inverter" required={req.has("ref_inv_sn")}><SnInput value={it.ref_inv_sn} onChange={(v) => upd({ ref_inv_sn: v })} /></Field>
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="secondary" onClick={() => setItems((l) => [...l, emptyItem()])}>+ เพิ่มรุ่น Optimizer</Button>
            </div>
          )}

          {type === "accessory" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ModelSelect label="รุ่นอุปกรณ์" models={typeModels} value={f.model} other={f.model_other} onChange={(v) => set("model", v)} onOther={(v) => set("model_other", v)} />
              <Field label="S/N อุปกรณ์ (ถ้ามี)"><SnInput rows={1} value={f.bad_sn} onChange={(v) => set("bad_sn", v)} /></Field>
              <Field label="อ้างอิง S/N Inverter" required={req.has("ref_inv_sn")}><SnInput rows={1} value={f.ref_inv_sn} onChange={(v) => set("ref_inv_sn", v)} /></Field>
            </div>
          )}

          {(type === "panel" || type === "battery" || type === "other") && (
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
              {typeModels.length > 0 ? (
                <ModelSelect label="รุ่น" models={typeModels} value={f.model} other={f.model_other} onChange={(v) => set("model", v)} onOther={(v) => set("model_other", v)} />
              ) : (
                <Field label="รุ่น" required><Input value={f.model_other} onChange={(e) => { set("model", OTHER); set("model_other", e.target.value); }} required /></Field>
              )}
              <Field label="จำนวน" required><Input type="number" min={1} max={200} value={f.qty} onChange={(e) => set("qty", Math.max(1, Number(e.target.value) || 1))} /></Field>
              <div className="sm:col-span-2"><Field label={type === "panel" ? "S/N แผง" : "S/N"} hint="หลายตัวคั่นด้วยขึ้นบรรทัดใหม่"><SnInput rows={3} value={f.sn} onChange={(v) => set("sn", v)} /></Field></div>
            </div>
          )}

          {type && (
            <div className="mt-4"><Field label="รายละเอียด / อาการเสีย"><Textarea rows={3} value={f.symptom} onChange={(e) => set("symptom", e.target.value)} /></Field></div>
          )}

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">รูปภาพ / ไฟล์ประกอบ{req.has("attachment") && <span className="text-red-500"> *</span>} <span className="font-normal text-slate-500">(รูป PDF Excel ไม่เกิน {MAX_FILE_MB} MB ต่อไฟล์)</span></span>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>เลือกไฟล์</Button>
              {files.map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs">
                  {x.name}
                  <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={`ลบ ${x.name}`} className="text-slate-500 hover:text-red-600">✕</button>
                </span>
              ))}
            </div>
            <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-navy-900">การรับสินค้าเคลม</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["pickup", "shipping"] as const).map((k) => (
              <label key={k} className={cx("flex cursor-pointer items-center gap-3 rounded-xl p-4 ring-1", f.delivery_type === k ? "bg-navy-50 ring-navy-300" : "ring-slate-200")}>
                <input type="radio" name="delivery" checked={f.delivery_type === k} onChange={() => set("delivery_type", k)} />
                <span className="text-sm font-medium">{k === "pickup" ? cfg?.pickup_label ?? "รับเองที่คลังปทุมธานี" : cfg?.shipping_label ?? "จัดส่ง (มีค่าใช้จ่าย)"}</span>
              </label>
            ))}
          </div>
          {f.delivery_type === "shipping" && (
            <div className="mt-4"><Field label="ที่อยู่จัดส่ง" required><Textarea rows={3} value={f.delivery_address} onChange={(e) => set("delivery_address", e.target.value)} required /></Field></div>
          )}
        </Card>

        {err && <Alert>{err}</Alert>}
        <div className="flex gap-3">
          <Button type="submit" variant="sun" loading={busy}>ส่งแจ้งเคลม</Button>
          <Link to="/app/claims" className="self-center text-sm text-slate-600 hover:underline">ยกเลิก</Link>
        </div>
      </form>
    </>
  );
}
