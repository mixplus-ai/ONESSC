import { useMemo, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, Card, Empty, Input, Loading, PageTitle, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { Avatar } from "../../../components/Avatar";
import { CARE_ROLE_LABEL, CareTeamPicker } from "../../../components/CareTeam";
import type { Company, Profile, TeamMember } from "../../../lib/types";

function PendingList({ onChange }: { onChange: () => void }) {
  const pending = useRows<Profile>(() =>
    supabase.from("profiles").select("*").eq("company_status", "pending").order("updated_at"),
  );
  const companies = useRows<Company>(() => supabase.from("companies").select("*"));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function review(u: Profile, approve: boolean) {
    setBusy(u.id);
    setErr("");
    const { error } = await supabase.rpc("review_company_link", { p_user_id: u.id, p_approve: approve });
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    pending.reload();
    companies.reload();
    onChange();
  }

  if (pending.loading) return <Loading />;
  if (!pending.rows.length) return <Empty>ไม่มีคำขอผูกบริษัทที่รออนุมัติ</Empty>;
  return (
    <div className="space-y-3">
      {err && <Alert>{err}</Alert>}
      {pending.rows.map((u) => {
        const existing = companies.rows.find((c) => c.tax_id === u.tax_id);
        const nameDiffers = existing && existing.name.trim() !== (u.company_name ?? "").trim();
        return (
          <Card key={u.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-navy-900">{u.company_name}</p>
                <p className="text-sm text-slate-600">เลขผู้เสียภาษี {u.tax_id}</p>
                <p className="mt-1 text-sm text-slate-500">ขอโดย {u.full_name || "-"} · {u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                {existing ? (
                  <p className={cx("mt-2 text-xs", nameDiffers ? "text-amber-700" : "text-emerald-700")}>
                    มีบริษัทนี้ในระบบแล้ว: “{existing.name}” {nameDiffers && "(ชื่อที่กรอกไม่ตรง ตรวจสอบก่อนอนุมัติ)"}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">บริษัทใหม่ จะถูกสร้างเมื่ออนุมัติ</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => review(u, true)} loading={busy === u.id}>อนุมัติ</Button>
                <Button variant="secondary" onClick={() => review(u, false)} disabled={busy === u.id}>ไม่อนุมัติ</Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CarePerson({ role, m }: { role: "sales" | "support"; m: TeamMember | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
      {m ? <Avatar url={m.photo_url} name={m.full_name} className="h-8 w-8 shrink-0 text-xs" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-sun-600">{CARE_ROLE_LABEL[role]}</p>
        <p className={cx("truncate text-sm", m ? "font-medium text-navy-900" : "text-slate-400")}>{m ? m.full_name : "ยังไม่กำหนด"}</p>
      </div>
    </div>
  );
}

function CompanyRow({ c, members, team, onSaved }: { c: Company; members: Profile[]; team: Map<string, TeamMember>; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(c.name);
  const [phone, setPhone] = useState(c.phone ?? "");
  const [address, setAddress] = useState(c.address ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("companies").update({ name: name.trim(), phone: phone || null, address: address || null }).eq("id", c.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setEdit(false);
    onSaved();
  }

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-navy-900">{c.name}</p>
          <p className="text-sm text-slate-500">เลขผู้เสียภาษี {c.tax_id}{c.phone ? ` · ${c.phone}` : ""}</p>
        </div>
        <div className="grid min-w-0 flex-1 gap-2 sm:max-w-md sm:grid-cols-2">
          <CarePerson role="sales" m={c.sales_member_id ? team.get(c.sales_member_id) : undefined} />
          <CarePerson role="support" m={c.support_member_id ? team.get(c.support_member_id) : undefined} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="navy">{members.length} ผู้ใช้</Badge>
          <Button variant="secondary" className="!py-1.5" onClick={() => setEdit((e) => !e)}>{edit ? "ปิด" : "แก้ไข"}</Button>
        </div>
      </div>
      {members.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">สมาชิก: {members.map((m) => m.full_name || m.email).join(", ")}</p>
      )}
      {edit && (
        <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อบริษัท" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="เบอร์โทร" />
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ที่อยู่" />
          {err && <div className="sm:col-span-3"><Alert>{err}</Alert></div>}
          <div className="sm:col-span-3"><Button onClick={save} loading={busy}>บันทึก</Button></div>
          <div className="border-t border-slate-200 pt-3 sm:col-span-3">
            <p className="mb-2 text-sm font-semibold text-navy-900">ทีมงานที่ดูแล</p>
            <CareTeamPicker company={c} onSaved={onSaved} />
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Companies() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const companies = useRows<Company>(() => supabase.from("companies").select("*").order("name"));
  const members = useRows<Profile>(() => supabase.from("profiles").select("*").eq("company_status", "approved"));
  const teamRows = useRows<TeamMember>(() => supabase.from("team_members").select("*"));
  const team = useMemo(() => new Map(teamRows.rows.map((m) => [m.id, m])), [teamRows.rows]);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return companies.rows.filter((c) => !s || c.name.toLowerCase().includes(s) || c.tax_id.includes(s));
  }, [companies.rows, q]);

  return (
    <Gate allow={can("companies")}>
      <PageTitle title="บริษัทลูกค้า" subtitle="อนุมัติการผูกผู้ใช้กับบริษัทด้วยเลขผู้เสียภาษี และดูรายชื่อบริษัท" />
      <div className="mb-5 inline-flex rounded-lg bg-slate-200/60 p-1">
        {(["pending", "all"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("rounded-md px-4 py-1.5 text-sm font-medium", tab === t ? "bg-white text-navy-900 shadow-sm" : "text-slate-600")}>
            {t === "pending" ? "รออนุมัติ" : `บริษัททั้งหมด (${companies.rows.length})`}
          </button>
        ))}
      </div>
      {tab === "pending" ? (
        <PendingList onChange={() => { companies.reload(); members.reload(); }} />
      ) : (
        <>
          <Input placeholder="ค้นหาชื่อบริษัทหรือเลขผู้เสียภาษี" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
          {companies.loading ? (
            <Loading />
          ) : shown.length ? (
            <div className="space-y-3">
              {shown.map((c) => (
                <CompanyRow key={c.id} c={c} members={members.rows.filter((m) => m.company_id === c.id)} team={team} onSaved={companies.reload} />
              ))}
            </div>
          ) : (
            <Empty>ยังไม่มีบริษัท</Empty>
          )}
        </>
      )}
    </Gate>
  );
}
