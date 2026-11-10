// Board tools (perm 'claims'): new claim, paste from Excel (A–J), import the whole old sheet (A–Z),
// and "กรอกเลขที่ใบเบิกทุกเคลม" (document numbers across claims).
import { useMemo, useState } from "react";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "../../../../components/ui";
import { PRODUCT_TYPES, STEPS, STEP_DOC, parseClaimPaste, todayIso, type Claim, type ClaimUnit, type ImportClaim, type ParseResult } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { useBoard } from "./shared";

export function NewClaimModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (no: string) => void }) {
  const { reload, brands } = useBoard();
  const blank = { claim_no: "", pcode: "", voucher_no: "", voucher_date: "", case_id: "", site_id: "", company_name: "", pickup_on: "", sales_code: "", qty: 1, brand_id: "", product_type: "", contact_name: "", contact_phone: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.rpc("import_claims", {
      p_claims: [{ ...f, model: f.pcode, voucher_date: f.voucher_date || null, brand_id: f.brand_id || null, product_type: f.product_type || null, status: "in_progress" }],
      p_source: "staff",
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    const res = data as { created: string[]; skipped: string[] };
    if (res.skipped.length) return setErr(`เลขเคลม ${res.skipped[0]} มีอยู่แล้ว`);
    await reload();
    setF(blank);
    onCreated(res.created[0]);
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} wide title="เปิดใบเคลมใหม่ (ขั้น 1 · A–J)"
      footer={<><Button variant="ghost" onClick={onClose}>ยกเลิก</Button><Button onClick={save} loading={busy}>สร้างใบเคลม</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="F เลขเคลม" hint="เว้นว่าง = ออกเลขใหม่อัตโนมัติ (YY-NNNN)"><Input value={f.claim_no} onChange={(e) => set("claim_no", e.target.value)} placeholder="อัตโนมัติ" /></Field>
        <Field label="A รหัสสินค้า"><Input value={f.pcode} onChange={(e) => set("pcode", e.target.value)} /></Field>
        <Field label="J จำนวน" hint="สร้าง 1 แถวต่อ 1 ชิ้น"><Input type="number" min={1} max={200} value={f.qty} onChange={(e) => set("qty", Math.max(1, Number(e.target.value) || 1))} /></Field>
        <Field label="B เลขใบสำคัญ"><Input value={f.voucher_no} onChange={(e) => set("voucher_no", e.target.value)} /></Field>
        <Field label="C วันที่ใบสำคัญ"><Input type="date" value={f.voucher_date} onChange={(e) => set("voucher_date", e.target.value)} /></Field>
        <Field label="D Case ID"><Input value={f.case_id} onChange={(e) => set("case_id", e.target.value)} /></Field>
        <Field label="E SiteID"><Input value={f.site_id} onChange={(e) => set("site_id", e.target.value)} /></Field>
        <Field label="G ชื่อบริษัท"><Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="H วันนัดรับ"><Input value={f.pickup_on} onChange={(e) => set("pickup_on", e.target.value)} /></Field>
        <Field label="I รหัสเซลล์"><Input value={f.sales_code} onChange={(e) => set("sales_code", e.target.value)} /></Field>
        <Field label="แบรนด์">
          <Select value={f.brand_id} onChange={(e) => set("brand_id", e.target.value)}><option value="">-</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </Field>
        <Field label="ประเภทสินค้า">
          <Select value={f.product_type} onChange={(e) => set("product_type", e.target.value)}><option value="">-</option>{PRODUCT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
        </Field>
        <Field label="ผู้ติดต่อ"><Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
        <Field label="เบอร์โทร"><Input value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} /></Field>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  );
}

/** mode header = "วางใบเคลมจาก Excel" (A–J); mode full = นำเข้าข้อมูลชีตเดิมทั้งหมด (A–Z, 1 แถว = 1 ชิ้น) */
export function PasteModal({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: "header" | "full" }) {
  const { reload, claims } = useBoard();
  const [text, setText] = useState("");
  const [perUnit, setPerUnit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ created: string[]; skipped: string[] } | null>(null);
  const parsed: ParseResult | null = useMemo(() => (text.trim() ? parseClaimPaste(text, mode, perUnit) : null), [text, mode, perUnit]);
  const existing = useMemo(() => new Set(claims.map((c) => c.claim_no)), [claims]);
  const fresh = parsed?.claims.filter((c) => !existing.has(c.claim_no)) ?? [];
  const units = fresh.reduce((s, c) => s + (c.units?.length ?? (perUnit ? c.qty : 1)), 0);

  async function save() {
    if (!fresh.length) return;
    setBusy(true);
    setErr("");
    const out = { created: [] as string[], skipped: [] as string[] };
    try {
      for (let i = 0; i < fresh.length; i += 300) {
        const chunk = fresh.slice(i, i + 300).map((c: ImportClaim) => ({ ...c, model: c.pcode, status: c.status ?? "in_progress" }));
        const { data, error } = await supabase.rpc("import_claims", { p_claims: chunk, p_source: mode === "full" ? "import" : "staff" });
        if (error) throw error;
        const r = data as typeof out;
        out.created.push(...r.created);
        out.skipped.push(...r.skipped);
      }
    } catch (e) {
      setErr(`${errorMessage(e)} (บันทึกไปแล้ว ${out.created.length} เคลม)`);
    }
    setBusy(false);
    setDone(out);
    setText("");
    await reload();
  }
  const close = () => { setDone(null); setErr(""); onClose(); };

  return (
    <Modal open={open} onClose={close} wide title={mode === "header" ? "วางใบเคลมจาก Excel (คอลัมน์ A–J)" : "นำเข้าข้อมูลจากชีต ssccare เดิม (คอลัมน์ A–Z)"}
      footer={<><Button variant="ghost" onClick={close}>ปิด</Button><Button onClick={save} loading={busy} disabled={!fresh.length}>บันทึก {fresh.length ? `${fresh.length} เคลม` : ""}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {mode === "header"
            ? "คัดลอกแถวจาก Excel หรือ Google Sheets (A รหัสสินค้า · B เลขใบสำคัญ · C วันที่ · D Case ID · E SiteID · F เลขเคลม · G บริษัท · H วันนัดรับ · I รหัสเซลล์ · J จำนวน) แล้ววางด้านล่าง แถวหัวตารางจะถูกข้ามให้อัตโนมัติ"
            : "เปิดชีตเดิม เลือกคอลัมน์ A ถึง Z ของทุกแถว (1 แถว = 1 ชิ้น) คัดลอกแล้ววางด้านล่าง แถวที่มีเลขเคลมเดียวกันจะรวมเป็นเคลมเดียว เคลมที่มีอยู่แล้วจะถูกข้าม จึงวางซ้ำได้"}
        </p>
        <Textarea rows={8} className="font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setDone(null); }} placeholder="วางข้อมูลที่นี่" />
        {mode === "header" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perUnit} onChange={(e) => setPerUnit(e.target.checked)} />สร้างแถวตาม "จำนวน" (1 แถวต่อ 1 ชิ้น)</label>}
        {parsed && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p>พร้อมบันทึก <b>{fresh.length}</b> เคลม · {units} หน่วยสินค้า · มีอยู่แล้ว (ข้าม) {parsed.claims.length - fresh.length} · ข้ามแถว {parsed.skipped.length}</p>
            {parsed.skipped.filter((s) => s.reason !== "หัวตาราง").slice(0, 10).map((s, i) => <p key={i} className="text-xs text-red-700">แถว {s.line}: {s.reason}</p>)}
            {parsed.warnings.slice(0, 10).map((s, i) => <p key={i} className="text-xs text-amber-700">แถว {s.line}: {s.reason}</p>)}
            {fresh.length > 0 && (
              <div className="mt-2 max-h-48 overflow-auto">
                <table className="text-xs">
                  <thead><tr className="text-left text-slate-500"><th className="pr-3">เลขเคลม</th><th className="pr-3">บริษัท</th><th className="pr-3">รหัสสินค้า</th><th className="pr-3">วันที่</th><th className="pr-3">จำนวน</th>{mode === "full" && <th>สถานะ</th>}</tr></thead>
                  <tbody>{fresh.slice(0, 50).map((c) => <tr key={c.claim_no}><td className="pr-3 font-mono">{c.claim_no}</td><td className="pr-3">{c.company_name}</td><td className="pr-3">{c.pcode}</td><td className="pr-3">{c.voucher_date ?? ""}</td><td className="pr-3">{c.units?.length ?? c.qty}</td>{mode === "full" && <td>{c.status === "closed" ? "ปิดครบ" : "ดำเนินการ"}</td>}</tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {done && <Alert tone="green">บันทึกแล้ว {done.created.length} เคลม{done.skipped.length ? ` · ข้าม ${done.skipped.length} (มีอยู่แล้ว)` : ""}</Alert>}
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  );
}

type DocFilter = "all" | "missing" | "m2" | "m3" | "m4" | "m5" | "multi" | "edited";
/** กรอกเลขที่ใบเบิกทุกเคลม */
export function BulkDocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { claims, unitsBy, reload } = useBoard();
  const [filter, setFilter] = useState<DocFilter>("missing");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [edits, setEdits] = useState<Record<string, { doc?: string; date?: string }>>({}); // key `${claimId}:${step}`
  const [bulk, setBulk] = useState({ step: 2 as 2 | 3 | 4 | 5, doc: "", date: todayIso() });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const steps = [2, 3, 4, 5] as const;
  const docsOf = (units: ClaimUnit[], s: 2 | 3 | 4 | 5) => [...new Set(units.map((u) => u[STEP_DOC[s].doc] as string | null).filter(Boolean))] as string[];
  const rows = useMemo(() => claims.filter((c) => {
    const u = unitsBy.get(c.id) ?? [];
    const missing = (s: 2 | 3 | 4 | 5) => u.some((x) => !x[STEP_DOC[s].doc]);
    switch (filter) {
      case "missing": return steps.slice(0, 3).some((s) => missing(s));
      case "m2": return missing(2);
      case "m3": return missing(3);
      case "m4": return missing(4);
      case "m5": return missing(5);
      case "multi": return steps.some((s) => docsOf(u, s).length > 1);
      case "edited": return Object.keys(edits).some((k) => k.startsWith(c.id));
      default: return true;
    }
  }), [claims, unitsBy, filter, edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const PAGE = 50;
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const setEdit = (c: Claim, s: number, patch: { doc?: string; date?: string }) => setEdits((e) => ({ ...e, [`${c.id}:${s}`]: { ...e[`${c.id}:${s}`], ...patch } }));
  function applyBulk(target: "selected" | "all") {
    const list = target === "selected" ? rows.filter((c) => sel.has(c.id)) : rows;
    setEdits((e) => {
      const n = { ...e };
      for (const c of list) n[`${c.id}:${bulk.step}`] = { doc: bulk.doc, date: bulk.date };
      return n;
    });
  }
  async function save() {
    setBusy(true);
    setMsg("");
    const payload: Record<string, unknown>[] = [];
    for (const [k, v] of Object.entries(edits)) {
      const [cid, sRaw] = k.split(":");
      const s = Number(sRaw) as 2 | 3 | 4 | 5;
      const sd = STEP_DOC[s];
      for (const u of unitsBy.get(cid) ?? []) {
        if (onlyEmpty && u[sd.doc]) continue;
        const { updated_at, updated_by, seq, ...rest } = u;
        void updated_at; void updated_by; void seq;
        payload.push({ ...rest, [sd.doc]: v.doc ?? u[sd.doc], [sd.date]: v.date ?? u[sd.date], ...(sd.pcode && !u[sd.pcode] ? { [sd.pcode]: u.pcode } : {}) });
      }
    }
    let saved = 0;
    try {
      for (let i = 0; i < payload.length; i += 500) {
        const { data, error } = await supabase.rpc("save_claim_units", { p_units: payload.slice(i, i + 500), p_delete: [] });
        if (error) throw error;
        saved += data as number;
      }
      setEdits({});
      setMsg(`บันทึกแล้ว ${saved} แถว`);
    } catch (e) {
      setMsg(errorMessage(e));
    }
    setBusy(false);
    await reload();
  }
  return (
    <Modal open={open} onClose={onClose} wide="full" title="กรอกเลขที่ใบเบิกทุกเคลม"
      footer={<><span className="mr-auto self-center text-sm text-slate-600">{msg}</span><Button variant="ghost" onClick={() => setEdits({})}>ล้างที่แก้</Button><Button onClick={save} loading={busy} disabled={!Object.keys(edits).length}>บันทึก ({Object.keys(edits).length})</Button></>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="แสดง">
          <Select value={filter} onChange={(e) => { setFilter(e.target.value as DocFilter); setPage(0); }}>
            <option value="all">ทุกเคลม</option>
            <option value="missing">ยังไม่มีเลขที่เบิกบางขั้น</option>
            <option value="m2">ขาดเลขขั้น 2</option><option value="m3">ขาดเลขขั้น 3</option><option value="m4">ขาดเลขขั้น 4</option><option value="m5">ขาดเลขขั้น 5</option>
            <option value="multi">มีหลายเลขในขั้นเดียว</option>
            <option value="edited">เฉพาะที่แก้</option>
          </Select>
        </Field>
        <label className="mb-2 flex items-center gap-1 text-sm"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />เขียนเฉพาะแถวที่ว่าง (ไม่ติ๊ก = ทุกแถวของเคลม)</label>
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-2">
          <Select className="!w-auto" value={bulk.step} onChange={(e) => setBulk((b) => ({ ...b, step: Number(e.target.value) as 2 | 3 | 4 | 5 }))}>{steps.map((s) => <option key={s} value={s}>ขั้น {s}</option>)}</Select>
          <Input className="!w-36" placeholder="เลขที่เอกสาร" value={bulk.doc} onChange={(e) => setBulk((b) => ({ ...b, doc: e.target.value }))} />
          <Input className="!w-40" type="date" value={bulk.date} onChange={(e) => setBulk((b) => ({ ...b, date: e.target.value }))} />
          <Button variant="secondary" onClick={() => applyBulk("selected")} disabled={!sel.size}>ใส่ที่เลือก ({sel.size})</Button>
          <Button variant="secondary" onClick={() => applyBulk("all")}>ใส่ทุกเคลมที่แสดง ({rows.length})</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead><tr className="text-left text-slate-500">
            <th><input type="checkbox" aria-label="เลือกทั้งหน้า" onChange={(e) => setSel(e.target.checked ? new Set(shown.map((c) => c.id)) : new Set())} /></th>
            <th className="px-1">เลขเคลม</th><th className="px-1">บริษัท</th><th className="px-1">หน่วย</th>
            {steps.map((s) => <th key={s} className="px-1" colSpan={2}>ขั้น {s} · {STEPS[s - 1].short}</th>)}
          </tr></thead>
          <tbody>
            {shown.map((c) => {
              const u = unitsBy.get(c.id) ?? [];
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td><input type="checkbox" checked={sel.has(c.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} /></td>
                  <td className="px-1 font-mono">{c.claim_no}</td>
                  <td className="max-w-[10rem] truncate px-1">{c.company_name}</td>
                  <td className="px-1">{u.length}</td>
                  {steps.map((s) => {
                    const e = edits[`${c.id}:${s}`];
                    const cur = docsOf(u, s);
                    const curDate = u.find((x) => x[STEP_DOC[s].date])?.[STEP_DOC[s].date] as string | undefined;
                    return [
                      <td key={`${s}d`} className="px-0.5 py-0.5"><input className={`w-28 rounded border px-1 py-1 ${e ? "border-sun-500 bg-sun-500/10" : "border-slate-200"}`} value={e?.doc ?? cur.join(", ")} onChange={(ev) => setEdit(c, s, { doc: ev.target.value })} /></td>,
                      <td key={`${s}t`} className="px-0.5 py-0.5"><input type="date" className={`w-32 rounded border px-1 py-1 ${e ? "border-sun-500 bg-sun-500/10" : "border-slate-200"}`} value={e?.date ?? curDate ?? ""} onChange={(ev) => setEdit(c, s, { date: ev.target.value })} /></td>,
                    ];
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</Button>
          <span>หน้า {page + 1}/{Math.ceil(rows.length / PAGE)}</span>
          <Button variant="secondary" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage((p) => p + 1)}>›</Button>
        </div>
      )}
    </Modal>
  );
}
