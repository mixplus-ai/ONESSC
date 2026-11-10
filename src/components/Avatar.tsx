import { UserIcon } from "./icons";

/** Round profile photo; shown in the menu and on documents staff prepare for the user. */
export function Avatar({ url, name, className = "h-10 w-10" }: { url?: string | null; name?: string | null; className?: string }) {
  if (url) return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover ring-2 ring-white/20`} />;
  const initial = (name || "").trim().charAt(0).toUpperCase();
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-full bg-navy-100 font-semibold text-navy-700`}>
      {initial || <UserIcon className="h-1/2 w-1/2" />}
    </span>
  );
}
