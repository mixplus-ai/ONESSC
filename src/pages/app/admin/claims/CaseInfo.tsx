import { useState } from "react";
import { Alert, Button, Field, Input, Textarea } from "../../../../components/ui";
import type { Claim } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";

/** Staff: Case no. (from Engineer) / Issue / Description. Customers fill these only for SolarEdge inverters; staff add them for every other claim. */
export function CaseBox({ c, reload }: { c: Claim; reload: () => Promise<void> }) {
  const d = c.details ?? {};
  const init = { case_no: d.case_no ?? "", issue: d.issue ?? "", description: d.description ?? "" };
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const dirty = v.case_no !== init.case_no || v.issue !== init.issue || v.description !== init.description;
  const filled = !!(init.case_no || init.issue || init.description);

  async function save() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("set_claim_case", { p_claim: c.id, p_case_no: v.case_no, p_issue: v.issue, p_description: v.description });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setOpen(false);
    await reload();
  }

  if (!open) {
    return (
      <button type="button" className="text-sm text-navy-700 underline" onClick={() => { setV(init); setOpen(true); }}>
        {filled ? "แก้ไขข้อมูล Case / Issue / Description" : "+ กรอกข้อมูล Case (Engineer) / Issue / Description"}
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="mb-2 text-sm font-semibold text-navy-900">ข้อมูล Case (Engineer)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="หมายเลข Case (จาก Engineer)"><Input value={v.case_no} onChange={(e) => setV({ ...v, case_no: e.target.value })} maxLength={100} /></Field>
        <Field label="Issue"><Input value={v.issue} onChange={(e) => setV({ ...v, issue: e.target.value })} maxLength={200} /></Field>
      </div>
      <div className="mt-3"><Field label="Description" hint="เว้นว่างเพื่อลบข้อมูลช่องนั้น"><Textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} /></Field></div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="!py-1.5" onClick={save} loading={busy} disabled={!dirty}>บันทึก</Button>
        <Button variant="ghost" className="!py-1.5" onClick={() => setOpen(false)}>ยกเลิก</Button>
      </div>
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
    </div>
  );
}
