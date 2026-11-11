import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gate } from "../../../components/AppLayout";
import { Avatar } from "../../../components/Avatar";
import { CareTeamPicker } from "../../../components/CareTeam";
import { Badge, Card, Empty, Input, Loading, PageTitle, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { supabase } from "../../../lib/supabase";
import { COMPANY_STATUS_LABEL, type Company, type Profile } from "../../../lib/types";

const BILLING_TYPE = { company: "นิติบุคคล", person: "บุคคลธรรมดา (ใบกำกับภาษี)", person_no_vat: "บุคคลธรรมดา (ไม่รับใบกำกับ)" } as const;
const STATUS_TONE = { none: "slate", pending: "amber", approved: "green", rejected: "red" } as const;

/** Staff/Admin: look up a customer's profile, company and billing details, and set the company's care team. */
export default function Customers() {
  const { can } = useAuth();
  const users = useRows<Profile>(() => supabase.from("profiles").select("*").eq("role", "user").order("created_at", { ascending: false }));
  const companies = useRows<Company>(() => supabase.from("companies").select("*"));
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(companies.rows.map((c) => [c.id, c])), [companies.rows]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return users.rows.filter((u) => {
      if (!s) return true;
      const co = u.company_id ? byId.get(u.company_id)?.name : u.company_name;
      return [u.full_name, u.email, u.line_id, co].some((x) => x?.toLowerCase().includes(s)) || (!!digits && [u.phone, u.tax_id].some((x) => x?.replace(/\D/g, "").includes(digits)));
    });
  }, [users.rows, q, byId]);
  const sel = users.rows.find((u) => u.id === selId) ?? null;
  useEffect(() => {
    if (!selId && hits.length && window.matchMedia("(min-width: 1024px)").matches) setSelId(hits[0].id);
  }, [hits, selId]);

  return (
    <Gate allow={can("companies")}>
      <PageTitle title="ลูกค้า" subtitle="ดูข้อมูลส่วนตัว บริษัท และข้อมูลออกใบกำกับของลูกค้า และกำหนดเซลล์/ซัพพอร์ตที่ดูแล" />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className={cx(sel && "hidden lg:block")}>
          <Input type="search" placeholder="ค้นหาชื่อ อีเมล เบอร์ บริษัท หรือเลขผู้เสียภาษี" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="mt-2 px-1 text-xs text-slate-500">{users.loading ? "กำลังโหลด…" : `${hits.length.toLocaleString("th-TH")} คน`}</p>
          <div className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto">
            {users.loading ? <Loading /> : hits.slice(0, 200).map((u) => {
              const co = u.company_id ? byId.get(u.company_id)?.name : u.company_name;
              return (
                <button key={u.id} onClick={() => setSelId(u.id)} className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", selId === u.id ? "bg-navy-800 text-white" : "hover:bg-white")}>
                  <Avatar url={u.avatar_url} name={u.full_name || u.email} className="h-9 w-9 shrink-0 text-xs" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.full_name || u.email}</span>
                    <span className={cx("block truncate text-xs", selId === u.id ? "text-navy-100" : "text-slate-500")}>{co || u.email}</span>
                  </span>
                </button>
              );
            })}
            {!users.loading && !hits.length && <p className="px-3 text-sm text-slate-500">ไม่พบลูกค้า</p>}
          </div>
        </div>
        <div>
          {sel ? (
            <CustomerDetail
              u={sel}
              company={sel.company_id ? byId.get(sel.company_id) ?? null : null}
              onBack={() => setSelId(null)}
              onCompany={() => companies.reload()}
            />
          ) : (
            <div className="hidden lg:block"><Empty>เลือกลูกค้าจากรายการด้านซ้าย</Empty></div>
          )}
        </div>
      </div>
    </Gate>
  );
}

function CustomerDetail({ u, company, onBack, onCompany }: { u: Profile; company: Company | null; onBack: () => void; onCompany: () => void }) {
  const { can } = useAuth();
  const b = u.billing;
  const rows: [string, string | null | undefined][] = [
    ["อีเมล", u.email],
    ["เบอร์โทร", u.phone],
    ["LINE ID", u.line_id],
    ["ตำแหน่ง", u.position],
    ["ชื่อภาษาอังกฤษ", u.name_en],
    ["สมัครเมื่อ", new Date(u.created_at).toLocaleDateString("th-TH", { dateStyle: "medium" })],
  ];
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-navy-700 lg:hidden">← กลับไปรายชื่อ</button>
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar url={u.avatar_url} name={u.full_name || u.email} className="h-16 w-16 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-navy-900">{u.full_name || "-"}</p>
            <p className="text-sm text-slate-500">{u.email}</p>
          </div>
          {!u.is_active && <Badge tone="red">ถูกระงับ</Badge>}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
              <dd className="min-w-0 break-words text-navy-900">{k === "เบอร์โทร" && v ? <a href={`tel:${v}`} className="hover:underline">{v}</a> : k === "อีเมล" && v ? <a href={`mailto:${v}`} className="hover:underline">{v}</a> : v || "-"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-navy-900">บริษัท</h3>
          <Badge tone={STATUS_TONE[u.company_status]}>{COMPANY_STATUS_LABEL[u.company_status]}</Badge>
        </div>
        <p className="mt-2 text-navy-900">{company?.name ?? u.company_name ?? "ยังไม่ระบุบริษัท"}</p>
        {(company?.tax_id ?? u.tax_id) && <p className="text-sm text-slate-500">เลขผู้เสียภาษี {company?.tax_id ?? u.tax_id}</p>}
        {u.company_status === "pending" && (
          <p className="mt-2 text-sm text-amber-700">
            รออนุมัติผูกบริษัท {can("companies") && <Link to="/app/admin/companies" className="font-semibold underline">ไปหน้าอนุมัติ</Link>}
          </p>
        )}
        {company && u.company_status === "approved" ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-3 text-sm text-slate-500">ทีมงานที่ดูแลบริษัทนี้ (ลูกค้าทุกคนในบริษัทจะเห็นในหน้าข้อมูลส่วนตัว)</p>
            <CareTeamPicker company={company} onSaved={onCompany} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">กำหนดเซลล์/ซัพพอร์ตได้หลังอนุมัติผูกบริษัท</p>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold text-navy-900">ข้อมูลออกใบเสร็จ / ใบกำกับภาษี</h3>
        {b ? (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {([
              ["ประเภท", BILLING_TYPE[b.type]],
              ["ชื่อ", b.name],
              ["เลขผู้เสียภาษี", b.tax_id],
              ["สาขา", b.branch],
              ["ที่อยู่", b.address],
              ["เบอร์โทร", b.phone],
              ["อีเมลรับเอกสาร", b.email],
            ] as [string, string | undefined][]).map(([k, v]) => (
              <div key={k} className={cx("flex gap-2", k === "ที่อยู่" && "sm:col-span-2")}>
                <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
                <dd className="min-w-0 break-words whitespace-pre-line text-navy-900">{v || "-"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">ลูกค้ายังไม่ได้กรอก</p>
        )}
      </Card>
    </div>
  );
}
