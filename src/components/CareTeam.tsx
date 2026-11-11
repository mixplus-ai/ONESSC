import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useRows, useSiteSettings } from "../lib/content";
import { errorMessage, supabase } from "../lib/supabase";
import { DEPARTMENT_LABEL, type Company, type TeamMember } from "../lib/types";
import { Avatar } from "./Avatar";
import { ChatIcon, MailIcon, PhoneIcon } from "./icons";
import { Card, Field, Select } from "./ui";

interface CareMember {
  role: "sales" | "support";
  full_name: string;
  job_title: string | null;
  phone: string | null;
  line_id: string | null;
  email: string | null;
  photo_url: string | null;
}

export const CARE_ROLE_LABEL = { sales: "เซลล์ที่ดูแล", support: "ซัพพอร์ตที่ดูแล" } as const;

const lineHref = (id: string) => (/^https?:\/\//.test(id) ? id : id.startsWith("@") ? `https://line.me/R/ti/p/${id}` : `https://line.me/ti/p/~${id}`);
const tel = (p: string) => `tel:${p.split(/[,\n/]/)[0].replace(/[^\d+]/g, "")}`;

export function CareMemberCard({ m, role }: { m: Omit<CareMember, "role">; role: CareMember["role"] }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <Avatar url={m.photo_url} name={m.full_name} className="h-14 w-14 shrink-0 text-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-sun-600">{CARE_ROLE_LABEL[role]}</p>
        <p className="truncate font-semibold text-navy-900">{m.full_name}</p>
        {m.job_title && <p className="truncate text-xs text-slate-500">{m.job_title}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {m.phone && <a href={tel(m.phone)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-slate-200 hover:ring-navy-400"><PhoneIcon className="h-3.5 w-3.5" /> {m.phone}</a>}
          {m.line_id && <a href={lineHref(m.line_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#06C755] px-3 py-1 text-xs font-semibold text-white hover:brightness-110"><ChatIcon className="h-3.5 w-3.5" /> LINE</a>}
          {m.email && <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-slate-200 hover:ring-navy-400"><MailIcon className="h-3.5 w-3.5" /> อีเมล</a>}
        </div>
      </div>
    </div>
  );
}

/** Customer side: "ทีมงานที่ดูแลคุณ" for the customer's approved company. */
export function MyCareTeam() {
  const { profile } = useAuth();
  const { company } = useSiteSettings();
  const [rows, setRows] = useState<CareMember[] | null>(null);
  const approved = profile?.company_status === "approved";
  useEffect(() => {
    if (!approved) return setRows([]);
    supabase.rpc("my_care_team").then(({ data }) => setRows((data ?? []) as CareMember[]));
  }, [approved, profile?.company_id]);
  if (!profile || rows === null) return null;
  return (
    <Card>
      <h3 className="font-semibold text-navy-900">ทีมงานที่ดูแลคุณ</h3>
      {rows.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map((m) => <CareMemberCard key={m.role} m={m} role={m.role} />)}</div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          {approved ? "ทีมงานกำลังจัดผู้ดูแลให้บริษัทของคุณ ระหว่างนี้ติดต่อเราได้ทาง " : "ผูกบัญชีกับบริษัทด้วยเลขผู้เสียภาษีด้านล่าง เมื่ออนุมัติแล้วจะเห็นเซลล์และซัพพอร์ตที่ดูแล หรือติดต่อเราได้ทาง "}
          {company.line_oa_url ? <a href={company.line_oa_url} target="_blank" rel="noreferrer" className="font-semibold text-navy-700 underline">LINE Official Account</a> : "หน้าติดต่อเรา"}
        </p>
      )}
    </Card>
  );
}

/** Staff side: pick the sales and support person for a company (saves immediately). */
export function CareTeamPicker({ company, onSaved }: { company: Company; onSaved?: (c: Company) => void }) {
  const team = useRows<TeamMember>(() => supabase.from("team_members").select("*").order("sort").order("full_name"));
  const [val, setVal] = useState({ sales: company.sales_member_id ?? "", support: company.support_member_id ?? "" });
  const [msg, setMsg] = useState("");
  useEffect(() => setVal({ sales: company.sales_member_id ?? "", support: company.support_member_id ?? "" }), [company]);
  const sorted = (dept: string[]) => [...team.rows].sort((a, b) => Number(!dept.includes(a.department)) - Number(!dept.includes(b.department)));
  const salesOpts = useMemo(() => sorted(["sales"]), [team.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const supportOpts = useMemo(() => sorted(["service", "coordination"]), [team.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(role: "sales" | "support", id: string) {
    setVal((v) => ({ ...v, [role]: id }));
    setMsg("กำลังบันทึก…");
    const col = role === "sales" ? "sales_member_id" : "support_member_id";
    const { data, error } = await supabase.from("companies").update({ [col]: id || null }).eq("id", company.id).select().single();
    if (error) return setMsg(errorMessage(error));
    setMsg("บันทึกแล้ว ลูกค้าเห็นในหน้าข้อมูลส่วนตัว");
    onSaved?.(data as Company);
  }
  const opt = (m: TeamMember) => <option key={m.id} value={m.id}>{m.full_name}{m.position ? ` · ${m.position}` : ` · ${DEPARTMENT_LABEL[m.department] ?? ""}`}{m.is_published ? "" : " (ไม่แสดงบนหน้าทีมงาน)"}</option>;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={CARE_ROLE_LABEL.sales}>
          <Select value={val.sales} onChange={(e) => save("sales", e.target.value)} disabled={team.loading}>
            <option value="">— ยังไม่กำหนด —</option>
            {salesOpts.map(opt)}
          </Select>
        </Field>
        <Field label={CARE_ROLE_LABEL.support}>
          <Select value={val.support} onChange={(e) => save("support", e.target.value)} disabled={team.loading}>
            <option value="">— ยังไม่กำหนด —</option>
            {supportOpts.map(opt)}
          </Select>
        </Field>
      </div>
      {!team.loading && !team.rows.length && <p className="mt-2 text-xs text-amber-700">ยังไม่มีรายชื่อทีมงาน เพิ่มได้ที่เมนู หน้าเว็บ → ทีมงาน</p>}
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </div>
  );
}
