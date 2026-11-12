import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card } from "../../../../components/ui";
import { SN_CHANGE_STATUS, SN_REASON, fmtThaiTime, type SnChange } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { staffName, useBoard } from "./shared";

/** All SN correction requests (small table): pending ones are shown on the queue for approval. */
export function useSnChanges() {
  const [rows, setRows] = useState<SnChange[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("claim_sn_changes").select("*").order("created_at", { ascending: false }).limit(500);
    setRows((data ?? []) as SnChange[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, reload: load };
}

/** คำขอแก้ SN จากลูกค้า: approve applies the new SN to the claim (reported SN, details, board column Q). */
export function SnChangeQueue({ rows, reload, onOpen }: { rows: SnChange[]; reload: () => void; onOpen: (claimId: string) => void }) {
  const { claims, staff, reload: reloadBoard } = useBoard();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const pending = rows.filter((r) => r.status === "pending");
  if (!pending.length) return null;

  async function decide(r: SnChange, approve: boolean) {
    let note: string | null = null;
    if (!approve) {
      note = prompt(`เหตุผลที่ไม่อนุมัติ (ลูกค้าจะเห็นข้อความนี้)\n${r.old_sn} → ${r.new_sn}`);
      if (!note?.trim()) return;
    } else if (!confirm(`อนุมัติเปลี่ยน SN ${r.old_sn} → ${r.new_sn}?\nระบบจะแก้ SN ที่แจ้งไว้ในเคลม และช่อง Q SN คืนในผัง ถ้ามี`)) return;
    setBusy(r.id);
    setErr("");
    const { error } = await supabase.rpc("decide_sn_change", { p_id: r.id, p_approve: approve, p_note: note });
    setBusy("");
    if (error) return setErr(errorMessage(error));
    reload();
    if (approve) reloadBoard();
  }

  return (
    <Card className="mb-4 !bg-amber-50/60 ring-amber-200">
      <p className="mb-2 font-semibold text-navy-900">คำขอแก้ไข SN จากลูกค้า <Badge tone="amber">{pending.length}</Badge></p>
      {err && <div className="mb-2"><Alert>{err}</Alert></div>}
      <ul className="divide-y divide-amber-100">
        {pending.map((r) => {
          const c = claims.find((x) => x.id === r.claim_id);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
              <button type="button" className="font-mono font-semibold text-navy-800 hover:underline" onClick={() => onOpen(r.claim_id)}>{c?.claim_no ?? "เคลม"}</button>
              <span className="font-mono text-xs"><span className="text-slate-500 line-through">{r.old_sn}</span> → <span className="font-semibold text-navy-900">{r.new_sn}</span></span>
              <span className="text-slate-700">{SN_REASON[r.reason]}{r.note ? `: ${r.note}` : ""}</span>
              <span className="text-xs text-slate-500">{c?.company_name ?? c?.contact_name ?? ""} · {fmtThaiTime(r.created_at)} · {staffName(staff, c?.assigned_to ?? null)}</span>
              <span className="ml-auto flex gap-2">
                <Button className="!py-1.5" onClick={() => decide(r, true)} loading={busy === r.id}>อนุมัติ</Button>
                <Button className="!py-1.5" variant="secondary" onClick={() => decide(r, false)} disabled={busy === r.id}>ไม่อนุมัติ</Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** History of SN corrections on one claim (shown on the queue card). */
export function SnChangeHistory({ rows }: { rows: SnChange[] }) {
  const { staff } = useBoard();
  if (!rows.length) return null;
  return (
    <div className="mt-3 text-sm">
      <p className="mb-1 font-semibold text-navy-900">ประวัติแก้ไข SN</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-mono"><span className="text-slate-500 line-through">{r.old_sn}</span> → {r.new_sn}</span>
            <span className="text-slate-600">{SN_REASON[r.reason]}{r.note ? `: ${r.note}` : ""}</span>
            <Badge tone={SN_CHANGE_STATUS[r.status].tone}>{SN_CHANGE_STATUS[r.status].label}</Badge>
            <span className="text-slate-500">{fmtThaiTime(r.decided_at ?? r.created_at)}{r.decided_by ? ` · ${staffName(staff, r.decided_by)}` : ""}{r.staff_note ? ` · ${r.staff_note}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
