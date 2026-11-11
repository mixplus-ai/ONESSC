import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { BoxIcon, CartIcon, FileIcon, HomeIcon, UserIcon } from "./icons";
import { cx } from "./ui";

/** Pages with their own sticky action bar at the bottom: the tab bar steps aside there. */
const OWN_BAR = [/^\/products\/[^/]+$/, /^\/app\/cart$/];
export const hidesTabBar = (path: string) => OWN_BAR.some((r) => r.test(path));

/** App-style bottom navigation for phones (hidden from lg up). */
export function MobileTabBar() {
  const { session } = useAuth();
  const { count } = useCart();
  const { pathname } = useLocation();
  if (hidesTabBar(pathname)) return null;
  const guard = (to: string) => (session ? to : "/login");
  const tabs = [
    { to: "/", label: "หน้าแรก", icon: HomeIcon, end: true, match: (p: string) => p === "/" },
    { to: "/products", label: "สินค้า", icon: BoxIcon, match: (p: string) => p.startsWith("/products") || p.startsWith("/promotions") },
    { to: guard("/app/requests"), label: "คำขอ", icon: FileIcon, match: (p: string) => p.startsWith("/app/requests") || p.startsWith("/app/claims") },
    { to: guard("/app/cart"), label: "ตะกร้า", icon: CartIcon, badge: count, match: (p: string) => p.startsWith("/app/cart") },
    { to: session ? "/app" : "/login", label: session ? "บัญชี" : "เข้าสู่ระบบ", icon: UserIcon, match: (p: string) => p === "/app" || p.startsWith("/app/profile") || p === "/login" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="เมนูลัด">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, badge, match }) => {
          const active = match(pathname);
          return (
            <NavLink key={label} to={to} state={session ? undefined : { from: to }} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-navy-700" : "text-slate-500")}>
              <span className={cx("grid h-8 w-12 place-items-center rounded-full transition", active && "bg-navy-50")}>
                <Icon className="h-5 w-5" />
              </span>
              {label}
              {!!badge && <span className="absolute top-1 left-1/2 ml-2 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-sun-500 px-1 text-[10px] font-bold text-navy-950">{badge}</span>}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
