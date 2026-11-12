import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScanButton } from "../../../components/SnScanner";
import { Alert, Button, Card, Field, Input, PageTitle, Select, Textarea, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useSiteSettings } from "../../../lib/content";
import { MAX_FILE_MB, PRODUCT_TYPES, uploadClaimFile, type ClaimModel, type ClaimSettings, type ProductType } from "../../../lib/claims";
import { errorMessage, supabase } from "../../../lib/supabase";

interface BrandOpt { id: string; name: string; warranty_text: string | null; terms: string | null; required_docs: string | null; require_fields: string[] }
interface Unit { key: string; sn: string; symptom: string; volt: string; ohm: string }
interface OptItem { key: string; model: string; ref_inv_sn: string; units: Unit[] }
interface StockModel { sku: string; description: string | null }
interface CareMember { role: "sales" | "support"; full_name: string; job_title: string | null; phone: string | null; line_id: string | null; email: string | null }
const uid = () => Math.random().toString(36).slice(2);
const emptyUnit = (): Unit => ({ key: uid(), sn: "", symptom: "", volt: "", ohm: "" });
const emptyItem = (): OptItem => ({ key: uid(), model: "", ref_inv_sn: "", units: [emptyUnit()] });
const lineHref = (id: string) => (/^https?:\/\//.test(id) ? id : id.startsWith("@") ? `https://line.me/R/ti/p/${id}` : `https://line.me/ti/p/~${id}`);
const tel = (ph: string) => `tel:${ph.split(/[,\n/]/)[0].replace(/[^\d+]/g, "")}`;

/** รุ่น / รหัสสินค้า: type to search the stock sheet of the chosen brand (code + name) or the claim model list. */
function ModelPicker({ label, value, onChange, options, required = true }: { label: string; value: string; onChange: (v: string) => void; options: { code: string; name: string }[]; required?: boolean }) {
  const id = useMemo(() => `m-${uid()}`, []);
  const hit = options.find((o) => o.code.toUpperCase() === value.trim().toUpperCase());
  return (
    <Field label={label} required={required} hint={hit?.name ? <span className="text-navy-800">{hit.name}</span> : options.length ? `พิมพ์ค้นหารหัสหรือชื่อ (${options.length} รายการจากสต๊อก) หรือพิมพ์รุ่นเองได้` : "พิมพ์รุ่นสินค้า"}>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder="รหัส / รุ่นสินค้า" />
      <datalist id={id}>{options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</datalist>
    </Field>
  );
}

/** One row per S/N: S/N (scan), its own symptom, and for optimizers the measured V and resistance. */
function SnRows({ units, onChange, measure, single, snLabel = "S/N" }: { units: Unit[]; onChange: (u: Unit[]) => void; measure?: boolean; single?: boolean; snLabel?: string }) {
  const upd = (k: string, patch: Partial<Unit>) => onChange(units.map((u) => (u.key === k ? { ...u, ...patch } : u)));
  /** scanned codes fill empty rows first, then add rows */
  function scan(sn: string) {
    const empty = units.find((u) => !u.sn.trim());
    if (empty) upd(empty.key, { sn });
    else if (!single) onChange([...units, { ...emptyUnit(), sn }]);
  }
  const cols = measure ? "sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1.4fr)_5.5rem_5.5rem_2rem]" : "sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_2rem]";
  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <div className={cx("hidden gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:grid", cols)}>
        <span>#</span><span>{snLabel}</span><span>อาการเสียของตัวนี้</span>{measure && <><span>แรงดัน (V)</span><span>ความต้านทาน (Ω)</span></>}<span />
      </div>
      <ul className="divide-y divide-slate-100">
        {units.map((u, i) => (
          <li key={u.key} className={cx("grid grid-cols-2 items-center gap-2 px-3 py-2", cols)}>
            <span className="col-span-2 text-xs font-semibold text-slate-500 sm:col-span-1">{single ? "" : `${i + 1}.`}</span>
            <Input className="col-span-2 font-mono sm:col-span-1" value={u.sn} onChange={(e) => upd(u.key, { sn: e.target.value })} placeholder={snLabel} aria-label={`${snLabel} รายการ ${i + 1}`} />
            <Input className="col-span-2 sm:col-span-1" value={u.symptom} onChange={(e) => upd(u.key, { symptom: e.target.value })} placeholder="เช่น ไม่มีไฟออก, Error 18xA" aria-label={`อาการเสีย รายการ ${i + 1}`} />
            {measure && <>
              <Input inputMode="decimal" value={u.volt} onChange={(e) => upd(u.key, { volt: e.target.value })} placeholder="V" aria-label={`แรงดัน รายการ ${i + 1}`} />
              <Input inputMode="decimal" value={u.ohm} onChange={(e) => upd(u.key, { ohm: e.target.value })} placeholder="Ω" aria-label={`ความต้านทาน รายการ ${i + 1}`} />
            </>}
            {!single && units.length > 1
              ? <button type="button" className="justify-self-end text-slate-400 hover:text-red-600" onClick={() => onChange(units.filter((x) => x.key !== u.key))} aria-label={`ลบรายการ ${i + 1}`}>✕</button>
              : <span />}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
        {!single && <Button type="button" variant="secondary" className="!py-1.5" onClick={() => onChange([...units, emptyUnit()])}>+ เพิ่ม S/N</Button>}
        <ScanButton multi={!single} onScan={scan} />
        {!single && <span className="text-xs text-slate-500">{units.length} รายการ · สแกนต่อเนื่องได้ ระบบเพิ่มบรรทัดให้</span>}
      </div>
    </div>
  );
}

/** Case no. comes from the Engineer: show who to contact (the company's support person, else LINE OA). */
function SupportContact() {
  const { profile } = useAuth();
  const { company } = useSiteSettings();
  const [team, setTeam] = useState<CareMember[]>([]);
  useEffect(() => {
    if (profile?.company_status !== "approved") return;
    supabase.rpc("my_care_team").then(({ data }) => setTeam((data ?? []) as CareMember[]));
  }, [profile?.company_status]);
  const sup = team.find((m) => m.role === "support");
  return (
    <div className="rounded-xl bg-sun-500/10 p-3 text-sm">
      <p className="font-semibold text-navy-900">ยังไม่มีเลข Case? ติดต่อ Support</p>
      {sup ? (
        <>
          <p className="mt-0.5 text-slate-700">{sup.full_name}{sup.job_title ? ` · ${sup.job_title}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sup.phone && <a href={tel(sup.phone)} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-slate-200 hover:ring-navy-400">โทร {sup.phone}</a>}
            {sup.line_id && <a href={lineHref(sup.line_id)} target="_blank" rel="noreferrer" className="rounded-full bg-[#06C755] px-3 py-1 text-xs font-semibold text-white hover:brightness-110">LINE</a>}
            {sup.email && <a href={`mailto:${sup.email}`} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-slate-200 hover:ring-navy-400">อีเมล</a>}
          </div>
        </>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {company.line_oa_url && <a href={company.line_oa_url} target="_blank" rel="noreferrer" className="rounded-full bg-[#06C755] px-3 py-1 text-xs font-semibold text-white hover:brightness-110">ติดต่อ Support ทาง LINE</a>}
          {company.phone && <a href={tel(company.phone)} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-slate-200">โทร {company.phone}</a>}
          <Link to="/contact?topic=service" className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-slate-200">หน้าติดต่อเรา</Link>
        </div>
      )}
    </div>
  );
}

export default function NewClaim() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [models, setModels] = useState<ClaimModel[]>([]);
  const [stock, setStock] = useState<StockModel[]>([]);
  const [cfg, setCfg] = useState<ClaimSettings | null>(null);
  const [type, setType] = useState<ProductType | "">("");
  const [brandId, setBrandId] = useState("");
  const [f, setF] = useState({
    contact_name: "", contact_phone: "", company_name: "", po_no: "", installer_name: "", site_name: "", site_id: "",
    model: "", manager_sn: "", case_no: "", ref_inv_sn: "", symptom: "",
    delivery_type: "pickup" as "pickup" | "shipping", delivery_address: "",
  });
  const [units, setUnits] = useState<Unit[]>([emptyUnit()]);
  const [items, setItems] = useState<OptItem[]>([emptyItem()]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.rpc("claim_brands").then(({ data }) => setBrands((data ?? []) as BrandOpt[]));
    supabase.from("claim_models").select("*").eq("is_active", true).order("sort").order("model").then(({ data }) => setModels((data ?? []) as ClaimModel[]));
    supabase.from("claim_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => setCfg(data as ClaimSettings));
  }, []);
  useEffect(() => {
    if (!brandId) return setStock([]);
    supabase.rpc("claim_stock_models", { p_brand: brandId }).then(({ data }) => setStock((data ?? []) as StockModel[]));
  }, [brandId]);
  useEffect(() => {
    if (!profile) return;
    setF((x) => ({ ...x, contact_name: x.contact_name || profile.full_name || "", contact_phone: x.contact_phone || profile.phone || "", company_name: x.company_name || profile.company_name || "" }));
  }, [profile]);

  const brand = brands.find((b) => b.id === brandId);
  const req = new Set(brand?.require_fields ?? []);
  // model options: the claim model list for this type + brand, then the brand's codes from the stock sheet
  const options = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of models) if (m.product_type === type && (!m.brand_id || m.brand_id === brandId)) out.set(m.model, m.note ?? "");
    for (const st of stock) if (!out.has(st.sku)) out.set(st.sku, st.description ?? "");
    return [...out].map(([code, name]) => ({ code, name }));
  }, [models, stock, type, brandId]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const resetProduct = () => { set("model", ""); setUnits([emptyUnit()]); setItems([emptyItem()]); };

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
    if (!type) return setErr("กรุณาเลือกประเภทการเคลม");
    if (!brandId) return setErr("กรุณาเลือกแบรนด์");
    if (!f.site_id.trim()) return setErr("กรุณากรอก Site ID");
    if (type === "inverter" && !f.case_no.trim()) return setErr("กรุณากรอกหมายเลข Case จาก Engineer (ยังไม่มีเลข กดติดต่อ Support)");
    if (req.has("attachment") && files.length === 0) return setErr("แบรนด์นี้ต้องแนบรูปหรือไฟล์ประกอบ");
    const clean = (l: Unit[]) => l.filter((u) => u.sn.trim() || u.symptom.trim() || u.volt.trim() || u.ohm.trim());
    const asJson = (u: Unit, model: string) => ({ model, sn: u.sn.trim(), symptom: u.symptom.trim(), ...(type === "optimizer" ? { volt: u.volt.trim(), ohm: u.ohm.trim() } : {}) });
    const sns = (l: Unit[]) => l.map((u) => u.sn.trim()).filter(Boolean).join("\n");
    const model = f.model.trim();
    const details: Record<string, unknown> = { po_no: f.po_no.trim() || undefined };
    let rows: { model: string; sn: string; symptom: string }[] = [];
    if (type === "optimizer") {
      if (items.some((i) => !i.model.trim())) return setErr("กรุณาเลือกรุ่น Optimizer ให้ครบ");
      if (req.has("ref_inv_sn") && items.some((i) => !i.ref_inv_sn.trim())) return setErr("กรุณากรอกอ้างอิง S/N Inverter");
      details.items = items.map((i) => ({ model: i.model.trim(), qty: Math.max(1, i.units.length), bad_sn: sns(i.units), ref_inv_sn: i.ref_inv_sn.trim() }));
      details.units = items.flatMap((i) => clean(i.units).map((u) => asJson(u, i.model.trim())));
    } else {
      if (!model) return setErr("กรุณาเลือกหรือพิมพ์รุ่นสินค้า");
      const list = clean(units);
      if (type === "inverter") {
        if (!units[0].sn.trim()) return setErr("กรุณากรอก S/N ตัวที่เสีย");
        Object.assign(details, { bad_sn: units[0].sn.trim(), manager_sn: f.manager_sn.trim(), case_no: f.case_no.trim() });
      } else if (type === "accessory") {
        if (req.has("ref_inv_sn") && !f.ref_inv_sn.trim()) return setErr("กรุณากรอกอ้างอิง S/N Inverter");
        Object.assign(details, { ref_inv_sn: f.ref_inv_sn.trim(), bad_sn: sns(units) });
      } else {
        Object.assign(details, { qty: Math.max(1, units.length), sn: sns(units) });
      }
      details.units = list.map((u) => asJson(u, model));
    }
    rows = (details.units as typeof rows).filter((u) => u.symptom);
    // staff also see each unit's symptom in the claim's symptom text
    const symptom = [f.symptom.trim(), ...rows.map((u) => `${u.sn || u.model}: ${u.symptom}`)].filter(Boolean).join("\n");
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_claim", {
      p: {
        brand_id: brandId, product_type: type, model: type === "optimizer" ? null : model,
        contact_name: f.contact_name, contact_phone: f.contact_phone, company_name: f.company_name,
        installer_name: f.installer_name, site_name: f.site_name, site_id: f.site_id.trim(), symptom,
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

  const step = !type ? 1 : !brandId ? 2 : 3;
  return (
    <>
      <PageTitle title="แจ้งเคลมสินค้า" subtitle="กรอกข้อมูลให้ครบ ส่งแล้วได้เลขเคลมทันที และติดตามสถานะได้ที่หน้าเคลมของฉัน" actions={<Link to="/app/claims" className="text-sm font-semibold text-navy-700 hover:underline">เคลมของฉัน</Link>} />
      {cfg?.form_note && <div className="mb-4"><Alert tone="navy"><span className="whitespace-pre-line">{cfg.form_note}</span></Alert></div>}
      <form onSubmit={submit} className="space-y-5">
        <Card>
          <h2 className="mb-4 font-semibold text-navy-900">ข้อมูลผู้ติดต่อ</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ชื่อผู้ติดต่อ" required><Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} required /></Field>
            <Field label="เบอร์โทรศัพท์" required><Input type="tel" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} required /></Field>
            <Field label="ชื่อบริษัท / ผู้ซื้อ" hint={profile?.company_status === "approved" ? "ใช้บริษัทที่ผูกกับบัญชี" : undefined}>
              <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} disabled={profile?.company_status === "approved"} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-navy-900">รายละเอียดการเคลม</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เลขที่ PO หรือ PI ที่เคยสั่งซื้อ" hint="ถ้ามี ช่วยให้ตรวจสอบประกันได้เร็วขึ้น"><Input value={f.po_no} onChange={(e) => set("po_no", e.target.value)} placeholder="เช่น PI-SSC2026091001" /></Field>
            <Field label="ชื่อ EPC / ผู้ติดตั้ง" required={req.has("installer_name")}><Input value={f.installer_name} onChange={(e) => set("installer_name", e.target.value)} required={req.has("installer_name")} /></Field>
            <Field label="ชื่อไซต์งาน (Site Name)" required={req.has("site_name")}><Input value={f.site_name} onChange={(e) => set("site_name", e.target.value)} required={req.has("site_name")} /></Field>
            <Field label="เลขที่ Site ID" required><Input value={f.site_id} onChange={(e) => set("site_id", e.target.value)} required placeholder="Site ID ในระบบมอนิเตอร์" /></Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold text-navy-900">ข้อมูลสินค้า</h2>
          <p className="mb-4 text-xs text-slate-500">เลือกตามลำดับ: 1 ประเภทการเคลม → 2 แบรนด์ → 3 รายละเอียดสินค้า</p>

          <p className="mb-2 text-sm font-medium text-slate-700"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-navy-800 text-xs text-white">1</span>ประเภทการเคลมสินค้า <span className="text-red-500">*</span></p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_TYPES.map((t) => (
              <button key={t.key} type="button" onClick={() => { setType(t.key); resetProduct(); }}
                className={cx("rounded-xl px-4 py-2 text-sm font-semibold ring-1", type === t.key ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-200 hover:ring-navy-300")}>
                {t.label}
              </button>
            ))}
          </div>

          {step >= 2 && (
            <div className="mt-5 max-w-md">
              <p className="mb-2 text-sm font-medium text-slate-700"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-navy-800 text-xs text-white">2</span>แบรนด์ <span className="text-red-500">*</span></p>
              <Select value={brandId} onChange={(e) => { setBrandId(e.target.value); resetProduct(); }} required aria-label="แบรนด์">
                <option value="">— เลือกแบรนด์ —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          )}
          {brand && (brand.warranty_text || brand.terms || brand.required_docs) && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              {brand.warranty_text && <p><span className="font-medium">ระยะรับประกัน:</span> {brand.warranty_text}</p>}
              {brand.required_docs && <p className="mt-1"><span className="font-medium">เอกสารที่ต้องแนบ:</span> {brand.required_docs}</p>}
              {brand.terms && <p className="mt-1 whitespace-pre-line">{brand.terms}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="mt-5">
              <p className="mb-3 text-sm font-medium text-slate-700"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-navy-800 text-xs text-white">3</span>รายละเอียดสินค้า</p>

              {type === "inverter" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ModelPicker label="รุ่น / รหัส Inverter" value={f.model} onChange={(v) => set("model", v)} options={options} />
                    <Field label="อ้างอิง S/N Manager Inverter" required={req.has("manager_sn")}><Input className="font-mono" value={f.manager_sn} onChange={(e) => set("manager_sn", e.target.value)} required={req.has("manager_sn")} /></Field>
                  </div>
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <Field label="หมายเลข Case (จาก Engineer)" required><Input value={f.case_no} onChange={(e) => set("case_no", e.target.value)} required /></Field>
                    <SupportContact />
                  </div>
                  <div><p className="mb-1.5 text-sm font-medium text-slate-700">S/N ตัวที่เสีย และอาการ <span className="text-red-500">*</span></p><SnRows single units={units} onChange={setUnits} /></div>
                </div>
              )}

              {type === "optimizer" && (
                <div className="space-y-4">
                  {items.map((it, i) => {
                    const upd = (patch: Partial<OptItem>) => setItems((l) => l.map((x) => (x.key === it.key ? { ...x, ...patch } : x)));
                    return (
                      <div key={it.key} className="rounded-xl bg-slate-50/60 p-4 ring-1 ring-slate-200">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-navy-900">Optimizer รุ่นที่ {i + 1} · {it.units.length} ตัว</p>
                          {items.length > 1 && <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>ลบรุ่นนี้</button>}
                        </div>
                        <div className="mb-3 grid gap-3 sm:grid-cols-2">
                          <ModelPicker label="รุ่น / รหัส" value={it.model} onChange={(v) => upd({ model: v })} options={options} />
                          <Field label="อ้างอิง S/N Inverter" required={req.has("ref_inv_sn")}><Input className="font-mono" value={it.ref_inv_sn} onChange={(e) => upd({ ref_inv_sn: e.target.value })} /></Field>
                        </div>
                        <SnRows measure units={it.units} onChange={(u) => upd({ units: u })} snLabel="S/N ตัวเสีย" />
                      </div>
                    );
                  })}
                  <Button type="button" variant="secondary" onClick={() => setItems((l) => [...l, emptyItem()])}>+ เพิ่มรุ่น Optimizer</Button>
                </div>
              )}

              {type === "accessory" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ModelPicker label="รุ่น / รหัสอุปกรณ์" value={f.model} onChange={(v) => set("model", v)} options={options} />
                    <Field label="อ้างอิง S/N Inverter" required={req.has("ref_inv_sn")}><Input className="font-mono" value={f.ref_inv_sn} onChange={(e) => set("ref_inv_sn", e.target.value)} required={req.has("ref_inv_sn")} /></Field>
                  </div>
                  <div><p className="mb-1.5 text-sm font-medium text-slate-700">S/N อุปกรณ์ (ถ้ามี) และอาการ</p><SnRows units={units} onChange={setUnits} /></div>
                </div>
              )}

              {(type === "panel" || type === "battery" || type === "other") && (
                <div className="space-y-4">
                  <div className="max-w-md"><ModelPicker label="รุ่น / รหัสสินค้า" value={f.model} onChange={(v) => set("model", v)} options={options} /></div>
                  <div><p className="mb-1.5 text-sm font-medium text-slate-700">{type === "panel" ? "S/N แผง" : "S/N"} และอาการ <span className="font-normal text-slate-500">(1 บรรทัด = 1 ชิ้น · จำนวน {units.length} ชิ้น)</span></p><SnRows units={units} onChange={setUnits} /></div>
                </div>
              )}

              <div className="mt-4"><Field label="รายละเอียดเพิ่มเติม / อาการโดยรวม" hint="อาการของแต่ละตัวกรอกในตารางด้านบน"><Textarea rows={2} value={f.symptom} onChange={(e) => set("symptom", e.target.value)} /></Field></div>

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
            </div>
          )}
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
          <Button type="submit" variant="sun" loading={busy} disabled={step < 3}>ส่งแจ้งเคลม</Button>
          <Link to="/app/claims" className="self-center text-sm text-slate-600 hover:underline">ยกเลิก</Link>
        </div>
      </form>
    </>
  );
}
