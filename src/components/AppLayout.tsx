import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/types";
import { AcademicIcon, BoxIcon, BuildingIcon, CartIcon, ChartIcon, EditIcon, FileIcon, GiftIcon, HomeIcon, ImageIcon, InboxIcon, LogIcon, LogoutIcon, MenuIcon, StarIcon, TagIcon, UserIcon, UsersIcon, WrenchIcon, XIcon, TruckIcon } from "./icons";
import { useCart } from "../lib/cart";
import { Logo } from "./PublicLayout";
import { Alert, Loading, cx } from "./ui";
import { Avatar } from "./Avatar";
import { MobileTabBar } from "./MobileTabBar";

interface Item {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  show: boolean;
  end?: boolean;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (profile && !profile.is_active)
    return (
      <div className="container-x py-20"><Alert>บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ</Alert></div>
    );
  return <>{children}</>;
}

/** Hides a page from users that lack the role/permission (RLS still enforces it server-side). */
export function Gate({ allow, children }: { allow: boolean; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile) return <Loading />;
  if (!allow) return <Alert tone="amber">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ หากต้องการใช้งานกรุณาติดต่อ Admin</Alert>;
  return <>{children}</>;
}

export default function AppLayout() {
  const { profile, isAdmin, can, signOut } = useAuth();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  // work menus fold by group (remembered per browser); the group holding the current page is always open
  const [folds, setFolds] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("navFolds") ?? "{}"); } catch { return {}; }
  });
  const toggleFold = (title: string, open: boolean) => setFolds((f) => {
    const n = { ...f, [title]: !open };
    try { localStorage.setItem("navFolds", JSON.stringify(n)); } catch { /* private mode */ }
    return n;
  });
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const isCustomer = profile?.role === "user";
  const mine: Item[] = [
        { to: "/app/cart", label: count ? `ตะกร้า (${count})` : "ตะกร้า", icon: CartIcon, show: true },
        { to: "/app/requests", label: "คำขอของฉัน", icon: FileIcon, show: true },
        { to: "/app/training", label: "การอบรมของฉัน", icon: AcademicIcon, show: true },
        { to: "/app/claims", label: "งานเคลมของฉัน", icon: WrenchIcon, show: true },
        { to: "/app/points", label: "แต้มและของรางวัล", icon: GiftIcon, show: true },
  ];
  // Staff/Admin: their own customer pages fold into a collapsible "ของฉัน" group so work menus come first
  const groups: { title?: string; items: Item[]; fold?: boolean }[] = ([
    {
      items: [
        { to: "/app", label: "แดชบอร์ด", icon: HomeIcon, show: true, end: true },
        { to: "/app/profile", label: "ข้อมูลส่วนตัว", icon: UserIcon, show: true },
        ...(isCustomer ? mine : []),
      ],
    },
    {
      title: "งานบริการ",
      items: [{ to: "/app/admin/claims", label: "งานบริการและเคลม", icon: WrenchIcon, show: can("claims.view") || can("claims") }],
    },
    {
      title: "อบรมและแต้ม",
      items: [
        { to: "/app/admin/training", label: "อบรมและกิจกรรม", icon: AcademicIcon, show: can("training.view") || can("courses") },
        { to: "/app/admin/company-points", label: "แต้มบริษัท", icon: StarIcon, show: can("company_points") },
        { to: "/app/admin/points", label: "แต้มส่วนตัวและของรางวัล", icon: GiftIcon, show: can("rewards") },
      ],
    },
    {
      title: "สินค้าและการขาย",
      items: [
        { to: "/app/admin/requests", label: "คำขอจากลูกค้า", icon: InboxIcon, show: can("requests") },
        { to: "/app/admin/stock", label: "สต๊อกสินค้า", icon: ChartIcon, show: can("stock.view") },
        { to: "/app/admin/deliveries", label: "ตารางส่งสินค้า", icon: TruckIcon, show: can("deliveries.view") || can("deliveries.manage") },
        { to: "/app/admin/pricing", label: "ราคาเฉพาะบริษัท", icon: TagIcon, show: can("pricing") },
        { to: "/app/admin/products", label: "สินค้า", icon: BoxIcon, show: can("products") },
        { to: "/app/admin/promotions", label: "โปรโมชั่นและแพ็กเกจ", icon: TagIcon, show: can("products") },
      ],
    },
    {
      title: "จัดการ",
      items: [
        { to: "/app/admin/users", label: "ผู้ใช้และสิทธิ์", icon: UsersIcon, show: isAdmin },
        { to: "/app/admin/customers", label: "ลูกค้า", icon: UserIcon, show: can("companies") },
        { to: "/app/admin/companies", label: "บริษัทลูกค้า", icon: BuildingIcon, show: can("companies") },
        { to: "/app/admin/messages", label: "ข้อความติดต่อ", icon: InboxIcon, show: can("contact_messages") },
      ],
    },
    {
      title: "หน้าเว็บ",
      items: [
        { to: "/app/admin/content", label: "เนื้อหาเว็บและโฆษณา", icon: EditIcon, show: can("site_content") },
        { to: "/app/admin/portfolio", label: "ผลงาน", icon: ImageIcon, show: can("site_content") },
        { to: "/app/admin/team", label: "ทีมงาน", icon: UsersIcon, show: can("site_content") },
      ],
    },
    { title: "ระบบ", items: [
      { to: "/app/admin/reports", label: "รายงานและส่งออก", icon: ChartIcon, show: can("reports") },
      { to: "/app/admin/logs", label: "Log การใช้งาน", icon: LogIcon, show: isAdmin },
    ] },
    ...(isCustomer ? [] : [{ title: "ของฉัน (ในฐานะลูกค้า)", items: mine, fold: true }]),
  ] as { title?: string; items: Item[]; fold?: boolean }[]).map((g) => ({ ...g, fold: g.fold ?? Boolean(g.title) }));

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="เมนูหลังบ้าน">
      {groups.map((g, i) => {
        const items = g.items.filter((it) => it.show);
        if (!items.length) return null;
        const here = items.some((it) => (it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to)));
        // "ของฉัน" starts folded; work groups start open unless folded by the user
        const isOpen = !g.fold || here || (folds[g.title!] === undefined ? g.title !== "ของฉัน (ในฐานะลูกค้า)" : !folds[g.title!]);
        return (
          <div key={i}>
            {g.fold && (
              <button type="button" onClick={() => toggleFold(g.title!, isOpen)} aria-expanded={isOpen} className="mb-2 flex w-full items-center justify-between px-3 text-xs font-semibold tracking-wide text-navy-200/70 hover:text-white">
                {g.title}
                <span className="flex items-center gap-2">
                  {!isOpen && <span className="font-normal text-navy-200/60">{items.length}</span>}
                  <span className={cx("transition", isOpen && "rotate-180")}>▾</span>
                </span>
              </button>
            )}
            {isOpen && <div className="grid gap-1">
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      isActive ? "bg-white/10 text-white" : "text-navy-100 hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              ))}
            </div>}
          </div>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="border-t border-white/10 p-4">
      <Link to="/app/profile" className="flex items-center gap-3">
        <Avatar url={profile?.avatar_url} name={profile?.full_name || profile?.email} className="h-10 w-10 text-sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{profile?.full_name || profile?.email}</span>
          <span className="block truncate text-xs text-navy-200">{profile && (profile.role === "user" ? (profile.company_name || "ลูกค้า") : ROLE_LABEL[profile.role])} · {profile?.email}</span>
        </span>
      </Link>
      <button onClick={signOut} className="mt-3 inline-flex items-center gap-2 text-sm text-navy-100 hover:text-white">
        <LogoutIcon className="h-4 w-4" /> ออกจากระบบ
      </button>
    </div>
  );

  return (
    <RequireAuth>
      <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
        <aside className="hidden bg-navy-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="p-4"><Logo light /></div>
          {nav}
          {userBox}
        </aside>
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-navy-900 px-4 lg:hidden">
          <Logo light />
          {/* customers use the bottom tab bar + the account hub on the dashboard instead of a second menu */}
          {!isCustomer && <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-white" aria-label="เปิดเมนู"><MenuIcon /></button>}
        </div>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy-900">
              <div className="flex items-center justify-between p-4">
                <Logo light />
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white" aria-label="ปิดเมนู"><XIcon /></button>
              </div>
              {nav}
              {userBox}
            </aside>
          </div>
        )}
        <main className={cx("min-w-0 px-4 py-6 sm:px-8 sm:py-8", isCustomer && "pb-24 lg:pb-8")}>
          <div className="mx-auto max-w-6xl"><Outlet /></div>
        </main>
        {isCustomer && <MobileTabBar />}
      </div>
    </RequireAuth>
  );
}
