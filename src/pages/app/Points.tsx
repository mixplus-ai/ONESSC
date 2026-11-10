import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, Empty, Loading, PageTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useRows } from "../../lib/content";
import { errorMessage, supabase } from "../../lib/supabase";
import {
  formatPoints,
  formatThaiDate,
  LEDGER_KIND,
  loadPointsConfig,
  qrDataUrl,
  REDEMPTION_STATUS,
  type LedgerRow,
  type PointsConfig,
  type Redemption,
  type Reward,
  type TrainingStatus,
} from "../../lib/training";
import { Tabs } from "./MyRequests";

function CouponQr({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    qrDataUrl(code, 160).then(setUrl);
  }, [code]);
  return url ? <img src={url} alt={`QR ${code}`} className="h-28 w-28 rounded-lg ring-1 ring-slate-200" /> : null;
}

/** Ledger table shared by the customer page and the back office. */
export function LedgerTable({ rows, showDoc }: { rows: LedgerRow[]; showDoc?: boolean }) {
  if (!rows.length) return <Empty>ยังไม่มีรายการแต้ม</Empty>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">วันที่</th>
            <th className="px-4 py-2 font-medium">รายการ</th>
            {showDoc && <th className="px-4 py-2 font-medium">เอกสาร / ยอดซื้อ</th>}
            <th className="px-4 py-2 text-right font-medium">แต้ม</th>
            <th className="px-4 py-2 font-medium">หมดอายุ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => {
            const expired = l.expires_on && l.expires_on < today;
            return (
              <tr key={l.id} className={l.voided_at ? "text-slate-400 line-through" : ""}>
                <td className="whitespace-nowrap px-4 py-2">{formatThaiDate(l.doc_date ?? l.created_at)}</td>
                <td className="px-4 py-2">
                  <span className="font-medium">{LEDGER_KIND[l.kind]}</span>
                  {l.note && <span className="text-slate-500"> · {l.note}</span>}
                  {l.voided_at && <span className="block text-xs no-underline">ยกเลิก: {l.void_reason}</span>}
                </td>
                {showDoc && (
                  <td className="px-4 py-2 text-slate-600">
                    {l.invoice_no ?? l.ref_doc ?? "-"}
                    {l.amount != null && <span className="block text-xs">฿{Number(l.amount).toLocaleString("th-TH")}</span>}
                  </td>
                )}
                <td className={`px-4 py-2 text-right font-semibold ${l.points > 0 ? "text-emerald-700" : "text-red-600"}`}>{l.points > 0 ? "+" : ""}{formatPoints(l.points)}</td>
                <td className={`whitespace-nowrap px-4 py-2 ${expired ? "text-red-500" : "text-slate-500"}`}>{l.expires_on ? formatThaiDate(l.expires_on) : "-"}{expired ? " (หมดอายุ)" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RewardCard({ r, balance, onRedeem, busy }: { r: Reward; balance: number; onRedeem?: () => void; busy?: boolean }) {
  const out = r.stock != null && r.stock <= 0;
  return (
    <Card className="flex flex-col !p-4">
      <div className="mb-3 grid h-28 place-items-center overflow-hidden rounded-xl bg-slate-100">
        {r.image_url ? <img src={r.image_url} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl">🎁</span>}
      </div>
      <p className="font-semibold text-navy-900">{r.name}</p>
      {r.description && <p className="text-sm text-slate-500">{r.description}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="font-semibold text-sun-600">{r.points != null ? `${formatPoints(r.points)} แต้ม` : ""}</span>
        {r.stock != null && <span className="text-xs text-slate-500">เหลือ {r.stock}</span>}
      </div>
      {onRedeem && (
        <Button className="mt-2" onClick={onRedeem} loading={busy} disabled={out || Number(r.points ?? 0) > balance}>
          {out ? "หมดแล้ว" : Number(r.points ?? 0) > balance ? "แต้มไม่พอ" : "แลก"}
        </Button>
      )}
    </Card>
  );
}

export default function Points() {
  const { session, profile } = useAuth();
  const uid = session?.user.id ?? "";
  const companyId = profile?.company_status === "approved" ? profile.company_id : null;
  const [tab, setTab] = useState<"personal" | "coupons" | "company">("personal");
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [cfg, setCfg] = useState<PointsConfig | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const ledger = useRows<LedgerRow>(() => supabase.from("point_ledger").select("*").eq("wallet", "personal").eq("user_id", uid).order("created_at", { ascending: false }).limit(200), [uid]);
  const companyLedger = useRows<LedgerRow>(
    () => (companyId ? supabase.from("point_ledger").select("*").eq("wallet", "company").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null })),
    [companyId],
  );
  const rewards = useRows<Reward>(() => supabase.from("rewards").select("*").eq("is_active", true).order("sort").order("points"));
  const coupons = useRows<Redemption>(() => supabase.from("redemptions").select("*").eq("wallet", "personal").eq("user_id", uid).order("created_at", { ascending: false }), [uid]);
  const companyRedemptions = useRows<Redemption>(
    () => (companyId ? supabase.from("redemptions").select("*").eq("wallet", "company").eq("company_id", companyId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null })),
    [companyId],
  );
  const loadStatus = () => supabase.rpc("my_training_status").then(({ data }) => setStatus(data as TrainingStatus));
  useEffect(() => {
    loadStatus();
    loadPointsConfig().then(setCfg);
  }, []);

  const balance = Number(status?.personal_points ?? 0);
  const items = rewards.rows.filter((r) => r.wallet === "personal" && r.kind === "item");
  const prizes = rewards.rows.filter((r) => r.wallet === "personal" && r.kind === "prize");
  const companyRewards = rewards.rows.filter((r) => r.wallet === "company");
  const open = coupons.rows.filter((c) => c.status === "issued");
  const yearEnd = `31 ธ.ค. ${new Date().getFullYear() + 543}`;

  async function act(key: string, fn: () => PromiseLike<{ data: unknown; error: unknown }>, ok: (d: Redemption) => string) {
    if (key !== "lucky" && !confirm("ยืนยันการแลก?")) return;
    setBusy(key);
    setMsg(null);
    const { data, error } = await fn();
    setBusy("");
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    setMsg({ tone: "green", text: ok(data as Redemption) });
    loadStatus();
    ledger.reload();
    coupons.reload();
    rewards.reload();
  }
  async function cancelCoupon(c: Redemption) {
    if (!confirm(`ยกเลิกคูปอง ${c.code} และคืน ${formatPoints(c.points)} แต้ม?`)) return;
    const { error } = await supabase.rpc("cancel_redemption", { p_id: c.id, p_reason: "ลูกค้ายกเลิกเอง" });
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    loadStatus();
    ledger.reload();
    coupons.reload();
  }

  return (
    <>
      <PageTitle title="แต้มสะสมและของรางวัล" subtitle="แต้มส่วนตัวได้จากการอบรม · แต้มบริษัทได้จากยอดซื้อ" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-500">แต้มส่วนตัว</p>
          <p className="text-3xl font-bold text-emerald-700">{formatPoints(balance)}</p>
          <p className="mt-1 text-xs text-slate-500">แต้มหมดอายุ {yearEnd} ของปีที่ได้รับ · ติดตัวคุณแม้ย้ายบริษัท</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">แต้มบริษัท {companyId ? "" : "(ยังไม่ผูกบริษัท)"}</p>
          {companyId ? (
            <>
              <p className="text-3xl font-bold text-navy-900">{formatPoints(status?.company_points)}</p>
              <p className="mt-1 text-xs text-slate-500">รวมทุกคนในบริษัท ใช้เป็นส่วนลดหรือแลกของ โดยแจ้งเซลล์/เจ้าหน้าที่</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">กรอกเลขผู้เสียภาษีที่ <Link to="/app/profile" className="font-semibold underline">ข้อมูลส่วนตัว</Link> เพื่อสะสมแต้มบริษัท</p>
          )}
        </Card>
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: "personal", label: "แลกของรางวัล" },
        { key: "coupons", label: "คูปองของฉัน", count: open.length },
        { key: "company", label: "แต้มบริษัท" },
      ]} />

      {tab === "personal" && (
        <div className="space-y-8">
          {cfg && !cfg.rewards_enabled ? (
            <Alert tone="amber">ปิดการแลกของรางวัลชั่วคราว</Alert>
          ) : (
            <>
              {rewards.loading ? <Loading /> : items.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((r) => (
                    <RewardCard key={r.id} r={r} balance={balance} busy={busy === r.id}
                      onRedeem={() => act(r.id, () => supabase.rpc("redeem_reward", { p_reward_id: r.id }), (d) => `แลกสำเร็จ คูปอง ${d.code} นำไปแสดงกับเจ้าหน้าที่เพื่อรับของ`)} />
                  ))}
                </div>
              ) : <Empty>ยังไม่มีของรางวัล</Empty>}
              {cfg && Number(cfg.lucky_cost) > 0 && prizes.length > 0 && (
                <Card className="bg-gradient-to-r from-sun-500/15 to-white">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-navy-900">สุ่มรางวัล</p>
                      <p className="text-sm text-slate-600">ใช้ {formatPoints(cfg.lucky_cost)} แต้มต่อครั้ง · ลุ้น {prizes.map((p) => p.name).join(", ")}</p>
                    </div>
                    <Button variant="sun" loading={busy === "lucky"} disabled={balance < Number(cfg.lucky_cost)}
                      onClick={() => confirm(`ใช้ ${cfg.lucky_cost} แต้มสุ่มรางวัล?`) && act("lucky", () => supabase.rpc("lucky_draw"), (d) => `🎉 ได้รับ “${d.reward_name}” คูปอง ${d.code}`)}>
                      สุ่มเลย
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
          <div>
            <h3 className="mb-3 font-semibold text-navy-900">ประวัติแต้มส่วนตัว</h3>
            {ledger.loading ? <Loading /> : <LedgerTable rows={ledger.rows} />}
          </div>
        </div>
      )}

      {tab === "coupons" && (
        coupons.loading ? <Loading /> : coupons.rows.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {coupons.rows.map((c) => (
              <Card key={c.id} className="flex gap-4 !p-4">
                {c.status === "issued" && <CouponQr code={c.code} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-lg font-bold text-navy-900">{c.code}</p>
                    <Badge tone={REDEMPTION_STATUS[c.status].tone}>{REDEMPTION_STATUS[c.status].label}</Badge>
                  </div>
                  <p className="font-medium">{c.reward_name}</p>
                  <p className="text-xs text-slate-500">{c.method === "lucky" ? "สุ่มรางวัล" : "แลก"} {formatPoints(c.points)} แต้ม · {formatThaiDate(c.created_at)}</p>
                  {c.status === "issued" && <p className="mt-2 text-xs text-slate-600">แสดงคูปองนี้กับเจ้าหน้าที่เพื่อรับของรางวัล</p>}
                  {c.used_ref && <p className="mt-1 text-xs text-slate-500">ใช้กับ {c.used_ref}</p>}
                  {c.status === "issued" && c.method === "direct" && (
                    <button onClick={() => cancelCoupon(c)} className="mt-2 text-xs text-red-600 hover:underline">ยกเลิกและคืนแต้ม</button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : <Empty>ยังไม่มีคูปอง</Empty>
      )}

      {tab === "company" && (
        companyId ? (
          <div className="space-y-8">
            {companyRewards.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold text-navy-900">ของรางวัลแต้มบริษัท</h3>
                <p className="mb-3 text-sm text-slate-500">แจ้งเซลล์หรือเจ้าหน้าที่เพื่อใช้แต้มบริษัทเป็นส่วนลด บัตรกำนัล สินค้า หรือทริปดูงาน</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {companyRewards.map((r) => <RewardCard key={r.id} r={r} balance={Number(status?.company_points ?? 0)} />)}
                </div>
              </div>
            )}
            {companyRedemptions.rows.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold text-navy-900">การใช้แต้มบริษัท</h3>
                <div className="space-y-2">
                  {companyRedemptions.rows.map((c) => (
                    <div key={c.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                      <span><b className="font-mono">{c.code}</b> · {c.reward_name}{c.ref_doc ? ` · อ้างอิง ${c.ref_doc}` : ""}</span>
                      <span className={c.status === "cancelled" ? "text-slate-400 line-through" : "font-semibold text-red-600"}>−{formatPoints(c.points)} แต้ม</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h3 className="mb-3 font-semibold text-navy-900">ประวัติแต้มบริษัท</h3>
              {companyLedger.loading ? <Loading /> : <LedgerTable rows={companyLedger.rows} showDoc />}
            </div>
          </div>
        ) : (
          <Empty>ยังไม่ได้ผูกบริษัท กรอกเลขผู้เสียภาษีที่ <Link to="/app/profile" className="underline">ข้อมูลส่วนตัว</Link></Empty>
        )
      )}
    </>
  );
}
