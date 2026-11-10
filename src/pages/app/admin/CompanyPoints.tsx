import { useEffect, useMemo, useRef, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select, Spinner, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import {
  formatPoints,
  formatThaiDate,
  LEDGER_KIND,
  openPrivateFile,
  REDEMPTION_STATUS,
  todayBkk,
  uploadPointFile,
  type Bonus,
  type LedgerRow,
  type Redemption,
  type Reward,
} from "../../../lib/training";
import type { Company } from "../../../lib/types";
import { isValidThaiTaxId } from "../Profile";

interface Calc { points: number; base: number; tier_multiplier: number; bonus_multiplier: number; bonus_label: string | null; expires_on: string | null; baht_per_point: number }

function PurchaseForm({ company, edit, onDone, onClose }: { company: Company; edit?: LedgerRow; onDone: () => void; onClose: () => void }) {
  const bonuses = useRows<Bonus>(() => supabase.from("company_point_bonuses").select("*").eq("is_active", true).order("label"));
  const [invoice, setInvoice] = useState(edit?.invoice_no ?? "");
  const [date, setDate] = useState(edit?.doc_date ?? todayBkk());
  const [amount, setAmount] = useState(edit?.amount?.toString() ?? "");
  const [items, setItems] = useState(edit?.items ?? "");
  const [bonus, setBonus] = useState((edit?.calc?.bonus_id as string) ?? "");
  const [override, setOverride] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState(edit?.file_path ?? "");
  const [calc, setCalc] = useState<Calc | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayBkk();
  const activeBonuses = bonuses.rows.filter((b) => (!b.starts_on || b.starts_on <= date) && (!b.ends_on || b.ends_on >= date));

  useEffect(() => {
    const n = Number(amount);
    if (!n || n <= 0) return setCalc(null);
    const t = setTimeout(() => {
      supabase.rpc("calc_company_points", { p_amount: n, p_bonus_id: bonus || null, p_doc_date: date }).then(({ data, error }) => {
        if (error) setErr(errorMessage(error));
        else {
          setErr("");
          setCalc(data as Calc);
        }
      });
    }, 300);
    return () => clearTimeout(t);
  }, [amount, bonus, date]);

  async function upload(f: File) {
    if (f.size > 20 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 20 MB");
    setUploading(true);
    try {
      setFile(await uploadPointFile(company.id, f));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!invoice.trim()) return setErr("กรุณากรอกเลขที่ใบกำกับ/PI");
    if (!Number(amount)) return setErr("กรุณากรอกยอดซื้อ");
    if (override && !note.trim()) return setErr("กรุณาระบุเหตุผลเมื่อแก้จำนวนแต้มเอง");
    if (edit && !reason.trim()) return setErr("กรุณาระบุเหตุผลที่แก้ไข");
    setBusy(true);
    setErr("");
    const common = {
      p_invoice_no: invoice, p_doc_date: date, p_amount: Number(amount), p_items: items || null, p_file_path: file || null,
      p_bonus_id: bonus || null, p_note: note || null, p_points_override: override === "" ? null : Number(override),
    };
    const { error } = edit
      ? await supabase.rpc("edit_company_purchase", { p_id: edit.id, p_reason: reason, ...common })
      : await supabase.rpc("add_company_purchase", { p_company_id: company.id, ...common });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }

  return (
    <Card className="mb-4 ring-navy-200">
      <h3 className="mb-4 font-semibold text-navy-900">{edit ? `แก้ไขยอดซื้อ ${edit.invoice_no}` : "เพิ่มแต้มบริษัทจากยอดซื้อ"}</h3>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="เลขที่ใบกำกับ / PI" required><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
        <Field label="วันที่เอกสาร" required><Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="ยอดซื้อ (บาท)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="โบนัสพิเศษ">
          <Select value={bonus} onChange={(e) => setBonus(e.target.value)}>
            <option value="">ไม่มี</option>
            {activeBonuses.map((b) => <option key={b.id} value={b.id}>{b.label} (×{b.multiplier})</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-4"><Field label="รายการสินค้า (ไม่บังคับ)"><Textarea rows={2} value={items} onChange={(e) => setItems(e.target.value)} /></Field></div>
        <Field label="แนบไฟล์">
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading && <Spinner className="h-4 w-4" />}{file ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}</Button>
            {file && <button type="button" className="text-sm text-navy-700 underline" onClick={() => openPrivateFile("point-files", file)}>ดู</button>}
          </div>
          <input ref={fileRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </Field>
        <Field label="แก้จำนวนแต้มเอง" hint="ว่าง = ตามกติกา"><Input type="number" min={0} value={override} onChange={(e) => setOverride(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="หมายเหตุ / เหตุผล"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
        {edit && <div className="sm:col-span-4"><Field label="เหตุผลที่แก้ไข" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>}
      </div>
      {calc && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="text-2xl font-bold">{formatPoints(override === "" ? calc.points : Number(override))} แต้ม</p>
          <p>
            {Number(amount).toLocaleString("th-TH")} ÷ {Number(calc.baht_per_point).toLocaleString("th-TH")} = {calc.base}
            {Number(calc.tier_multiplier) !== 1 && ` × ขั้นบันได ${calc.tier_multiplier}`}
            {Number(calc.bonus_multiplier) !== 1 && ` × ${calc.bonus_label} ${calc.bonus_multiplier}`} (ปัดเศษลง)
          </p>
          <p className="text-xs">หมดอายุ {calc.expires_on ? formatThaiDate(calc.expires_on) : "ไม่มีวันหมดอายุ"}</p>
        </div>
      )}
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy}>บันทึกแต้ม</Button><Button variant="ghost" onClick={onClose}>ปิด</Button></div>
    </Card>
  );
}

function RedeemForm({ company, balance, onDone, onClose }: { company: Company; balance: number; onDone: () => void; onClose: () => void }) {
  const rewards = useRows<Reward>(() => supabase.from("rewards").select("*").eq("wallet", "company").eq("is_active", true).order("sort"));
  const [reward, setReward] = useState("");
  const [title, setTitle] = useState("ส่วนลดการซื้อ");
  const [points, setPoints] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  function pick(id: string) {
    setReward(id);
    const r = rewards.rows.find((x) => x.id === id);
    if (r) {
      setTitle(r.name);
      if (r.points != null) setPoints(String(r.points));
    } else setTitle("ส่วนลดการซื้อ");
  }
  async function save() {
    const n = Number(points);
    if (!n || n <= 0) return setErr("กรุณากรอกจำนวนแต้ม");
    if (n > balance) return setErr(`แต้มไม่พอ (คงเหลือ ${formatPoints(balance)})`);
    if (!confirm(`ตัด ${formatPoints(n)} แต้มจาก ${company.name}?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("company_redeem", { p_company_id: company.id, p_points: n, p_reward_id: reward || null, p_title: title, p_ref_doc: ref || null, p_note: note || null });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }
  return (
    <Card className="mb-4 ring-amber-200">
      <h3 className="mb-4 font-semibold text-navy-900">ตัดแต้มบริษัท (ใช้เป็นส่วนลด / แลกของ)</h3>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="ของรางวัล">
          <Select value={reward} onChange={(e) => pick(e.target.value)}>
            <option value="">ส่วนลด / ระบุเอง</option>
            {rewards.rows.map((r) => <option key={r.id} value={r.id}>{r.name}{r.points != null ? ` (${formatPoints(r.points)} แต้ม)` : ""}</option>)}
          </Select>
        </Field>
        <Field label="รายการ"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="จำนวนแต้ม" required><Input type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
        <Field label="เลขเอกสารอ้างอิง" hint="เช่น เลขใบกำกับที่ให้ส่วนลด"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <div className="sm:col-span-4"><Field label="หมายเหตุ"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy}>ตัดแต้ม</Button><Button variant="ghost" onClick={onClose}>ปิด</Button></div>
    </Card>
  );
}

function CompanyDetail({ company }: { company: Company }) {
  const ledger = useRows<LedgerRow>(() => supabase.from("point_ledger").select("*").eq("wallet", "company").eq("company_id", company.id).order("created_at", { ascending: false }), [company.id]);
  const redemptions = useRows<Redemption>(() => supabase.from("redemptions").select("*").eq("wallet", "company").eq("company_id", company.id).order("created_at", { ascending: false }), [company.id]);
  const members = useRows<{ id: string; full_name: string | null; email: string }>(() => supabase.from("profiles").select("id, full_name, email").eq("company_id", company.id).eq("company_status", "approved"), [company.id]);
  const [balance, setBalance] = useState(0);
  const [mode, setMode] = useState<"" | "add" | "redeem">("");
  const [edit, setEdit] = useState<LedgerRow | null>(null);
  const [err, setErr] = useState("");
  const loadBalance = () => supabase.rpc("point_balance", { p_wallet: "company", p_owner: company.id }).then(({ data }) => setBalance(Number(data ?? 0)));
  useEffect(() => {
    loadBalance();
    setMode("");
    setEdit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);
  const reload = () => {
    ledger.reload();
    redemptions.reload();
    loadBalance();
    setMode("");
    setEdit(null);
  };
  const totals = useMemo(() => {
    const live = ledger.rows.filter((l) => !l.voided_at);
    return {
      earned: live.filter((l) => l.points > 0).reduce((s, l) => s + Number(l.points), 0),
      purchases: live.filter((l) => l.kind === "purchase").reduce((s, l) => s + Number(l.amount ?? 0), 0),
    };
  }, [ledger.rows]);

  async function voidRow(l: LedgerRow) {
    const reason = prompt(`เหตุผลที่ยกเลิกรายการ ${l.invoice_no ?? l.id}`);
    if (!reason) return;
    const { error } = await supabase.rpc("void_point_entry", { p_id: l.id, p_reason: reason });
    if (error) return setErr(errorMessage(error));
    reload();
  }
  async function cancelRedemption(r: Redemption) {
    const reason = prompt(`เหตุผลที่ยกเลิก ${r.code} (คืน ${formatPoints(r.points)} แต้ม)`);
    if (!reason) return;
    const { error } = await supabase.rpc("cancel_redemption", { p_id: r.id, p_reason: reason });
    if (error) return setErr(errorMessage(error));
    reload();
  }

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-navy-900">{company.name}</p>
            <p className="text-sm text-slate-500">เลขผู้เสียภาษี {company.tax_id} · สมาชิก {members.rows.length} คน{members.rows.length ? `: ${members.rows.map((m) => m.full_name || m.email).join(", ")}` : ""}</p>
            <p className="mt-1 text-xs text-slate-500">แต้มที่เคยได้ทั้งหมด {formatPoints(totals.earned)} · ยอดซื้อที่บันทึก ฿{totals.purchases.toLocaleString("th-TH")}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">แต้มคงเหลือ</p>
            <p className="text-3xl font-bold text-navy-900">{formatPoints(balance)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => { setEdit(null); setMode("add"); }}>+ เพิ่มแต้มจากยอดซื้อ</Button>
          <Button variant="secondary" onClick={() => { setEdit(null); setMode("redeem"); }} disabled={balance <= 0}>ตัดแต้ม</Button>
        </div>
      </Card>
      {mode === "add" && <PurchaseForm company={company} onDone={reload} onClose={() => setMode("")} />}
      {edit && <PurchaseForm key={edit.id} company={company} edit={edit} onDone={reload} onClose={() => setEdit(null)} />}
      {mode === "redeem" && <RedeemForm company={company} balance={balance} onDone={reload} onClose={() => setMode("")} />}
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      {redemptions.rows.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 font-semibold text-navy-900">การตัดแต้ม</h3>
          <div className="space-y-2">
            {redemptions.rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                <span><b className="font-mono">{r.code}</b> · {r.reward_name}{r.ref_doc ? ` · อ้างอิง ${r.ref_doc}` : ""} · {formatThaiDate(r.created_at)}{r.cancel_reason ? ` · ยกเลิก: ${r.cancel_reason}` : ""}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={REDEMPTION_STATUS[r.status].tone}>{r.status === "used" ? "ตัดแล้ว" : REDEMPTION_STATUS[r.status].label}</Badge>
                  <span className="font-semibold text-red-600">−{formatPoints(r.points)}</span>
                  {r.status !== "cancelled" && <button className="text-xs text-red-600 hover:underline" onClick={() => cancelRedemption(r)}>ยกเลิก</button>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-2 font-semibold text-navy-900">รายการแต้ม</h3>
      {ledger.loading ? <Loading /> : ledger.rows.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2 font-medium">วันที่</th><th className="px-3 py-2 font-medium">รายการ</th><th className="px-3 py-2 font-medium">เอกสาร</th><th className="px-3 py-2 text-right font-medium">ยอดซื้อ</th><th className="px-3 py-2 text-right font-medium">แต้ม</th><th className="px-3 py-2 font-medium">หมดอายุ</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.rows.map((l) => (
                <tr key={l.id} className={l.voided_at ? "text-slate-400" : ""}>
                  <td className="whitespace-nowrap px-3 py-2">{formatThaiDate(l.doc_date ?? l.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className={l.voided_at ? "line-through" : "font-medium"}>{LEDGER_KIND[l.kind]}</span>
                    {l.note && <span className="text-slate-500"> · {l.note}</span>}
                    {l.items && <span className="block text-xs text-slate-500">{l.items}</span>}
                    {l.replaces_id && <span className="block text-xs text-slate-500">แก้ไขจากรายการ #{l.replaces_id}</span>}
                    {l.voided_at && <span className="block text-xs">ยกเลิก {formatThaiDate(l.voided_at)}: {l.void_reason}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {l.invoice_no ?? l.ref_doc ?? "-"}
                    {l.file_path && <button className="ml-2 text-xs text-navy-700 underline" onClick={() => openPrivateFile("point-files", l.file_path!)}>ไฟล์</button>}
                  </td>
                  <td className="px-3 py-2 text-right">{l.amount != null ? `฿${Number(l.amount).toLocaleString("th-TH")}` : ""}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${l.voided_at ? "line-through" : l.points > 0 ? "text-emerald-700" : "text-red-600"}`}>{l.points > 0 ? "+" : ""}{formatPoints(l.points)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{l.expires_on ? formatThaiDate(l.expires_on) : "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                    {!l.voided_at && !l.redemption_id && (
                      <>
                        {l.kind === "purchase" && <button className="mr-3 text-navy-700 hover:underline" onClick={() => { setMode(""); setEdit(l); }}>แก้ไข</button>}
                        <button className="text-red-600 hover:underline" onClick={() => voidRow(l)}>ยกเลิก</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>ยังไม่มีรายการแต้มของบริษัทนี้</Empty>}
    </div>
  );
}

export default function CompanyPoints() {
  const { isStaff } = useAuth();
  const companies = useRows<Company>(() => supabase.from("companies").select("*").order("name"));
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ tax_id: "", name: "" });
  const [err, setErr] = useState("");
  async function addCompany() {
    const tax = nc.tax_id.replace(/\D/g, "");
    if (!isValidThaiTaxId(tax)) return setErr("เลขผู้เสียภาษีไม่ถูกต้อง");
    if (!nc.name.trim()) return setErr("กรุณากรอกชื่อบริษัท");
    const { data, error } = await supabase.from("companies").insert({ tax_id: tax, name: nc.name.trim() }).select().single();
    if (error) return setErr(error.code === "23505" ? "มีบริษัทเลขนี้แล้ว" : errorMessage(error));
    setErr("");
    setAdding(false);
    setNc({ tax_id: "", name: "" });
    companies.reload();
    setSel(data as Company);
  }
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies.rows.slice(0, 20);
    return companies.rows.filter((c) => c.name.toLowerCase().includes(s) || c.tax_id.includes(s.replace(/\D/g, "") || "x")).slice(0, 20);
  }, [q, companies.rows]);

  return (
    <Gate allow={isStaff}>
      <PageTitle title="แต้มบริษัท" subtitle="บันทึกยอดซื้อเป็นแต้มตามกติกา ตัดแต้มเป็นส่วนลด · ทุกการแก้ไข/ยกเลิกเก็บผู้ทำและเหตุผล" />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div>
          <Input placeholder="ค้นหาชื่อบริษัทหรือเลขผู้เสียภาษี" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 space-y-1">
            {companies.loading ? <Loading /> : hits.map((c) => (
              <button key={c.id} onClick={() => setSel(c)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${sel?.id === c.id ? "bg-navy-800 text-white" : "hover:bg-white"}`}>
                <span className="block font-medium">{c.name}</span>
                <span className={`block text-xs ${sel?.id === c.id ? "text-navy-100" : "text-slate-500"}`}>{c.tax_id}</span>
              </button>
            ))}
            {!companies.loading && !hits.length && <p className="px-3 text-sm text-slate-500">ไม่พบบริษัท</p>}
          </div>
          {adding ? (
            <div className="mt-4 space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <Input placeholder="เลขผู้เสียภาษี 13 หลัก" inputMode="numeric" value={nc.tax_id} onChange={(e) => setNc({ ...nc, tax_id: e.target.value })} />
              <Input placeholder="ชื่อบริษัท" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2"><Button className="!py-1.5" onClick={addCompany}>เพิ่ม</Button><Button variant="ghost" className="!py-1.5" onClick={() => setAdding(false)}>ปิด</Button></div>
              <p className="text-xs text-slate-500">ลูกค้าที่กรอกเลขเดียวกันในโปรไฟล์จะเห็นแต้มนี้หลังอนุมัติ</p>
            </div>
          ) : (
            <button className="mt-4 px-3 text-sm font-semibold text-navy-700 hover:underline" onClick={() => setAdding(true)}>+ เพิ่มบริษัทที่ยังไม่มีในระบบ</button>
          )}
        </div>
        <div>{sel ? <CompanyDetail company={sel} /> : <Empty>เลือกบริษัทจากรายการด้านซ้าย</Empty>}</div>
      </div>
    </Gate>
  );
}
