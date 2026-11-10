import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ScanButton } from "../../../components/SnScanner";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Loading, PageTitle, Spinner, Textarea, cx } from "../../../components/ui";
import { CLAIM_STATUS, fmtThai, fmtThaiTime, openClaimFile, productTypeLabel, splitSns, uploadClaimFile, type MyClaim } from "../../../lib/claims";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";

const STEP_LABELS = ["กรอกแบบฟอร์มแล้ว", "กำลังดำเนินการ / เสร็จ", "ส่งของเคลมกลับ"];

/** The 3 customer steps; step 4 = closed. */
export function ClaimSteps({ status }: { status: MyClaim["status"] }) {
  const cur = CLAIM_STATUS[status].step;
  const rejected = status === "rejected";
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="ขั้นตอนเคลม">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = !rejected && (cur > n || (n === 2 && status === "done") || status === "closed");
        const active = !rejected && cur === n && !done;
        return (
          <li key={n} className="flex flex-col items-center text-center">
            <span className={cx("grid h-8 w-8 place-items-center rounded-full text-sm font-bold",
              done ? "bg-emerald-600 text-white" : active ? "bg-sun-500 text-navy-950" : rejected && n === 1 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-500")}>
              {done ? "✓" : n}
            </span>
            <span className={cx("mt-1 text-xs", active || done ? "font-medium text-navy-900" : "text-slate-500")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ReturnForm({ c, onDone }: { c: MyClaim; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setErr("");
    const sns = splitSns(text);
    if (!sns.length) return setErr("กรุณากรอก SN ของตัวเก่าที่ส่งคืน");
    setBusy(true);
    const { error } = await supabase.rpc("return_claim", { p_claim: c.id, p_sns: sns });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }
  return (
    <div className="mt-4 rounded-xl bg-sun-500/10 p-4">
      <p className="text-sm font-semibold text-navy-900">ขั้นที่ 3: ส่งของเคลมกลับ</p>
      <p className="mt-1 text-xs text-slate-600">กรอก SN ของตัวเก่าที่ส่งคืน {c.reported_sns.length > 1 ? `ให้ครบ ${c.reported_sns.length} ตัว ` : ""}ต้องตรงกับ SN ที่แจ้งเคลมไว้ ไม่เช่นนั้นจะส่งไม่ได้</p>
      <div className="mt-3 flex gap-2">
        <Textarea rows={Math.min(6, Math.max(2, c.reported_sns.length))} className="font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์หรือสแกน SN ทีละบรรทัด" />
        <ScanButton multi onScan={(sn) => setText((t) => (t.trim() ? `${t.trim()}\n${sn}` : sn))} />
      </div>
      {err && <div className="mt-2"><Alert>{err}</Alert></div>}
      <Button className="mt-3" onClick={send} loading={busy}>ยืนยันส่งของคืน</Button>
    </div>
  );
}

function AddFiles({ c, onDone }: { c: MyClaim; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function up(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setErr("");
    try {
      for (const f of [...list]) await uploadClaimFile(c.id, "customer", f);
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
  }
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />}แนบไฟล์เพิ่ม
      </button>
      <input ref={ref} type="file" hidden multiple accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={(e) => { up(e.target.files); e.target.value = ""; }} />
      {err && <span className="text-xs text-red-600">{err}</span>}
    </>
  );
}

function ClaimCard({ c, onChanged }: { c: MyClaim; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const st = CLAIM_STATUS[c.status];
  const doc = c.files.find((f) => f.kind === "claim_doc" && f.path === c.claim_doc_path) ?? c.files.find((f) => f.kind === "claim_doc");
  const optItems = c.details.items ?? [];
  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg font-bold text-navy-900">{c.claim_no}</p>
          <p className="text-xs text-slate-500">แจ้งเมื่อ {fmtThaiTime(c.created_at)}{!c.mine && " · แจ้งโดยเพื่อนร่วมบริษัท"}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-700">
        {[c.brand, productTypeLabel(c.product_type), c.model].filter(Boolean).join(" · ")} · {c.qty} ชิ้น
        {c.site_name && <span className="text-slate-500"> · ไซต์ {c.site_name}</span>}
      </p>
      <div className="mt-4"><ClaimSteps status={c.status} /></div>

      {c.customer_note && <div className="mt-4"><Alert tone={c.status === "rejected" ? "red" : "navy"}><span className="whitespace-pre-line">{c.customer_note}</span></Alert></div>}
      {(c.status === "done" || c.status === "returned" || c.status === "closed") && doc && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">ใบเคลมสินค้าพร้อมแล้ว นำไปแจ้งรับสินค้าได้{c.delivery_type === "pickup" ? " ที่คลัง" : ""}</p>
          <Button variant="secondary" onClick={() => openClaimFile(doc.path)}>ดาวน์โหลดใบเคลม</Button>
        </div>
      )}
      {c.status === "done" && <ReturnForm c={c} onDone={onChanged} />}
      {c.status === "returned" && <p className="mt-4 text-sm text-slate-600">ส่ง SN คืนแล้ว {c.returned_sns?.join(", ")} · รอทีมงานตรวจรับเพื่อปิดงาน</p>}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-navy-700 hover:underline">{open ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}</button>
        {c.mine && (c.status === "submitted" || c.status === "in_progress") && <AddFiles c={c} onDone={onChanged} />}
      </div>
      {open && (
        <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
          <dl className="space-y-1">
            <div><dt className="inline text-slate-500">ผู้ติดต่อ: </dt><dd className="inline">{c.contact_name} · {c.contact_phone}</dd></div>
            {c.company_name && <div><dt className="inline text-slate-500">บริษัท: </dt><dd className="inline">{c.company_name}</dd></div>}
            {c.installer_name && <div><dt className="inline text-slate-500">ผู้ติดตั้ง: </dt><dd className="inline">{c.installer_name}</dd></div>}
            {c.case_id && <div><dt className="inline text-slate-500">Case: </dt><dd className="inline">{c.case_id}</dd></div>}
            {c.reported_sns.length > 0 && <div><dt className="inline text-slate-500">SN ที่แจ้ง: </dt><dd className="inline font-mono">{c.reported_sns.join(", ")}</dd></div>}
            {optItems.length > 0 && (
              <div><dt className="text-slate-500">รายการ Optimizer</dt>
                <dd><ul className="list-disc pl-5">{optItems.map((i, k) => <li key={k}>{i.model} × {i.qty}{i.ref_inv_sn ? ` · Ref Inv ${i.ref_inv_sn}` : ""}</li>)}</ul></dd></div>
            )}
            {c.symptom && <div><dt className="inline text-slate-500">อาการ: </dt><dd className="inline whitespace-pre-line">{c.symptom}</dd></div>}
            <div><dt className="inline text-slate-500">การรับสินค้า: </dt><dd className="inline">{c.delivery_type === "pickup" ? "รับเองที่คลัง" : `จัดส่ง · ${c.delivery_address ?? ""}`}</dd></div>
            {c.handler && <div><dt className="inline text-slate-500">ผู้รับเรื่อง: </dt><dd className="inline">{c.handler}</dd></div>}
          </dl>
          <div>
            <p className="text-slate-500">ประวัติสถานะ</p>
            <ul className="mt-1 space-y-1">
              {c.events.map((e, i) => (
                <li key={i}><span className="text-xs text-slate-500">{fmtThaiTime(e.at)}</span> · {CLAIM_STATUS[e.status]?.label ?? e.status}{e.note ? ` — ${e.note}` : ""}</li>
              ))}
            </ul>
            {c.files.length > 0 && (
              <>
                <p className="mt-3 text-slate-500">ไฟล์</p>
                <ul className="mt-1 space-y-1">
                  {c.files.map((f) => (
                    <li key={f.id}><button type="button" className="text-navy-700 underline" onClick={() => openClaimFile(f.path)}>{f.kind === "claim_doc" ? "ใบเคลมสินค้า" : f.file_name ?? "ไฟล์"}</button> <span className="text-xs text-slate-500">{fmtThai(f.created_at)}</span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function MyClaims() {
  const loc = useLocation();
  const st = loc.state as { created?: string; failed?: string[] } | null;
  const list = useRows<MyClaim>(async () => {
    const { data, error } = await supabase.rpc("my_claims");
    return { data: (data ?? []) as MyClaim[], error };
  });
  const [filter, setFilter] = useState<"open" | "all">("open");
  const rows = list.rows.filter((c) => filter === "all" || !["closed", "rejected"].includes(c.status));

  return (
    <>
      <PageTitle title="เคลมของฉัน" subtitle="ติดตามสถานะเคลมของคุณและของบริษัท" actions={<ButtonLink to="/app/claims/new" variant="sun">+ แจ้งเคลม</ButtonLink>} />
      {st?.created && (
        <div className="mb-4">
          <Alert tone="green">ส่งแจ้งเคลมแล้ว เลขเคลมของคุณคือ <span className="font-mono font-bold">{st.created}</span> ทีมงานจะติดต่อกลับโดยเร็ว</Alert>
          {st.failed && st.failed.length > 0 && <div className="mt-2"><Alert tone="amber">อัปโหลดไฟล์ไม่สำเร็จ: {st.failed.join(", ")} กรุณากด "แนบไฟล์เพิ่ม" อีกครั้ง</Alert></div>}
        </div>
      )}
      <div className="mb-4 flex gap-2 text-sm">
        {(["open", "all"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3 py-1", filter === k ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-700")}>
            {k === "open" ? "กำลังดำเนินการ" : "ทั้งหมด"}
          </button>
        ))}
      </div>
      {list.loading ? <Loading /> : list.error ? <Alert>{errorMessage(list.error)}</Alert> : rows.length === 0 ? (
        <Empty>
          {filter === "open" && list.rows.length ? "ไม่มีเคลมที่ค้างอยู่" : "ยังไม่มีรายการเคลม"} ·{" "}
          <Link to="/app/claims/new" className="font-semibold text-navy-700 underline">แจ้งเคลมใหม่</Link>
        </Empty>
      ) : (
        <div className="space-y-4">{rows.map((c) => <ClaimCard key={c.id} c={c} onChanged={list.reload} />)}</div>
      )}
      <p className="mt-6 text-xs text-slate-500">สอบถามเพิ่มเติม ติดต่อฝ่ายบริการผ่าน LINE OA หรือ <Link to="/contact?topic=service" className="underline">หน้าติดต่อเรา</Link></p>
    </>
  );
}
