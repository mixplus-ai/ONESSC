import { useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Badge, Card, Empty, Loading, PageTitle, Select } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { supabase } from "../../../lib/supabase";
import type { AuditLog } from "../../../lib/types";

const TABLE: Record<string, string> = {
  profiles: "ผู้ใช้",
  companies: "บริษัท",
  staff_permissions: "สิทธิ์ Staff",
  site_settings: "เนื้อหาเว็บ",
  portfolio_projects: "ผลงาน",
  team_members: "ทีมงาน",
  "auth.users": "บัญชี",
};
const ACTION: Record<string, { label: string; tone: "green" | "amber" | "red" | "navy" }> = {
  insert: { label: "เพิ่ม", tone: "green" },
  update: { label: "แก้ไข", tone: "amber" },
  delete: { label: "ลบ", tone: "red" },
  invite: { label: "เชิญ", tone: "navy" },
};
const IGNORED = new Set(["updated_at", "created_at"]);

function diff(log: AuditLog) {
  if (log.action !== "update" || !log.old_data || !log.new_data) return [];
  return Object.keys(log.new_data)
    .filter((k) => !IGNORED.has(k) && JSON.stringify(log.old_data![k]) !== JSON.stringify(log.new_data![k]))
    .map((k) => ({ k, from: log.old_data![k], to: log.new_data![k] }));
}
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function Logs() {
  const { isAdmin } = useAuth();
  const [table, setTable] = useState("");
  const list = useRows<AuditLog>(() => {
    let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (table) q = q.eq("table_name", table);
    return q;
  }, [table]);

  return (
    <Gate allow={isAdmin}>
      <PageTitle
        title="Log การใช้งาน"
        subtitle="200 รายการล่าสุด: ใคร ทำอะไร เมื่อไร ค่าเดิม/ค่าใหม่"
        actions={
          <Select value={table} onChange={(e) => setTable(e.target.value)} className="w-44">
            <option value="">ทุกประเภท</option>
            {Object.entries(TABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        }
      />
      {list.loading ? (
        <Loading />
      ) : list.rows.length ? (
        <div className="space-y-2">
          {list.rows.map((l) => {
            const a = ACTION[l.action] ?? { label: l.action, tone: "navy" as const };
            const d = diff(l);
            const subject = (l.new_data ?? l.old_data) as Record<string, unknown> | null;
            const name = subject?.full_name ?? subject?.title ?? subject?.name ?? subject?.email ?? subject?.key ?? subject?.perm;
            return (
              <Card key={l.id} className="!p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.tone}>{a.label}</Badge>
                  <span className="font-medium text-navy-900">{TABLE[l.table_name] ?? l.table_name}</span>
                  {name != null && <span className="text-slate-600">“{String(name)}”</span>}
                  <span className="ml-auto text-xs text-slate-400">{l.actor_email ?? "ระบบ"} · {new Date(l.created_at).toLocaleString("th-TH")}</span>
                </div>
                {d.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                    {d.map(({ k, from, to }) => (
                      <li key={k} className="break-all"><span className="font-mono text-slate-500">{k}</span>: {show(from)} → <b>{show(to)}</b></li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>ยังไม่มี Log</Empty>
      )}
    </Gate>
  );
}
