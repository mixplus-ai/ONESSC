import { useRef, useState } from "react";
import { Alert, Badge, Button, Field, Input } from "../../../../components/ui";
import { SHIP_STATUS, fmtBaht, fmtThaiTime, openClaimFile, uploadClaimFile, type Claim } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";

/** Staff: shipping fee paid by the company first → courier receipt → customer's slip → confirm or reject. */
export function ShippingBox({ c, canHandle, reload }: { c: Claim; canHandle: boolean; reload: () => Promise<void> }) {
  const [fee, setFee] = useState(c.ship_fee != null ? String(c.ship_fee) : "");
  const [carrier, setCarrier] = useState(c.ship_carrier ?? "");
  const [tracking, setTracking] = useState(c.ship_tracking ?? "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const st = c.ship_status ? SHIP_STATUS[c.ship_status] : null;
  const paid = c.ship_status === "paid";
  const dirty = fee !== (c.ship_fee != null ? String(c.ship_fee) : "") || carrier !== (c.ship_carrier ?? "") || tracking !== (c.ship_tracking ?? "");

  async function run(label: string, fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(label); setErr("");
    const { error } = await fn();
    setBusy("");
    if (error) return setErr(errorMessage(error));
    await reload();
  }
  const save = () => {
    const n = fee.trim() === "" ? null : Number(fee.replace(/,/g, ""));
    if (n != null && (!Number.isFinite(n) || n < 0)) return setErr("กรุณากรอกค่าส่งเป็นตัวเลข");
    return run("save", () => supabase.rpc("set_claim_shipping", { p_claim: c.id, p_fee: n, p_carrier: carrier, p_tracking: tracking }));
  };
  async function upload(f: File) {
    setBusy("receipt"); setErr("");
    try {
      await uploadClaimFile(c.id, "ship_receipt", f);
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy("");
  }
  const decide = (ok: boolean) => {
    const note = ok ? null : prompt("เหตุผลที่สลิปไม่ถูกต้อง (ลูกค้าจะเห็นข้อความนี้)");
    if (!ok && !note?.trim()) return;
    return run(ok ? "ok" : "no", () => supabase.rpc("decide_ship_slip", { p_claim: c.id, p_ok: ok, p_note: note }));
  };

  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-navy-900">ค่าจัดส่ง (บริษัทออกให้ก่อน ลูกค้าโอนคืน)</p>
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
        {paid && c.ship_paid_at && <span className="text-xs text-slate-500">ยืนยันเมื่อ {fmtThaiTime(c.ship_paid_at)}</span>}
      </div>
      {canHandle ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ค่าส่ง (บาท)" hint={paid ? "ชำระแล้ว แก้ยอดไม่ได้" : undefined}><Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} disabled={paid} placeholder="0" /></Field>
          <Field label="ขนส่ง"><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="เช่น Kerry, Flash" /></Field>
          <Field label="เลขพัสดุ"><Input className="font-mono" value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
        </div>
      ) : (
        <p className="text-sm">ค่าส่ง {fmtBaht(c.ship_fee)} · {c.ship_carrier ?? "-"} · {c.ship_tracking ?? "-"}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canHandle && <Button variant="secondary" className="!py-1.5" onClick={save} loading={busy === "save"} disabled={!dirty}>บันทึกค่าส่ง</Button>}
        {canHandle && <Button variant="secondary" className="!py-1.5" onClick={() => fileRef.current?.click()} loading={busy === "receipt"}>{c.ship_receipt_path ? "อัปโหลดใบเสร็จใหม่" : "อัปโหลดใบเสร็จค่าส่ง"}</Button>}
        <input ref={fileRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        {c.ship_receipt_path && <button type="button" className="text-sm text-navy-700 underline" onClick={() => openClaimFile(c.ship_receipt_path!)}>ดูใบเสร็จ</button>}
        {c.ship_slip_path && <button type="button" className="text-sm text-navy-700 underline" onClick={() => openClaimFile(c.ship_slip_path!)}>ดูสลิปลูกค้า{c.ship_slip_at ? ` (${fmtThaiTime(c.ship_slip_at)})` : ""}</button>}
      </div>
      {c.ship_status === "slip" && canHandle && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="sun" className="!py-1.5" onClick={() => decide(true)} loading={busy === "ok"}>ยืนยันรับเงินค่าส่ง</Button>
          <Button variant="danger" className="!py-1.5" onClick={() => decide(false)} loading={busy === "no"}>สลิปไม่ถูกต้อง</Button>
        </div>
      )}
      {c.ship_status === "rejected" && c.ship_note && <p className="mt-2 text-xs text-red-600">แจ้งลูกค้าแล้ว: {c.ship_note}</p>}
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
    </div>
  );
}
