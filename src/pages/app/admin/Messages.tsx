import { useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { Badge, Card, Empty, Loading, PageTitle, Select, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { supabase } from "../../../lib/supabase";
import type { ContactMessage } from "../../../lib/types";

const STATUS = { new: "ใหม่", in_progress: "กำลังดำเนินการ", closed: "ปิดแล้ว" } as const;
const TOPIC: Record<string, string> = { general: "ทั่วไป", quotation: "ใบเสนอราคา", product: "สินค้า", training: "อบรม", service: "บริการ/เคลม" };

export default function Messages() {
  const { can, session } = useAuth();
  const [filter, setFilter] = useState<"" | ContactMessage["status"]>("new");
  const list = useRows<ContactMessage>(() => {
    let q = supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter) q = q.eq("status", filter);
    return q;
  }, [filter]);

  async function setStatus(m: ContactMessage, status: ContactMessage["status"]) {
    await supabase.from("contact_messages").update({ status, handled_by: session?.user.id }).eq("id", m.id);
    list.reload();
  }

  return (
    <Gate allow={can("contact_messages")}>
      <PageTitle
        title="ข้อความติดต่อ"
        subtitle="ข้อความจากแบบฟอร์มหน้าเว็บ"
        actions={
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-44">
            <option value="">ทั้งหมด</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        }
      />
      {list.loading ? (
        <Loading />
      ) : list.rows.length ? (
        <div className="space-y-3">
          {list.rows.map((m) => (
            <Card key={m.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">
                    {m.name} {m.company && <span className="font-normal text-slate-500">· {m.company}</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {[m.phone && <a key="p" href={`tel:${m.phone}`} className="hover:underline">{m.phone}</a>, m.email && <a key="e" href={`mailto:${m.email}`} className="hover:underline">{m.email}</a>]
                      .filter(Boolean)
                      .reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, " · ", el] : [el]), [])}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.topic && <Badge tone="navy">{TOPIC[m.topic] ?? m.topic}</Badge>}
                  <Select value={m.status} onChange={(e) => setStatus(m, e.target.value as ContactMessage["status"])} className={cx("!w-40 !py-1.5", m.status === "new" && "!ring-amber-400")}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{m.message}</p>
              <p className="mt-2 text-xs text-slate-400">{new Date(m.created_at).toLocaleString("th-TH")}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>ไม่มีข้อความ</Empty>
      )}
    </Gate>
  );
}
