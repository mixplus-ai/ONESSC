import { useState } from "react";
import { useLocation } from "react-router-dom";
import { NextSteps } from "../../components/CareTeam";
import { Alert, Badge, Button, Card, Empty, Loading, PageTitle, cx } from "../../components/ui";
import { Stepper } from "../../components/Stepper";
import { useAuth } from "../../lib/auth";
import {
  formatBaht,
  formatDate,
  formatDateTime,
  formatQty,
  QUOTE_STATUS,
  quoteFileUrl,
  RESERVATION_STATUS,
  reservationState,
  type QuoteRequest,
  type Reservation,
} from "../../lib/catalog";
import { useRows } from "../../lib/content";
import { errorMessage, supabase } from "../../lib/supabase";

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { key: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cx("rounded-lg px-4 py-2 text-sm font-medium transition", value === t.key ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-800")}
        >
          {t.label}
          {t.count ? <span className="ml-1.5 rounded-full bg-sun-500 px-1.5 text-xs text-navy-950">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function QuoteSteps({ status }: { status: QuoteRequest["status"] }) {
  const steps = ["ส่งคำขอ", "กำลังจัดทำ", "ได้ใบเสนอราคา", "สั่งซื้อ"];
  const at = { new: 0, in_progress: 1, quoted: 2, won: 3, lost: 3, cancelled: 1 }[status];
  return <Stepper steps={steps} current={at} stopped={status === "lost" ? "ไม่ได้สั่งซื้อ" : status === "cancelled" ? "ยกเลิกคำขอแล้ว" : undefined} />;
}

function ReservationSteps({ state }: { state: ReturnType<typeof reservationState> }) {
  const steps = ["ส่งคำจอง", "ยืนยันการจอง", "บันทึกเข้าสต๊อก"];
  const at = { pending: 0, confirmed: 1, closed: 2, cancelled: 1, expired: 1 }[state];
  return <Stepper steps={steps} current={at} stopped={state === "cancelled" ? "ยกเลิกการจองแล้ว" : state === "expired" ? "การจองหมดอายุ" : undefined} />;
}

export default function MyRequests() {
  const { session } = useAuth();
  const loc = useLocation();
  const created = loc.state as { created?: string; kind?: "quote" | "reserve" } | null;
  const [tab, setTab] = useState<"quotes" | "reservations">(created?.kind === "reserve" ? "reservations" : "quotes");
  const uid = session?.user.id ?? "";
  const quotes = useRows<QuoteRequest>(
    () => supabase.from("quote_requests").select("*, quote_request_items(*)").eq("user_id", uid).order("created_at", { ascending: false }),
    [uid],
  );
  const reservations = useRows<Reservation>(
    () => supabase.from("reservations").select("*, reservation_items(*)").eq("user_id", uid).order("created_at", { ascending: false }),
    [uid],
  );
  const [err, setErr] = useState("");

  async function cancel(kind: "quote" | "reservation", id: string) {
    if (!confirm("ยืนยันยกเลิกรายการนี้?")) return;
    const { error } = await supabase.rpc("cancel_my_request", { p_kind: kind, p_id: id });
    if (error) return setErr(errorMessage(error));
    (kind === "quote" ? quotes : reservations).reload();
  }

  async function openFile(path: string) {
    const url = await quoteFileUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else setErr("เปิดไฟล์ไม่ได้ กรุณาลองใหม่");
  }

  return (
    <>
      <PageTitle title="คำขอของฉัน" subtitle="ติดตามใบเสนอราคาและการจองสินค้าที่ส่งถึงทีมขาย" />
      {created?.created && <div className="mb-4"><NextSteps kind={created.kind === "reserve" ? "reserve" : "quote"} code={created.created} /></div>}
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "quotes", label: "ใบเสนอราคา" },
          { key: "reservations", label: "การจองสินค้า" },
        ]}
      />
      {tab === "quotes" &&
        (quotes.loading ? (
          <Loading />
        ) : quotes.rows.length ? (
          <div className="space-y-3">
            {quotes.rows.map((q) => (
              <Card key={q.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold text-navy-900">{q.code}</p>
                    <p className="text-xs text-slate-500">ส่งเมื่อ {formatDateTime(q.created_at)}</p>
                  </div>
                  <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {(q.quote_request_items ?? []).map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>{i.label}</span>
                      <span className="shrink-0 text-slate-500">× {formatQty(i.qty)}</span>
                    </li>
                  ))}
                </ul>
                <QuoteSteps status={q.status} />
                {q.project_note && <p className="mt-2 text-sm text-slate-500">หมายเหตุ: {q.project_note}</p>}
                {(q.quoted_total != null || q.quote_file_path || q.staff_note) && (
                  <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                    {q.quoted_total != null && <p>ยอดเสนอราคา <b>{formatBaht(q.quoted_total)}</b></p>}
                    {q.staff_note && <p>{q.staff_note}</p>}
                    {q.quote_file_path && (
                      <button onClick={() => openFile(q.quote_file_path as string)} className="mt-1 font-semibold underline">ดาวน์โหลดใบเสนอราคา</button>
                    )}
                  </div>
                )}
                {(q.status === "new" || q.status === "in_progress") && (
                  <div className="mt-3"><Button variant="ghost" className="!px-2 !py-1 text-red-600" onClick={() => cancel("quote", q.id)}>ยกเลิกคำขอ</Button></div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Empty>ยังไม่มีคำขอใบเสนอราคา</Empty>
        ))}

      {tab === "reservations" &&
        (reservations.loading ? (
          <Loading />
        ) : reservations.rows.length ? (
          <div className="space-y-3">
            {reservations.rows.map((r) => {
              const st = reservationState(r);
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono font-semibold text-navy-900">{r.code}</p>
                      <p className="text-xs text-slate-500">จองเมื่อ {formatDateTime(r.created_at)} · กันสินค้าถึง {formatDate(r.expires_at)}</p>
                    </div>
                    <Badge tone={RESERVATION_STATUS[st].tone}>{RESERVATION_STATUS[st].label}</Badge>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {(r.reservation_items ?? []).map((i) => (
                      <li key={i.id} className="flex justify-between gap-3"><span>{i.label}</span><span className="shrink-0 text-slate-500">× {formatQty(i.qty)}</span></li>
                    ))}
                  </ul>
                  <ReservationSteps state={st} />
                  {r.note && <p className="mt-2 text-sm text-slate-500">หมายเหตุ: {r.note}</p>}
                  {r.staff_note && <p className="mt-2 rounded-lg bg-navy-50 p-3 text-sm text-navy-800">{r.staff_note}</p>}
                  {(st === "pending" || st === "confirmed") && (
                    <div className="mt-3"><Button variant="ghost" className="!px-2 !py-1 text-red-600" onClick={() => cancel("reservation", r.id)}>ยกเลิกการจอง</Button></div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Empty>ยังไม่มีการจองสินค้า</Empty>
        ))}
    </>
  );
}
