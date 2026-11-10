import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSiteSettings } from "../lib/content";
import { cx } from "./ui";
import { CartIcon, ChatIcon, MailIcon, MenuIcon, PhoneIcon, PinIcon, SunIcon, XIcon } from "./icons";
import { useCart } from "../lib/cart";

export const NAV = [
  { to: "/", label: "หน้าแรก", end: true },
  { to: "/about", label: "เกี่ยวกับเรา" },
  { to: "/products", label: "สินค้า" },
  { to: "/promotions", label: "โปรโมชั่น" },
  { to: "/training", label: "อบรมและกิจกรรม" },
  { to: "/portfolio", label: "ผลงาน" },
  { to: "/claims", label: "แจ้งเคลม" },
  { to: "/contact", label: "ติดต่อเรา" },
];

export function Logo({ light = false }: { light?: boolean }) {
  const { company } = useSiteSettings();
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="หน้าแรก">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy-900 text-sun-500 ring-1 ring-white/10">
        <SunIcon className="h-5 w-5" />
      </span>
      <span className={cx("text-lg font-bold tracking-tight", light ? "text-white" : "text-navy-900")}>
        {company.name_th}
        <span className={cx("ml-1.5 text-xs font-medium", light ? "text-navy-200" : "text-slate-500")}>One App</span>
      </span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { session, profile } = useAuth();
  const { count } = useCart();
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const account = session ? (
    <Link to="/app" className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
      {profile?.full_name?.split(" ")[0] || "บัญชีของฉัน"}
    </Link>
  ) : (
    <Link to="/login" className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
      เข้าสู่ระบบ
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="เมนูหลัก">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive ? "bg-navy-50 text-navy-800" : "text-slate-600 hover:text-navy-800",
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to={session ? "/app/cart" : "/login"}
            state={session ? undefined : { from: "/app/cart" }}
            className="relative rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            aria-label={`รายการสินค้า ${count} รายการ`}
          >
            <CartIcon />
            {count > 0 && <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-sun-500 px-1 text-xs font-bold text-navy-950">{count}</span>}
          </Link>
          <div className="hidden sm:block">{account}</div>
          <button
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={open}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white lg:hidden" aria-label="เมนูมือถือ">
          <div className="container-x grid gap-1 py-3">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx("rounded-lg px-3 py-2.5 text-sm font-medium", isActive ? "bg-navy-50 text-navy-800" : "text-slate-700")
                }
              >
                {n.label}
              </NavLink>
            ))}
            <div className="pt-2 sm:hidden">{account}</div>
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const { company } = useSiteSettings();
  return (
    <footer className="bg-navy-950 text-navy-100">
      <div className="container-x grid gap-10 py-12 md:grid-cols-3">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm text-navy-200">{company.tagline}</p>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-white">ติดต่อบริษัท</p>
          {company.address && (
            <p className="flex gap-2"><PinIcon className="h-5 w-5 shrink-0 text-sun-400" />{company.address}</p>
          )}
          {company.phone && (
            <p className="flex gap-2"><PhoneIcon className="h-5 w-5 shrink-0 text-sun-400" /><a href={`tel:${company.phone}`}>{company.phone}</a></p>
          )}
          {company.email && (
            <p className="flex gap-2"><MailIcon className="h-5 w-5 shrink-0 text-sun-400" /><a href={`mailto:${company.email}`}>{company.email}</a></p>
          )}
          {company.line_oa_url && (
            <p className="flex gap-2"><ChatIcon className="h-5 w-5 shrink-0 text-sun-400" /><a href={company.line_oa_url} target="_blank" rel="noreferrer">LINE Official Account</a></p>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-white">ลิงก์</p>
          <div className="grid grid-cols-2 gap-2">
            {NAV.slice(1).map((n) => (
              <Link key={n.to} to={n.to} className="text-navy-200 hover:text-white">{n.label}</Link>
            ))}
            <Link to="/team" className="text-navy-200 hover:text-white">ทีมงาน</Link>
            <Link to="/privacy" className="text-navy-200 hover:text-white">นโยบายความเป็นส่วนตัว</Link>
            {company.facebook_url && (
              <a href={company.facebook_url} target="_blank" rel="noreferrer" className="text-navy-200 hover:text-white">Facebook</a>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-navy-200">
        © {new Date().getFullYear()} {company.name_en || company.name_th}. สงวนลิขสิทธิ์
      </div>
    </footer>
  );
}

function LineButton() {
  const { company } = useSiteSettings();
  if (!company.line_oa_url) return null;
  return (
    <a
      href={company.line_oa_url}
      target="_blank"
      rel="noreferrer"
      className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#06C755] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:brightness-110 sm:right-6 sm:bottom-6"
    >
      <ChatIcon className="h-5 w-5" />
      คุยกับเซลล์
    </a>
  );
}

export default function PublicLayout() {
  const { pathname } = useLocation();
  // braces matter: newer Chrome returns a Promise from scrollTo, which React would call as a cleanup
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <LineButton />
    </div>
  );
}
