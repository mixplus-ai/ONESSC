import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AcademicIcon, ArrowRightIcon, BoxIcon, BuildingIcon, InboxIcon, UsersIcon, WrenchIcon } from "../../components/icons";
import { Alert, Badge, Card, PageTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { COMPANY_STATUS_LABEL, LEGACY, ROLE_LABEL, type Company } from "../../lib/types";

function Stat({ label, value, to, icon: Icon }: { label: string; value: number | string; to?: string; icon: typeof UsersIcon }) {
  const body = (
    <Card className="flex items-center gap-4 transition hover:ring-navy-200">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-6 w-6" /></span>
      <div>
        <p className="text-2xl font-bold text-navy-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function ComingCard({ icon: Icon, title, text, phase, href }: { icon: typeof UsersIcon; title: string; text: string; phase: string; href?: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><Icon /></span>
        <Badge>{phase}</Badge>
      </div>
      <h3 className="mt-4 font-semibold text-navy-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
          ใช้ระบบเดิมไปก่อน <ArrowRightIcon className="h-4 w-4" />
        </a>
      )}
    </Card>
  );
}

function UserDashboard() {
  const { profile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  useEffect(() => {
    if (profile?.company_id && profile.company_status === "approved")
      supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle().then(({ data }) => setCompany(data as Company));
  }, [profile?.company_id, profile?.company_status]);
  if (!profile) return null;
  const tone = { none: "slate", pending: "amber", approved: "green", rejected: "red" } as const;

  return (
    <div className="space-y-6">
      {!profile.tax_id && (
        <Alert tone="navy">
          กรอกเลขผู้เสียภาษีและชื่อบริษัทใน <Link to="/app/profile" className="font-semibold underline">ข้อมูลส่วนตัว</Link> เพื่อดูราคาเฉพาะบริษัทและแต้มบริษัท
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-500">บัญชีของฉัน</p>
          <p className="mt-1 text-lg font-semibold text-navy-900">{profile.full_name || "-"}</p>
          <p className="text-sm text-slate-600">{profile.email}</p>
          {profile.phone && <p className="text-sm text-slate-600">{profile.phone}</p>}
          <Link to="/app/profile" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">แก้ไขโปรไฟล์ <ArrowRightIcon className="h-4 w-4" /></Link>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">บริษัทที่สังกัด</p>
            <Badge tone={tone[profile.company_status]}>{COMPANY_STATUS_LABEL[profile.company_status]}</Badge>
          </div>
          <p className="mt-1 text-lg font-semibold text-navy-900">{company?.name ?? profile.company_name ?? "-"}</p>
          {profile.tax_id && <p className="text-sm text-slate-600">เลขผู้เสียภาษี {profile.tax_id}</p>}
          {profile.company_status === "pending" && <p className="mt-2 text-xs text-slate-500">ทีมงานกำลังตรวจสอบ เมื่ออนุมัติแล้วจะเห็นราคาและแต้มของบริษัท</p>}
          {profile.company_status === "rejected" && <p className="mt-2 text-xs text-red-600">ไม่ผ่านการตรวจสอบ กรุณาตรวจเลขผู้เสียภาษีหรือติดต่อเซลล์</p>}
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ComingCard icon={BoxIcon} title="การจองและใบเสนอราคา" text="ติดตามใบเสนอราคาและสถานะการจองสินค้าของคุณ" phase="เฟส 2" />
        <ComingCard icon={AcademicIcon} title="แต้มและการอบรม" text="แต้มส่วนตัว แต้มบริษัท ประวัติอบรม และใบประกาศ" phase="เฟส 3" href={LEGACY.training} />
        <ComingCard icon={WrenchIcon} title="สถานะเคลมของฉัน" text="แจ้งเคลมและติดตาม 3 ขั้นตอนได้จากที่นี่" phase="เฟส 4" />
      </div>
    </div>
  );
}

function StaffDashboard() {
  const { isAdmin, can } = useAuth();
  const [stats, setStats] = useState({ pending: 0, messages: 0, users: 0, staff: 0, companies: 0 });
  useEffect(() => {
    const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    Promise.all([
      count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_status", "pending")),
      can("contact_messages") ? count(supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new")) : Promise.resolve(0),
      count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "user")),
      count(supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["staff", "admin"])),
      count(supabase.from("companies").select("id", { count: "exact", head: true })),
    ]).then(([pending, messages, users, staff, companies]) => setStats({ pending, messages, users, staff, companies }));
  }, [can]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="รออนุมัติผูกบริษัท" value={stats.pending} to="/app/admin/companies" icon={BuildingIcon} />
        {can("contact_messages") && <Stat label="ข้อความใหม่" value={stats.messages} to="/app/admin/messages" icon={InboxIcon} />}
        <Stat label="ลูกค้า (User)" value={stats.users} to={isAdmin ? "/app/admin/users" : undefined} icon={UsersIcon} />
        <Stat label="บริษัทลูกค้า" value={stats.companies} to="/app/admin/companies" icon={BuildingIcon} />
        {isAdmin && <Stat label="Staff / Admin" value={stats.staff} to="/app/admin/users" icon={UsersIcon} />}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ComingCard icon={BoxIcon} title="สต๊อกและการจอง" text="สต๊อกคงเหลือจาก Google Sheet และสถานะการจองทั้งหมด" phase="เฟส 2" />
        <ComingCard icon={AcademicIcon} title="เพิ่มแต้มบริษัท" text="บันทึกยอดซื้อและคำนวณแต้มตามกติกาที่ Admin ตั้ง" phase="เฟส 3" />
        <ComingCard icon={WrenchIcon} title="งานเคลมค้าง / ใหม่" text="ผัง 5 ขั้นภายในและคิวเคลมจากลูกค้า" phase="เฟส 4" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile, isStaff } = useAuth();
  if (!profile) return null;
  return (
    <>
      <PageTitle title={`สวัสดี ${profile.full_name?.split(" ")[0] ?? ""}`} subtitle={`บทบาท: ${ROLE_LABEL[profile.role]}`} />
      {isStaff ? <StaffDashboard /> : <UserDashboard />}
    </>
  );
}
