import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Input, Select, cx } from "../../../../components/ui";
import { BOARD_STATUS, CLAIM_STATUS, SHEET_HEADER, claimYear, download, sheetRows, snKey, toCsv, type BoardStatus, type Claim } from "../../../../lib/claims";
import ClaimDetail, { Pips } from "./Detail";
import { BulkDocsModal, NewClaimModal, PasteModal } from "./Tools";
import { useBoard } from "./shared";

type Scope = "all" | "claim_no" | "pcode" | "sn" | "doc" | "case" | "company";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "ทุกช่อง" },
  { key: "claim_no", label: "เลขเคลม" },
  { key: "pcode", label: "รหัสสินค้า" },
  { key: "sn", label: "SN (ทุกขั้นตอน)" },
  { key: "doc", label: "เลขใบสำคัญ / เลขที่เบิก" },
  { key: "case", label: "Case ID / SiteID" },
  { key: "company", label: "ชื่อบริษัท" },
];

export default function Board({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const { claims, unitsBy, statusBy, canEdit, reload, loadedAt, brands } = useBoard();
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [year, setYear] = useState<number | "all">("all");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState<BoardStatus | "all">("all");
  const [desc, setDesc] = useState(true);
  const [tool, setTool] = useState<"" | "new" | "paste" | "import" | "docs">("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        document.getElementById("claim-search")?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const years = useMemo(() => [...new Set(claims.map(claimYear))].sort((a, b) => b - a), [claims]);
  const needle = q.trim().toLowerCase();
  const snNeedle = snKey(q.trim());
  const match = (c: Claim): string | null => {
    if (!needle) return "";
    const units = unitsBy.get(c.id) ?? [];
    const has = (v: string | null | undefined) => Boolean(v && v.toLowerCase().includes(needle));
    const checks: Record<Exclude<Scope, "all">, () => string | null> = {
      claim_no: () => (has(c.claim_no) || has(c.legacy_ref) ? "" : null),
      pcode: () => { const u = units.find((x) => [x.pcode, x.ret_pcode, x.rcv_pcode, x.ok_pcode].some(has)); return u ? `รหัส ${u.pcode}` : has(c.model) ? "" : null; },
      sn: () => {
        for (const u of units) for (const k of ["iss_sn", "ret_sn", "rcv_sn", "ok_sn"] as const) if (u[k] && snKey(u[k]).includes(snNeedle)) return `${k.replace("_sn", "").toUpperCase()} ${u[k]}`;
        return c.reported_sns.some((s) => snKey(s).includes(snNeedle)) ? "SN ที่ลูกค้าแจ้ง" : null;
      },
      doc: () => { if (has(c.voucher_no)) return `ใบสำคัญ ${c.voucher_no}`; const u = units.find((x) => [x.iss_doc, x.ret_doc, x.rcv_doc, x.ok_doc].some(has)); return u ? `เลขที่เบิก ${[u.iss_doc, u.ret_doc, u.rcv_doc, u.ok_doc].find(has)}` : null; },
      case: () => (has(c.case_id) ? `Case ${c.case_id}` : has(c.site_id) ? `Site ${c.site_id}` : null),
      company: () => (has(c.company_name) || has(c.contact_name) ? "" : null),
    };
    if (scope !== "all") return checks[scope]();
    for (const k of Object.keys(checks) as Exclude<Scope, "all">[]) { const r = checks[k](); if (r !== null) return r; }
    return null;
  };
  const base = claims.filter((c) => (year === "all" || claimYear(c) === year) && (!brand || c.brand_id === brand));
  const counts = { all: base.length, open: 0, done: 0, problem: 0 } as Record<BoardStatus | "all", number>;
  let unitsTotal = 0;
  for (const c of base) { counts[statusBy.get(c.id) ?? "open"]++; unitsTotal += unitsBy.get(c.id)?.length ?? 0; }
  const list = base
    .filter((c) => status === "all" || statusBy.get(c.id) === status)
    .map((c) => ({ c, hit: match(c) }))
    .filter((x) => x.hit !== null)
    .sort((a, b) => (desc ? b.c.claim_no.localeCompare(a.c.claim_no, "en", { numeric: true }) : a.c.claim_no.localeCompare(b.c.claim_no, "en", { numeric: true })));
  const sel = claims.find((c) => c.id === selected) ?? null;

  function exportCsv() {
    const rows: (string | number)[][] = [];
    for (const { c } of list) {
      const st = BOARD_STATUS[statusBy.get(c.id) ?? "open"].label;
      for (const r of sheetRows([c], unitsBy)) rows.push([...r, st]);
    }
    download(`claims-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([[...SHEET_HEADER, "สถานะ"], ...rows]));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select className="!w-auto" value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="ค้นหาใน">
          {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        <Input id="claim-search" className="min-w-[12rem] flex-1" placeholder='ค้นหา (กด "/")' value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="secondary" onClick={exportCsv}>ส่งออก CSV</Button>
        <Button variant="ghost" onClick={() => reload()}>รีเฟรช</Button>
      </div>
      {canEdit && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="sun" onClick={() => setTool("new")}>+ เปิดใบเคลมใหม่</Button>
          <Button variant="secondary" onClick={() => setTool("paste")}>วางใบเคลมจาก Excel</Button>
          <Button variant="secondary" onClick={() => setTool("docs")}>กรอกเลขที่ใบเบิกทุกเคลม</Button>
          <Button variant="secondary" onClick={() => setTool("import")}>นำเข้าจากชีตเดิม (A–Z)</Button>
        </div>
      )}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([["all", "เคลมทั้งหมด"], ["open", "กำลังดำเนินการ"], ["done", "ปิดครบ 4 ขั้นตอน"], ["problem", "ต้องตรวจสอบ"]] as [BoardStatus | "all", string][]).map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={cx("rounded-xl p-3 text-left ring-1", status === k ? "bg-navy-800 text-white ring-navy-800" : "bg-white ring-slate-200 hover:ring-navy-200")}>
            <p className="text-xl font-bold">{counts[k].toLocaleString()}</p><p className="text-xs opacity-80">{label}</p>
          </button>
        ))}
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-xl font-bold text-navy-900">{unitsTotal.toLocaleString()}</p><p className="text-xs text-slate-500">หน่วยสินค้า</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{list.length.toLocaleString()} เลขเคลม{loadedAt ? ` · ข้อมูล ณ ${loadedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            <Select className="!w-auto !py-1 text-xs" value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="ปี">
              <option value="all">ทุกปี</option>{years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
            </Select>
            <Select className="!w-auto !py-1 text-xs" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="แบรนด์">
              <option value="">ทุกแบรนด์</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <button className="underline" onClick={() => setDesc((d) => !d)}>{desc ? "ใหม่ → เก่า" : "เก่า → ใหม่"}</button>
          </div>
          {list.length === 0 ? <Empty>ไม่พบเคลม</Empty> : (
            <ul className="max-h-[75vh] space-y-1 overflow-y-auto pr-1">
              {list.slice(0, 400).map(({ c, hit }) => {
                const st = BOARD_STATUS[statusBy.get(c.id) ?? "open"];
                const units = unitsBy.get(c.id) ?? [];
                return (
                  <li key={c.id}>
                    <button onClick={() => onSelect(c.id)} className={cx("w-full rounded-xl p-3 text-left ring-1 transition", selected === c.id ? "bg-navy-50 ring-navy-300" : "bg-white ring-slate-200 hover:ring-navy-200")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-navy-900">{c.claim_no}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <p className="truncate text-xs text-slate-600">{c.company_name ?? "-"}</p>
                      {c.source === "customer" && <p className="text-[11px] text-sky-700">ลูกค้าแจ้งออนไลน์ · {CLAIM_STATUS[c.status].label}</p>}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-slate-500">{hit || units[0]?.pcode || c.model || ""}</span>
                        <Pips claim={c} units={units} />
                      </div>
                    </button>
                  </li>
                );
              })}
              {list.length > 400 && <li className="p-2 text-center text-xs text-slate-500">แสดง 400 รายการแรก ค้นหาเพื่อกรองเพิ่ม</li>}
            </ul>
          )}
        </div>
        <div className="min-w-0">{sel ? <ClaimDetail claim={sel} /> : <Card><p className="text-sm text-slate-500">เลือกเลขเคลมทางซ้ายเพื่อดูทั้ง 5 ขั้นตอน</p></Card>}</div>
      </div>

      {canEdit && (
        <>
          <NewClaimModal open={tool === "new"} onClose={() => setTool("")} onCreated={(no) => { const c = claims.find((x) => x.claim_no === no); if (c) onSelect(c.id); setQ(no); setScope("claim_no"); }} />
          <PasteModal open={tool === "paste"} onClose={() => setTool("")} mode="header" />
          <PasteModal open={tool === "import"} onClose={() => setTool("")} mode="full" />
          <BulkDocsModal open={tool === "docs"} onClose={() => setTool("")} />
        </>
      )}
    </div>
  );
}
