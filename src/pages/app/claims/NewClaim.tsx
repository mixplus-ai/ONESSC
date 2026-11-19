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
type ItemKind = "optimizer" | "accessory" | "panel";
/** one piece in an inverter's string (optimizer / accessory / panel) */
interface StringItem { key: string; kind: ItemKind; model: string; sn: string; pos: string; symptom: string; volt: string; ohm: string }
/** one inverter on the job: claimed itself, or only the reference for the items in its string */
interface InvGroup { key: string; claimed: boolean; model: string; sn: string; pos: string; symptom: string; items: StringItem[];
  /** per inverter (owner 2026-11-17): S/N Manager, Case no. from the Engineer, Issue, Description */
  manager_sn?: string; case_no?: string; issue?: string; description?: string }
interface StockModel { sku: string; description: string | null }
interface CareMember { role: "sales" | "support"; full_name: string; job_title: string | null; phone: string | null; line_id: string | null; email: string | null }
const uid = () => Math.random().toString(36).slice(2);
const emptyUnit = (): Unit => ({ key: uid(), sn: "", symptom: "", volt: "", ohm: "" });
const POS0 = "0.0.0.0";
const emptyItem = (kind: ItemKind): StringItem => ({ key: uid(), kind, model: "", sn: "", pos: POS0, symptom: "", volt: "", ohm: "" });
const emptyGroup = (claimed: boolean, kind?: ItemKind): InvGroup => ({ key: uid(), claimed, model: "", sn: "", pos: POS0, symptom: "", items: kind ? [emptyItem(kind)] : [] });
const ITEM_KINDS: { key: ItemKind; label: string }[] = [{ key: "optimizer", label: "Optimizer" }, { key: "accessory", label: "Accessories" }, { key: "panel", label: "Solar Panel" }];
const GROUPED = new Set<ProductType>(["inverter", "optimizer", "accessory", "panel"]);
const lineHref = (id: string) => (/^https?:\/\//.test(id) ? id : id.startsWith("@") ? `https://line.me/R/ti/p/${id}` : `https://line.me/ti/p/~${id}`);
const tel = (ph: string) => `tel:${ph.split(/[,\n/]/)[0].replace(/[^\d+]/g, "")}`;

/** รุ่น / รหัสสินค้า: type to search the stock sheet of the chosen brand (code + name) or the claim model list. */
function ModelPicker({ label, value, onChange, options, required = true, strict, brand }: { label: string; value: string; onChange: (v: string) => void; options: { code: string; name: string }[]; required?: boolean; strict?: boolean; brand?: string }) {
  const id = useMemo(() => `m-${uid()}`, []);
  const hit = options.find((o) => o.code.toUpperCase() === value.trim().toUpperCase());
  const wrong = strict && options.length > 0 && value.trim() !== "" && !hit;
  return (
    <Field label={label} required={required} hint={wrong ? <span className="text-red-600">เลือกได้เฉพาะสินค้า {brand} จากรายการ</span> : hit?.name ? <span className="text-navy-800">{hit.name}</span> : options.length ? (strict ? `พิมพ์ค้นหาแล้วเลือกจากรายการสินค้า ${brand} (${options.length} รายการ)` : `พิมพ์ค้นหารหัสหรือชื่อ (${options.length} รายการจากสต๊อก) หรือพิมพ์รุ่นเองได้`) : "พิมพ์รุ่นสินค้า"}>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder="รหัส / รุ่นสินค้า" className={wrong ? "!ring-red-400" : ""} />
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

/** Failed panel position 0.0.0.0: four numbers, each up to 3 digits. */
export function PosInput({ value, onChange, label = "ตำแหน่งที่เสีย" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const parts = (value || POS0).split(".").concat(["0", "0", "0", "0"]).slice(0, 4);
  const set = (i: number, v: string) => onChange(parts.map((p, j) => (j === i ? v.replace(/\D/g, "").slice(0, 3) : p)).join("."));
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="font-bold text-slate-400">.</span>}
          <input inputMode="numeric" maxLength={3} value={p} onFocus={(e) => e.target.select()} onChange={(e) => set(i, e.target.value)}
            onBlur={() => { if (parts[i] === "") set(i, "0"); }} aria-label={`${label} ช่องที่ ${i + 1}`}
            className="w-11 rounded-lg border border-slate-300 px-1 py-2 text-center font-mono text-sm focus:border-navy-500 focus:outline-none" />
        </span>
      ))}
    </div>
  );
}

/** Inverters on the job; each one's string holds the optimizers / accessories / panels that failed there. */
function InverterGroups({ groups, onChange, optionsFor, strict, brand, defaultKind, needSn, needCase, needManager, showPos }: {
  groups: InvGroup[]; onChange: (g: InvGroup[]) => void; optionsFor: (k: ProductType) => { code: string; name: string }[];
  strict: boolean; brand: string; defaultKind: ItemKind; needSn: boolean; needCase: boolean; needManager: boolean;
  /** failed panel position on the inverter itself (not for SolarEdge inverters) */
  showPos: boolean;
}) {
  const upd = (k: string, patch: Partial<InvGroup>) => onChange(groups.map((g) => (g.key === k ? { ...g, ...patch } : g)));
  const updItem = (g: InvGroup, k: string, patch: Partial<StringItem>) => upd(g.key, { items: g.items.map((x) => (x.key === k ? { ...x, ...patch } : x)) });
  const pieces = groups.reduce((n, g) => n + (g.claimed ? 1 : 0) + g.items.length, 0);
  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={g.key} className={cx("rounded-xl p-4 ring-1", g.claimed ? "bg-sun-500/5 ring-sun-500/40" : "bg-slate-50/60 ring-slate-200")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-navy-900">Inverter ตัวที่ {gi + 1}{g.sn.trim() ? <span className="ml-1 font-mono font-normal text-slate-500">{g.sn.trim().toUpperCase()}</span> : null}</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={g.claimed} onChange={(e) => upd(g.key, { claimed: e.target.checked })} />เคลม Inverter ตัวนี้</label>
              {groups.length > 1 && <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => onChange(groups.filter((x) => x.key !== g.key))}>ลบ</button>}
            </div>
          </div>
          {(
            <div className="mb-3 max-w-md">
              <Field label="อ้างอิง S/N Manager Inverter" required={needManager}><Input className="font-mono" value={g.manager_sn ?? ""} onChange={(e) => upd(g.key, { manager_sn: e.target.value })} /></Field>
            </div>
          )}
          <div className={cx("grid gap-3", showPos ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "sm:grid-cols-2")}>
            <ModelPicker label="รุ่น / รหัส Inverter" value={g.model} onChange={(v) => upd(g.key, { model: v })} options={optionsFor("inverter")} required={g.claimed} strict={strict} brand={brand} />
            <Field label="S/N Inverter" required>
              <div className="flex gap-1">
                <Input className="font-mono" value={g.sn} onChange={(e) => upd(g.key, { sn: e.target.value })} placeholder="S/N" />
                <ScanButton onScan={(sn) => upd(g.key, { sn })} />
              </div>
            </Field>
            {g.claimed && showPos && <Field label="ตำแหน่งที่เสีย (แผง)" hint="0.0.0.0 แก้ได้ช่องละ 3 หลัก"><PosInput value={g.pos} onChange={(v) => upd(g.key, { pos: v })} /></Field>}
          </div>
          {(
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="หมายเลข Case (จาก Engineer)" required={needCase}><Input value={g.case_no ?? ""} onChange={(e) => upd(g.key, { case_no: e.target.value })} maxLength={100} /></Field>
              <Field label="Issue" required={needCase} hint="หัวข้อปัญหาตาม Case เช่น Isolation fault, Error 3x9A"><Input value={g.issue ?? ""} onChange={(e) => upd(g.key, { issue: e.target.value })} maxLength={200} /></Field>
              <div className="sm:col-span-2"><Field label="Description" required={needCase} hint="รายละเอียดปัญหาและสิ่งที่ตรวจสอบแล้ว"><Textarea rows={2} value={g.description ?? ""} onChange={(e) => upd(g.key, { description: e.target.value })} maxLength={2000} /></Field></div>
            </div>
          )}
          {g.claimed && <div className="mt-3"><Field label="อาการเสียของ Inverter ตัวนี้"><Input value={g.symptom} onChange={(e) => upd(g.key, { symptom: e.target.value })} placeholder="เช่น ไม่มีไฟออก, Error 18xA" /></Field></div>}

          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-slate-700">สินค้าที่เสียในสตริงของ Inverter นี้ <span className="font-normal text-slate-500">(1 แถว = 1 ชิ้น · {g.items.length} ชิ้น)</span></p>
            {g.items.length > 0 && (
              <ul className="space-y-2">
                {g.items.map((it, i) => (
                  <li key={it.key} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500">{i + 1}.</span>
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => upd(g.key, { items: g.items.filter((x) => x.key !== it.key) })} aria-label={`ลบชิ้นที่ ${i + 1}`}>✕</button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Field label="ประเภท">
                        <Select value={it.kind} onChange={(e) => updItem(g, it.key, { kind: e.target.value as ItemKind, model: "" })}>
                          {ITEM_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                        </Select>
                      </Field>
                      <ModelPicker label="รุ่น / รหัส" value={it.model} onChange={(v) => updItem(g, it.key, { model: v })} options={optionsFor(it.kind)} strict={strict} brand={brand} />
                      <Field label="S/N" required={needSn}>
                        <div className="flex gap-1">
                          <Input className="font-mono" value={it.sn} onChange={(e) => updItem(g, it.key, { sn: e.target.value })} placeholder="S/N" />
                          <ScanButton onScan={(sn) => updItem(g, it.key, { sn })} />
                        </div>
                      </Field>
                      <Field label="ตำแหน่งที่เสีย"><PosInput value={it.pos} onChange={(v) => updItem(g, it.key, { pos: v })} /></Field>
                    </div>
                    <div className={cx("mt-2 grid gap-2", it.kind === "optimizer" ? "sm:grid-cols-[minmax(0,1fr)_6rem_6rem]" : "")}>
                      <Input value={it.symptom} onChange={(e) => updItem(g, it.key, { symptom: e.target.value })} placeholder="อาการเสียของชิ้นนี้" aria-label={`อาการเสีย ชิ้นที่ ${i + 1}`} />
                      {it.kind === "optimizer" && <>
                        <Input inputMode="decimal" value={it.volt} onChange={(e) => updItem(g, it.key, { volt: e.target.value })} placeholder="V" aria-label={`แรงดัน ชิ้นที่ ${i + 1}`} />
                        <Input inputMode="decimal" value={it.ohm} onChange={(e) => updItem(g, it.key, { ohm: e.target.value })} placeholder="Ω" aria-label={`ความต้านทาน ชิ้นที่ ${i + 1}`} />
                      </>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" className="!py-1.5" onClick={() => upd(g.key, { items: [...g.items, emptyItem(g.items[g.items.length - 1]?.kind ?? defaultKind)] })}>+ เพิ่มสินค้าในสตริงนี้</Button>
              <ScanButton multi onScan={(sn) => upd(g.key, { items: [...g.items, { ...emptyItem(g.items[g.items.length - 1]?.kind ?? defaultKind), sn, model: g.items[g.items.length - 1]?.model ?? "" }] })} />
              <span className="text-xs text-slate-500">สแกนต่อเนื่องได้ ระบบเพิ่มแถวให้</span>
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => onChange([...groups, emptyGroup(groups[0]?.claimed ?? true)])}>+ เพิ่ม Inverter</Button>
        <span className="text-sm text-slate-600">รวม {pieces} ชิ้นที่เคลม</span>
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

interface Draft { at: string; type: ProductType | ""; brandId: string; f: Record<string, string>; units: Unit[]; groups?: InvGroup[] }
const draftKey = (id: string | undefined) => `claimDraft:${id ?? "anon"}`;
function readDraft(id: string | undefined): Draft | null {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null"); } catch { return null; }
}

export default function NewClaim() {
  const { profile, session } = useAuth();
  const nav = useNavigate();
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [models, setModels] = useState<ClaimModel[]>([]);
  const [stock, setStock] = useState<StockModel[]>([]);
  const [cfg, setCfg] = useState<ClaimSettings | null>(null);
  const [type, setType] = useState<ProductType | "">("");
  const [brandId, setBrandId] = useState("");
  const [f, setF] = useState({
    contact_name: "", contact_phone: "", company_name: "", po_no: "", installer_name: "", site_name: "", site_id: "",
    model: "", manager_sn: "", case_no: "", issue: "", description: "", ref_inv_sn: "", symptom: "",
    delivery_type: "pickup" as "pickup" | "shipping", delivery_address: "",
  });
  const [units, setUnits] = useState<Unit[]>([emptyUnit()]);
  const [groups, setGroups] = useState<InvGroup[]>([emptyGroup(true)]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // the form is long: keep a draft on this device so closing the page does not lose it (attached files are not kept)
  const me = session?.user.id;
  const [restored, setRestored] = useState<string | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current || !me) return;
    loaded.current = true;
    const d = readDraft(me);
    if (!d) return;
    setType(d.type); setBrandId(d.brandId);
    setF((x) => ({ ...x, ...d.f }));
    if (d.units?.length) setUnits(d.units);
    if (d.groups?.length) setGroups(d.groups);
    setRestored(d.at);
  }, [me]);
  useEffect(() => {
    if (!loaded.current || !me) return;
    const t = window.setTimeout(() => {
      const touched = type || units.some((u) => u.sn || u.symptom) || f.site_id || f.symptom || f.model;
      try {
        if (touched) localStorage.setItem(draftKey(me), JSON.stringify({ at: new Date().toISOString(), type, brandId, f, units, groups } satisfies Draft));
      } catch { /* storage full or private mode */ }
    }, 600);
    return () => window.clearTimeout(t);
  }, [me, type, brandId, f, units, groups]);
  function clearDraft() {
    try { localStorage.removeItem(draftKey(me)); } catch { /* ignore */ }
    setRestored(null);
    setType(""); setBrandId(""); setUnits([emptyUnit()]); setGroups([emptyGroup(true)]);
    setF((x) => ({ ...x, po_no: "", installer_name: "", site_name: "", site_id: "", model: "", manager_sn: "", case_no: "", issue: "", description: "", ref_inv_sn: "", symptom: "", delivery_type: "pickup", delivery_address: "" }));
  }

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
  // SolarEdge: only SolarEdge items, one piece per row with its own S/N
  const isSE = /solar\s*edge/i.test(brand?.name ?? "");
  const grouped = Boolean(type && GROUPED.has(type));
  const claimedInv = grouped && groups.some((g) => g.claimed);
  // Case no. / Issue / Description: required for SolarEdge inverters only; staff fill them in for other claims
  const seInv = isSE && (type === "inverter" || claimedInv);
  // model options per product type: the claim model list for the type + brand, then the brand's codes from the stock sheet
  // (SolarEdge: brand-specific models only, no generic ones)
  const optionsFor = useMemo(() => {
    const cache = new Map<string, { code: string; name: string }[]>();
    return (t: ProductType) => {
      if (!cache.has(t)) {
        const out = new Map<string, string>();
        for (const m of models) if (m.product_type === t && (isSE ? m.brand_id === brandId : !m.brand_id || m.brand_id === brandId)) out.set(m.model, m.note ?? "");
        for (const st of stock) if (!out.has(st.sku)) out.set(st.sku, st.description ?? "");
        cache.set(t, [...out].map(([code, name]) => ({ code, name })));
      }
      return cache.get(t)!;
    };
  }, [models, stock, brandId, isSE]);
  const options = type ? optionsFor(type) : [];
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const startGroups = (t: ProductType | "") => [emptyGroup(t === "inverter" || !t, t && t !== "inverter" && GROUPED.has(t) ? (t as ItemKind) : undefined)];
  const resetProduct = (t: ProductType | "" = type) => { set("model", ""); setUnits([emptyUnit()]); setGroups(startGroups(t)); };
  // a new claim type starts steps 2–3 over: brand, product rows, case fields, notes and files
  const pickType = (t: ProductType) => {
    if (t === type) return;
    setType(t); setBrandId(""); setFiles([]); setErr("");
    setF((x) => ({ ...x, model: "", manager_sn: "", case_no: "", issue: "", description: "", ref_inv_sn: "", symptom: "" }));
    setUnits([emptyUnit()]); setGroups(startGroups(t));
  };

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
    if (seInv && !grouped && !f.case_no.trim()) return setErr("กรุณากรอกหมายเลข Case จาก Engineer (ยังไม่มีเลข กดติดต่อ Support)");
    if (seInv && !grouped && !f.issue.trim()) return setErr("กรุณากรอก Issue");
    if (seInv && !grouped && !f.description.trim()) return setErr("กรุณากรอก Description");
    if (req.has("attachment") && files.length === 0) return setErr("แบรนด์นี้ต้องแนบรูปหรือไฟล์ประกอบ");
    const clean = (l: Unit[]) => l.filter((u) => u.sn.trim() || u.symptom.trim() || u.volt.trim() || u.ohm.trim());
    const inList = (t: ProductType, v: string) => { const o = optionsFor(t); return !isSE || !o.length || o.some((x) => x.code.toUpperCase() === v.trim().toUpperCase()); };
    const details: Record<string, unknown> = { po_no: f.po_no.trim() || undefined };
    type Row = { kind: ProductType; model: string; sn: string; symptom: string; pos?: string; inv_sn?: string; volt?: string; ohm?: string; manager_sn?: string; case_no?: string; issue?: string; description?: string };
    let rows: Row[] = [];
    if (grouped) {
      for (const [gi, g] of groups.entries()) {
        const n = `Inverter ตัวที่ ${gi + 1}`;
        if (!g.sn.trim()) return setErr(`กรุณากรอก S/N ของ ${n}`);
        if (g.claimed && !g.model.trim()) return setErr(`กรุณาเลือกรุ่นของ ${n}`);
        if (!g.manager_sn?.trim()) return setErr(`กรุณากรอก S/N Manager ของ ${n}`);
        if (!g.case_no?.trim()) return setErr(`กรุณากรอกหมายเลข Case จาก Engineer ของ ${n} (ยังไม่มีเลข กดติดต่อ Support)`);
        if (!g.issue?.trim()) return setErr(`กรุณากรอก Issue ของ ${n}`);
        if (!g.description?.trim()) return setErr(`กรุณากรอก Description ของ ${n}`);
        if (g.model.trim() && !inList("inverter", g.model)) return setErr(`${n}: เลือกได้เฉพาะสินค้า ${brand?.name} จากรายการ`);
        for (const [i, it] of g.items.entries()) {
          if (!it.model.trim()) return setErr(`กรุณาเลือกรุ่นของชิ้นที่ ${i + 1} ใน${n}`);
          if (!inList(it.kind, it.model)) return setErr(`ชิ้นที่ ${i + 1} ใน${n}: เลือกได้เฉพาะสินค้า ${brand?.name} จากรายการ`);
          if (isSE && !it.sn.trim()) return setErr(`SolarEdge เคลมเป็นรายชิ้น กรุณากรอก S/N ชิ้นที่ ${i + 1} ใน${n}`);
        }
      }
      if (type === "inverter" && !claimedInv) return setErr("ติ๊ก \"เคลม Inverter ตัวนี้\" อย่างน้อย 1 ตัว");
      details.inverters = groups.map((g) => ({ sn: g.sn.trim().toUpperCase(), model: g.model.trim() || undefined, pos: g.claimed && !isSE ? g.pos : undefined, claimed: g.claimed,
        manager_sn: g.manager_sn?.trim(), case_no: g.case_no?.trim(), issue: g.issue?.trim(), description: g.description?.trim() }));
      rows = groups.flatMap((g): Row[] => [
        ...(g.claimed ? [{ kind: "inverter" as const, model: g.model.trim(), sn: g.sn.trim(), symptom: g.symptom.trim(), pos: isSE ? undefined : g.pos,
          manager_sn: g.manager_sn?.trim() || undefined, case_no: g.case_no?.trim() || undefined, issue: g.issue?.trim() || undefined, description: g.description?.trim() || undefined }] : []),
        ...g.items.map((it) => ({ kind: it.kind, model: it.model.trim(), sn: it.sn.trim(), symptom: it.symptom.trim(), pos: it.pos, inv_sn: g.sn.trim().toUpperCase(),
          ...(it.kind === "optimizer" ? { volt: it.volt.trim(), ohm: it.ohm.trim() } : {}) })),
      ]);
      if (!rows.length) return setErr("กรุณาเพิ่มสินค้าที่เคลมอย่างน้อย 1 ชิ้น");
      // first claimed inverter's case also kept at the top level (older screens read these)
      const first = groups.find((g) => g.claimed);
      if (first) Object.assign(details, { case_no: first.case_no?.trim() || undefined, issue: first.issue?.trim() || undefined, description: first.description?.trim() || undefined, manager_sn: first.manager_sn?.trim() || undefined });
    } else {
      const model = f.model.trim();
      if (!model) return setErr("กรุณาเลือกหรือพิมพ์รุ่นสินค้า");
      if (!inList(type, model)) return setErr(`เลือกได้เฉพาะสินค้า ${brand?.name} จากรายการ`);
      const list = clean(units);
      if (isSE && (!list.length || list.some((u) => !u.sn.trim()))) return setErr("SolarEdge เคลมเป็นรายชิ้น กรุณากรอก S/N ทุกชิ้น");
      rows = (list.length ? list : [emptyUnit()]).map((u) => ({ kind: type, model, sn: u.sn.trim(), symptom: u.symptom.trim() }));
    }
    details.units = rows;
    const keys = rows.map((r) => r.sn.toUpperCase().replace(/[\s\-_./]/g, "")).filter(Boolean);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) return setErr(`S/N ซ้ำในใบเคลม: ${dup}`);
    const withSymptom = rows.filter((u) => u.symptom);
    // staff also see each unit's symptom in the claim's symptom text
    const caseText = grouped
      ? rows.filter((r) => r.kind === "inverter" && (r.case_no || r.issue || r.description)).map((r) => `${r.sn} · Case ${r.case_no ?? "-"} · Issue: ${r.issue ?? "-"} · Description: ${r.description ?? "-"}`)
      : seInv ? [`Issue: ${f.issue.trim()}`, `Description: ${f.description.trim()}`] : [];
    const symptom = [...caseText, f.symptom.trim(), ...withSymptom.map((u) => `${u.sn || u.model}${u.pos && u.pos !== POS0 ? ` @${u.pos}` : ""}: ${u.symptom}`)].filter(Boolean).join("\n");
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_claim", {
      p: {
        brand_id: brandId, product_type: type, model: null,
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
    try { localStorage.removeItem(draftKey(me)); } catch { /* ignore */ }
    nav("/app/claims", { state: { created: row.claim_no, failed } });
  }

  const step = !type ? 1 : !brandId ? 2 : 3;
  return (
    <>
      <PageTitle title="แจ้งเคลมสินค้า" subtitle="กรอกข้อมูลให้ครบ ส่งแล้วได้เลขเคลมทันที และติดตามสถานะได้ที่หน้าเคลมของฉัน" actions={<Link to="/app/claims" className="text-sm font-semibold text-navy-700 hover:underline">เคลมของฉัน</Link>} />
      {restored && (
        <div className="mb-4"><Alert tone="navy">
          กู้คืนแบบฟอร์มที่กรอกค้างไว้เมื่อ {new Date(restored).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} แล้ว (ไฟล์แนบต้องเลือกใหม่)
          {" "}<button type="button" className="font-semibold underline" onClick={clearDraft}>เริ่มกรอกใหม่</button>
        </Alert></div>
      )}
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
            <Field label="ชื่อโครงการ (Project Name)" required={req.has("site_name")}><Input value={f.site_name} onChange={(e) => set("site_name", e.target.value)} required={req.has("site_name")} /></Field>
            <Field label="เลขที่ Site ID" required><Input value={f.site_id} onChange={(e) => set("site_id", e.target.value)} required placeholder="Site ID ในระบบมอนิเตอร์" /></Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold text-navy-900">ข้อมูลสินค้า</h2>
          <p className="mb-4 text-xs text-slate-500">เลือกตามลำดับ: 1 ประเภทการเคลม → 2 แบรนด์ → 3 รายละเอียดสินค้า</p>

          <p className="mb-2 text-sm font-medium text-slate-700"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-navy-800 text-xs text-white">1</span>ประเภทการเคลมสินค้า <span className="text-red-500">*</span></p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_TYPES.map((t) => (
              <button key={t.key} type="button" onClick={() => pickType(t.key)}
                className={cx("rounded-xl px-4 py-2 text-sm font-semibold ring-1", type === t.key ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-200 hover:ring-navy-300")}>
                {t.label}
              </button>
            ))}
          </div>
          {type && <p className="mt-1.5 text-xs text-slate-500">เปลี่ยนประเภทการเคลม ข้อ 2–3 จะล้างและเริ่มกรอกใหม่</p>}

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

              {isSE && <div className="mb-4"><Alert tone="navy">SolarEdge เคลมเป็นรายชิ้น: 1 แถว = 1 ชิ้น พร้อม S/N ของชิ้นนั้น และเลือกได้เฉพาะสินค้า SolarEdge</Alert></div>}

              {grouped && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    {type === "inverter"
                      ? `เพิ่ม Inverter ได้หลายตัว ใส่ S/N${isSE ? "" : " และตำแหน่งที่เสีย"} ถ้ามี Optimizer / อุปกรณ์ / แผงเสียในสตริงเดียวกัน เพิ่มไว้ใต้ Inverter ตัวนั้น`
                      : "ระบุ Inverter ที่สินค้าแต่ละชิ้นต่ออยู่ (ไม่ต้องติ๊กเคลม ถ้า Inverter ไม่เสีย) แล้วเพิ่มชิ้นที่เสียไว้ใต้ Inverter ตัวนั้น"}
                  </p>
                  <div className="max-w-md"><SupportContact /></div>
                  <InverterGroups groups={groups} onChange={setGroups} optionsFor={optionsFor} strict={isSE} brand={brand?.name ?? ""}
                    defaultKind={type !== "inverter" && GROUPED.has(type as ProductType) ? (type as ItemKind) : "optimizer"} needSn={isSE} needCase needManager showPos={!isSE} />
                </div>
              )}

              {(type === "battery" || type === "other") && (
                <div className="space-y-4">
                  <div className="max-w-md"><ModelPicker label="รุ่น / รหัสสินค้า" value={f.model} onChange={(v) => set("model", v)} options={options} strict={isSE} brand={brand?.name} /></div>
                  <div><p className="mb-1.5 text-sm font-medium text-slate-700">S/N และอาการ <span className="font-normal text-slate-500">(1 บรรทัด = 1 ชิ้น · จำนวน {units.length} ชิ้น)</span></p><SnRows units={units} onChange={setUnits} /></div>
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
          {f.delivery_type === "shipping" && (<>
            <div className="mt-4"><Alert tone="navy">บริษัทจะออกค่าจัดส่งให้ก่อน เมื่อส่งของแล้วจะแจ้งยอดพร้อมใบเสร็จในหน้าเคลมของฉัน ให้โอนแล้วแนบสลิปได้ที่หน้านั้น</Alert></div>
            <div className="mt-4"><Field label="ที่อยู่จัดส่ง" required><Textarea rows={3} value={f.delivery_address} onChange={(e) => set("delivery_address", e.target.value)} required /></Field></div>
          </>)}
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
