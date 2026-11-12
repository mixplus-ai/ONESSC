import { useEffect, useMemo, useRef, useState } from "react";
import { ScanButton } from "../../../../components/SnScanner";
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Spinner, Textarea, cx } from "../../../../components/ui";
import {
  BOARD_STATUS, CLAIM_STATUS, STEPS, STEP_DOC, STEP_STATE_LABEL, claimFileUrl, fmtDmy, isImage, openClaimFile, productTypeLabel,
  splitSns, stepProgress, todayIso, uploadClaimFile,
  type Claim, type ClaimFile, type ClaimUnit, type FileKind, type StepState, type UnitField,
} from "../../../../lib/claims";
import { useAuth } from "../../../../lib/auth";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { printClaim, exportClaimImage, exportClaimXlsx } from "./exporters";
import { staffName, useBoard } from "./shared";

const chipTone: Record<StepState, string> = {
  none: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-800",
  full: "bg-emerald-50 text-emerald-700",
  over: "bg-red-50 text-red-700",
};

export function Pips({ claim, units }: { claim: Claim; units: ClaimUnit[] }) {
  const p = stepProgress(claim, units);
  const color: Record<StepState, string> = { none: "bg-slate-200", partial: "bg-amber-400", full: "bg-emerald-500", over: "bg-red-500" };
  return (
    <span className="inline-flex gap-1" aria-label="ความคืบหน้า 5 ขั้น">
      {p.map((x) => <span key={x.n} title={`ขั้น ${x.n}: ${x.count}/${x.qty}`} className={cx("h-2 w-4 rounded-full", x.n === 5 && x.state === "none" ? "bg-slate-100 ring-1 ring-slate-200" : color[x.state])} />)}
    </span>
  );
}

type Draft = Partial<ClaimUnit> & { _key: string };
const blankUnit = (claimId: string, pcode: string | null): Draft => ({ _key: crypto.randomUUID(), claim_id: claimId, pcode });

/** กรอกรวมตามเลขเคลม: every unit × every step field, with fill / scan / paste tools. */
export function UnitGrid({ claim, units, open, onClose, focusStep }: { claim: Claim; units: ClaimUnit[]; open: boolean; onClose: () => void; focusStep?: number }) {
  const { reload } = useBoard();
  const [rows, setRows] = useState<Draft[]>([]);
  const [del, setDel] = useState<number[]>([]);
  const [step, setStep] = useState<2 | 3 | 4 | 5>(2);
  const [doc, setDoc] = useState("");
  const [date, setDate] = useState(todayIso());
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [snText, setSnText] = useState("");
  const [addN, setAddN] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setRows(units.map((u) => ({ ...u, _key: String(u.id) })));
    setDel([]);
    setErr("");
    if (focusStep && focusStep >= 2) setStep(focusStep as 2 | 3 | 4 | 5);
  }, [open, units, focusStep]);

  // only column A + the chosen step's columns, unless "แสดงทุกขั้น" is ticked
  const fields = STEPS.slice(1).filter((s) => showAll || s.n === step).flatMap((s) => s.fields.map((f) => ({ ...f, step: s.n })));
  const setCell = (i: number, k: UnitField | "pcode", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v || null } : x)));
  const snField = STEPS[step - 1].sn!;
  const sd = STEP_DOC[step];

  function fillDoc() {
    setRows((r) => r.map((x) => {
      if (onlyEmpty && (x[sd.doc] as string | null)) return x;
      const n = { ...x, [sd.doc]: doc || x[sd.doc] || null, [sd.date]: date || x[sd.date] || null };
      if (sd.pcode && !n[sd.pcode]) (n as Record<string, unknown>)[sd.pcode] = x.pcode ?? null;
      return n;
    }));
  }
  function addSns(list: string[]) {
    setRows((r) => {
      const out = [...r];
      let k = 0;
      for (let i = 0; i < out.length && k < list.length; i++) {
        if (out[i][snField]) continue;
        out[i] = { ...out[i], [snField]: list[k++] };
      }
      if (k < list.length) setErr(`มี SN เกินจำนวนแถวว่าง ${list.length - k} ตัว (เพิ่มแถวก่อน)`);
      return out;
    });
  }
  async function save() {
    setBusy(true);
    setErr("");
    const payload = rows.map(({ _key, updated_at, updated_by, seq, ...u }) => { void _key; void updated_at; void updated_by; void seq; return { ...u, claim_id: claim.id }; });
    const { error } = await supabase.rpc("save_claim_units", { p_units: payload, p_delete: del });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} wide="full" title={`กรอกรวมทุกขั้นตอน · ${claim.claim_no}`}
      footer={<><Button variant="ghost" onClick={onClose}>ยกเลิก</Button><Button onClick={save} loading={busy}>บันทึก</Button></>}>
      <div className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-3 lg:grid-cols-[auto_1fr_1fr]">
        <Field label="ขั้นตอน">
          <Select value={step} onChange={(e) => setStep(Number(e.target.value) as 2 | 3 | 4 | 5)}>
            {STEPS.slice(1).map((s) => <option key={s.n} value={s.n}>ขั้น {s.n} · {s.short}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="เลขที่เอกสาร"><Input value={doc} onChange={(e) => setDoc(e.target.value)} /></Field>
          <Field label="วันที่"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <label className="mb-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />เฉพาะแถวว่าง</label>
          <Button variant="secondary" onClick={fillDoc}>เติมทุกแถว</Button>
        </div>
        <div className="flex items-end gap-2">
          <Field label={`วาง / สแกน ${STEPS[step - 1].fields.find((f) => f.key === snField)?.label}`}>
            <Textarea rows={2} className="font-mono" value={snText} onChange={(e) => setSnText(e.target.value)} placeholder="SN ทีละบรรทัด (ยิงบาร์โค้ดได้)" />
          </Field>
          <ScanButton multi onScan={(sn) => addSns([sn])} />
          <Button variant="secondary" onClick={() => { addSns(splitSns(snText)); setSnText(""); }}>ใส่</Button>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-900">ขั้น {step} · {STEPS[step - 1].short} <span className="font-normal text-slate-500">({STEPS[step - 1].dir})</span></p>
        <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />แสดงทุกขั้น</label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="px-1 py-1">#</th>
              <th className="px-1 py-1">A รหัสสินค้า</th>
              {fields.map((f) => <th key={f.key} className={cx("whitespace-nowrap px-1 py-1", showAll && f.step === step && "bg-sun-500/15")}>{f.col} {f.label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._key} className="border-t border-slate-100">
                <td className="px-1 text-slate-500">{i + 1}</td>
                <td className="px-0.5 py-0.5"><input className="w-28 rounded border border-slate-200 px-1 py-1" value={r.pcode ?? ""} onChange={(e) => setCell(i, "pcode", e.target.value)} /></td>
                {fields.map((f) => (
                  <td key={f.key} className={cx("px-0.5 py-0.5", showAll && f.step === step && "bg-sun-500/5")}>
                    <input type={f.type === "date" ? "date" : "text"} className={cx("rounded border border-slate-200 px-1 py-1", f.type === "date" ? "w-36" : f.type === "sn" ? (showAll ? "w-32 font-mono" : "w-56 font-mono") : showAll ? "w-24" : "w-36")}
                      value={(r[f.key as UnitField] as string | null) ?? ""} onChange={(e) => setCell(i, f.key as UnitField, e.target.value)} />
                  </td>
                ))}
                <td><button type="button" className="px-1 text-red-600" title="ลบแถว" onClick={() => { if (r.id) setDel((d) => [...d, r.id!]); setRows((x) => x.filter((_, j) => j !== i)); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Input type="number" min={1} max={300} className="!w-20" value={addN} onChange={(e) => setAddN(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} />
        <Button variant="secondary" onClick={() => setRows((r) => [...r, ...Array.from({ length: addN }, () => blankUnit(claim.id, r[r.length - 1]?.pcode ?? claim.model))])}>เพิ่มแถว</Button>
        <span className="text-xs text-slate-500">{rows.length} แถว · ใบเคลมระบุ {claim.qty} ชิ้น</span>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  );
}

/** แก้ไขแถวเดียว: all 5 fieldsets, scan + today buttons */
function UnitEditor({ claim, unit, onClose }: { claim: Claim; unit: ClaimUnit | null; onClose: () => void }) {
  const { reload } = useBoard();
  const [u, setU] = useState<Partial<ClaimUnit>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [only, setOnly] = useState<number | null>(2);
  useEffect(() => {
    setU(unit ?? {});
    setErr("");
    // open on the first step this unit hasn't finished (its SN is empty)
    setOnly(unit ? STEPS.slice(1).find((s) => s.sn && !unit[s.sn])?.n ?? 2 : 2);
  }, [unit]);
  const set = (k: UnitField, v: string) => setU((x) => ({ ...x, [k]: v || null }));
  async function save(remove = false) {
    if (!unit) return;
    if (remove && !confirm(`ลบแถวที่ ${unit.seq} ของเคลม ${claim.claim_no}?`)) return;
    setBusy(true);
    const { updated_at, updated_by, seq, ...rest } = u as ClaimUnit;
    void updated_at; void updated_by; void seq;
    const { error } = await supabase.rpc("save_claim_units", remove ? { p_units: [], p_delete: [unit.id] } : { p_units: [rest], p_delete: [] });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    await reload();
    onClose();
  }
  return (
    <Modal open={Boolean(unit)} onClose={onClose} wide title={`แก้ไขหน่วยสินค้า #${unit?.seq ?? ""} · ${claim.claim_no}`}
      footer={<><Button variant="danger" onClick={() => save(true)} disabled={busy}>ลบแถว</Button><span className="flex-1" /><Button variant="ghost" onClick={onClose}>ยกเลิก</Button><Button onClick={() => save()} loading={busy}>บันทึก</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {STEPS.slice(1).map((s) => (
            <button key={s.n} type="button" onClick={() => setOnly(s.n)} className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", only === s.n ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>ขั้น {s.n} · {s.short}</button>
          ))}
          <button type="button" onClick={() => setOnly(null)} className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", only === null ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>ทุกขั้น</button>
        </div>
        <Field label="A รหัสสินค้า"><Input value={u.pcode ?? ""} onChange={(e) => set("pcode", e.target.value)} /></Field>
        {STEPS.slice(1).filter((s) => only === null || s.n === only).map((s) => (
          <fieldset key={s.n} className="rounded-xl p-3 ring-1 ring-slate-200">
            <legend className="px-1 text-sm font-semibold text-navy-900">ขั้น {s.n} · {s.short} <span className="font-normal text-slate-500">({s.dir})</span></legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {s.fields.map((f) => (
                <Field key={f.key} label={`${f.col} ${f.label}`}>
                  <div className="flex gap-1">
                    <Input type={f.type === "date" ? "date" : "text"} className={f.type === "sn" ? "font-mono" : ""} value={(u[f.key as UnitField] as string | null) ?? ""} onChange={(e) => set(f.key as UnitField, e.target.value)} />
                    {f.type === "sn" && <ScanButton onScan={(sn) => set(f.key as UnitField, sn)} />}
                    {f.type === "date" && <button type="button" className="shrink-0 rounded-lg px-2 text-xs ring-1 ring-inset ring-slate-300" onClick={() => set(f.key as UnitField, todayIso())}>วันนี้</button>}
                  </div>
                </Field>
              ))}
            </div>
          </fieldset>
        ))}
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  );
}

/** แก้ไขใบเคลม: header A–J + linking */
export function HeaderEditor({ claim, open, onClose }: { claim: Claim; open: boolean; onClose: () => void }) {
  const { reload, brands } = useBoard();
  const [c, setC] = useState<Claim>(claim);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setC(claim); setErr(""); }, [claim, open]);
  const set = <K extends keyof Claim>(k: K, v: Claim[K]) => setC((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("claims").update({
      claim_no: c.claim_no, legacy_ref: c.legacy_ref || null, company_name: c.company_name || null, voucher_no: c.voucher_no || null,
      voucher_date: c.voucher_date || null, case_id: c.case_id || null, site_id: c.site_id || null, pickup_on: c.pickup_on || null,
      sales_code: c.sales_code || null, qty: c.qty, brand_id: c.brand_id || null, product_type: c.product_type || null, model: c.model || null,
      internal_note: c.internal_note || null,
    }).eq("id", c.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    await reload();
    onClose();
  }
  async function remove() {
    if (!confirm(`ลบเคลม ${claim.claim_no} ทั้งใบ (ทุกหน่วยสินค้าและไฟล์)? ย้อนกลับไม่ได้`)) return;
    setBusy(true);
    const { error } = await supabase.from("claims").delete().eq("id", claim.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    await reload();
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} wide title={`แก้ไขใบเคลม ${claim.claim_no}`}
      footer={<><Button variant="danger" onClick={remove} disabled={busy}>ลบเคลมทั้งใบ</Button><span className="flex-1" /><Button variant="ghost" onClick={onClose}>ยกเลิก</Button><Button onClick={save} loading={busy}>บันทึก</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="F เลขเคลม" required><Input value={c.claim_no} onChange={(e) => set("claim_no", e.target.value)} /></Field>
        <Field label="B เลขใบสำคัญ"><Input value={c.voucher_no ?? ""} onChange={(e) => set("voucher_no", e.target.value)} /></Field>
        <Field label="C วันที่ใบสำคัญ"><Input type="date" value={c.voucher_date ?? ""} onChange={(e) => set("voucher_date", e.target.value)} /></Field>
        <Field label="D Case ID"><Input value={c.case_id ?? ""} onChange={(e) => set("case_id", e.target.value)} /></Field>
        <Field label="E SiteID"><Input value={c.site_id ?? ""} onChange={(e) => set("site_id", e.target.value)} /></Field>
        <Field label="G ชื่อบริษัท"><Input value={c.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="H วันนัดรับ"><Input value={c.pickup_on ?? ""} onChange={(e) => set("pickup_on", e.target.value)} /></Field>
        <Field label="I รหัสเซลล์"><Input value={c.sales_code ?? ""} onChange={(e) => set("sales_code", e.target.value)} /></Field>
        <Field label="J จำนวน"><Input type="number" min={1} max={1000} value={c.qty} onChange={(e) => set("qty", Math.max(1, Number(e.target.value) || 1))} /></Field>
        <Field label="แบรนด์">
          <Select value={c.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value || null)}>
            <option value="">-</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="รุ่น (สรุป)"><Input value={c.model ?? ""} onChange={(e) => set("model", e.target.value)} /></Field>
        <Field label="เลขอ้างอิงเดิม (CLM-…)"><Input value={c.legacy_ref ?? ""} onChange={(e) => set("legacy_ref", e.target.value)} /></Field>
        <div className="sm:col-span-3"><Field label="หมายเหตุภายใน (ลูกค้าไม่เห็น)"><Textarea rows={2} value={c.internal_note ?? ""} onChange={(e) => set("internal_note", e.target.value)} /></Field></div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  );
}

function Photos({ claim, kind, title, canUpload }: { claim: Claim; kind: FileKind; title: string; canUpload: boolean }) {
  const [files, setFiles] = useState<ClaimFile[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [view, setView] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const { canEdit } = useBoard();
  const load = async () => {
    const { data } = await supabase.from("claim_files").select("*").eq("claim_id", claim.id).eq("kind", kind).order("created_at");
    const list = (data ?? []) as ClaimFile[];
    setFiles(list);
    const imgs = list.filter(isImage);
    if (imgs.length) {
      const { data: urls } = await supabase.storage.from("claim-files").createSignedUrls(imgs.map((f) => f.path), 3600);
      setThumbs(Object.fromEntries((urls ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string])));
    }
  };
  useEffect(() => { load(); }, [claim.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  async function up(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setErr("");
    try { for (const f of [...list]) await uploadClaimFile(claim.id, kind, f); } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
    load();
  }
  async function remove(f: ClaimFile) {
    if (!confirm("ลบรูปนี้?")) return;
    await supabase.storage.from("claim-files").remove([f.path]);
    await supabase.from("claim_files").delete().eq("id", f.id);
    setView(null);
    load();
  }
  const imgs = (files ?? []).filter(isImage);
  const cur = view != null ? imgs[view] : null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {canUpload && <button type="button" className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "+ เพิ่มรูป"}</button>}
        <input ref={ref} type="file" hidden multiple accept="image/*,.pdf" onChange={(e) => { up(e.target.files); e.target.value = ""; }} />
      </div>
      {files === null ? <Spinner className="h-4 w-4" /> : files.length === 0 ? <p className="text-xs text-slate-500">ยังไม่มีรูป</p> : (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => isImage(f) && thumbs[f.path] ? (
            <button key={f.id} type="button" onClick={() => setView(imgs.indexOf(f))}><img src={thumbs[f.path]} alt={f.file_name ?? ""} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" /></button>
          ) : (
            <button key={f.id} type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-xs" onClick={() => openClaimFile(f.path)}>{f.file_name ?? "ไฟล์"}</button>
          ))}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <Modal open={cur != null} onClose={() => setView(null)} wide title={`${title} ${view != null ? `${view + 1}/${imgs.length}` : ""}`}
        footer={cur && <>
          {canEdit && <Button variant="danger" onClick={() => remove(cur)}>ลบ</Button>}
          <span className="flex-1" />
          <Button variant="secondary" disabled={view === 0} onClick={() => setView((v) => (v ?? 1) - 1)}>‹ ก่อนหน้า</Button>
          <Button variant="secondary" disabled={view === imgs.length - 1} onClick={() => setView((v) => (v ?? 0) + 1)}>ถัดไป ›</Button>
          <Button onClick={async () => { const u = await claimFileUrl(cur.path, cur.file_name ?? "photo.jpg"); if (u) window.location.href = u; }}>ดาวน์โหลด</Button>
        </>}>
        {cur && thumbs[cur.path] && <img src={thumbs[cur.path]} alt={cur.file_name ?? ""} className="mx-auto max-h-[70vh] rounded-lg" />}
      </Modal>
    </div>
  );
}

export default function ClaimDetail({ claim }: { claim: Claim }) {
  const { unitsBy, statusBy, canEdit, staff, brands } = useBoard();
  const me = useAuth().session?.user.id;
  const units = useMemo(() => unitsBy.get(claim.id) ?? [], [unitsBy, claim.id]);
  const progress = stepProgress(claim, units);
  const done4 = progress.slice(0, 4).filter((p) => p.state === "full").length;
  const bs = BOARD_STATUS[statusBy.get(claim.id) ?? "open"];
  const [grid, setGrid] = useState<number | null>(null);
  const [edit, setEdit] = useState<ClaimUnit | null>(null);
  const [header, setHeader] = useState(false);
  const [exporting, setExporting] = useState(false);
  const issueSns = units.map((u) => u.iss_sn).filter(Boolean) as string[];
  const dupIssue = issueSns.length !== new Set(issueSns.map((s) => s.toUpperCase())).size;
  const cardRef = useRef<HTMLDivElement>(null);

  const kv: [string, string][] = [
    ["รหัสสินค้า", [...new Set(units.map((u) => u.pcode).filter(Boolean))].join(", ") || claim.model || "-"],
    ["เลขใบสำคัญ", claim.voucher_no ?? "-"],
    ["วันที่ใบสำคัญ", fmtDmy(claim.voucher_date) || "-"],
    ["Case ID", claim.case_id ?? "-"],
    ["SiteID", claim.site_id ?? "-"],
    ["วันนัดรับ", claim.pickup_on ?? "-"],
    ["รหัสเซลล์", claim.sales_code ?? "-"],
    ["จำนวน", String(claim.qty)],
  ];

  async function exp(kind: "print" | "png" | "xlsx") {
    setExporting(true);
    try {
      if (kind === "print") printClaim(claim, units, brands);
      else if (kind === "png") await exportClaimImage(claim, units, brands);
      else await exportClaimXlsx(claim, units);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4" ref={cardRef}>
      <Card className="!p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-bold text-navy-900">{claim.claim_no}</p>
            <p className="text-sm text-slate-600">{claim.company_name ?? "-"}</p>
            <p className="text-xs text-slate-500">
              {[brands.find((b) => b.id === claim.brand_id)?.name, claim.product_type && productTypeLabel(claim.product_type)].filter(Boolean).join(" · ")}
              {claim.legacy_ref && ` · อ้างอิง ${claim.legacy_ref}`}
              {claim.source === "customer" && <> · ลูกค้า: <Badge tone={CLAIM_STATUS[claim.status].tone}>{CLAIM_STATUS[claim.status].label}</Badge></>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={bs.tone}>{bs.label}</Badge>
            <div className="flex flex-wrap justify-end gap-1">
              <Select className="!w-auto !py-1.5 text-xs" value="" disabled={exporting} onChange={(e) => { const v = e.target.value as "print" | "png" | "xlsx"; e.target.value = ""; if (v) exp(v); }} aria-label="พิมพ์ / ส่งออก">
                <option value="">พิมพ์ / ส่งออก…</option>
                <option value="print">พิมพ์ / บันทึก PDF</option>
                <option value="png">รูปภาพ PNG</option>
                <option value="xlsx">Excel (XLSX)</option>
              </Select>
              {canEdit && <Button variant="secondary" className="!py-1.5" onClick={() => setHeader(true)}>แก้ไขใบเคลม</Button>}
              {canEdit && <Button className="!py-1.5" onClick={() => setGrid(2)}>กรอกรวมทุกขั้นตอน</Button>}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${(done4 / 4) * 100}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">ครบ {done4}/4 ขั้นตอนหลัก · {units.length} หน่วยสินค้า · ผู้รับผิดชอบ {staffName(staff, claim.assigned_to)}</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {kv.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="truncate" title={v}>{v}</dd></div>)}
        </dl>
        {dupIssue && <div className="mt-3"><Alert tone="amber">มี SN เบิกซ้ำกันในเคลมนี้</Alert></div>}
        {claim.internal_note && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">หมายเหตุภายใน: {claim.internal_note}</p>}
        <p className="mt-2 text-xs text-slate-400">แก้ไขล่าสุด {new Date(claim.updated_at).toLocaleString("th-TH")} · {staffName(staff, claim.updated_by)}</p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STEPS.map((s, i) => {
          const p = progress[i];
          return (
            <Card key={s.n} className="!p-3">
              <p className="text-xs font-semibold text-sun-600">ขั้น {s.n}{s.optional ? " (ไม่บังคับ)" : ""}</p>
              <p className="text-sm font-semibold text-navy-900">{s.short}</p>
              <p className="text-xs text-slate-500">{s.dir}</p>
              <p className={cx("mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium", chipTone[p.state])}>
                {s.n === 5 ? (p.count ? `${p.count} รายการ` : "ไม่มีรายการ") : `${p.count}/${p.qty} · ${STEP_STATE_LABEL[p.state]}`}
              </p>
              {canEdit && s.n > 1 && <button type="button" className="mt-2 block text-xs font-semibold text-navy-700 hover:underline" onClick={() => setGrid(s.n)}>{p.count ? "แก้ไข" : "กรอก"}</button>}
            </Card>
          );
        })}
      </div>

      <Card className="!p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Photos claim={claim} kind="receive" title="ขั้น 1 · รับของเคลมจากลูกค้า" canUpload={canEdit || claim.assigned_to === me} />
          <Photos claim={claim} kind="issue" title="ขั้น 2 · ส่งของให้ลูกค้า" canUpload={canEdit || claim.assigned_to === me} />
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-2 py-1" rowSpan={2}>#</th>
                <th className="px-2 py-1" rowSpan={2}>A รหัสสินค้า</th>
                {STEPS.slice(1).map((s) => <th key={s.n} colSpan={s.fields.length} className="border-l border-slate-200 px-2 py-1 text-center">ขั้น {s.n} · {s.short}</th>)}
                {canEdit && <th rowSpan={2} />}
              </tr>
              <tr>
                {STEPS.slice(1).flatMap((s) => s.fields.map((f, j) => <th key={f.key} className={cx("whitespace-nowrap px-2 py-1 font-normal", j === 0 && "border-l border-slate-200")}>{f.col} {f.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1 text-slate-500">{u.seq}</td>
                  <td className="px-2 py-1">{u.pcode}</td>
                  {STEPS.slice(1).flatMap((s) => s.fields.map((f, j) => {
                    const v = u[f.key as UnitField] as string | null;
                    return <td key={f.key} className={cx("whitespace-nowrap px-2 py-1", j === 0 && "border-l border-slate-100", f.type === "sn" && "font-mono")}>{f.type === "date" ? fmtDmy(v) : v}</td>;
                  }))}
                  {canEdit && <td className="px-2"><button type="button" className="text-navy-700 hover:underline" onClick={() => setEdit(u)}>แก้ไข</button></td>}
                </tr>
              ))}
              {units.length === 0 && <tr><td colSpan={20} className="px-2 py-4 text-center text-slate-500">ยังไม่มีหน่วยสินค้า</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {canEdit && (
        <>
          <UnitGrid claim={claim} units={units} open={grid != null} focusStep={grid ?? undefined} onClose={() => setGrid(null)} />
          <UnitEditor claim={claim} unit={edit} onClose={() => setEdit(null)} />
          <HeaderEditor claim={claim} open={header} onClose={() => setHeader(false)} />
        </>
      )}
    </div>
  );
}
