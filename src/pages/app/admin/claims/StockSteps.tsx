import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Card, Input, Spinner, cx } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { snKey, type Claim, type ClaimUnit } from "../../../../lib/claims";
import { DOC_LABEL, DOC_STATUS_LABEL, DOC_STATUS_TONE, type DocItem, type SerialStatus, type StockDoc, type Warehouse } from "../../../../lib/stockdocs";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { printStockDoc } from "../stockdocs/print";
import { useBoard } from "./shared";

// Stock documents made per claim step (migration 40, rpc claim_stock_action):
//   step 2  reserve → TR main stock → คลังจองเคลม · issue → BR ใบเคลมสินค้า (cut out, with the customer)
//   step 3  receive → RT into คลังรับเคลมรอตรวจ · inspect → TR good: main / bad: คลังของเสีย · writeoff → WO
//   step 4  mfr_in → GN from the manufacturer into main stock

export type StockAction = "reserve" | "issue" | "receive" | "inspect" | "writeoff" | "mfr_in";
type Role = "main" | "claim_hold" | "claim_check" | "defect";
interface WhRow extends Warehouse { role: Role }
interface SnRow { sn: string; sn_key: string; sku: string; status: SerialStatus; condition: "good" | "defective"; warehouse_id: string | null; role: Role | null; mine: boolean }
type DocRow = StockDoc & { items: DocItem[] };
interface Info { auto: boolean; warehouses: WhRow[]; docs: DocRow[]; serials: SnRow[] }
interface ActionResult { docs: { id: string; doc_no: string; doc_type: string; n: number }[]; skipped: { sn: string; reason: string }[] }

const EVT = "claim-stock-changed";
const AUTO_ACTION: Partial<Record<number, StockAction>> = { 2: "reserve", 3: "receive", 4: "mfr_in" };

/** After staff save the 5-step grid: make that step's stock document automatically once stock documents are in use. */
export async function autoClaimStock(claimId: string, steps: number[]) {
  const acts = [...new Set(steps.map((s) => AUTO_ACTION[s]).filter(Boolean))] as StockAction[];
  if (!acts.length) return;
  const { data } = await supabase.rpc("claim_stock_info", { p_claim: claimId });
  if (!(data as Info | null)?.auto) return;
  const out: ActionResult = { docs: [], skipped: [] };
  for (const a of acts) {
    const { data: r, error } = await supabase.rpc("claim_stock_action", { p_claim: claimId, p_action: a });
    if (error) { out.skipped.push({ sn: "-", reason: errorMessage(error) }); continue; }
    const res = r as ActionResult;
    out.docs.push(...res.docs);
    out.skipped.push(...res.skipped);
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: { claimId, result: out } }));
}

const ROLE_LABEL: Record<Role, string> = { main: "คลังหลัก", claim_hold: "คลังจองเคลม", claim_check: "คลังรับเคลมรอตรวจ", defect: "คลังของเสีย" };

function state(s: SnRow | undefined, whName: (id: string | null) => string): { label: string; tone: "slate" | "green" | "amber" | "red" | "navy" } {
  if (!s) return { label: "ไม่พบในเอกสารคลัง", tone: "slate" };
  if (s.status === "written_off") return { label: "ตัดออกจากระบบแล้ว", tone: "slate" };
  if (s.status === "borrowed" || s.status === "sold" || s.status === "withdrawn") return { label: "ตัดออกแล้ว · อยู่กับลูกค้า", tone: "green" };
  if (s.role === "claim_hold") return { label: "อยู่คลังจองเคลม", tone: "navy" };
  if (s.role === "claim_check") return { label: "รอตรวจสอบ", tone: "amber" };
  if (s.role === "defect") return { label: "คลังของเสีย", tone: "red" };
  return { label: `${whName(s.warehouse_id)}${s.condition === "defective" ? " (เสีย)" : ""}`, tone: "green" };
}

/** Which claim step a document belongs to. */
function docStep(d: DocRow, role: (id: string | null) => Role | null): 2 | 3 | 4 {
  if (d.doc_type === "BR") return 2;
  if (d.doc_type === "TR") return role(d.to_warehouse_id) === "claim_hold" ? 2 : 3;
  if (d.doc_type === "GN" || d.doc_type === "GR") return 4;
  return 3;
}

export function ClaimStockSteps({ claim, units }: { claim: Claim; units: ClaimUnit[] }) {
  const { canEdit } = useBoard();
  const me = useAuth().session?.user.id;
  const canAct = canEdit || claim.assigned_to === me;
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState<StockAction | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "amber" | "red"; text: string; skipped?: ActionResult["skipped"] } | null>(null);
  const [verdict, setVerdict] = useState<Record<string, { result: "good" | "bad" | ""; note: string }>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("claim_stock_info", { p_claim: claim.id });
    if (error) setMsg({ tone: "red", text: errorMessage(error) });
    setInfo((data ?? null) as Info | null);
  }, [claim.id]);
  const unitKey = units.map((u) => [u.iss_sn, u.ret_sn, u.rcv_sn, u.ok_sn, u.ret_result].join("|")).join(",");
  useEffect(() => { setMsg(null); setVerdict({}); load(); }, [load, unitKey]);

  const show = useCallback((r: ActionResult) => {
    const made = r.docs.map((d) => `${d.doc_no} ${DOC_LABEL[d.doc_type as keyof typeof DOC_LABEL] ?? d.doc_type} (${d.n} รายการ)`).join(", ");
    setMsg(r.docs.length
      ? { tone: r.skipped.length ? "amber" : "green", text: `สร้างเอกสารแล้ว: ${made}`, skipped: r.skipped }
      : { tone: r.skipped.length ? "amber" : "green", text: r.skipped.length ? "ไม่มีรายการที่ทำได้" : "ไม่มีรายการใหม่ (ทำครบแล้ว)", skipped: r.skipped });
  }, []);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ claimId: string; result: ActionResult }>).detail;
      if (d.claimId !== claim.id) return;
      if (d.result.docs.length || d.result.skipped.length) show(d.result);
      load();
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [claim.id, load, show]);

  const whName = useCallback((id: string | null) => info?.warehouses.find((w) => w.id === id)?.name ?? "-", [info]);
  const whRole = useCallback((id: string | null) => info?.warehouses.find((w) => w.id === id)?.role ?? null, [info]);
  const byKey = useMemo(() => new Map((info?.serials ?? []).map((s) => [s.sn_key, s])), [info]);
  const sns = (k: "iss_sn" | "ret_sn" | "rcv_sn" | "ok_sn") => [...new Map(units.filter((u) => u[k]?.trim()).map((u) => [snKey(u[k]), { sn: u[k]!.trim(), unit: u }])).values()];
  const iss = sns("iss_sn"), ret = sns("ret_sn"), rcv = sns("rcv_sn");
  const toCheck = ret.filter((r) => byKey.get(snKey(r.sn))?.role === "claim_check" && byKey.get(snKey(r.sn))?.status === "in_stock");
  const inDefect = ret.concat(sns("ok_sn")).filter((r) => byKey.get(snKey(r.sn))?.role === "defect" && byKey.get(snKey(r.sn))?.status === "in_stock");

  async function run(a: StockAction, items?: { sn: string; result: string; note: string }[]) {
    setBusy(a);
    setMsg(null);
    const { data, error } = await supabase.rpc("claim_stock_action", { p_claim: claim.id, p_action: a, p_items: items ?? null });
    setBusy(null);
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    show(data as ActionResult);
    setVerdict({});
    load();
  }

  if (!info) return <Card className="!p-4"><Spinner className="h-4 w-4" /></Card>;
  const docsOf = (n: 2 | 3 | 4) => info.docs.filter((d) => docStep(d, whRole) === n);
  const warehouses: Warehouse[] = info.warehouses;

  const SnList = ({ list }: { list: { sn: string }[] }) => list.length === 0 ? <p className="text-xs text-slate-500">ยังไม่ได้กรอก SN ในขั้นนี้</p> : (
    <ul className="space-y-1">
      {list.map((r) => {
        const st = state(byKey.get(snKey(r.sn)), whName);
        return <li key={r.sn} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-mono">{r.sn}</span><Badge tone={st.tone}>{st.label}</Badge></li>;
      })}
    </ul>
  );
  const Docs = ({ n }: { n: 2 | 3 | 4 }) => {
    const list = docsOf(n);
    if (!list.length) return null;
    return (
      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
        {list.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-semibold text-navy-900">{d.doc_no}</span>
            <span>{DOC_LABEL[d.doc_type]}</span>
            <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
            <span className="text-slate-500">{d.note ?? ""} · {d.items.length} รายการ</span>
            <button type="button" className="ml-auto font-semibold text-navy-700 hover:underline" onClick={() => printStockDoc(d, d.items, warehouses)}>ดาวน์โหลด / พิมพ์</button>
          </li>
        ))}
      </ul>
    );
  };
  const Act = ({ a, children, disabled }: { a: StockAction; children: ReactNode; disabled?: boolean }) =>
    canAct ? <Button variant="secondary" className="!py-1.5 text-xs" loading={busy === a} disabled={Boolean(busy) || disabled} onClick={() => run(a)}>{children}</Button> : null;

  return (
    <Card className="!p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-navy-900">เอกสารคลังของเคลมนี้</p>
          <p className="text-xs text-slate-500">
            {info.auto ? "บันทึกขั้น 2 / 3 / 4 แล้วระบบออกใบย้าย / ใบรับให้อัตโนมัติ" : "ยังไม่ถึงวันเริ่มใช้เอกสารคลัง ระบบยังไม่ออกเอกสารอัตโนมัติ กดปุ่มเพื่อออกเองได้"}
            {" · "}{(["claim_hold", "claim_check", "defect"] as Role[]).map((r) => info.warehouses.find((w) => w.role === r)?.name ?? ROLE_LABEL[r]).join(" / ")}
          </p>
        </div>
        {!canAct && <span className="text-xs text-slate-500">รับเรื่องก่อนจึงจะทำเอกสารคลังได้</span>}
      </div>
      {msg && (
        <div className="mb-3"><Alert tone={msg.tone}>
          {msg.text}
          {msg.skipped && msg.skipped.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{msg.skipped.map((s, i) => <li key={i}><span className="font-mono">{s.sn}</span>: {s.reason}</li>)}</ul>}
        </Alert></div>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-xl p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold text-navy-900">ขั้น 2 · เบิกสินค้าให้ลูกค้า</p>
          <SnList list={iss} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Act a="reserve" disabled={!iss.length}>ย้ายเข้าคลังจองเคลม</Act>
            <Act a="issue" disabled={!iss.length}>ตัดสินค้าออกจากระบบ</Act>
          </div>
          <Docs n={2} />
        </section>

        <section className="rounded-xl p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold text-navy-900">ขั้น 3 · รับของเคลมคืน และตรวจสอบ</p>
          <SnList list={ret} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Act a="receive" disabled={!ret.length}>รับของเคลมเข้าระบบ</Act>
            <Act a="writeoff" disabled={!inDefect.length}>ตัดของเสียออกจากระบบ ({inDefect.length})</Act>
          </div>
          {canAct && toCheck.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-2">
              <p className="mb-1 text-xs font-semibold text-amber-900">ผลตรวจ: ของดีย้ายเข้าคลังหลัก ของเสียย้ายไปคลังของเสีย</p>
              <ul className="space-y-1.5">
                {toCheck.map((r) => {
                  const v = verdict[r.sn] ?? { result: "", note: "" };
                  const setV = (p: Partial<typeof v>) => setVerdict((x) => ({ ...x, [r.sn]: { ...v, ...p } }));
                  return (
                    <li key={r.sn} className="text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{r.sn}</span>
                        {(["good", "bad"] as const).map((k) => (
                          <button key={k} type="button" onClick={() => setV({ result: v.result === k ? "" : k })}
                            className={cx("rounded-full px-2.5 py-0.5 font-semibold ring-1", v.result === k ? (k === "good" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-red-600 text-white ring-red-600") : "bg-white text-slate-600 ring-slate-300")}>
                            {k === "good" ? "ของดี" : "ของเสีย"}
                          </button>
                        ))}
                      </div>
                      {v.result && <Input className="mt-1 !py-1 text-xs" placeholder="หมายเหตุผลตรวจ (ถ้ามี)" value={v.note} onChange={(e) => setV({ note: e.target.value })} />}
                    </li>
                  );
                })}
              </ul>
              <Button className="mt-2 !py-1.5 text-xs" loading={busy === "inspect"} disabled={Boolean(busy) || !Object.values(verdict).some((v) => v.result)}
                onClick={() => run("inspect", Object.entries(verdict).filter(([, v]) => v.result).map(([sn, v]) => ({ sn, result: v.result, note: v.note })))}>บันทึกผลตรวจ</Button>
            </div>
          )}
          <Docs n={3} />
        </section>

        <section className="rounded-xl p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold text-navy-900">ขั้น 4 · รับของเคลมจากผู้ผลิต</p>
          <SnList list={rcv} />
          <div className="mt-3 flex flex-wrap gap-2"><Act a="mfr_in" disabled={!rcv.length}>รับเข้าคลังหลัก</Act></div>
          <Docs n={4} />
        </section>
      </div>
    </Card>
  );
}
