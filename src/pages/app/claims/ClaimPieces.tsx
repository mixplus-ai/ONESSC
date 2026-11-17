import { productTypeLabel, type ClaimDetails } from "../../../lib/claims";

/** The pieces a customer reported (claim form v2/v3): type, model, S/N, failed panel position, the inverter it belongs to. */
export function ClaimPieces({ d }: { d: ClaimDetails }) {
  const units = d.units ?? [];
  if (!units.length) return null;
  const measure = units.some((u) => u.volt || u.ohm);
  const v3 = units.some((u) => u.kind || u.pos || u.inv_sn);
  const refOnly = (d.inverters ?? []).filter((i) => !i.claimed && !units.some((u) => u.kind === "inverter" && u.sn?.toUpperCase() === i.sn.toUpperCase()));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3">#</th>{v3 && <th className="py-1 pr-3">ประเภท</th>}<th className="py-1 pr-3">รุ่น</th><th className="py-1 pr-3">S/N</th>
            {v3 && <><th className="py-1 pr-3">ตำแหน่งที่เสีย</th><th className="py-1 pr-3">Inverter อ้างอิง</th></>}
            <th className="py-1 pr-3">อาการ</th>{measure && <><th className="py-1 pr-3">V</th><th className="py-1 pr-3">Ω</th></>}
          </tr>
        </thead>
        <tbody>
          {units.map((u, k) => (
            <tr key={k} className="border-t border-slate-100">
              <td className="py-1 pr-3 text-slate-400">{k + 1}</td>
              {v3 && <td className="py-1 pr-3">{productTypeLabel(u.kind)}</td>}
              <td className="py-1 pr-3">{u.model ?? "-"}</td><td className="py-1 pr-3 font-mono">{u.sn || "-"}</td>
              {v3 && <><td className="py-1 pr-3 font-mono">{u.pos || "-"}</td><td className="py-1 pr-3 font-mono">{u.kind === "inverter" ? "-" : u.inv_sn || "-"}</td></>}
              <td className="py-1 pr-3">{u.symptom || "-"}</td>
              {measure && <><td className="py-1 pr-3">{u.volt || "-"}</td><td className="py-1 pr-3">{u.ohm || "-"}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
      {refOnly.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">Inverter อ้างอิง (ไม่ได้เคลม): {refOnly.map((i) => `${i.sn}${i.model ? ` (${i.model})` : ""}`).join(", ")}</p>
      )}
    </div>
  );
}
