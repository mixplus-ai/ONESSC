import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Field, Input, Loading, PageTitle, Select, Textarea, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { errorMessage, supabase } from "../../../lib/supabase";
import {
  BILLING_TYPE,
  formatMoney,
  loadSeats,
  loadTrainingSettings,
  priceBreakdown,
  cols,
  SESSION_COLS,
  sessionDateText,
  sessionPrice,
  todayBkk,
  type Billing,
  type Course,
  type Redemption,
  type Session,
  type TrainingSettings,
  type TrainingStatus,
} from "../../../lib/training";

type S = Session & { courses: Course };
interface Promo { code: string; kind: "free" | "amount" | "percent"; value: number; session_id: string | null }

/** Baht off for this session, or 0 when the code is for another session. */
function promoDiscount(p: Promo | null, s: Pick<Session, "id">, price: number) {
  if (!p || (p.session_id && p.session_id !== s.id) || price <= 0) return 0;
  if (p.kind === "free") return price;
  if (p.kind === "amount") return Math.min(Number(p.value), price);
  return Math.round(price * Number(p.value)) / 100;
}
function PriceTag({ price, discount }: { price: number; discount: number }) {
  if (price <= 0) return <span className="block font-semibold">ฟรี</span>;
  if (discount <= 0) return <span className="block font-semibold">{formatMoney(price)}</span>;
  return (
    <span className="block">
      <span className="mr-1 text-slate-400 line-through">{formatMoney(price)}</span>
      <span className="font-semibold text-emerald-700">{price - discount > 0 ? formatMoney(price - discount) : "ฟรี"}</span>
    </span>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ["เลือกรอบ", "กรอกข้อมูล", "ยืนยัน"];
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2">
      {labels.map((l, i) => (
        <li key={l} className={cx("rounded-lg px-3 py-2 text-center text-sm font-medium", i + 1 === step ? "bg-navy-800 text-white" : i + 1 < step ? "bg-navy-50 text-navy-700" : "bg-slate-100 text-slate-500")}>
          {i + 1}. {l}
        </li>
      ))}
    </ol>
  );
}

export default function Book() {
  const { sessionId } = useParams();
  const { profile } = useAuth();
  const nav = useNavigate();
  const [cfg, setCfg] = useState<TrainingSettings | null>(null);
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [sessions, setSessions] = useState<S[]>([]);
  const [seats, setSeats] = useState<Map<string, number>>(new Map());
  const [coupons, setCoupons] = useState<(Redemption & { rewards: { discount_baht: number | null } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [pick, setPick] = useState(sessionId ?? "");
  const [sale, setSale] = useState("");
  const [source, setSource] = useState("");
  const [sourceOther, setSourceOther] = useState("");
  const [billing, setBilling] = useState<Billing>({ type: "company", name: "", tax_id: "", branch: "สำนักงานใหญ่", address: "" });
  const [coupon, setCoupon] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoErr, setPromoErr] = useState("");
  const [wantsQuote, setWantsQuote] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const first = sessionId
        ? await supabase.from("course_sessions").select(cols(`${SESSION_COLS}, courses(*)`)).eq("id", sessionId).maybeSingle()
        : { data: null };
      const courseId = (first.data as S | null)?.course_id;
      let q = supabase.from("course_sessions").select(cols(`${SESSION_COLS}, courses!inner(*)`)).eq("is_archived", false).eq("status", "open").gte("starts_on", todayBkk()).eq("courses.is_active", true).order("starts_on");
      if (courseId) q = q.eq("course_id", courseId);
      const [{ data: list }, c, st, sts, cps] = await Promise.all([
        q,
        loadTrainingSettings(),
        supabase.rpc("my_training_status"),
        loadSeats(),
        supabase.from("redemptions").select("*, rewards(discount_baht)").eq("status", "issued").eq("wallet", "personal"),
      ]);
      setSessions((list ?? []) as unknown as S[]);
      setCfg(c);
      setStatus(st.data as TrainingStatus);
      setSeats(sts);
      setCoupons(((cps.data ?? []) as typeof coupons).filter((r) => Number(r.rewards?.discount_baht ?? 0) > 0));
      setLoading(false);
    })();
  }, [sessionId]);

  useEffect(() => {
    if (!profile) return;
    setBilling((b) => ({ ...b, name: b.name || profile.company_name || profile.full_name || "", tax_id: b.tax_id || profile.tax_id || "", type: profile.tax_id ? "company" : "person" }));
  }, [profile]);

  const s = sessions.find((x) => x.id === pick);
  const price = s ? sessionPrice(s, s.courses) : 0;
  const couponRow = coupons.find((c) => c.code === coupon);
  const promoOff = s ? promoDiscount(promo, s, price) : 0;
  const discount = promoOff > 0 ? promoOff : Math.min(Number(couponRow?.rewards?.discount_baht ?? 0), price);
  const toPay = price - discount; // before VAT / WHT
  const breakdown = useMemo(
    () => (s && cfg ? priceBreakdown(price, billing.type, s, cfg, discount) : null),
    [s, cfg, price, billing.type, discount],
  );

  async function applyPromo() {
    setPromoErr("");
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    const { data, error } = await supabase.rpc("check_promo_code", { p_code: code });
    setPromoBusy(false);
    if (error) return setPromoErr(errorMessage(error));
    const p = data as Promo;
    setPromo(p);
    setCoupon("");
    if (p.session_id && sessions.some((x) => x.id === p.session_id)) setPick(p.session_id);
    else if (p.session_id) setPromoErr("โค้ดนี้ใช้กับรอบอื่นที่ไม่ได้แสดงในหน้านี้");
  }
  function clearPromo() {
    setPromo(null);
    setPromoInput("");
    setPromoErr("");
  }

  if (loading) return <Loading />;
  if (status?.banned)
    return (
      <>
        <PageTitle title="จองอบรม" />
        <Alert>บัญชีของคุณถูกระงับสิทธิ์การจองถึง 31 ธ.ค. เนื่องจากเลื่อน/ยกเลิก/ไม่มาเกิน {status.strike_limit} ครั้ง กรุณาติดต่อทีมงาน</Alert>
      </>
    );

  function next2() {
    setErr("");
    if (!s) return setErr("กรุณาเลือกรอบอบรม");
    setStep(2);
  }
  function next3() {
    setErr("");
    if (!sale) return setErr("กรุณาเลือก Sale ที่เชิญ (หรือเลือก “ไม่มี”)");
    if (!source || (source === "อื่นๆ" && !sourceOther.trim())) return setErr("กรุณาเลือกช่องทางที่รู้จักกิจกรรม");
    if (toPay > 0) {
      if (!billing.name.trim()) return setErr("กรุณากรอกชื่อสำหรับออกใบเสร็จ");
      if (billing.type === "company" && !/^\d{13}$/.test(billing.tax_id ?? "")) return setErr("กรุณากรอกเลขผู้เสียภาษี 13 หลัก");
      if (billing.type !== "person_no_vat" && !billing.address?.trim()) return setErr("กรุณากรอกที่อยู่สำหรับออกใบกำกับภาษี");
    }
    setStep(3);
  }
  async function confirm() {
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.rpc("book_session", {
      p_session_id: pick,
      p_sale_name: sale === "-" ? null : sale,
      p_source: source === "อื่นๆ" ? `อื่นๆ: ${sourceOther.trim()}` : source,
      p_billing: toPay > 0 ? billing : null,
      p_coupon_code: (promoOff > 0 ? promo?.code : coupon) || null,
      p_wants_quote: toPay > 0 && wantsQuote,
      p_note: note || null,
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    nav("/app/training", { state: { booked: (data as { code: string }).code } });
  }

  const sources = [...(cfg?.source_list ?? []), "อื่นๆ"];

  return (
    <>
      <PageTitle title="จองอบรม" subtitle={s ? s.courses.title : "เลือกรอบที่สะดวก"} />
      <Steps step={step} />
      {status && (
        <p className="mb-4 text-sm text-slate-500">
          จองล่วงหน้าอยู่ {status.active_bookings}/{status.max_active_bookings} รอบ · เลื่อน/ยกเลิกได้ถึง {status.change_days_before} วันก่อนวันอบรม · เลื่อน/ยกเลิก/ไม่มาเกิน {status.strike_limit} ครั้งต่อปีจะถูกระงับสิทธิ์ (ใช้ไปแล้ว {status.strikes} ครั้ง)
        </p>
      )}
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      {step === 1 && (
        <Card>
          {sessions.length ? (
            <div className="grid gap-2">
              {sessions.map((x) => {
                const left = x.capacity - (seats.get(x.id) ?? 0);
                return (
                  <label key={x.id} className={cx("flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1", pick === x.id ? "bg-navy-50 ring-navy-300" : "ring-slate-200 hover:bg-slate-50", left <= 0 && "cursor-not-allowed opacity-50")}>
                    <input type="radio" name="s" className="mt-1" checked={pick === x.id} disabled={left <= 0} onChange={() => setPick(x.id)} />
                    <span className="flex-1">
                      <span className="block font-semibold text-navy-900">{x.courses.title}{x.title ? ` · ${x.title}` : ""}</span>
                      <span className="block text-sm text-slate-600">{sessionDateText(x)}</span>
                      <span className="block text-sm text-slate-500">{x.location}</span>
                    </span>
                    <span className="text-right text-sm">
                      <PriceTag price={sessionPrice(x, x.courses)} discount={promoDiscount(promo, x, sessionPrice(x, x.courses))} />
                      <span className="block text-slate-500">{left > 0 ? `เหลือ ${left} ที่` : "เต็ม"}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">ไม่มีรอบที่เปิดรับสมัคร <Link to="/training" className="underline">ดูปฏิทินอบรม</Link></p>
          )}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-navy-900">โค้ดโปรโมชั่น</p>
            <p className="text-xs text-slate-500">มีโค้ดส่วนลดหรือโค้ดอบรมฟรีจากทีมงาน กรอกที่นี่</p>
            {promo ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-mono font-semibold text-emerald-800 ring-1 ring-emerald-200">{promo.code}</span>
                <span className="text-emerald-700">
                  {promo.kind === "free" ? "อบรมฟรี" : promo.kind === "amount" ? `ลด ${formatMoney(promo.value)}` : `ลด ${Number(promo.value)}%`}
                  {promo.session_id ? " · เฉพาะรอบที่กำหนด" : ""}
                </span>
                <button type="button" className="text-slate-500 underline" onClick={clearPromo}>เอาออก</button>
              </div>
            ) : (
              <div className="mt-2 flex max-w-sm gap-2">
                <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && applyPromo()} placeholder="เช่น FREE2569" className="font-mono uppercase" />
                <Button variant="secondary" onClick={applyPromo} loading={promoBusy}>ใช้โค้ด</Button>
              </div>
            )}
            {promoErr && <p className="mt-1 text-sm text-red-600">{promoErr}</p>}
            {s && promo && promoOff === 0 && price > 0 && !promoErr && <p className="mt-1 text-sm text-amber-700">โค้ดนี้ใช้กับรอบที่เลือกไม่ได้</p>}
          </div>
          <div className="mt-5"><Button onClick={next2} disabled={!pick}>ถัดไป</Button></div>
        </Card>
      )}

      {step === 2 && s && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sale ที่เชิญเข้าร่วม" required>
              <Select value={sale} onChange={(e) => setSale(e.target.value)}>
                <option value="">— เลือก —</option>
                {(cfg?.sales_list ?? []).map((n) => <option key={n}>{n}</option>)}
                <option value="-">ไม่มี / ไม่ทราบ</option>
              </Select>
            </Field>
            <Field label="รู้จักกิจกรรมนี้จากช่องทางใด" required>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">— เลือก —</option>
                {sources.map((n) => <option key={n}>{n}</option>)}
              </Select>
            </Field>
            {source === "อื่นๆ" && <Field label="ระบุช่องทาง"><Input value={sourceOther} onChange={(e) => setSourceOther(e.target.value)} /></Field>}

            {price > 0 && toPay <= 0 && (
              <div className="sm:col-span-2"><Alert tone="green">ใช้โค้ด {promo?.code} แล้ว รอบนี้ไม่มีค่าใช้จ่าย ไม่ต้องกรอกข้อมูลใบเสร็จหรือแนบสลิป</Alert></div>
            )}
            {toPay > 0 && (
              <>
                <div className="border-t border-slate-200 pt-4 sm:col-span-2">
                  <h3 className="font-semibold text-navy-900">ข้อมูลออกใบเสร็จ / ใบกำกับภาษี</h3>
                  <p className="text-xs text-slate-500">ค่าอบรม {formatMoney(price)} {s.vat ? `+ VAT ${cfg?.vat_rate}%` : ""}{s.wht_allowed ? ` · นิติบุคคลหัก ณ ที่จ่าย ${cfg?.wht_rate}% ได้` : ""}</p>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  {(Object.keys(BILLING_TYPE) as Billing["type"][])
                    .filter((t) => t !== "person_no_vat" || cfg?.person_no_vat)
                    .map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={billing.type === t} onChange={() => setBilling({ ...billing, type: t })} /> {BILLING_TYPE[t]}
                      </label>
                    ))}
                </div>
                <Field label={billing.type === "company" ? "ชื่อบริษัท" : "ชื่อ-นามสกุล"} required>
                  <Input value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} />
                </Field>
                {billing.type !== "person_no_vat" && (
                  <Field label="เลขประจำตัวผู้เสียภาษี" required={billing.type === "company"}>
                    <Input inputMode="numeric" maxLength={13} value={billing.tax_id ?? ""} onChange={(e) => setBilling({ ...billing, tax_id: e.target.value.replace(/\D/g, "") })} />
                  </Field>
                )}
                {billing.type === "company" && (
                  <Field label="สาขา"><Input value={billing.branch ?? ""} onChange={(e) => setBilling({ ...billing, branch: e.target.value })} /></Field>
                )}
                {billing.type !== "person_no_vat" && (
                  <div className="sm:col-span-2">
                    <Field label="ที่อยู่ออกใบกำกับภาษี" required><Textarea rows={2} value={billing.address ?? ""} onChange={(e) => setBilling({ ...billing, address: e.target.value })} /></Field>
                  </div>
                )}
                {coupons.length > 0 && promoOff === 0 && (
                  <Field label="คูปองส่วนลดค่าอบรม" hint="คูปองที่แลกจากแต้มส่วนตัว">
                    <Select value={coupon} onChange={(e) => setCoupon(e.target.value)}>
                      <option value="">ไม่ใช้คูปอง</option>
                      {coupons.map((c) => <option key={c.id} value={c.code}>{c.code} · {c.reward_name}</option>)}
                    </Select>
                  </Field>
                )}
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={wantsQuote} onChange={(e) => setWantsQuote(e.target.checked)} /> ต้องการใบเสนอราคาก่อนชำระเงิน
                </label>
              </>
            )}
            <div className="sm:col-span-2"><Field label="หมายเหตุ"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>ย้อนกลับ</Button>
            <Button onClick={next3}>ถัดไป</Button>
          </div>
        </Card>
      )}

      {step === 3 && s && (
        <Card>
          <h3 className="font-semibold text-navy-900">{s.courses.title}</h3>
          <p className="text-sm text-slate-600">{sessionDateText(s)}</p>
          <p className="text-sm text-slate-500">{s.location}</p>
          <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-500">ผู้เข้าอบรม</dt><dd>{profile?.full_name || profile?.email}</dd>
            <dt className="text-slate-500">Sale ที่เชิญ</dt><dd>{sale === "-" ? "-" : sale}</dd>
            {toPay > 0 && (<><dt className="text-slate-500">ออกใบเสร็จในนาม</dt><dd>{billing.name}{billing.tax_id ? ` · ${billing.tax_id}` : ""}</dd></>)}
          </dl>
          {breakdown && price > 0 ? (
            <div className="mt-4 max-w-sm space-y-1 rounded-xl bg-slate-50 p-4 text-sm">
              <p className="flex justify-between"><span>ค่าอบรม</span><span>{formatMoney(breakdown.price)}</span></p>
              {breakdown.discount > 0 && <p className="flex justify-between text-emerald-700"><span>{promoOff > 0 ? `ส่วนลดโค้ด ${promo?.code}` : "ส่วนลดคูปอง"}</span><span>−{formatMoney(breakdown.discount)}</span></p>}
              {breakdown.vat > 0 && <p className="flex justify-between"><span>VAT {cfg?.vat_rate}%</span><span>{formatMoney(breakdown.vat)}</span></p>}
              {breakdown.wht > 0 && <p className="flex justify-between"><span>หัก ณ ที่จ่าย {cfg?.wht_rate}%</span><span>−{formatMoney(breakdown.wht)}</span></p>}
              <p className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>ยอดชำระ</span><span>{breakdown.total > 0 ? formatMoney(breakdown.total) : "ฟรี"}</span></p>
              {breakdown.total <= 0 && <p className="pt-1 text-emerald-700">ไม่ต้องชำระเงินหรือแนบเอกสาร กดยืนยันการจองได้เลย</p>}
            </div>
          ) : (
            <p className="mt-4 text-sm font-semibold text-emerald-700">ไม่มีค่าใช้จ่าย</p>
          )}
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>ย้อนกลับ</Button>
            <Button onClick={confirm} loading={busy}>ยืนยันการจอง</Button>
          </div>
        </Card>
      )}
    </>
  );
}
