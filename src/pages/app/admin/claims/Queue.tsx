import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Select, Spinner, Textarea, cx } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import {
  CLAIM_STATUS, FILE_KIND, fmtThaiTime, openClaimFile, productTypeLabel, splitSns, uploadClaimFile,
  type Claim, type ClaimEvent, type ClaimFile, type ClaimStatus,
} from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { staffName, useBoard, type StaffOpt } from "./shared";
import { SnChangeHistory, SnChangeQueue, useSnChanges } from "./SnChanges";
import type { SnChange } from "../../../../lib/claims";

const actorName = (staff: StaffOpt[], id: string | null) => {
  if (!id) return "ระบบ";
  const s = staff.find((x) => x.id === id);
  return s ? s.full_name || s.email : "ลูกค้า";
};

type QTab = "new" | "progress" | "done" | "returned" | "mine" | "all";
const QTABS: { key: QTab; label: string; match: (c: Claim, me: string) => boolean }[] = [
  { key: "new", label: "เคลมใหม่", match: (c) => c.status === "submitted" },
  { key: "progress", label: "กำลังดำเนินการ", match: (c) => c.status === "in_progress" },
  { key: "done", label: "รอลูกค้าส่งคืน", match: (c) => c.status === "done" },
  { key: "returned", label: "รอตรวจรับของคืน", match: (c) => c.status === "returned" },
  { key: "mine", label: "ที่ฉันรับผิดชอบ", match: (c, me) => c.assigned_to === me && !["closed", "rejected"].includes(c.status) },
  { key: "all", label: "ทั้งหมด", match: () => true },
];
const NEXT: Record<ClaimStatus, { to: ClaimStatus; label: string; variant?: "primary" | "secondary" | "danger" | "sun" }[]> = {
  submitted: [{ to: "in_progress", label: "เริ่มดำเนินการ", variant: "sun" }, { to: "rejected", label: "ไม่อนุมัติ", variant: "danger" }],
  in_progress: [{ to: "done", label: "ดำเนินการเสร็จ (ส่งใบเคลม)", variant: "sun" }, { to: "submitted", label: "ย้อนกลับ: เคลมใหม่", variant: "secondary" }, { to: "rejected", label: "ไม่อนุมัติ", variant: "danger" }],
  done: [{ to: "returned", label: "บันทึกว่าลูกค้าส่งคืนแล้ว", variant: "secondary" }, { to: "in_progress", label: "ย้อนกลับ: กำลังดำเนินการ", variant: "secondary" }],
  returned: [{ to: "closed", label: "ยืนยันรับของคืนครบ · ปิดงาน", variant: "sun" }, { to: "done", label: "ย้อนกลับ: รอส่งคืน", variant: "secondary" }],
  closed: [{ to: "returned", label: "เปิดงานอีกครั้ง", variant: "secondary" }],
  rejected: [{ to: "submitted", label: "เปิดเคลมอีกครั้ง", variant: "secondary" }],
};

/** Days a claim has been open (since it was reported); null once closed or rejected. */
export const openDays = (c: Claim) =>
  ["closed", "rejected"].includes(c.status) ? null : Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86_400_000);

function AgeBadge({ c }: { c: Claim }) {
  const d = openDays(c);
  if (d == null) return null;
  const cls = d > 30 ? "bg-red-100 text-red-700" : d > 7 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", cls)} title="จำนวนวันตั้งแต่แจ้งเคลม">{d === 0 ? "วันนี้" : `ค้าง ${d} วัน`}</span>;
}

function Details({ c }: { c: Claim }) {
  const d = c.details ?? {};
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div><dt className="inline text-slate-500">ผู้ติดต่อ: </dt><dd className="inline">{c.contact_name} · {c.contact_phone}{c.contact_email ? ` · ${c.contact_email}` : ""}</dd></div>
      <div><dt className="inline text-slate-500">บริษัท: </dt><dd className="inline">{c.company_name ?? "-"}{c.company_id ? "" : " (ยังไม่ผูกบริษัท)"}</dd></div>
      {c.installer_name && <div><dt className="inline text-slate-500">ผู้ติดตั้ง (EPC): </dt><dd className="inline">{c.installer_name}</dd></div>}
      {c.site_name && <div><dt className="inline text-slate-500">ไซต์งาน: </dt><dd className="inline">{c.site_name}</dd></div>}
      {d.manager_sn && <div><dt className="inline text-slate-500">S/N Manager: </dt><dd className="inline font-mono">{d.manager_sn}</dd></div>}
      {d.case_no && <div><dt className="inline text-slate-500">Case (Engineer): </dt><dd className="inline">{d.case_no}</dd></div>}
      {d.ref_inv_sn && <div><dt className="inline text-slate-500">อ้างอิง S/N Inverter: </dt><dd className="inline font-mono">{d.ref_inv_sn}</dd></div>}
      {d.items && d.items.length > 0 && (
        <div className="sm:col-span-2"><dt className="text-slate-500">Optimizer</dt>
          <dd><ul className="list-disc pl-5">{d.items.map((i, k) => <li key={k}>{i.model} × {i.qty} · เสีย <span className="font-mono">{i.bad_sn || "-"}</span>{i.ref_inv_sn ? <> · Ref Inv <span className="font-mono">{i.ref_inv_sn}</span></> : null}</li>)}</ul></dd></div>
      )}
      {(d.po_no || c.site_id) && <div><dt className="inline text-slate-500">PO / PI: </dt><dd className="inline">{d.po_no || "-"}</dd>{c.site_id && <> · <dt className="inline text-slate-500">Site ID: </dt><dd className="inline font-mono">{c.site_id}</dd></>}</div>}
      {d.units && d.units.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-slate-500">S/N และอาการรายตัว</dt>
          <dd className="mt-1 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">รุ่น</th><th className="py-1 pr-3">S/N</th><th className="py-1 pr-3">อาการ</th>{d.units.some((u) => u.volt || u.ohm) && <><th className="py-1 pr-3">V</th><th className="py-1 pr-3">Ω</th></>}</tr></thead>
              <tbody>
                {d.units.map((u, k) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1 pr-3 text-slate-400">{k + 1}</td><td className="py-1 pr-3">{u.model ?? "-"}</td><td className="py-1 pr-3 font-mono">{u.sn || "-"}</td><td className="py-1 pr-3">{u.symptom || "-"}</td>
                    {d.units!.some((x) => x.volt || x.ohm) && <><td className="py-1 pr-3">{u.volt || "-"}</td><td className="py-1 pr-3">{u.ohm || "-"}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </dd>
        </div>
      )}
      {c.symptom && <div className="sm:col-span-2"><dt className="inline text-slate-500">อาการ: </dt><dd className="inline whitespace-pre-line">{c.symptom}</dd></div>}
      <div className="sm:col-span-2"><dt className="inline text-slate-500">การรับสินค้า: </dt><dd className="inline">{c.delivery_type === "pickup" ? "รับเองที่คลัง" : `จัดส่ง · ${c.delivery_address ?? ""}`}</dd></div>
    </dl>
  );
}

function QueueCard({ c, onOpenBoard, snChanges }: { c: Claim; onOpenBoard: (id: string) => void; snChanges: SnChange[] }) {
  const { session, isAdmin, can } = useAuth();
  const { staff, canEdit, reload, brands } = useBoard();
  const me = session?.user.id ?? "";
  const mine = c.assigned_to === me;
  const canHandle = canEdit || mine;
  // ปิดงาน / เปิดงานที่ปิดแล้ว: only Admin or the staff responsible (DB enforces the same rule)
  const canClose = isAdmin || mine;
  const touchesClose = (to: ClaimStatus) => to === "closed" || c.status === "closed";
  const [open, setOpen] = useState(c.status === "submitted");
  const [files, setFiles] = useState<ClaimFile[] | null>(null);
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  const [note, setNote] = useState(c.customer_note ?? "");
  const [sns, setSns] = useState(c.reported_sns.join("\n"));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const docRef = useRef<HTMLInputElement>(null);
  const st = CLAIM_STATUS[c.status];

  const loadFiles = () => {
    supabase.from("claim_files").select("*").eq("claim_id", c.id).order("created_at").then(({ data }) => setFiles((data ?? []) as ClaimFile[]));
    supabase.from("claim_events").select("*").eq("claim_id", c.id).order("created_at").then(({ data }) => setEvents((data ?? []) as ClaimEvent[]));
  };
  useEffect(() => { if (open && files === null) loadFiles(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label: string, fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(label);
    setErr("");
    const { error } = await fn();
    setBusy("");
    if (error) return setErr(errorMessage(error));
    await reload();
  }
  const take = () => run("take", () => supabase.rpc("take_claim", { p_claim: c.id }));
  const assign = (uid: string) => run("assign", () => supabase.rpc("assign_claim", { p_claim: c.id, p_user: uid || null }));
  const setStatus = (to: ClaimStatus) => run(to, () => supabase.rpc("set_claim_status", {
    p_claim: c.id, p_status: to, p_note: note.trim() || null,
    p_reported_sns: sns.trim() === c.reported_sns.join("\n") ? null : splitSns(sns),
  }));
  async function uploadDoc(f: File) {
    setBusy("doc");
    setErr("");
    try {
      await uploadClaimFile(c.id, "claim_doc", f);
      loadFiles();
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy("");
  }

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => onOpenBoard(c.id)} className="font-mono text-lg font-bold text-navy-900 hover:underline" title="เปิดในผัง 5 ขั้น">{c.claim_no}</button>
          <p className="text-xs text-slate-500">แจ้งเมื่อ {fmtThaiTime(c.created_at)}{c.legacy_ref ? ` · อ้างอิง ${c.legacy_ref}` : ""}</p>
        </div>
        <div className="text-sm">
          <p className="font-medium text-navy-900">{[brands.find((b) => b.id === c.brand_id)?.name, productTypeLabel(c.product_type), c.model].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-slate-500">{c.qty} ชิ้น · SN {c.reported_sns.slice(0, 3).join(", ") || "-"}{c.reported_sns.length > 3 ? ` +${c.reported_sns.length - 3}` : ""}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1"><AgeBadge c={c} /><Badge tone={st.tone}>{st.label}</Badge></span>
          <span className={cx("text-xs", c.assigned_to ? "text-slate-600" : "font-semibold text-amber-700")}>{staffName(staff, c.assigned_to)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!c.assigned_to && (can("claims.handle") || canEdit) && <Button onClick={take} loading={busy === "take"}>รับเรื่อง</Button>}
        {canEdit && (
          <Select className="!w-auto !py-1.5" value={c.assigned_to ?? ""} onChange={(e) => assign(e.target.value)} aria-label="มอบหมายผู้รับผิดชอบ">
            <option value="">— มอบหมายให้ —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </Select>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-navy-700 hover:underline">{open ? "ซ่อน" : "รายละเอียด / อัปเดตสถานะ"}</button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <Details c={c} />
          <SnChangeHistory rows={snChanges} />
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">ไฟล์</p>
            {files === null ? <Spinner className="h-4 w-4" /> : files.length === 0 ? <p className="text-sm text-slate-500">ไม่มีไฟล์แนบ</p> : (
              <ul className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <li key={f.id}><button type="button" onClick={() => openClaimFile(f.path)} className="rounded-full bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200">{FILE_KIND[f.kind]} · {f.file_name ?? "ไฟล์"}</button></li>
                ))}
              </ul>
            )}
          </div>
          {canHandle ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ข้อความถึงลูกค้า" hint="แสดงในหน้าเคลมของลูกค้าและในอีเมล"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <Field label="SN ที่ต้องส่งคืน (ใช้ตรวจตอนลูกค้าส่งของกลับ)" hint="แก้ได้ถ้าลูกค้าแนบเป็นไฟล์ Excel"><Textarea rows={3} className="font-mono" value={sns} onChange={(e) => setSns(e.target.value)} /></Field>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => docRef.current?.click()} loading={busy === "doc"}>{c.claim_doc_path ? "อัปโหลดใบเคลมใหม่" : "อัปโหลดใบเคลมสินค้า"}</Button>
                {c.claim_doc_path && <button type="button" className="text-sm text-navy-700 underline" onClick={() => openClaimFile(c.claim_doc_path!)}>ดูใบเคลม</button>}
                <input ref={docRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadDoc(f); }} />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                {NEXT[c.status].filter((n) => canClose || !touchesClose(n.to)).map((n) => (
                  <Button key={n.to} variant={n.variant} onClick={() => setStatus(n.to)} loading={busy === n.to} disabled={Boolean(busy)}>{n.label}</Button>
                ))}
                {!canClose && NEXT[c.status].some((n) => touchesClose(n.to)) && (
                  <span className="self-center text-xs text-slate-500">ปิดงานได้เฉพาะ Admin หรือผู้รับผิดชอบ ({actorName(staff, c.assigned_to)})</span>
                )}
                {c.status === "closed" && c.closed_by && <span className="self-center text-xs text-slate-500">ปิดงานโดย {actorName(staff, c.closed_by)}</span>}
                {note.trim() !== (c.customer_note ?? "") && <Button variant="ghost" onClick={() => setStatus(c.status)} loading={busy === c.status}>บันทึกข้อความ</Button>}
              </div>
            </div>
          ) : (
            <Alert tone="amber">{can("claims.handle") ? "รับเรื่องก่อนจึงจะเปลี่ยนสถานะหรืออัปโหลดใบเคลมได้" : "ดูได้อย่างเดียว · ขอสิทธิ์ “รับเรื่อง เปลี่ยนสถานะ” จาก Admin เพื่อดูแลเคลม"}</Alert>
          )}
          {err && <Alert>{err}</Alert>}
          {events.length > 0 && (
            <ul className="space-y-0.5 text-xs text-slate-500">
              {events.map((e) => <li key={e.id}>{fmtThaiTime(e.created_at)} · {CLAIM_STATUS[e.status]?.label ?? e.status} · {actorName(staff, e.actor_id)}{e.note ? ` — ${e.note}` : ""}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Queue({ onOpenBoard }: { onOpenBoard: (id: string) => void }) {
  const { claims } = useBoard();
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const [tab, setTab] = useState<QTab>("new");
  const [q, setQ] = useState("");
  const [age, setAge] = useState<"" | "7" | "30">("");
  const [oldFirst, setOldFirst] = useState(false);
  const sn = useSnChanges();
  const customer = useMemo(() => claims.filter((c) => c.source === "customer").sort((a, b) => b.created_at.localeCompare(a.created_at)), [claims]);
  const t = QTABS.find((x) => x.key === tab)!;
  const needle = q.trim().toLowerCase();
  const rows = customer.filter((c) => t.match(c, me))
    .filter((c) => !age || (openDays(c) ?? -1) > Number(age))
    .filter((c) => !needle || [c.claim_no, c.company_name, c.contact_name, c.contact_phone, c.model, c.site_name, ...c.reported_sns].some((v) => v?.toLowerCase().includes(needle)));
  if (oldFirst) rows.reverse();
  const late = customer.filter((c) => (openDays(c) ?? -1) > 7).length;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {QTABS.map((x) => {
          const n = customer.filter((c) => x.match(c, me)).length;
          return (
            <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
              className={cx("rounded-lg px-3 py-1.5 text-sm font-medium", tab === x.key ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-800")}>
              {x.label}{x.key !== "all" && n > 0 && <span className="ml-1.5 rounded-full bg-sun-500 px-1.5 text-xs text-navy-950">{n}</span>}
            </button>
          );
        })}
      </div>
      <SnChangeQueue rows={sn.rows} reload={sn.reload} onOpen={onOpenBoard} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="min-w-0 flex-1" placeholder="ค้นหา เลขเคลม บริษัท ชื่อ เบอร์ รุ่น SN" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="!w-auto" value={age} onChange={(e) => setAge(e.target.value as "" | "7" | "30")} aria-label="อายุงาน">
          <option value="">ทุกอายุงาน</option>
          <option value="7">ค้างเกิน 7 วัน{late ? ` (${late})` : ""}</option>
          <option value="30">ค้างเกิน 30 วัน</option>
        </Select>
        <Select className="!w-auto" value={oldFirst ? "old" : "new"} onChange={(e) => setOldFirst(e.target.value === "old")} aria-label="เรียงลำดับ">
          <option value="new">ล่าสุดก่อน</option>
          <option value="old">ค้างนานสุดก่อน</option>
        </Select>
      </div>
      {rows.length === 0 ? <Empty>ไม่มีรายการ</Empty> : <div className="space-y-3">{rows.slice(0, 200).map((c) => <QueueCard key={c.id} c={c} onOpenBoard={onOpenBoard} snChanges={sn.rows.filter((r) => r.claim_id === c.id)} />)}</div>}
    </div>
  );
}
