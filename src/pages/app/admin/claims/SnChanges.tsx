import { useCallback, useEffect, useMemo, useState } from "react";
import { ScanButton } from "../../../../components/SnScanner";
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { SN_CHANGE_STATUS, SN_REASON, fmtThaiTime, type Claim, type ClaimUnit, type SnChange, type SnChangeReason } from "../../../../lib/claims";
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

/** Ask to confirm / reject. Returns null when the user backed out, "" on success, else the error. */
async function decideSnChange(r: SnChange, approve: boolean): Promise<string | null> {
  let note: string | null = null;
  if (!approve) {
    note = prompt(`เหตุผลที่ไม่อนุมัติ${r.by_staff ? "" : " (ลูกค้าจะเห็นข้อความนี้)"}\n${r.old_sn} → ${r.new_sn}`);
    if (!note?.trim()) return null;
  } else if (!confirm(`ยืนยันเปลี่ยน SN ${r.old_sn} → ${r.new_sn}?\nระบบจะแก้ SN ที่แจ้งไว้ในเคลม และช่อง Q SN คืนในผัง ถ้ามี`)) return null;
  const { error } = await supabase.rpc("decide_sn_change", { p_id: r.id, p_approve: approve, p_note: note });
  return error ? errorMessage(error) : "";
}

/** คำขอแก้ SN จากลูกค้าหรือ Staff: approve applies the new SN to the claim (reported SN, details, board column Q). */
export function SnChangeQueue({ rows, reload, onOpen }: { rows: SnChange[]; reload: () => void; onOpen: (claimId: string) => void }) {
  const { claims, staff, reload: reloadBoard } = useBoard();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const { session, isAdmin } = useAuth();
  const me = session?.user.id;
  const pending = rows.filter((r) => r.status === "pending");
  if (!pending.length) return null;

  async function decide(r: SnChange, approve: boolean) {
    setBusy(r.id);
    setErr("");
    const e = await decideSnChange(r, approve);
    setBusy("");
    if (e === null) return;
    if (e) return setErr(e);
    reload();
    if (approve) reloadBoard();
  }

  return (
    <Card className="mb-4 !bg-amber-50/60 ring-amber-200">
      <p className="mb-2 font-semibold text-navy-900">คำขอแก้ไข SN รอยืนยัน <Badge tone="amber">{pending.length}</Badge></p>
      {err && <div className="mb-2"><Alert>{err}</Alert></div>}
      <ul className="divide-y divide-amber-100">
        {pending.map((r) => {
          const c = claims.find((x) => x.id === r.claim_id);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
              <button type="button" className="font-mono font-semibold text-navy-800 hover:underline" onClick={() => onOpen(r.claim_id)}>{c?.claim_no ?? "เคลม"}</button>
              <span className="font-mono text-xs"><span className="text-slate-500 line-through">{r.old_sn}</span> → <span className="font-semibold text-navy-900">{r.new_sn}</span></span>
              <span className="text-slate-700">{SN_REASON[r.reason]}{r.note ? `: ${r.note}` : ""}</span>
              <span className="text-xs text-slate-500">{r.by_staff ? <>Staff ขอ: {staffName(staff, r.user_id)}</> : "ลูกค้าขอ"} · {c?.company_name ?? c?.contact_name ?? ""} · {fmtThaiTime(r.created_at)} · ผู้รับผิดชอบ {staffName(staff, c?.assigned_to ?? null)}</span>
              <span className="ml-auto flex gap-2">
                {r.by_staff && r.user_id === me && !isAdmin ? <span className="text-xs text-slate-500">รอผู้รับผิดชอบคนอื่นยืนยัน</span> : <>
                  <Button className="!py-1.5" onClick={() => decide(r, true)} loading={busy === r.id}>ยืนยัน</Button>
                  <Button className="!py-1.5" variant="secondary" onClick={() => decide(r, false)} disabled={busy === r.id}>ไม่อนุมัติ</Button>
                </>}
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

/** Every SN the claim holds that a correction can target: reported SNs, units' reported SN, board column Q. */
function claimSns(claim: Claim, units: ClaimUnit[]) {
  const seen = new Map<string, string>();
  const key = (x: string) => x.toUpperCase().replace(/[\s\-_./]/g, "");
  for (const s of [...(claim.reported_sns ?? []), ...units.map((u) => u.reported_sn), ...units.map((u) => u.ret_sn)]) {
    if (s && s.trim() && !seen.has(key(s))) seen.set(key(s), s.trim().toUpperCase());
  }
  return { list: [...seen.values()], key };
}

/** ขอแก้ไข SN (ขั้น 3): staff handling the claim ask; another handler or Admin confirms. */
export function ClaimSnChanges({ claim, units }: { claim: Claim; units: ClaimUnit[] }) {
  const { session, isAdmin, can } = useAuth();
  const me = session?.user.id;
  const { staff, reload: reloadBoard } = useBoard();
  const canHandle = can("claims") || claim.assigned_to === me;
  const [rows, setRows] = useState<SnChange[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("claim_sn_changes").select("*").eq("claim_id", claim.id).order("created_at");
    setRows((data ?? []) as SnChange[]);
  }, [claim.id]);
  useEffect(() => { load(); }, [load]);
  const { list, key } = useMemo(() => claimSns(claim, units), [claim, units]);
  const pendingOld = new Set(rows.filter((r) => r.status === "pending").map((r) => key(r.old_sn)));
  const free = list.filter((s) => !pendingOld.has(key(s)));
  const openStatus = ["submitted", "in_progress", "done"].includes(claim.status);
  const [open, setOpen] = useState(false);
  const [oldSn, setOldSn] = useState("");
  const [newSn, setNewSn] = useState("");
  const [reason, setReason] = useState<SnChangeReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!canHandle && !rows.length) return null;
  if (!list.length && !rows.length) return null;

  async function send() {
    setErr("");
    if (!oldSn) return setErr("เลือก SN เดิมที่จะแก้");
    if (!newSn.trim()) return setErr("กรอก SN ที่ถูกต้อง");
    if (!reason) return setErr("เลือกสาเหตุ");
    if (reason === "other" && !note.trim()) return setErr("ระบุสาเหตุ");
    setBusy("send");
    const { error } = await supabase.rpc("staff_request_sn_change", { p_claim: claim.id, p_old: oldSn, p_new: newSn.trim(), p_reason: reason, p_note: note.trim() || null });
    setBusy("");
    if (error) return setErr(errorMessage(error));
    setOpen(false); setOldSn(""); setNewSn(""); setReason(""); setNote("");
    load();
  }
  async function decide(r: SnChange, approve: boolean) {
    setBusy(r.id); setErr("");
    const e = await decideSnChange(r, approve);
    setBusy("");
    if (e === null) return;
    if (e) return setErr(e);
    load();
    if (approve) reloadBoard();
  }
  async function cancel(r: SnChange) {
    if (!confirm(`ยกเลิกคำขอแก้ SN ${r.old_sn} → ${r.new_sn}?`)) return;
    setBusy(r.id); setErr("");
    const { error } = await supabase.rpc("staff_cancel_sn_change", { p_id: r.id });
    setBusy("");
    if (error) return setErr(errorMessage(error));
    load();
  }

  return (
    <div id="claim-sn-changes"><Card className="!p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-navy-900">ขอแก้ไข SN <span className="font-normal text-slate-500">· ขั้น 3 ลูกค้าคืนของเสีย</span></p>
        {canHandle && openStatus && free.length > 0 && !open && (
          <Button variant="secondary" className="!py-1.5" onClick={() => { setOpen(true); setOldSn(free.length === 1 ? free[0] : ""); }}>ขอแก้ไข SN</Button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
          <Field label="SN เดิมในเคลม">
            <Select value={oldSn} onChange={(e) => setOldSn(e.target.value)}>
              <option value="">เลือก SN</option>
              {free.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="SN ที่ถูกต้อง">
            <div className="flex gap-1">
              <Input className="font-mono" value={newSn} onChange={(e) => setNewSn(e.target.value)} placeholder="กรอกหรือสแกน" />
              <ScanButton onScan={(sn) => setNewSn(sn)} />
            </div>
          </Field>
          <Field label="สาเหตุ">
            <Select value={reason} onChange={(e) => setReason(e.target.value as SnChangeReason)}>
              <option value="">เลือกสาเหตุ</option>
              {(Object.keys(SN_REASON) as SnChangeReason[]).map((k) => <option key={k} value={k}>{SN_REASON[k]}</option>)}
            </Select>
          </Field>
          <Field label={reason === "other" ? "รายละเอียด (จำเป็น)" : "รายละเอียดเพิ่มเติม (ไม่บังคับ)"}>
            <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button onClick={send} loading={busy === "send"}>ส่งคำขอให้ผู้รับผิดชอบยืนยัน</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setErr(""); }}>ยกเลิก</Button>
            <span className="text-xs text-slate-500">ผู้ส่งคำขอยืนยันเองไม่ได้ ต้องเป็นผู้รับผิดชอบคนอื่นหรือแอดมิน เมื่อยืนยันแล้ว ระบบจะเปลี่ยน SN ในเคลมและช่อง Q SN คืน</span>
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {[...rows].reverse().map((r) => {
            const mine = r.by_staff && r.user_id === me;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-mono text-xs"><span className="text-slate-500 line-through">{r.old_sn}</span> → <span className="font-semibold text-navy-900">{r.new_sn}</span></span>
                <span className="text-slate-700">{SN_REASON[r.reason]}{r.note ? `: ${r.note}` : ""}</span>
                <Badge tone={SN_CHANGE_STATUS[r.status].tone}>{SN_CHANGE_STATUS[r.status].label}</Badge>
                <span className="text-xs text-slate-500">
                  {r.by_staff ? `Staff ขอ: ${staffName(staff, r.user_id)}` : "ลูกค้าขอ"} · {fmtThaiTime(r.created_at)}
                  {r.decided_by ? ` · ตัดสินโดย ${staffName(staff, r.decided_by)}` : ""}{r.staff_note ? ` · ${r.staff_note}` : ""}
                </span>
                {r.status === "pending" && (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    {canHandle && (!mine || isAdmin) && <>
                      <Button className="!py-1.5" onClick={() => decide(r, true)} loading={busy === r.id}>ยืนยัน</Button>
                      <Button className="!py-1.5" variant="secondary" onClick={() => decide(r, false)} disabled={busy === r.id}>ไม่อนุมัติ</Button>
                    </>}
                    {mine && !isAdmin && <span className="text-xs text-slate-500">รอผู้รับผิดชอบคนอื่นยืนยัน</span>}
                    {r.by_staff && (mine || isAdmin) && <button type="button" className="text-xs text-slate-500 underline" onClick={() => cancel(r)} disabled={busy === r.id}>ยกเลิกคำขอ</button>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
    </Card></div>
  );
}
