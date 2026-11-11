import type { CompanySettings } from "../lib/types";

type Key = "facebook_url" | "line_oa_url" | "youtube_url" | "tiktok_url" | "instagram_url" | "x_url" | "website_url";

const P = { fill: "currentColor" } as const;

/** Social networks shown as round logo buttons; order = display order. */
export const SOCIALS: { key: Key; name: string; color: string; icon: JSX.Element }[] = [
  { key: "facebook_url", name: "Facebook", color: "#1877F2", icon: <path {...P} d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" /> },
  { key: "line_oa_url", name: "LINE", color: "#06C755", icon: <><path {...P} d="M12 3.5c-5 0-9 3.2-9 7.2 0 3.6 3.2 6.6 7.5 7.1.3.1.7.2.8.5.1.2.1.6 0 .8l-.1.8c0 .2-.2.9.8.5s5.4-3.2 7.4-5.4c1.4-1.5 2-3 2-4.3 0-4-4-7.2-9-7.2z" /><path fill="#fff" d="M7 9h1v3h1.8v1H7V9zm3.6 0h1v4h-1V9zm1.9 0h1l1.6 2.3V9h1v4h-1l-1.6-2.3V13h-1V9zm4.2 0H19v1h-1.3v.5H19v1h-1.3v.5H19v1h-2.3V9z" /></> },
  { key: "youtube_url", name: "YouTube", color: "#FF0000", icon: <path {...P} d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z" /> },
  { key: "tiktok_url", name: "TikTok", color: "#000000", icon: <path {...P} d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.6a6.7 6.7 0 0 1-3.8-1.2v5.6c0 3.3-2.3 5.7-5.6 5.7S5.5 17 5.5 14c0-3.3 2.8-5.6 6.2-5.2v2.8c-1.6-.3-3.3.6-3.3 2.4 0 1.5 1.1 2.6 2.6 2.6 1.6 0 2.7-1 2.7-2.9V3h2.9z" /> },
  { key: "instagram_url", name: "Instagram", color: "#E4405F", icon: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle {...P} cx="17.3" cy="6.7" r="1.2" /></> },
  { key: "x_url", name: "X", color: "#000000", icon: <path {...P} d="M17.5 3.5h3l-6.6 7.5 7.7 9.5h-6l-4.7-6-5.4 6h-3l7-8L2.4 3.5h6.2l4.3 5.5 4.6-5.5zm-1 15.3h1.7L7.6 5.1H5.8l10.7 13.7z" /> },
  { key: "website_url", name: "เว็บไซต์", color: "#0F2D52", icon: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z" fill="none" stroke="currentColor" strokeWidth="1.8" /></> },
];

/** Round social logo buttons; renders nothing when no link is set. */
export function SocialLinks({ company, tone = "dark", className = "" }: { company: CompanySettings; tone?: "dark" | "light"; className?: string }) {
  const items = SOCIALS.filter((s) => (company[s.key] ?? "").trim());
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((s) => (
        <a
          key={s.key}
          href={company[s.key]}
          target="_blank"
          rel="noreferrer"
          aria-label={s.name}
          title={s.name}
          style={{ ["--brand" as string]: s.color }}
          className={
            tone === "dark"
              ? "grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:-translate-y-0.5 hover:bg-[var(--brand)]"
              : "grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-[var(--brand)] transition hover:-translate-y-0.5 hover:bg-[var(--brand)] hover:text-white"
          }
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">{s.icon}</svg>
        </a>
      ))}
    </div>
  );
}
