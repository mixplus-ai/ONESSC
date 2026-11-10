import { useEffect, useMemo, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { ImageUpload } from "../../../components/ImageUpload";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select, Textarea } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import {
  EXPIRY_LABEL,
  formatPoints,
  formatThaiDate,
  loadPointsConfig,
  REDEMPTION_STATUS,
  uploadTrainingMedia,
  type Bonus,
  type LedgerRow,
  type PointsConfig,
  type Redemption,
  type Reward,
} from "../../../lib/training";
import type { Profile } from "../../../lib/types";
import { LedgerTable } from "../Points";
import { Tabs } from "../MyRequests";

// ---------------------------------------------------------------------------
// Coupons: customer shows a code → staff marks it used
// ---------------------------------------------------------------------------
function CouponsTab() {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Redemption | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"issued" | "all">("issued");
  const list = useRows<Redemption>(() => {
    let q = supabase.from("redemptions").select("*, profiles(full_name, email)").eq("wallet", "personal").order("created_at", { ascending: false }).limit(200);
    if (filter === "issued") q = q.eq("status", "issued");
    return q;
  }, [filter]);

  async function lookup(c = code) {
    setMsg(null);
    const { data } = await supabase.from("redemptions").select("*, profiles(full_name, email)").eq("wallet", "personal").ilike("code", c.trim()).maybeSingle();
    setFound((data as Redemption) ?? null);
    if (!data) setMsg({ tone: "red", text: "ไม่พบคูปองรหัสนี้" });
  }
  async function use() {
    if (!found) return;
    setBusy(true);
    const { error } = await supabase.rpc("use_coupon", { p_code: found.code });
    setBusy(false);
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    setMsg({ tone: "green", text: `บันทึกใช้คูปอง ${found.code} แล้ว` });
    setFound(null);
    setCode("");
    list.reload();
  }
  async function cancel(r: Redemption) {
    const reason = prompt(`เหตุผลที่ยกเลิก ${r.code} (คืน ${formatPoints(r.points)} แต้มให้ลูกค้า)`);
    if (!reason) return;
    const { error } = await supabase.rpc("cancel_redemption", { p_id: r.id, p_reason: reason });
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    setMsg({ tone: "green", text: `ยกเลิก ${r.code} และคืนแต้มแล้ว` });
    setFound(null);
    list.reload();
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold text-navy-900">รับคูปองจากลูกค้า</h3>
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="mt-3 flex max-w-md gap-2">
          <Input placeholder="รหัสคูปอง เช่น CP-69-0001" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button type="submit">ค้นหา</Button>
        </form>
        {found && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-lg font-bold">{found.code}</p>
              <Badge tone={REDEMPTION_STATUS[found.status].tone}>{REDEMPTION_STATUS[found.status].label}</Badge>
            </div>
            <p className="font-medium">{found.reward_name}</p>
            <p className="text-sm text-slate-500">{found.profiles?.full_name || found.profiles?.email} · {formatPoints(found.points)} แต้ม · {formatThaiDate(found.created_at)}</p>
            {found.used_at && <p className="text-sm text-slate-500">ใช้เมื่อ {formatThaiDate(found.used_at)}{found.used_ref ? ` กับ ${found.used_ref}` : ""}</p>}
            <div className="mt-3 flex gap-2">
              {found.status === "issued" && <Button onClick={use} loading={busy}>ส่งของแล้ว · ใช้คูปอง</Button>}
              {found.status !== "cancelled" && <Button variant="ghost" className="text-red-600" onClick={() => cancel(found)}>ยกเลิกและคืนแต้ม</Button>}
            </div>
          </div>
        )}
        {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      </Card>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-navy-900">คูปองแต้มส่วนตัว</h3>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as "issued" | "all")} className="!w-auto"><option value="issued">ยังไม่ได้ใช้</option><option value="all">ทั้งหมด</option></Select>
        </div>
        {list.loading ? <Loading /> : list.rows.length ? (
          <div className="space-y-2">
            {list.rows.map((r) => (
              <button key={r.id} onClick={() => { setFound(r); setCode(r.code); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-left text-sm ring-1 ring-slate-200 hover:ring-navy-200">
                <span><b className="font-mono">{r.code}</b> · {r.reward_name} · {r.profiles?.full_name || r.profiles?.email}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">{formatThaiDate(r.created_at)} <Badge tone={REDEMPTION_STATUS[r.status].tone}>{REDEMPTION_STATUS[r.status].label}</Badge></span>
              </button>
            ))}
          </div>
        ) : <Empty>ไม่มีคูปอง</Empty>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personal points per user (Staff view · Admin adjusts)
// ---------------------------------------------------------------------------
function PersonalTab() {
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [sel, setSel] = useState<Profile | null>(null);
  const [balance, setBalance] = useState(0);
  const [adj, setAdj] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const ledger = useRows<LedgerRow>(
    () => (sel ? supabase.from("point_ledger").select("*").eq("wallet", "personal").eq("user_id", sel.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null })),
    [sel?.id],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      const s = q.trim();
      let qq = supabase.from("profiles").select("*").order("full_name").limit(20);
      if (s) qq = qq.or(`full_name.ilike.%${s.replace(/[%,()]/g, "")}%,email.ilike.%${s.replace(/[%,()]/g, "")}%,phone.ilike.%${s.replace(/[%,()]/g, "")}%`);
      qq.then(({ data }) => setUsers((data ?? []) as Profile[]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (sel) supabase.rpc("point_balance", { p_wallet: "personal", p_owner: sel.id }).then(({ data }) => setBalance(Number(data ?? 0)));
  }, [sel, ledger.rows]);

  async function adjust() {
    const n = Number(adj);
    if (!n) return setMsg({ tone: "red", text: "กรอกจำนวนแต้ม (+ เพิ่ม / − หัก)" });
    if (!note.trim()) return setMsg({ tone: "red", text: "กรุณาระบุเหตุผล" });
    const { error } = await supabase.rpc("adjust_points", { p_wallet: "personal", p_owner: sel!.id, p_points: n, p_note: note });
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    setMsg({ tone: "green", text: "ปรับแต้มแล้ว" });
    setAdj("");
    setNote("");
    ledger.reload();
  }
  async function voidRow(l: LedgerRow) {
    const reason = prompt("เหตุผลที่ยกเลิกรายการนี้");
    if (!reason) return;
    const { error } = await supabase.rpc("void_point_entry", { p_id: l.id, p_reason: reason });
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    ledger.reload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div>
        <Input placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-3 space-y-1">
          {users.map((u) => (
            <button key={u.id} onClick={() => { setSel(u); setMsg(null); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${sel?.id === u.id ? "bg-navy-800 text-white" : "hover:bg-white"}`}>
              <span className="block font-medium">{u.full_name || u.email}</span>
              <span className={`block text-xs ${sel?.id === u.id ? "text-navy-100" : "text-slate-500"}`}>{u.email}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        {!sel ? <Empty>เลือกผู้ใช้</Empty> : (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-navy-900">{sel.full_name || sel.email}</p>
                  <p className="text-sm text-slate-500">{sel.email}{sel.legacy_cerssc_id ? ` · cerssc ${sel.legacy_cerssc_id}` : ""}</p>
                </div>
                <div className="text-right"><p className="text-xs text-slate-500">แต้มส่วนตัวคงเหลือ</p><p className="text-3xl font-bold text-emerald-700">{formatPoints(balance)}</p></div>
              </div>
              {isAdmin && (
                <div className="mt-4 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                  <Input type="number" placeholder="+/− แต้ม" value={adj} onChange={(e) => setAdj(e.target.value)} />
                  <Input placeholder="เหตุผล (จำเป็น)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button onClick={adjust}>ปรับแต้ม</Button>
                </div>
              )}
              {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
            </Card>
            {ledger.loading ? <Loading /> : <LedgerTable rows={ledger.rows} />}
            {isAdmin && ledger.rows.some((l) => !l.voided_at && !l.redemption_id) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-500">ยกเลิกรายการแต้ม (Admin)</summary>
                <div className="mt-2 space-y-1">
                  {ledger.rows.filter((l) => !l.voided_at && !l.redemption_id).map((l) => (
                    <div key={l.id} className="flex justify-between gap-2"><span>#{l.id} · {formatThaiDate(l.created_at)} · {l.note} · {formatPoints(l.points)}</span><button className="text-red-600" onClick={() => voidRow(l)}>ยกเลิก</button></div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rewards catalogue (Admin)
// ---------------------------------------------------------------------------
function RewardForm({ value, onSaved, onClose }: { value: Partial<Reward>; onSaved: () => void; onClose: () => void }) {
  const [f, setF] = useState<Partial<Reward>>(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Reward>(k: K, v: Reward[K] | null) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));
  async function save() {
    if (!f.name?.trim()) return setErr("กรุณากรอกชื่อ");
    if (f.kind === "item" && f.wallet === "personal" && !f.points) return setErr("กรุณากำหนดแต้มที่ใช้แลก");
    if (f.kind === "prize" && !f.weight) return setErr("กรุณากำหนดน้ำหนักการสุ่ม");
    setBusy(true);
    const row = {
      wallet: f.wallet, kind: f.wallet === "company" ? "item" : f.kind, name: f.name, description: f.description || null, image_url: f.image_url || null,
      points: f.points ?? null, stock: f.stock ?? null, weight: f.weight ?? null, discount_baht: f.discount_baht ?? null, bonus_points: f.bonus_points ?? null,
      is_active: f.is_active ?? true, sort: f.sort ?? 0,
    };
    const { error } = f.id ? await supabase.from("rewards").update(row).eq("id", f.id) : await supabase.from("rewards").insert(row);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }
  return (
    <Card className="mb-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="ใช้แต้ม">
          <Select value={f.wallet} onChange={(e) => set("wallet", e.target.value as Reward["wallet"])}><option value="personal">แต้มส่วนตัว (ลูกค้าแลกเอง)</option><option value="company">แต้มบริษัท (Staff ตัดให้)</option></Select>
        </Field>
        {f.wallet === "personal" && (
          <Field label="ประเภท">
            <Select value={f.kind} onChange={(e) => set("kind", e.target.value as Reward["kind"])}><option value="item">แลกตรง</option><option value="prize">รางวัลสุ่ม</option></Select>
          </Field>
        )}
        <div className="sm:col-span-2"><Field label="ชื่อ" required><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field></div>
        <div className="sm:col-span-4"><Field label="รายละเอียด"><Textarea rows={2} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
        {f.kind === "item" ? (
          <Field label="แต้มที่ใช้" hint={f.wallet === "company" ? "ว่าง = Staff กรอกเอง" : undefined}><Input type="number" min={0} value={f.points ?? ""} onChange={(e) => set("points", num(e.target.value))} /></Field>
        ) : (
          <Field label="น้ำหนักการสุ่ม" hint="ยิ่งมากยิ่งออกบ่อย"><Input type="number" min={0} value={f.weight ?? ""} onChange={(e) => set("weight", num(e.target.value))} /></Field>
        )}
        <Field label="จำนวนคงเหลือ" hint="ว่าง = ไม่จำกัด"><Input type="number" min={0} value={f.stock ?? ""} onChange={(e) => set("stock", num(e.target.value))} /></Field>
        {f.wallet === "personal" && f.kind === "item" && <Field label="เป็นคูปองส่วนลดค่าอบรม (บาท)" hint="ใช้ตอนจองอบรมได้"><Input type="number" min={0} value={f.discount_baht ?? ""} onChange={(e) => set("discount_baht", num(e.target.value))} /></Field>}
        {f.kind === "prize" && <Field label="เป็นแต้มคืน (แต้ม)" hint="ได้แต้มทันที ไม่ต้องรับของ"><Input type="number" min={0} value={f.bonus_points ?? ""} onChange={(e) => set("bonus_points", num(e.target.value))} /></Field>}
        <Field label="ลำดับ"><Input type="number" value={f.sort ?? 0} onChange={(e) => set("sort", Number(e.target.value))} /></Field>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.is_active ?? true} onChange={(e) => set("is_active", e.target.checked)} /> เปิดแสดง</label>
        <div className="sm:col-span-4"><ImageUpload value={f.image_url ?? ""} onChange={(u) => set("image_url", u)} folder="rewards" upload={uploadTrainingMedia} /></div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy}>บันทึก</Button><Button variant="ghost" onClick={onClose}>ปิด</Button></div>
    </Card>
  );
}

function RewardsTab() {
  const { isAdmin } = useAuth();
  const rows = useRows<Reward>(() => supabase.from("rewards").select("*").order("wallet").order("kind").order("sort"));
  const [form, setForm] = useState<Partial<Reward> | null>(null);
  const groups: [string, Reward[]][] = [
    ["แต้มส่วนตัว · แลกตรง", rows.rows.filter((r) => r.wallet === "personal" && r.kind === "item")],
    ["แต้มส่วนตัว · รางวัลสุ่ม", rows.rows.filter((r) => r.wallet === "personal" && r.kind === "prize")],
    ["แต้มบริษัท", rows.rows.filter((r) => r.wallet === "company")],
  ];
  return (
    <div>
      {isAdmin && <div className="mb-4 flex justify-end"><Button onClick={() => setForm({ wallet: "personal", kind: "item", is_active: true })}>เพิ่มของรางวัล</Button></div>}
      {form && <RewardForm key={form.id ?? "new"} value={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); rows.reload(); }} />}
      {rows.loading ? <Loading /> : (
        <div className="space-y-6">
          {groups.map(([title, list]) => (
            <div key={title}>
              <h3 className="mb-2 font-semibold text-navy-900">{title}</h3>
              {list.length ? (
                <div className="space-y-2">
                  {list.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                      <span className="flex items-center gap-3">
                        {r.image_url ? <img src={r.image_url} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-2xl">🎁</span>}
                        <span>
                          <b>{r.name}</b>{!r.is_active && <span className="ml-2 text-xs text-slate-400">(ซ่อน)</span>}
                          <span className="block text-xs text-slate-500">
                            {r.kind === "prize" ? `น้ำหนัก ${r.weight}` : r.points != null ? `${formatPoints(r.points)} แต้ม` : "กรอกแต้มเอง"}
                            {r.stock != null ? ` · เหลือ ${r.stock}` : ""}{r.discount_baht ? ` · ส่วนลดอบรม ${r.discount_baht} บาท` : ""}{r.bonus_points ? ` · แต้มคืน ${r.bonus_points}` : ""}
                          </span>
                        </span>
                      </span>
                      {isAdmin && <button className="font-semibold text-navy-700 hover:underline" onClick={() => setForm(r)}>แก้ไข</button>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">ยังไม่มี</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Point rules (Admin)
// ---------------------------------------------------------------------------
function RulesTab() {
  const { isAdmin } = useAuth();
  const [c, setC] = useState<PointsConfig | null>(null);
  const bonuses = useRows<Bonus>(() => supabase.from("company_point_bonuses").select("*").order("starts_on", { ascending: false }));
  const [nb, setNb] = useState({ label: "", multiplier: "2", starts_on: "", ends_on: "" });
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadPointsConfig().then(setC);
  }, []);
  const tiers = useMemo(() => [...(c?.company_tiers ?? [])].sort((a, b) => a.min - b.min), [c]);
  if (!c) return <Loading />;

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("points_config").update({
      points_per_hour: c!.points_per_hour, rewards_enabled: c!.rewards_enabled, lucky_cost: c!.lucky_cost,
      company_baht_per_point: c!.company_baht_per_point, company_tiers: tiers, company_expiry: c!.company_expiry,
    }).eq("id", 1);
    setBusy(false);
    setMsg(error ? { tone: "red", text: errorMessage(error) } : { tone: "green", text: "บันทึกกติกาแล้ว มีผลกับรายการใหม่เท่านั้น" });
  }
  async function addBonus() {
    if (!nb.label.trim() || !Number(nb.multiplier)) return;
    const { error } = await supabase.from("company_point_bonuses").insert({ label: nb.label, multiplier: Number(nb.multiplier), starts_on: nb.starts_on || null, ends_on: nb.ends_on || null });
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    setNb({ label: "", multiplier: "2", starts_on: "", ends_on: "" });
    bonuses.reload();
  }
  async function toggleBonus(b: Bonus) {
    await supabase.from("company_point_bonuses").update({ is_active: !b.is_active }).eq("id", b.id);
    bonuses.reload();
  }
  const setTier = (i: number, k: "min" | "multiplier", v: number) => setC({ ...c, company_tiers: tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });
  const dis = !isAdmin;

  return (
    <div className="space-y-6">
      {!isAdmin && <Alert tone="amber">Staff ดูกติกาได้ เฉพาะ Admin แก้ไข</Alert>}
      <Card>
        <h3 className="font-semibold text-navy-900">แต้มส่วนตัว (จากการอบรม)</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="แต้มต่อชั่วโมงอบรม"><Input type="number" min={0} step="0.5" disabled={dis} value={c.points_per_hour} onChange={(e) => setC({ ...c, points_per_hour: Number(e.target.value) })} /></Field>
          <Field label="แต้มต่อการสุ่มรางวัล 1 ครั้ง" hint="0 = ปิดการสุ่ม"><Input type="number" min={0} disabled={dis} value={c.lucky_cost} onChange={(e) => setC({ ...c, lucky_cost: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" disabled={dis} checked={c.rewards_enabled} onChange={(e) => setC({ ...c, rewards_enabled: e.target.checked })} /> เปิดให้ลูกค้าแลกของรางวัล</label>
        </div>
        <p className="mt-2 text-xs text-slate-500">แต้มส่วนตัวหมดอายุ 31 ธ.ค. ของปีที่ได้รับ (กติกาเดิมของ cerssc)</p>
      </Card>
      <Card>
        <h3 className="font-semibold text-navy-900">แต้มบริษัท (จากยอดซื้อ)</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="ยอดซื้อกี่บาท = 1 แต้ม"><Input type="number" min={1} disabled={dis} value={c.company_baht_per_point} onChange={(e) => setC({ ...c, company_baht_per_point: Number(e.target.value) })} /></Field>
          <Field label="วันหมดอายุ">
            <Select disabled={dis} value={c.company_expiry} onChange={(e) => setC({ ...c, company_expiry: e.target.value as PointsConfig["company_expiry"] })}>
              {Object.entries(EXPIRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-700">ขั้นบันไดตามยอดต่อบิล</p>
        <div className="mt-2 space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span>ยอดตั้งแต่</span>
              <Input type="number" min={0} disabled={dis} value={t.min} onChange={(e) => setTier(i, "min", Number(e.target.value))} className="!w-36" />
              <span>บาท ได้แต้ม ×</span>
              <Input type="number" min={0} step="0.1" disabled={dis} value={t.multiplier} onChange={(e) => setTier(i, "multiplier", Number(e.target.value))} className="!w-24" />
              {isAdmin && tiers.length > 1 && <button className="text-red-600" onClick={() => setC({ ...c, company_tiers: tiers.filter((_, j) => j !== i) })}>ลบ</button>}
            </div>
          ))}
          {isAdmin && <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => setC({ ...c, company_tiers: [...tiers, { min: (tiers.at(-1)?.min ?? 0) + 100000, multiplier: 1.5 }] })}>+ เพิ่มขั้น</button>}
        </div>
        <p className="mt-2 text-xs text-slate-500">ตัวอย่าง: ซื้อ 250,000 บาท · 1,000 บาท = 1 แต้ม · ขั้น 100,000 ขึ้นไป ×1.5 → 375 แต้ม (ปัดเศษลง)</p>
      </Card>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {isAdmin && <Button onClick={save} loading={busy}>บันทึกกติกา</Button>}
      <Card>
        <h3 className="font-semibold text-navy-900">โบนัสตามช่วงเวลา</h3>
        <p className="text-sm text-slate-500">เช่น “สินค้าโปรโมชั่น ×2” Staff เลือกใช้ตอนบันทึกยอดซื้อที่อยู่ในช่วงวันที่</p>
        <div className="mt-3 space-y-2">
          {bonuses.rows.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span><b>{b.label}</b> ×{b.multiplier} · {b.starts_on ? formatThaiDate(b.starts_on) : "ไม่กำหนด"} – {b.ends_on ? formatThaiDate(b.ends_on) : "ไม่กำหนด"}</span>
              {isAdmin ? <button className="text-navy-700 hover:underline" onClick={() => toggleBonus(b)}>{b.is_active ? "ปิด" : "เปิด"}</button> : <Badge tone={b.is_active ? "green" : "slate"}>{b.is_active ? "เปิด" : "ปิด"}</Badge>}
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_10rem_10rem_auto]">
            <Input placeholder="ชื่อโบนัส" value={nb.label} onChange={(e) => setNb({ ...nb, label: e.target.value })} />
            <Input type="number" step="0.1" placeholder="×" value={nb.multiplier} onChange={(e) => setNb({ ...nb, multiplier: e.target.value })} />
            <Input type="date" value={nb.starts_on} onChange={(e) => setNb({ ...nb, starts_on: e.target.value })} />
            <Input type="date" value={nb.ends_on} onChange={(e) => setNb({ ...nb, ends_on: e.target.value })} />
            <Button variant="secondary" onClick={addBonus}>เพิ่ม</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function PointsAdmin() {
  const { isStaff } = useAuth();
  const [tab, setTab] = useState<"coupons" | "personal" | "rewards" | "rules">("coupons");
  return (
    <Gate allow={isStaff}>
      <PageTitle title="แต้มส่วนตัวและของรางวัล" subtitle="รับคูปอง ดู/ปรับแต้มส่วนตัว ของรางวัล และกติกาแต้ม" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: "coupons", label: "รับคูปอง" },
        { key: "personal", label: "แต้มส่วนตัวรายคน" },
        { key: "rewards", label: "ของรางวัล" },
        { key: "rules", label: "กติกาแต้ม" },
      ]} />
      {tab === "coupons" && <CouponsTab />}
      {tab === "personal" && <PersonalTab />}
      {tab === "rewards" && <RewardsTab />}
      {tab === "rules" && <RulesTab />}
    </Gate>
  );
}
