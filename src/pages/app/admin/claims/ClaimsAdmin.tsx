import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Gate } from "../../../../components/AppLayout";
import { Alert, Loading, PageTitle } from "../../../../components/ui";
import { useAuth } from "../../../../lib/auth";
import { boardStatus, duplicateIssueClaims, groupUnits, loadBoard, type BoardStatus, type Claim, type ClaimUnit } from "../../../../lib/claims";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { Tabs } from "../../MyRequests";
import Board from "./Board";
import { ClaimAudit, ClaimDashboard } from "./Insights";
import Queue from "./Queue";
import ClaimSettingsTab from "./Settings";
import { BoardCtx, type BoardData, type BrandOpt, type StaffOpt } from "./shared";

type Tab = "queue" | "board" | "dashboard" | "audit" | "settings";

export default function ClaimsAdmin() {
  const { isStaff, can } = useAuth();
  const canEdit = can("claims");
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "queue";
  const selected = params.get("claim");
  const setTab = (t: Tab) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });
  const openClaim = (id: string | null) => setParams((p) => { p.set("tab", "board"); if (id) p.set("claim", id); else p.delete("claim"); return p; });

  const [claims, setClaims] = useState<Claim[]>([]);
  const [units, setUnits] = useState<ClaimUnit[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const reload = useCallback(async () => {
    try {
      const b = await loadBoard();
      setClaims(b.claims);
      setUnits(b.units);
      setLoadedAt(new Date());
      setErr("");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    if (!isStaff) return;
    Promise.all([
      reload(),
      supabase.from("profiles").select("id, full_name, email, role").in("role", ["admin", "staff"]).eq("is_active", true).order("full_name").then(({ data }) => setStaff((data ?? []) as StaffOpt[])),
      supabase.from("brands").select("id, name, slug").order("sort").order("name").then(({ data }) => setBrands((data ?? []) as BrandOpt[])),
    ]).finally(() => setLoading(false));
  }, [isStaff, reload]);
  // new claims from customers show up without a manual refresh: reload when the tab comes back and every 2 minutes
  useEffect(() => {
    if (!isStaff) return;
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => { if (document.visibilityState === "visible") reload(); }, 120_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(t); };
  }, [isStaff, reload]);

  const value: BoardData = useMemo(() => {
    const unitsBy = groupUnits(units);
    const dup = duplicateIssueClaims(units);
    const statusBy = new Map<string, BoardStatus>(claims.map((c) => [c.id, boardStatus(c, unitsBy.get(c.id) ?? [], dup.has(c.id))]));
    return { claims, units, unitsBy, statusBy, staff, brands, canEdit, reload, loadedAt };
  }, [claims, units, staff, brands, canEdit, reload, loadedAt]);

  const newCount = claims.filter((c) => c.source === "customer" && c.status === "submitted").length;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "queue", label: "คิวเคลมจากลูกค้า", count: newCount },
    { key: "board", label: "ผัง 5 ขั้นตอน" },
    { key: "dashboard", label: "แดชบอร์ด" },
    { key: "audit", label: "รายงานตรวจสอบ" },
    ...(canEdit ? [{ key: "settings" as Tab, label: "ตั้งค่า" }] : []),
  ];

  return (
    <Gate allow={isStaff}>
      <PageTitle title="งานบริการและเคลม" subtitle={canEdit ? "จัดการคิวเคลม ผัง 5 ขั้นตอน นำเข้าข้อมูล และตั้งค่า" : "ดูผัง 5 ขั้นได้ทั้งหมด · อัปเดตสถานะได้เฉพาะเคลมที่คุณรับเรื่อง"} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}
      {loading ? <Loading /> : (
        <BoardCtx.Provider value={value}>
          {tab === "queue" && <Queue onOpenBoard={openClaim} />}
          {tab === "board" && <Board selected={selected} onSelect={openClaim} />}
          {tab === "dashboard" && <ClaimDashboard />}
          {tab === "audit" && <ClaimAudit onOpen={openClaim} />}
          {tab === "settings" && canEdit && <ClaimSettingsTab />}
        </BoardCtx.Provider>
      )}
    </Gate>
  );
}
