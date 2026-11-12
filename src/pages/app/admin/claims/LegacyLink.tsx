import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Select, Spinner, cx } from "../../../../components/ui";
import { CLAIM_STATUS, fmtThai, productTypeLabel, type ClaimStatus } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { useBoard } from "./shared";

interface Customer { id: string; full_name: string | null; email: string; company_name: string | null; companies: { name: string } | null }
interface Row {
  id: string; claim_no: string; company_name: string | null; model: string | null; product_type: string | null;
  status: ClaimStatus; created_at: string; qty: number; reported_sns: string[]; user_id: string | null; exact: boolean;
}

/** Old claims came from ssccare without an account: staff attach them to the customer so they appear in "งานเคลมของฉัน". */
export default function LegacyLink() {
  const { reload } = useBoard();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userQ, setUserQ] = useState("");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email, company_name, companies(name)").eq("role", "user").order("full_name")
      .then(({ data }) => setCustomers((data ?? []) as unknown as Customer[]));
  }, []);
  const needle = userQ.trim().toLowerCase();
  const shown = customers.filter((c) => !needle || [c.full_name, c.email, c.company_name, c.companies?.name].some((v) => v?.toLowerCase().includes(needle)));
  const customer = customers.find((c) => c.id === userId);

  async function search(query = q) {
    if (!userId) return;
    setErr(""); setMsg(""); setRows(null); setPick(new Set());
    const { data, error } = await supabase.rpc("legacy_claim_search", { p_user: userId, p_query: query.trim() || null });
    if (error) { setErr(errorMessage(error)); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { setQ(""); if (userId) search(""); else setRows(null); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const free = useMemo(() => (rows ?? []).filter((r) => !r.user_id), [rows]);
  const linked = useMemo(() => (rows ?? []).filter((r) => r.user_id), [rows]);
  const toggle = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function link(ids: string[], on: boolean) {
    setBusy(true); setErr(""); setMsg("");
    const { data, error } = await supabase.rpc("link_legacy_claims", { p_user: userId, p_claims: ids, p_link: on });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setMsg(on ? `ผูก ${data} เคลมกับ ${customer?.full_name || customer?.email} แล้ว` : `ยกเลิกการผูก ${data} เคลมแล้ว`);
    await Promise.all([search(), reload()]);
  }

  return (
    <div className="space-y-4">
      <Alert tone="navy">เคลมที่นำเข้าจากระบบเดิมยังไม่มีเจ้าของ เลือกบัญชีลูกค้า ระบบจะเสนอเคลมที่ชื่อบริษัทตรงกัน ติ๊กเลือกแล้วกด “ผูกกับลูกค้า” ลูกค้าจะเห็นเคลมเหล่านั้นในหน้า “งานเคลมของฉัน”</Alert>
      <Card className="grid gap-3 sm:grid-cols-2">
        <Field label="ค้นหาลูกค้า"><Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="ชื่อ อีเมล หรือบริษัท" /></Field>
        <Field label="บัญชีลูกค้า">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— เลือกลูกค้า ({shown.length}) —</option>
            {shown.slice(0, 300).map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email} · {c.companies?.name ?? c.company_name ?? "ไม่ระบุบริษัท"}</option>)}
          </Select>
        </Field>
      </Card>

      {userId && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="ค้นหาเคลมเก่าเพิ่มเติม" hint="เว้นว่าง = จับคู่จากชื่อบริษัทของลูกค้า"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder="ชื่อบริษัท เลขเคลม หรือไซต์" /></Field>
            <Button variant="secondary" onClick={() => search()}>ค้นหา</Button>
          </div>
          {err && <Alert>{err}</Alert>}
          {msg && <Alert tone="green">{msg}</Alert>}
          {rows === null ? <Spinner className="h-5 w-5" /> : (
            <>
              {free.length === 0 ? <Empty>ไม่พบเคลมเก่าที่ยังไม่ผูก{q ? "" : " ที่ชื่อบริษัทตรงกับลูกค้านี้ ลองค้นด้วยชื่ออื่น"}</Empty> : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button type="button" className="font-semibold text-navy-700 hover:underline" onClick={() => setPick(new Set(free.map((r) => r.id)))}>เลือกทั้งหมด ({free.length})</button>
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => setPick(new Set(free.filter((r) => r.exact).map((r) => r.id)))}>เลือกเฉพาะชื่อตรง</button>
                    <span className="flex-1" />
                    <Button onClick={() => link([...pick], true)} disabled={!pick.size} loading={busy}>ผูกกับลูกค้า ({pick.size})</Button>
                  </div>
                  <ClaimList rows={free} pick={pick} onToggle={toggle} />
                </>
              )}
              {linked.length > 0 && (
                <div>
                  <p className="mb-1 mt-2 text-sm font-semibold text-navy-900">ผูกกับลูกค้านี้แล้ว ({linked.length})</p>
                  <ClaimList rows={linked} onUnlink={(id) => link([id], false)} />
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function ClaimList({ rows, pick, onToggle, onUnlink }: { rows: Row[]; pick?: Set<string>; onToggle?: (id: string) => void; onUnlink?: (id: string) => void }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
      {rows.map((r) => (
        <li key={r.id}>
          <label className={cx("flex items-center gap-3 px-3 py-2 text-sm", onToggle && "cursor-pointer hover:bg-slate-50")}>
            {onToggle && <input type="checkbox" className="h-4 w-4" checked={pick?.has(r.id) ?? false} onChange={() => onToggle(r.id)} />}
            <span className="w-20 font-mono font-semibold text-navy-900">{r.claim_no}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.company_name ?? "-"} {r.exact && <Badge tone="green">ชื่อตรง</Badge>}</span>
              <span className="block truncate text-xs text-slate-500">{fmtThai(r.created_at)} · {productTypeLabel(r.product_type)} {r.model ?? ""} · {r.qty} ชิ้น{r.reported_sns.length ? ` · ${r.reported_sns.slice(0, 2).join(", ")}` : ""}</span>
            </span>
            <Badge tone={CLAIM_STATUS[r.status]?.tone ?? "slate"}>{CLAIM_STATUS[r.status]?.label ?? r.status}</Badge>
            {onUnlink && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => onUnlink(r.id)}>ยกเลิกผูก</button>}
          </label>
        </li>
      ))}
    </ul>
  );
}
