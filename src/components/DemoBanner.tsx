import { DEMO } from "../lib/demo";

/** Small always-on badge so nobody mistakes the demo site for the live one. */
export default function DemoBanner() {
  if (!DEMO) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center">
      <div className="rounded-b-lg bg-amber-400 px-3 py-0.5 text-[11px] font-semibold text-amber-950 shadow">
        ระบบสาธิต · ข้อมูลทั้งหมดเป็นข้อมูลตัวอย่าง
      </div>
    </div>
  );
}
