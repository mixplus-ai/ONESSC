import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { activeAds, useSiteSettings } from "../lib/content";
import type { AdBanner, AdPlacement, PageKey } from "../lib/types";
import { SectionHeading } from "./cards";
import { XIcon } from "./icons";
import { cx } from "./ui";

const isExternal = (href: string) => /^https?:\/\//i.test(href);

/** Link that handles internal routes, external URLs and "no link". */
function SmartLink({ href, className, children, label }: { href: string; className?: string; children: ReactNode; label?: string }) {
  if (!href) return <div className={className}>{children}</div>;
  if (isExternal(href))
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} aria-label={label}>
        {children}
      </a>
    );
  return (
    <Link to={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

/**
 * Editable heading at the top of a public page. With a background image it becomes a full-width
 * banner; without one it renders as the plain heading the page always had.
 */
export function PageBanner({ page, fallbackTitle, fallbackSubtitle, children, className, imageOnly }: { page: PageKey; fallbackTitle?: string; fallbackSubtitle?: string; children?: ReactNode; className?: string; imageOnly?: boolean }) {
  const p = { ...useSiteSettings().pages[page] };
  const title = p.title || fallbackTitle || "";
  p.subtitle = p.subtitle || fallbackSubtitle || "";
  if (p.image_url) {
    return (
      <section className={cx("relative overflow-hidden bg-navy-900 text-white", className)}>
        <img src={p.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/80 to-navy-900/20" aria-hidden />
        <div className="container-x relative py-14 sm:py-20">
          {p.eyebrow && <p className="mb-2 text-sm font-semibold text-sun-300">{p.eyebrow}</p>}
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          {p.subtitle && <p className="mt-3 max-w-2xl whitespace-pre-line text-navy-100">{p.subtitle}</p>}
          {children && <div className="mt-6">{children}</div>}
        </div>
      </section>
    );
  }
  if (imageOnly) return null;
  return (
    <div className={cx("container-x pt-10", className)}>
      {p.eyebrow && <p className="mb-2 text-sm font-semibold text-sun-600">{p.eyebrow}</p>}
      <h1 className="text-3xl font-bold text-navy-900">{title}</h1>
      {p.subtitle && <p className="mt-2 max-w-3xl whitespace-pre-line text-slate-500">{p.subtitle}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/** Section-style heading for pages laid out inside their own container; hidden when the page has a banner image (render PageBanner imageOnly above). */
export function PageHeading({ page, fallbackTitle, fallbackSubtitle }: { page: PageKey; fallbackTitle?: string; fallbackSubtitle?: string }) {
  const p = useSiteSettings().pages[page];
  if (p.image_url) return null;
  return <SectionHeading eyebrow={p.eyebrow || undefined} title={p.title || fallbackTitle || ""} subtitle={p.subtitle || fallbackSubtitle || undefined} />;
}

function AdImage({ b, className }: { b: AdBanner; className?: string }) {
  return (
    <picture>
      {b.mobile_image_url && <source media="(max-width: 640px)" srcSet={b.mobile_image_url} />}
      <img src={b.image_url} alt={b.title || "โฆษณา"} loading="lazy" className={className} />
    </picture>
  );
}

/** Ad banners for one placement. Several banners rotate every 6 seconds. */
export function AdSlot({ placement, className }: { placement: Exclude<AdPlacement, "popup">; className?: string }) {
  const { ads } = useSiteSettings();
  const list = activeAds(ads, placement);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 6000);
    return () => clearInterval(t);
  }, [list.length]);
  if (!list.length) return null;
  const cur = list[i % list.length];
  return (
    <div className={cx("container-x", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200">
        <SmartLink href={cur.href} label={cur.title} className="block">
          <AdImage b={cur} className="max-h-80 w-full object-cover" />
        </SmartLink>
        {list.length > 1 && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {list.map((b, n) => (
              <button
                key={b.id}
                onClick={() => setI(n)}
                aria-label={`แบนเนอร์ที่ ${n + 1}`}
                className={cx("h-2 rounded-full transition-all", n === i % list.length ? "w-6 bg-white" : "w-2 bg-white/60")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Popup ad on the home page, shown once per browser session. */
export function AdPopup() {
  const { ads } = useSiteSettings();
  const b = activeAds(ads, "popup")[0];
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!b) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem("ad-popup") === b.id;
    } catch {
      /* storage blocked: show it */
    }
    if (!seen) setOpen(true);
  }, [b]);
  if (!b || !open) return null;
  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem("ad-popup", b.id);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={close} role="dialog" aria-modal="true" aria-label={b.title || "โฆษณา"}>
      <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <button onClick={close} className="absolute -top-3 -right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 shadow-lg" aria-label="ปิด">
          <XIcon className="h-5 w-5" />
        </button>
        <SmartLink href={b.href} label={b.title} className="block overflow-hidden rounded-2xl bg-white shadow-2xl">
          <AdImage b={b} className="max-h-[80vh] w-full object-contain" />
        </SmartLink>
      </div>
    </div>
  );
}

/** Thin announcement bar above the site header. */
export function AnnouncementBar() {
  const { announcement } = useSiteSettings().ads;
  if (!announcement.active || !announcement.text) return null;
  return (
    <SmartLink href={announcement.href} className="block bg-sun-500 px-4 py-2 text-center text-sm font-semibold text-navy-950 hover:brightness-105">
      {announcement.text}
    </SmartLink>
  );
}
