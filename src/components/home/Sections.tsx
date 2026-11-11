import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AdSlot } from "../banners";
import { PortfolioCard, SectionHeading, TeamCard } from "../cards";
import {
  AcademicIcon, ArrowRightIcon, BoltIcon, BoxIcon, BuildingIcon, ChartIcon, GiftIcon, SearchIcon, ShieldIcon, StarIcon, SunIcon, TruckIcon, UsersIcon, WrenchIcon, XIcon,
} from "../icons";
import { ButtonLink, Empty, cx } from "../ui";
import { usePublishedPortfolio, usePublishedTeam, useRows, useSiteSettings } from "../../lib/content";
import { productImage, usePricing, type Category, type PriceInfo, type Product } from "../../lib/catalog";
import { supabase } from "../../lib/supabase";
import { ProductCard } from "../catalog";
import { PRODUCT_SELECT } from "../../pages/public/Products";
import {
  embedUrl, type AdSection, type Anim, type Bg, type CardsSection, type CtaSection, type FeedSection, type GallerySection, type HeroSection,
  type HomeSection, type IconKey, type ImageTextSection, type LogosSection, type ModulesSection, type StatsSection, type TextSection, type VideoSection,
} from "../../lib/homeSections";
import { sessionDateText } from "../../lib/training";
import { ContactBlock } from "../../pages/public/Contact";
import { SessionCard, useUpcomingSessions } from "../../pages/public/Training";

const ICONS: Record<IconKey, (p: { className?: string }) => ReactNode> = {
  box: BoxIcon, academic: AcademicIcon, wrench: WrenchIcon, shield: ShieldIcon, sun: SunIcon, bolt: BoltIcon,
  chart: ChartIcon, users: UsersIcon, star: StarIcon, truck: TruckIcon, gift: GiftIcon, building: BuildingIcon,
};

const BG: Record<Bg, string> = {
  white: "bg-white",
  light: "bg-slate-50",
  dark: "bg-navy-950 text-white",
  brand: "bg-gradient-to-br from-sun-500 to-sun-600 text-navy-950",
};
const isDark = (bg?: Bg) => bg === "dark";

const isExternal = (href: string) => /^(https?:|mailto:|tel:)/.test(href);
function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (isExternal(href)) return <a href={href} className={className} target="_blank" rel="noreferrer">{children}</a>;
  return <Link to={href || "/"} className={className}>{children}</Link>;
}

// ---------------------------------------------------------------------------
// motion helpers
// ---------------------------------------------------------------------------
/** Fades/slides children in when they scroll into view. */
export function Reveal({ anim = "fade-up", delay = 0, className, children, as: Tag = "div" }: { anim?: Anim | "slide-r"; delay?: number; className?: string; children: ReactNode; as?: "div" | "li" }) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const [inView, setIn] = useState(anim === "none");
  useEffect(() => {
    if (anim === "none" || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") return setIn(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setIn(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [anim]);
  if (anim === "none") return <Tag className={className}>{children}</Tag>;
  return (
    <Tag ref={ref} data-anim={anim} className={cx("reveal", inView && "is-in", className)} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Counts up from 0 the first time it is visible. */
function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return setN(value);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1600);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  return <span ref={ref} className="tabular-nums">{n.toLocaleString("th-TH")}{suffix}</span>;
}

/** Image, uploaded video or YouTube/Vimeo, filling its box. */
function Media({ image, video, className, background, controls, poster }: { image?: string; video?: string; className?: string; background?: boolean; controls?: boolean; poster?: string }) {
  if (video) {
    const embed = embedUrl(video, background);
    if (embed) {
      return background ? (
        <div className={cx("pointer-events-none overflow-hidden", className)}>
          <iframe src={embed} title="video" allow="autoplay; encrypted-media" className="absolute top-1/2 left-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2" />
        </div>
      ) : (
        <iframe src={embed} title="video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className={className} />
      );
    }
    return background
      ? <video src={video} poster={image || poster} autoPlay muted loop playsInline className={cx("object-cover", className)} />
      : <video src={video} poster={poster || image} controls={controls ?? true} playsInline className={cx("bg-black object-cover", className)} />;
  }
  if (image) return <img src={image} alt="" loading="lazy" className={cx("object-cover", className)} />;
  return null;
}

function Heading({ s, center, dark }: { s: { eyebrow?: string; title?: string; subtitle?: string }; center?: boolean; dark?: boolean }) {
  if (!s.title && !s.eyebrow) return null;
  return (
    <div className={cx("mb-10 max-w-2xl", center && "mx-auto text-center")}>
      {s.eyebrow && <p className={cx("mb-2 text-sm font-semibold tracking-wide", dark ? "text-sun-300" : "text-sun-600")}>{s.eyebrow}</p>}
      {s.title && <h2 className={cx("text-2xl font-bold sm:text-4xl", dark ? "text-white" : "text-navy-900")}>{s.title}</h2>}
      {s.subtitle && <p className={cx("mt-3 text-base sm:text-lg", dark ? "text-navy-100" : "text-slate-600")}>{s.subtitle}</p>}
    </div>
  );
}

function Shell({ s, children, pad = "py-20", className }: { s: HomeSection; children: ReactNode; pad?: string; className?: string }) {
  return <section id={`s-${s.id}`} className={cx(s.bg ? BG[s.bg] : "", pad, "relative overflow-hidden", className)}>{children}</section>;
}

// ---------------------------------------------------------------------------
// blocks
// ---------------------------------------------------------------------------
function Hero({ s }: { s: HeroSection }) {
  const { about } = useSiteSettings();
  const slides = s.slides.filter((x) => x.image_url || x.video_url);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length]);
  const h = s.height === "full" ? "min-h-[calc(100svh-4rem)]" : s.height === "large" ? "min-h-[62vh] md:min-h-[640px]" : "min-h-[440px]";
  const center = s.align === "center";
  return (
    <section id={`s-${s.id}`} className={cx("relative isolate flex items-center overflow-hidden bg-navy-950 text-white", h)}>
      {slides.map((sl, n) => (
        <div key={n} className={cx("absolute inset-0 -z-20 transition-opacity duration-1000", n === i ? "opacity-100" : "opacity-0")} aria-hidden>
          <Media image={sl.image_url} video={sl.video_url} background className={cx("absolute inset-0 h-full w-full", !sl.video_url && n === i && "kenburns")} />
        </div>
      ))}
      {!slides.length && <div className="absolute -top-32 -right-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-sun-500/25 blur-3xl float-slow" aria-hidden />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950 via-navy-950/70 to-navy-950/20" style={{ opacity: Math.min(90, Math.max(0, s.overlay)) / 100 + 0.1 }} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-navy-950/70 to-transparent" aria-hidden />
      <div className={cx("container-x py-20", center && "text-center")}>
        <div className={cx("max-w-3xl", center && "mx-auto")}>
          {s.badge && (
            <p className="hero-in mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sun-300 ring-1 ring-white/20 backdrop-blur">
              <SunIcon className="h-4 w-4" /> {s.badge}
            </p>
          )}
          <h1 className="hero-in text-4xl leading-tight font-bold sm:text-6xl sm:leading-tight" style={{ "--d": "120ms" } as CSSProperties}>{s.title}</h1>
          {s.subtitle && <p className={cx("hero-in mt-5 max-w-xl text-lg text-navy-100 sm:text-xl", center && "mx-auto")} style={{ "--d": "240ms" } as CSSProperties}>{s.subtitle}</p>}
          {s.buttons.some((b) => b.label) && (
            <div className={cx("hero-in mt-9 flex flex-wrap gap-3", center && "justify-center")} style={{ "--d": "360ms" } as CSSProperties}>
              {s.buttons.filter((b) => b.label).map((b, n) => (
                <ButtonLink key={n} to={b.href || "/"} variant={n === 0 ? "sun" : "secondary"} className="!px-6 !py-3 text-base">
                  {b.label}{n === 0 && <ArrowRightIcon className="h-4 w-4" />}
                </ButtonLink>
              ))}
            </div>
          )}
          {s.show_brands && about.brands.length > 0 && (
            <div className={cx("hero-in mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-navy-200", center && "justify-center")} style={{ "--d": "480ms" } as CSSProperties}>
              <span>ตัวแทนจำหน่าย</span>
              {about.brands.map((b) => <span key={b} className="font-semibold tracking-wide text-white">{b}</span>)}
            </div>
          )}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
          {slides.map((_, n) => (
            <button key={n} type="button" aria-label={`สไลด์ ${n + 1}`} onClick={() => setI(n)} className={cx("h-1.5 rounded-full transition-all", n === i ? "w-8 bg-sun-400" : "w-3 bg-white/50 hover:bg-white")} />
          ))}
        </div>
      )}
      {s.height === "full" && (
        <a href="#after-hero" className="absolute right-6 bottom-6 hidden h-10 w-6 justify-center rounded-full ring-2 ring-white/50 md:flex" aria-label="เลื่อนลง">
          <span className="scroll-cue mt-2 h-2 w-1 rounded-full bg-white" />
        </a>
      )}
    </section>
  );
}

function Modules({ s, afterHero }: { s: ModulesSection; afterHero: boolean }) {
  return (
    <section id={`s-${s.id}`} className={cx("container-x relative z-10", afterHero ? "-mt-12" : "py-16")}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {s.items.map((m, n) => {
          const Icon = ICONS[m.icon] ?? SunIcon;
          return (
            <Reveal key={n} anim={s.anim} delay={n * 90}>
              <SmartLink href={m.href} className="group flex h-full flex-col rounded-2xl bg-white p-4 sm:p-6 shadow-lg shadow-navy-900/5 ring-1 ring-slate-200 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-sun-400">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-sun-500/15 text-sun-600 transition group-hover:scale-110 group-hover:bg-sun-500 group-hover:text-white"><Icon className="h-6 w-6" /></span>
                <h3 className="mt-4 font-semibold text-navy-900">{m.title}</h3>
                <p className="mt-1 flex-1 text-sm text-slate-600">{m.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 opacity-0 transition group-hover:opacity-100">ดูเพิ่มเติม <ArrowRightIcon className="h-4 w-4" /></span>
              </SmartLink>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function Stats({ s }: { s: StatsSection }) {
  const dark = isDark(s.bg);
  return (
    <Shell s={s} pad="py-16">
      <div className="container-x">
        <Heading s={s} center dark={dark} />
        <div className={cx("grid gap-6 text-center", s.items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
          {s.items.map((it, n) => (
            <Reveal key={n} anim={s.anim} delay={n * 100}>
              <p className={cx("text-4xl font-bold sm:text-5xl", dark ? "text-sun-400" : "text-navy-900")}><CountUp value={Number(it.value) || 0} suffix={it.suffix} /></p>
              <p className={cx("mt-2 text-sm sm:text-base", dark ? "text-navy-100" : "text-slate-600")}>{it.label}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function ImageText({ s }: { s: ImageTextSection }) {
  const dark = isDark(s.bg);
  const right = s.side === "right";
  return (
    <Shell s={s}>
      <div className="container-x grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal anim={s.anim === "slide" ? (right ? "slide-r" : "slide") : s.anim} className={cx("relative", right && "md:order-2")}>
          <div className="absolute -inset-3 -z-10 rounded-3xl bg-sun-500/20 blur-2xl" aria-hidden />
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-200 shadow-2xl">
            <Media image={s.image_url} video={s.video_url} className="absolute inset-0 h-full w-full transition duration-700 hover:scale-105" />
          </div>
        </Reveal>
        <Reveal anim={s.anim === "slide" ? (right ? "slide" : "slide-r") : s.anim} delay={150}>
          {s.eyebrow && <p className={cx("mb-2 text-sm font-semibold", dark ? "text-sun-300" : "text-sun-600")}>{s.eyebrow}</p>}
          <h2 className={cx("text-2xl font-bold sm:text-4xl", dark ? "text-white" : "text-navy-900")}>{s.title}</h2>
          {s.text && <p className={cx("mt-4 whitespace-pre-line text-base leading-relaxed sm:text-lg", dark ? "text-navy-100" : "text-slate-600")}>{s.text}</p>}
          {s.bullets.length > 0 && (
            <ul className="mt-6 space-y-3">
              {s.bullets.map((b, n) => (
                <li key={n} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun-500 text-xs font-bold text-white">✓</span>
                  <span className={dark ? "text-navy-50" : "text-slate-700"}>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {s.button.label && <ButtonLink to={s.button.href || "/"} variant="sun" className="mt-8">{s.button.label}<ArrowRightIcon className="h-4 w-4" /></ButtonLink>}
        </Reveal>
      </div>
    </Shell>
  );
}

function VideoBlock({ s }: { s: VideoSection }) {
  const dark = isDark(s.bg);
  return (
    <Shell s={s}>
      <div className="container-x">
        <Heading s={s} center dark={dark} />
        <Reveal anim={s.anim} className="mx-auto max-w-5xl">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-navy-950 shadow-2xl ring-1 ring-black/5">
            {s.video_url ? (
              s.autoplay
                ? <Media video={s.video_url} poster={s.poster_url} background className="absolute inset-0 h-full w-full" />
                : <Media video={s.video_url} poster={s.poster_url} className="absolute inset-0 h-full w-full" />
            ) : (
              <div className="grid h-full place-items-center text-navy-200">ยังไม่ได้ใส่วิดีโอ</div>
            )}
          </div>
        </Reveal>
      </div>
    </Shell>
  );
}

function Cards({ s }: { s: CardsSection }) {
  const dark = isDark(s.bg);
  const cols = s.columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : s.columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <Shell s={s}>
      <div className="container-x">
        <Heading s={s} dark={dark} />
        <div className={cx("grid gap-6", cols)}>
          {s.items.map((c, n) => {
            const body = (
              <>
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-200">
                  {c.image_url && <img src={c.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/50 to-transparent opacity-0 transition group-hover:opacity-100" />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-navy-900">{c.title}</h3>
                  {c.text && <p className="mt-1 text-sm text-slate-600">{c.text}</p>}
                  {c.href && <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700">ดูเพิ่มเติม <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" /></span>}
                </div>
              </>
            );
            const cls = "group block h-full overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-200 transition duration-300 hover:-translate-y-1 hover:shadow-xl";
            return (
              <Reveal key={n} anim={s.anim} delay={n * 90}>
                {c.href ? <SmartLink href={c.href} className={cls}>{body}</SmartLink> : <div className={cls}>{body}</div>}
              </Reveal>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

function Logos({ s }: { s: LogosSection }) {
  const { about } = useSiteSettings();
  const dark = isDark(s.bg);
  const items: ReactNode[] = s.logos.length
    ? s.logos.map((src, n) => <img key={n} src={src} alt="" className={cx("h-10 w-auto max-w-[9rem] object-contain opacity-70 transition hover:opacity-100 sm:h-12", !dark && "grayscale hover:grayscale-0")} />)
    : about.brands.map((b) => <span key={b} className={cx("text-xl font-bold tracking-wide sm:text-2xl", dark ? "text-white/80" : "text-navy-800/70")}>{b}</span>);
  if (!items.length) return null;
  const loop = s.marquee && items.length > 2;
  return (
    <Shell s={s} pad="py-12">
      <div className="container-x">
        {s.title && <p className={cx("mb-8 text-center text-sm font-semibold tracking-wide", dark ? "text-navy-200" : "text-slate-500")}>{s.title}</p>}
        <Reveal anim={s.anim}>
          {loop ? (
            <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
              <div className="marquee flex w-max items-center gap-16">
                {[...items, ...items.map((x, n) => <span key={`d${n}`} aria-hidden className="contents">{x}</span>)].map((x, n) => <div key={n} className="shrink-0">{x}</div>)}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6">{items}</div>
          )}
        </Reveal>
      </div>
    </Shell>
  );
}

function Gallery({ s }: { s: GallerySection }) {
  const [open, setOpen] = useState<number | null>(null);
  const dark = isDark(s.bg);
  useEffect(() => {
    if (open === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((n) => (n === null ? n : (n + 1) % s.images.length));
      if (e.key === "ArrowLeft") setOpen((n) => (n === null ? n : (n - 1 + s.images.length) % s.images.length));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, s.images.length]);
  if (!s.images.length) return null;
  // One large feature image only when the rest fill whole rows of 4 (5, 9, 13 …); otherwise an even grid.
  const count = s.images.length;
  const feature = count >= 5 && (count - 1) % 4 === 0;
  const cols = feature || count % 3 !== 0 ? "md:grid-cols-4" : "md:grid-cols-3";
  return (
    <Shell s={s}>
      <div className="container-x">
        <Heading s={s} dark={dark} />
        <div className={cx("grid grid-cols-2 gap-3", cols)}>
          {s.images.map((src, n) => (
            <Reveal key={n} anim={s.anim} delay={(n % 4) * 80} className={cx(feature && n === 0 && "md:col-span-2 md:row-span-2")}>
              <button type="button" onClick={() => setOpen(n)} className="group relative block aspect-square h-full w-full overflow-hidden rounded-xl bg-slate-200">
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                <span className="absolute inset-0 bg-navy-950/0 transition group-hover:bg-navy-950/20" />
              </button>
            </Reveal>
          ))}
        </div>
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setOpen(null)} role="dialog" aria-modal>
          <img src={s.images[open]} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button type="button" className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="ปิด"><XIcon className="h-6 w-6" /></button>
        </div>
      )}
    </Shell>
  );
}

function Cta({ s }: { s: CtaSection }) {
  const dark = isDark(s.bg) || !!s.image_url;
  return (
    <section id={`s-${s.id}`} className="container-x py-16">
      <Reveal anim={s.anim}>
        <div className={cx("relative isolate overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-16", s.image_url ? "bg-navy-950 text-white" : s.bg ? BG[s.bg] : BG.brand)}>
          {s.image_url && (
            <>
              <img src={s.image_url} alt="" className="kenburns absolute inset-0 -z-20 h-full w-full object-cover" />
              <div className="absolute inset-0 -z-10 bg-navy-950/70" />
            </>
          )}
          <div className="absolute -top-20 -right-20 -z-10 h-64 w-64 rounded-full bg-white/15 blur-2xl float-slow" aria-hidden />
          <h2 className={cx("text-2xl font-bold sm:text-4xl", dark ? "text-white" : "text-navy-950")}>{s.title}</h2>
          {s.text && <p className={cx("mx-auto mt-3 max-w-2xl text-base sm:text-lg", dark ? "text-navy-100" : "text-navy-900/80")}>{s.text}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {s.buttons.filter((b) => b.label).map((b, n) => (
              <ButtonLink key={n} to={b.href || "/"} variant={n === 0 ? (dark ? "sun" : "primary") : "secondary"} className="!px-6 !py-3 text-base">{b.label}</ButtonLink>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function TextBlock({ s }: { s: TextSection }) {
  const dark = isDark(s.bg);
  const center = s.align === "center";
  return (
    <Shell s={s}>
      <Reveal anim={s.anim} className={cx("container-x max-w-3xl", center && "text-center")}>
        {s.eyebrow && <p className={cx("mb-2 text-sm font-semibold", dark ? "text-sun-300" : "text-sun-600")}>{s.eyebrow}</p>}
        {s.title && <h2 className={cx("text-2xl font-bold sm:text-4xl", dark ? "text-white" : "text-navy-900")}>{s.title}</h2>}
        {s.body && <div className={cx("mt-5 space-y-4 text-base leading-relaxed sm:text-lg", dark ? "text-navy-100" : "text-slate-600")}>{s.body.split(/\n{2,}/).map((p, n) => <p key={n} className="whitespace-pre-line">{p}</p>)}</div>}
      </Reveal>
    </Shell>
  );
}

// ---------- blocks fed by the rest of the system ----------
function About({ s }: { s: FeedSection }) {
  const { about } = useSiteSettings();
  const onAboutPage = useLocation().pathname === "/about";
  return (
    <Shell s={s}>
      <div className="container-x grid gap-10 md:grid-cols-2">
        <Reveal anim={s.anim}><SectionHeading eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle} /></Reveal>
        <Reveal anim={s.anim} delay={150} className="space-y-4 text-slate-600">
          <p className="whitespace-pre-line text-lg leading-relaxed">{about.history}</p>
          <p className="whitespace-pre-line border-l-4 border-sun-500 pl-4 font-medium text-navy-800">{about.vision}</p>
          {!onAboutPage && <Link to="/about" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">อ่านเพิ่มเติม <ArrowRightIcon className="h-4 w-4" /></Link>}
        </Reveal>
      </div>
    </Shell>
  );
}

/** App-style shop strip: search, category icons, featured products in a swipeable row. */
function Shop({ s }: { s: FeedSection }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const cats = useRows<Category>(() => supabase.from("product_categories").select("*").is("parent_id", null).order("sort").order("name"));
  const prods = useRows<Product>(() =>
    supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("is_featured", { ascending: false }).order("sort").limit(Math.max(s.limit || 8, 1) * 3),
  );
  const list = useMemo(
    () => prods.rows.map((p) => ({ ...p, product_variants: (p.product_variants ?? []).filter((v) => v.is_active) })),
    [prods.rows],
  );
  const featured = list.slice(0, s.limit || 8);
  const { price, stock } = usePricing(useMemo(() => featured.flatMap((p) => p.product_variants ?? []), [featured]));
  const catImage = (id: string) => { const p = list.find((x) => x.category_id === id); return p ? productImage(p) : ""; };
  const dark = isDark(s.bg);
  return (
    <Shell s={s} pad="py-10 sm:py-16">
      <div className="container-x">
        <form onSubmit={(e) => { e.preventDefault(); nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }} className="relative mx-auto max-w-2xl">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสินค้า รุ่น หรือรหัสสินค้า" className="w-full rounded-2xl border-0 bg-slate-100 py-3.5 pr-4 pl-12 text-sm ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-navy-500" />
        </form>
        {cats.rows.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-6">
            {cats.rows.slice(0, 12).map((c, n) => {
              const img = catImage(c.id);
              return (
                <Reveal key={c.id} anim={s.anim} delay={(n % 6) * 60} className="w-24 shrink-0 sm:w-auto">
                  <Link to={`/products?category=${c.slug}`} className="flex h-full flex-col items-center gap-2 rounded-2xl bg-navy-50/60 p-3 text-center ring-1 ring-navy-100 transition hover:bg-navy-50 hover:ring-navy-300">
                    <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-white">{img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : <BoxIcon className="h-7 w-7 text-navy-400" />}</span>
                    <span className="line-clamp-2 text-xs font-medium text-navy-900">{c.name}</span>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        )}
        {featured.length > 0 && (
          <>
            <div className="mt-10 mb-4 flex items-end justify-between gap-3">
              <div>
                {s.eyebrow && <p className={cx("text-sm font-semibold", dark ? "text-sun-300" : "text-sun-600")}>{s.eyebrow}</p>}
                {s.title && <h2 className={cx("text-xl font-bold sm:text-3xl", dark ? "text-white" : "text-navy-900")}>{s.title}</h2>}
              </div>
              <Link to="/products" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">ดูทั้งหมด <ArrowRightIcon className="h-4 w-4" /></Link>
            </div>
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {featured.map((p) => {
                const vs = p.product_variants ?? [];
                const ps = vs.map((v) => price(v)).filter((x) => x.price != null);
                const lowest: PriceInfo | null = ps.length ? ps.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a)) : vs.length ? { price: null, base: null, kind: "ask" } : null;
                return <div key={p.id} className="w-44 shrink-0 snap-start sm:w-auto"><ProductCard p={p} price={lowest} stockSummary={vs.length === 1 ? stock.get(vs[0].sku) : undefined} /></div>;
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function ProductsTeaser({ s }: { s: FeedSection }) {
  const { rows, seats } = useUpcomingSessions(s.limit || 3);
  return (
    <Shell s={s} pad="py-16">
      <div className="container-x grid gap-6 md:grid-cols-2">
        <Reveal anim={s.anim} className="rounded-2xl bg-navy-50 p-8">
          <h3 className="text-xl font-semibold text-navy-900">{s.title}</h3>
          <p className="mt-2 text-slate-600">{s.subtitle}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink to="/products" variant="secondary">ดูสินค้าทั้งหมด</ButtonLink>
            <ButtonLink to="/promotions" variant="ghost">โปรโมชั่น</ButtonLink>
          </div>
        </Reveal>
        <Reveal anim={s.anim} delay={120} className="rounded-2xl bg-sun-500/10 p-8">
          <h3 className="text-xl font-semibold text-navy-900">อบรมและกิจกรรมที่กำลังจะมาถึง</h3>
          {rows.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {rows.map((x) => (
                <li key={x.id}>
                  <Link to={`/app/training/book/${x.id}`} className="block rounded-lg bg-white/70 px-3 py-2 transition hover:bg-white">
                    <span className="block font-medium text-navy-900">{x.courses.title}</span>
                    <span className="block text-xs text-slate-600">{sessionDateText(x)} · เหลือ {Math.max(x.capacity - (seats.get(x.id) ?? 0), 0)} ที่</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-600">ยังไม่มีรอบที่เปิดรับสมัคร</p>}
          <ButtonLink to="/training" variant="secondary" className="mt-4">ดูปฏิทินอบรม</ButtonLink>
        </Reveal>
      </div>
    </Shell>
  );
}

function Training({ s }: { s: FeedSection }) {
  const { rows, seats } = useUpcomingSessions(s.limit || 3);
  return (
    <Shell s={s}>
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading s={s} dark={isDark(s.bg)} />
          <Link to="/training" className="mb-10 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">ดูปฏิทินอบรม <ArrowRightIcon className="h-4 w-4" /></Link>
        </div>
        {rows.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((x, n) => <Reveal key={x.id} anim={s.anim} delay={n * 90}><SessionCard s={x} booked={seats.get(x.id) ?? 0} /></Reveal>)}
          </div>
        ) : <Empty>ยังไม่มีรอบที่เปิดรับสมัคร</Empty>}
      </div>
    </Shell>
  );
}

function Portfolio({ s }: { s: FeedSection }) {
  const portfolio = usePublishedPortfolio(s.limit || 6);
  return (
    <Shell s={s}>
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading s={s} dark={isDark(s.bg)} />
          <Link to="/portfolio" className="mb-10 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">ดูผลงานทั้งหมด <ArrowRightIcon className="h-4 w-4" /></Link>
        </div>
        {portfolio.rows.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.rows.map((p, n) => <Reveal key={p.id} anim={s.anim} delay={(n % 3) * 90}><PortfolioCard p={p} /></Reveal>)}
          </div>
        ) : <Empty>ผลงานจะแสดงที่นี่เมื่อ Admin เพิ่มโครงการจากหลังบ้าน</Empty>}
      </div>
    </Shell>
  );
}

function Team({ s }: { s: FeedSection }) {
  const team = usePublishedTeam();
  const limit = s.limit || 6;
  return (
    <Shell s={s}>
      <div className="container-x">
        <Heading s={s} dark={isDark(s.bg)} />
        {team.rows.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {team.rows.slice(0, limit).map((m, n) => <Reveal key={m.id} anim={s.anim} delay={(n % 3) * 90}><TeamCard m={m} /></Reveal>)}
          </div>
        ) : <Empty>รายชื่อทีมงานจะแสดงที่นี่เมื่อ Admin เพิ่มจากหลังบ้าน</Empty>}
        {team.rows.length > limit && (
          <Link to="/team" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">ดูทีมงานทั้งหมด <ArrowRightIcon className="h-4 w-4" /></Link>
        )}
      </div>
    </Shell>
  );
}

function Ad({ s }: { s: AdSection }) {
  return <AdSlot placement={s.placement} className="mt-10" />;
}

// ---------------------------------------------------------------------------
export function HomeSections({ sections }: { sections: HomeSection[] }) {
  const shown = sections.filter((s) => !s.hidden);
  return (
    <>
      {shown.map((s, n) => {
        const afterHero = n > 0 && shown[n - 1].type === "hero";
        const anchor = afterHero ? <div id="after-hero" /> : null;
        return (
          <div key={s.id}>
            {anchor}
            <Block s={s} afterHero={afterHero} />
          </div>
        );
      })}
    </>
  );
}

function Block({ s, afterHero }: { s: HomeSection; afterHero: boolean }) {
  switch (s.type) {
    case "hero": return <Hero s={s} />;
    case "modules": return <Modules s={s} afterHero={afterHero} />;
    case "stats": return <Stats s={s} />;
    case "image_text": return <ImageText s={s} />;
    case "video": return <VideoBlock s={s} />;
    case "cards": return <Cards s={s} />;
    case "logos": return <Logos s={s} />;
    case "gallery": return <Gallery s={s} />;
    case "cta": return <Cta s={s} />;
    case "text": return <TextBlock s={s} />;
    case "about": return <About s={s} />;
    case "products": return <ProductsTeaser s={s} />;
    case "shop": return <Shop s={s} />;
    case "training": return <Training s={s} />;
    case "portfolio": return <Portfolio s={s} />;
    case "team": return <Team s={s} />;
    case "contact": return <ContactBlock />;
    case "ad": return <Ad s={s} />;
  }
}
