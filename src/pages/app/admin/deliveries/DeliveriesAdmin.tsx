import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gate } from "../../../../components/AppLayout";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Input, Loading, Modal, PageTitle, Select, cx } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import {
  DELIVERY_SELECT,
  DELIVERY_STATUS,
  docBase,
  emptyDraft,
  loadDeliveries,
  openDeliveryFile,
  readDeliveryPdf,
  saveDelivery,
  sumQty,
  sumWatt,
  type Delivery,
  type DeliveryDraft,
  type DeliveryStatus,
} from "../../../../lib/deliveries";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { todayBkk } from "../../../../lib/training";
import DeliveryForm from "./DeliveryForm";

const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "2-digit" });
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
};
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
};
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const watt = (w: number) => (w >= 1000 ? `${fmt(Math.round(w / 10) / 100)} kW` : `${fmt(w)} W`);

const toDraft = (d: Delivery): DeliveryDraft => ({
  ...d,
  delivery_items: d.delivery_items.map((i) => ({ ...i, description: i.description ?? "", unit_watt: i.unit_watt == null ? null : Number(i.unit_watt), qty: Number(i.qty), total_watt: i.total_watt == null ? null : Number(i.total_watt) })),
  file: null,
  warnings: [],
});

export default function DeliveriesAdmin() {
  const { isAdmin, can } = useAuth();
  const canManage = can("deliveries.manage");
  const [month, setMonth] = useState(todayBkk().slice(0, 7));
  const [day, setDay] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [rows, setRows] = useState<Delivery[]>([]);
  const [hits, setHits] = useState<Delivery[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [queue, setQueue] = useState<DeliveryDraft[]>([]);
  const [reading, setReading] = useState(0);
  const [edit, setEdit] = useState<DeliveryDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await loadDeliveries(`${month}-01`, monthEnd(month));
    setLoading(false);
    if (error) return setErr(errorMessage(error));
    setErr("");
    setRows(data ?? []);
  }, [month]);
  useEffect(() => {
    reload();
  }, [reload]);

  // search across every month by document number, customer, site or model
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setHits(null);
    const t = setTimeout(async () => {
      const like = `%${term.replace(/[%_,()]/g, " ")}%`;
      const [a, b] = await Promise.all([
        supabase.from("deliveries").select(DELIVERY_SELECT).or(`doc_no.ilike.${like},customer_name.ilike.${like},site.ilike.${like},contact_name.ilike.${like}`).order("delivery_date", { ascending: false }).limit(100).returns<Delivery[]>(),
        supabase.from("delivery_items").select("delivery_id").ilike("model", like).limit(200),
      ]);
      const ids = [...new Set((b.data ?? []).map((r) => r.delivery_id as string))].filter((id) => !(a.data ?? []).some((d) => d.id === id));
      const more = ids.length ? (await supabase.from("deliveries").select(DELIVERY_SELECT).in("id", ids.slice(0, 100)).returns<Delivery[]>()).data ?? [] : [];
      setHits([...(a.data ?? []), ...more].sort((x, y) => y.delivery_date.localeCompare(x.delivery_date)));
    }, 300);
    return () => clearTimeout(t);
  }, [q, rows]);

  const shown = useMemo(() => {
    const base = hits ?? rows.filter((r) => !day || r.delivery_date === day);
    return base.filter((r) => status === "all" || r.status === status);
  }, [hits, rows, day, status]);
  const byDay = useMemo(() => {
    const m = new Map<string, Delivery[]>();
    for (const r of shown) m.set(r.delivery_date, [...(m.get(r.delivery_date) ?? []), r]);
    return [...m.entries()].sort((a, b) => (hits ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
  }, [shown, hits]);
  const active = rows.filter((r) => r.status !== "cancelled");
  const stats = {
    count: active.length,
    qty: active.reduce((s, r) => s + sumQty(r.delivery_items), 0),
    watt: active.reduce((s, r) => s + sumWatt(r.delivery_items), 0),
    waiting: rows.filter((r) => r.status === "waiting").length,
  };

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setReading(files.length);
    setNote("");
    const drafts: DeliveryDraft[] = [];
    for (const f of Array.from(files)) {
      try {
        const d = f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? await readDeliveryPdf(f) : { ...emptyDraft(), file: f, file_name: f.name, warnings: ["ไฟล์รูปภาพ ระบบอ่านอัตโนมัติไม่ได้ กรุณากรอกข้อมูลเอง (ไฟล์จะถูกแนบไว้)"] };
        drafts.push(await enrich(d));
      } catch (x) {
        drafts.push({ ...emptyDraft(), file: f, file_name: f.name, warnings: [`อ่านไฟล์ ${f.name} ไม่ได้: ${errorMessage(x)}`] });
      }
    }
    setReading(0);
    setQueue((q) => [...q, ...drafts]);
  }

  /** Use the registered company name when the tax ID matches, and flag a newer revision of a saved document. */
  async function enrich(d: DeliveryDraft): Promise<DeliveryDraft> {
    const warnings = [...d.warnings];
    if (d.customer_tax_id && /^\d{13}$/.test(d.customer_tax_id)) {
      const { data } = await supabase.from("companies").select("name").eq("tax_id", d.customer_tax_id).maybeSingle();
      if (data?.name) {
        d = { ...d, customer_name: data.name };
        const k = warnings.findIndex((w) => w.includes("ตัวสะกด"));
        if (k >= 0) warnings.splice(k, 1, "ใช้ชื่อลูกค้าจากบริษัทที่ลงทะเบียนในระบบ (ตรงตามเลขผู้เสียภาษี) ตรวจที่อยู่ภาษาไทยอีกครั้ง");
      }
    }
    if (d.doc_no) {
      const base = docBase(d.doc_no);
      const { data } = await supabase.from("deliveries").select("doc_no, delivery_date").ilike("doc_no", `${base}%`);
      const old = (data ?? []).find((r) => docBase(r.doc_no) === base);
      if (old) warnings.unshift(`มีเอกสาร ${old.doc_no} (ส่ง ${dayLabel(old.delivery_date)}) อยู่แล้ว บันทึกครั้งนี้จะอัปเดตรายการเดิมแทนการเพิ่มใหม่`);
    }
    return { ...d, warnings };
  }

  const cur = queue[0];
  async function saveDraft(d: DeliveryDraft, after: () => void) {
    if (!d.delivery_date) return setErr("กรุณาเลือกวันส่ง");
    if (!d.customer_name.trim()) return setErr("กรุณากรอกชื่อลูกค้า");
    setErr("");
    try {
      const r = await saveDelivery(d);
      setNote(`${r.replaced ? "อัปเดต" : "บันทึก"} ${d.doc_no || d.customer_name} ส่งวันที่ ${dayLabel(d.delivery_date)} แล้ว`);
      setMonth(d.delivery_date.slice(0, 7));
      setDay(d.delivery_date);
      after();
      reload();
    } catch (x) {
      setErr(errorMessage(x));
    }
  }

  async function quickStatus(r: Delivery, s: DeliveryStatus) {
    const { error } = await supabase.from("deliveries").update({ status: s }).eq("id", r.id);
    if (error) return setErr(errorMessage(error));
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: s } : x)));
    setHits((list) => list && list.map((x) => (x.id === r.id ? { ...x, status: s } : x)));
  }

  async function remove(d: DeliveryDraft) {
    if (!d.id || !confirm(`ลบรายการส่งสินค้า ${d.doc_no || d.customer_name}?`)) return;
    const { error } = await supabase.from("deliveries").delete().eq("id", d.id);
    if (error) return setErr(errorMessage(error));
    if (d.file_path) await supabase.storage.from("delivery-files").remove([d.file_path]);
    setEdit(null);
    reload();
  }

  return (
    <Gate allow={can("deliveries.view") || can("deliveries.manage")}>
      <PageTitle
        title="ตารางส่งสินค้า"
        subtitle="อัปโหลดใบส่งสินค้า (PDF) ระบบอ่านรายละเอียดและวันส่งให้ ตรวจแล้วบันทึกลงปฏิทิน · เห็นเฉพาะผู้ที่ได้รับสิทธิ์"
        actions={canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEdit(emptyDraft())}>+ เพิ่มเอง</Button>
            <Button variant="sun" onClick={() => fileRef.current?.click()} loading={reading > 0}>อัปโหลดใบส่งสินค้า</Button>
          </div>
        )}
      />
      <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}
      {note && <div className="mb-4"><Alert tone="green">{note}</Alert></div>}
      {reading > 0 && <div className="mb-4"><Alert tone="navy">กำลังอ่านเอกสาร {reading} ไฟล์…</Alert></div>}

      {canManage && <div
        className="mb-5 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
      >
        ลากไฟล์ใบส่งสินค้ามาวางที่นี่ได้หลายไฟล์พร้อมกัน หรือกด <button className="font-semibold text-navy-700 underline" onClick={() => fileRef.current?.click()}>เลือกไฟล์</button>
      </div>}

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [stats.count.toLocaleString(), `รายการส่งใน${monthLabel(month)}`],
          [fmt(stats.qty), "จำนวนสินค้ารวม (PCS)"],
          [watt(stats.watt), "กำลังวัตต์รวม"],
          [stats.waiting.toLocaleString(), "รอข้อมูล/รอรถ"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-xl font-bold text-navy-900">{v}</p>
            <p className="text-xs text-slate-500">{l}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-20">
          <MonthCalendar month={month} onMonth={(m) => { setMonth(m); setDay(""); }} day={day} onDay={setDay} rows={rows} />
          <div className="rounded-2xl bg-white p-4 text-xs ring-1 ring-slate-200">
            <p className="mb-2 font-semibold text-navy-900">สีตามสถานะ</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(DELIVERY_STATUS) as DeliveryStatus[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DELIVERY_STATUS[k].color }} />{DELIVERY_STATUS[k].label}</span>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input className="min-w-[12rem] flex-1" type="search" placeholder="ค้นหาทุกเดือน: เลข PI ลูกค้า สถานที่ หรือรุ่นสินค้า" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus | "all")} aria-label="สถานะ">
              <option value="all">ทุกสถานะ</option>
              {(Object.keys(DELIVERY_STATUS) as DeliveryStatus[]).map((k) => <option key={k} value={k}>{DELIVERY_STATUS[k].label}</option>)}
            </Select>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            {hits ? `ผลค้นหา ${shown.length} รายการ` : day ? <>วันที่ {dayLabel(day)} · <button className="underline" onClick={() => setDay("")}>ดูทั้งเดือน</button></> : `ทั้งเดือน${monthLabel(month)}`}
          </p>
          {loading && !hits ? (
            <Loading />
          ) : byDay.length === 0 ? (
            <Empty>{hits ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีรายการส่งสินค้าในช่วงนี้ อัปโหลดใบส่งสินค้าเพื่อเพิ่มลงปฏิทิน"}</Empty>
          ) : (
            <div className="space-y-6">
              {byDay.map(([date, list]) => (
                <section key={date}>
                  <h3 className={cx("mb-2 text-sm font-semibold", date === todayBkk() ? "text-sun-600" : "text-navy-900")}>
                    {dayLabel(date)}{date === todayBkk() && " · วันนี้"} <span className="font-normal text-slate-400">({list.length} รายการ)</span>
                  </h3>
                  <div className="space-y-2">
                    {list.map((r) => <DeliveryCard key={r.id} r={r} onOpen={() => setEdit(toDraft(r))} onStatus={canManage ? (s) => quickStatus(r, s) : undefined} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* review scanned documents one at a time */}
      <Modal
        open={Boolean(cur)}
        onClose={() => setQueue([])}
        wide
        title={`ตรวจข้อมูลจากเอกสาร${queue.length > 1 ? ` (เหลือ ${queue.length} ไฟล์)` : ""}: ${cur?.file_name ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQueue((q) => q.slice(1))}>ข้ามไฟล์นี้</Button>
            <Button onClick={() => cur && saveDraft(cur, () => setQueue((q) => q.slice(1)))}>บันทึกลงปฏิทิน</Button>
          </>
        }
      >
        {cur && <DeliveryForm d={cur} onChange={(d) => setQueue((q) => [d, ...q.slice(1)])} />}
      </Modal>

      {/* view / edit a saved delivery */}
      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        wide
        title={edit?.id ? `รายการส่งสินค้า ${edit.doc_no ?? ""}` : "เพิ่มรายการส่งสินค้า"}
        footer={
          edit && (
            <>
              {isAdmin && edit.id && <Button variant="ghost" className="mr-auto !text-red-600" onClick={() => remove(edit)}>ลบ</Button>}
              {edit.id && (can("stock.docs") || can("stock.post")) && <ButtonLink variant="secondary" to={`/app/admin/stock-docs?tab=docs&new=SO&delivery=${edit.id}`}>สร้างใบขาย / สแกน SN ตัดสต๊อก</ButtonLink>}
              {edit.file_path && <Button variant="secondary" onClick={() => openDeliveryFile(edit.file_path!).catch((x) => setErr(errorMessage(x)))}>เปิดไฟล์เอกสาร</Button>}
              {canManage && <label className="inline-flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-navy-700 hover:bg-slate-100">
                {edit.file ? `แนบ: ${edit.file.name}` : edit.file_path ? "เปลี่ยนไฟล์" : "แนบไฟล์"}
                <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setEdit({ ...edit, file: f }); e.target.value = ""; }} />
              </label>}
              {canManage ? <Button onClick={() => saveDraft(edit, () => setEdit(null))}>บันทึก</Button> : <Button variant="ghost" onClick={() => setEdit(null)}>ปิด</Button>}
            </>
          )
        }
      >
        {edit && <DeliveryForm d={edit} onChange={setEdit} />}
      </Modal>
    </Gate>
  );
}

function DeliveryCard({ r, onOpen, onStatus }: { r: Delivery; onOpen: () => void; onStatus?: (s: DeliveryStatus) => void }) {
  const st = DELIVERY_STATUS[r.status];
  const qty = sumQty(r.delivery_items);
  const w = sumWatt(r.delivery_items);
  return (
    <Card className={cx("!p-4", r.status === "cancelled" && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: st.color }} />
            <span className="font-semibold text-navy-900">{r.customer_name}</span>
            {r.doc_no && <span className="font-mono text-xs text-slate-500">{r.doc_no}</span>}
          </div>
          <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">
            {r.delivery_items.slice(0, 3).map((i) => (
              <li key={i.id ?? i.model} className="truncate">
                <span className="font-mono">{i.model}</span> × {fmt(Number(i.qty))}
                {i.total_watt ? <span className="text-slate-500"> ({watt(Number(i.total_watt))})</span> : null}
              </li>
            ))}
            {r.delivery_items.length > 3 && <li className="text-xs text-slate-500">และอีก {r.delivery_items.length - 3} รายการ</li>}
          </ul>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
            {r.site && <span>สถานที่: {r.site}</span>}
            {r.warehouse && <span>{r.warehouse}</span>}
            {r.contact_name && <span>ติดต่อ: {r.contact_name} {r.contact_phone}</span>}
            <span>รวม {fmt(qty)} ชิ้น{w ? ` · ${watt(w)}` : ""}</span>
          </p>
          {r.notes && <p className="mt-1 text-xs whitespace-pre-line text-amber-700">{r.notes}</p>}
        </button>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          {onStatus && (
            <Select className="!w-auto !py-1 text-xs" value={r.status} onChange={(e) => onStatus(e.target.value as DeliveryStatus)} aria-label="เปลี่ยนสถานะ">
              {(Object.keys(DELIVERY_STATUS) as DeliveryStatus[]).map((k) => <option key={k} value={k}>{DELIVERY_STATUS[k].label}</option>)}
            </Select>
          )}
        </div>
      </div>
    </Card>
  );
}

function MonthCalendar({ month, onMonth, day, onDay, rows }: { month: string; onMonth: (m: string) => void; day: string; onDay: (d: string) => void; rows: Delivery[] }) {
  const [y, mo] = month.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const byDay = new Map<string, Delivery[]>();
  for (const r of rows) byDay.set(r.delivery_date, [...(byDay.get(r.delivery_date) ?? []), r]);
  const today = todayBkk();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="เดือนก่อน" onClick={() => onMonth(shiftMonth(month, -1))} className="rounded-lg px-2.5 py-1 text-lg text-slate-600 hover:bg-slate-100">‹</button>
        <button type="button" className="font-semibold text-navy-900" onClick={() => { onMonth(today.slice(0, 7)); onDay(today); }} title="ไปวันนี้">{monthLabel(month)}</button>
        <button type="button" aria-label="เดือนถัดไป" onClick={() => onMonth(shiftMonth(month, 1))} className="rounded-lg px-2.5 py-1 text-lg text-slate-600 hover:bg-slate-100">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">{WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const list = byDay.get(d) ?? [];
          const selected = d === day;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onDay(selected ? "" : d)}
              title={list.map((r) => r.customer_name).join(", ")}
              className={cx(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg",
                selected ? "bg-navy-800 font-semibold text-white" : list.length ? "font-semibold text-navy-900 hover:bg-navy-50" : d < today ? "text-slate-300" : "text-slate-500 hover:bg-slate-50",
                d === today && !selected && "ring-1 ring-sun-400",
              )}
            >
              {Number(d.slice(8))}
              {list.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {list.slice(0, 4).map((r) => <span key={r.id} className="h-1.5 w-1.5 rounded-full" style={{ background: selected ? "#fff" : DELIVERY_STATUS[r.status].color }} />)}
                </span>
              )}
              {list.length > 4 && <span className={cx("absolute top-0.5 right-1 text-[9px]", selected ? "text-white" : "text-slate-500")}>{list.length}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">กดวันที่เพื่อดูรายการส่งของวันนั้น กดชื่อเดือนเพื่อกลับวันนี้</p>
    </div>
  );
}

