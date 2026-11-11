import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AcademicIcon, ArrowRightIcon, BoxIcon, BuildingIcon, CartIcon, FileIcon, GiftIcon, InboxIcon, LogoutIcon, UserIcon, UsersIcon, WrenchIcon } from "../../components/icons";
import { useCart } from "../../lib/cart";
import { Alert, Badge, Card, PageTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { COMPANY_STATUS_LABEL, ROLE_LABEL, type Company } from "../../lib/types";
import { formatPoints, todayBkk, type TrainingStatus } from "../../lib/training";

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

/** Mobile "บัญชี" tab: every customer page in one list, so the app needs no second (hamburger) menu. */
function AccountHub() {
  const { signOut } = useAuth();
  const { count } = useCart();
  const items = [
    { to: "/app/cart", label: "ตะกร้า", icon: CartIcon, badge: count || undefined },
    { to: "/app/requests", label: "คำขอของฉัน", icon: FileIcon },
    { to: "/app/training", label: "การอบรมของฉัน", icon: AcademicIcon },
    { to: "/app/claims", label: "งานเคลมของฉัน", icon: WrenchIcon },
    { to: "/app/points", label: "แต้มและของรางวัล", icon: GiftIcon },
    { to: "/app/profile", label: "ข้อมูลส่วนตัวและบริษัท", icon: UserIcon },
  ];
  return (
    <Card className="!p-0 lg:hidden">
      <ul className="divide-y divide-slate-100">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-navy-900 active:bg-slate-50">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-5 w-5" /></span>
              <span className="flex-1">{label}</span>
              {badge != null && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sun-500 px-1.5 text-[11px] font-bold text-navy-950">{badge}</span>}
              <ArrowRightIcon className="h-4 w-4 text-slate-400" />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-red-600 active:bg-red-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50"><LogoutIcon className="h-5 w-5" /></span>
            ออกจากระบบ
          </button>
        </li>
      </ul>
    </Card>
  );
}

function UserDashboard() {
  const { profile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [claims, setClaims] = useState<{ open: number; toReturn: number } | null>(null);
  useEffect(() => {
    supabase.rpc("my_training_status").then(({ data }) => setTraining(data as TrainingStatus));
    supabase.rpc("my_claims").then(({ data }) => {
      const list = (data ?? []) as { status: string }[];
      setClaims({ open: list.filter((c) => !["closed", "rejected"].includes(c.status)).length, toReturn: list.filter((c) => c.status === "done").length });
    });
  }, []);
  useEffect(() => {
    if (profile?.company_id && profile.company_status === "approved")
      supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle().then(({ data }) => setCompany(data as Company));
  }, [profile?.company_id, profile?.company_status]);
  if (!profile) return null;
  const tone = { none: "slate", pending: "amber", approved: "green", rejected: "red" } as const;

  return (
    <div className="space-y-6">
      <AccountHub />
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link to="/app/requests">
          <Card className="h-full transition hover:ring-navy-200">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><BoxIcon /></span>
            <h3 className="mt-4 font-semibold text-navy-900">คำขอของฉัน</h3>
            <p className="mt-1 text-sm text-slate-500">ติดตามคำขอใบเสนอราคาและสถานะการจองสินค้าของคุณ</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">ดูรายการ <ArrowRightIcon className="h-4 w-4" /></span>
          </Card>
        </Link>
        <Link to="/app/training">
          <Card className="h-full transition hover:ring-navy-200">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><AcademicIcon /></span>
            <h3 className="mt-4 font-semibold text-navy-900">การอบรมของฉัน</h3>
            <p className="mt-1 text-sm text-slate-500">{training?.active_bookings != null ? `จองไว้ ${training.active_bookings} รอบ · ` : ""}ประวัติอบรม ใบประกาศ และเช็กอิน</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">ดูการอบรม <ArrowRightIcon className="h-4 w-4" /></span>
          </Card>
        </Link>
        <Link to="/app/points">
          <Card className="h-full transition hover:ring-navy-200">
            <p className="text-sm text-slate-500">แต้มส่วนตัว</p>
            <p className="text-3xl font-bold text-emerald-700">{formatPoints(training?.personal_points ?? 0)}</p>
            <p className="mt-2 text-sm text-slate-500">แต้มบริษัท</p>
            <p className="text-xl font-bold text-navy-900">{training?.company_points != null ? formatPoints(training.company_points) : "ยังไม่ผูกบริษัท"}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">แลกของรางวัล <ArrowRightIcon className="h-4 w-4" /></span>
          </Card>
        </Link>
        <Link to="/app/claims">
          <Card className="h-full transition hover:ring-navy-200">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><WrenchIcon /></span>
            <h3 className="mt-4 font-semibold text-navy-900">สถานะเคลมของฉัน</h3>
            <p className="mt-1 text-sm text-slate-500">{claims ? (claims.open ? `เคลมที่กำลังดำเนินการ ${claims.open} รายการ${claims.toReturn ? ` · รอส่งของคืน ${claims.toReturn}` : ""}` : "ไม่มีเคลมค้าง") : "แจ้งเคลมและติดตาม 3 ขั้นตอน"}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">ดู / แจ้งเคลม <ArrowRightIcon className="h-4 w-4" /></span>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function StaffDashboard() {
  const { isAdmin, can } = useAuth();
  const claimsOk = can("claims.view") || can("claims");
  const trainingOk = can("training.view") || can("courses");
  const [stats, setStats] = useState({ pending: 0, messages: 0, users: 0, staff: 0, companies: 0, quotes: 0, reservations: 0, coupons: 0, slips: 0, sessions: 0, claimsNew: 0, claimsOpen: 0 });
  useEffect(() => {
    const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    Promise.all([
      count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_status", "pending")),
      can("contact_messages") ? count(supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new")) : Promise.resolve(0),
      count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "user")),
      count(supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["staff", "admin"])),
      count(supabase.from("companies").select("id", { count: "exact", head: true })),
      count(supabase.from("quote_requests").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"])),
      count(supabase.from("reservations").select("id", { count: "exact", head: true }).in("status", ["pending", "confirmed"]).gt("expires_at", new Date().toISOString())),
      count(supabase.from("redemptions").select("id", { count: "exact", head: true }).eq("wallet", "personal").eq("status", "issued")),
      count(supabase.from("training_registrations").select("id", { count: "exact", head: true }).eq("pay_status", "pending").eq("status", "registered")),
      count(supabase.from("course_sessions").select("id", { count: "exact", head: true }).eq("is_archived", false).neq("status", "cancelled").gte("starts_on", todayBkk())),
      count(supabase.from("claims").select("id", { count: "exact", head: true }).eq("source", "customer").eq("status", "submitted")),
      count(supabase.from("claims").select("id", { count: "exact", head: true }).eq("source", "customer").in("status", ["in_progress", "done", "returned"])),
    ]).then(([pending, messages, users, staff, companies, quotes, reservations, coupons, slips, sessions, claimsNew, claimsOpen]) =>
      setStats({ pending, messages, users, staff, companies, quotes, reservations, coupons, slips, sessions, claimsNew, claimsOpen }));
  }, [can]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {claimsOk && <Stat label="เคลมใหม่รอรับเรื่อง" value={stats.claimsNew} to="/app/admin/claims?tab=queue" icon={WrenchIcon} />}
        {claimsOk && <Stat label="เคลมค้าง (กำลังดำเนินการ)" value={stats.claimsOpen} to="/app/admin/claims?tab=queue" icon={WrenchIcon} />}
        {can("requests") && <Stat label="คำขอใบเสนอราคาที่เปิดอยู่" value={stats.quotes} to="/app/admin/requests?tab=quotes" icon={InboxIcon} />}
        {can("requests") && <Stat label="การจองที่รอดำเนินการ" value={stats.reservations} to="/app/admin/requests?tab=reservations" icon={BoxIcon} />}
        {can("companies") && <Stat label="รออนุมัติผูกบริษัท" value={stats.pending} to="/app/admin/companies" icon={BuildingIcon} />}
        {trainingOk && <Stat label="รอบอบรมที่จะถึง" value={stats.sessions} to="/app/admin/training" icon={AcademicIcon} />}
        {trainingOk && <Stat label="สลิปค่าอบรมรอตรวจ" value={stats.slips} to="/app/admin/training" icon={InboxIcon} />}
        {can("rewards") && <Stat label="คูปองที่ยังไม่ได้ใช้" value={stats.coupons} to="/app/admin/points?tab=coupons" icon={InboxIcon} />}
        {can("contact_messages") && <Stat label="ข้อความใหม่" value={stats.messages} to="/app/admin/messages" icon={InboxIcon} />}
        <Stat label="ลูกค้า (User)" value={stats.users} to={isAdmin ? "/app/admin/users" : undefined} icon={UsersIcon} />
        <Stat label="บริษัทลูกค้า" value={stats.companies} to={can("companies") ? "/app/admin/companies" : undefined} icon={BuildingIcon} />
        {isAdmin && <Stat label="Staff / Admin" value={stats.staff} to="/app/admin/users" icon={UsersIcon} />}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {can("company_points") && <Link to="/app/admin/company-points">
          <Card className="h-full transition hover:ring-navy-200">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><AcademicIcon /></span>
            <h3 className="mt-4 font-semibold text-navy-900">เพิ่มแต้มบริษัท</h3>
            <p className="mt-1 text-sm text-slate-500">บันทึกยอดซื้อ ระบบคำนวณแต้มตามกติกาที่ Admin ตั้ง และตัดแต้มเป็นส่วนลด</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">เปิด <ArrowRightIcon className="h-4 w-4" /></span>
          </Card>
        </Link>}
        {claimsOk && <Link to="/app/admin/claims?tab=board">
          <Card className="h-full transition hover:ring-navy-200">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sun-500/15 text-sun-600"><WrenchIcon /></span>
            <h3 className="mt-4 font-semibold text-navy-900">ผัง 5 ขั้นตอนงานเคลม</h3>
            <p className="mt-1 text-sm text-slate-500">ติดตามทุกหน่วยสินค้า เลขที่เบิก SN และรายงานตรวจสอบ</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">เปิด <ArrowRightIcon className="h-4 w-4" /></span>
          </Card>
        </Link>}
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
