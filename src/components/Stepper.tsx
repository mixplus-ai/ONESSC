import { cx } from "./ui";

/** Shipping-style progress line: done steps are ticked, the current one is highlighted. */
export function Stepper({ steps, current, stopped }: { steps: string[]; current: number; stopped?: string }) {
  return (
    <div className="mt-4">
      <ol className="flex items-start">
        {steps.map((label, i) => {
          const done = i < current || (i === current && i === steps.length - 1);
          const now = i === current && !done;
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span className={cx("absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2", i <= current && !stopped ? "bg-navy-600" : "bg-slate-200")} aria-hidden />}
              <span
                className={cx(
                  "relative z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-bold ring-4 ring-white",
                  stopped && i >= current ? "bg-slate-200 text-slate-400" : done ? "bg-navy-600 text-white" : now ? "bg-sun-500 text-navy-950 shadow-[0_0_0_4px] shadow-sun-500/25" : "bg-slate-200 text-slate-400",
                )}
              >
                {done && !(stopped && i >= current) ? "✓" : i + 1}
              </span>
              <span className={cx("mt-1.5 px-0.5 text-[11px] leading-tight sm:text-xs", now ? "font-semibold text-navy-900" : done ? "text-slate-700" : "text-slate-400")}>{label}</span>
            </li>
          );
        })}
      </ol>
      {stopped && <p className="mt-2 text-center text-xs font-medium text-slate-500">{stopped}</p>}
    </div>
  );
}
