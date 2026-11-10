import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Select } from "../../../../components/ui";
import { useRows } from "../../../../lib/content";
import { errorMessage, supabase } from "../../../../lib/supabase";
import { cols, formatMoney, SESSION_COLS, sessionDateText, todayBkk, type Course, type Session } from "../../../../lib/training";

interface PromoCode {
  id: string;
  code: string;
  session_id: string | null;
  kind: "free" | "amount" | "percent";
  value: number;
  max_uses: number | null;
  expires_on: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
}
type S = Session & { courses: Course };

const KIND: Record<PromoCode["kind"], string> = { free: "อบรมฟรี", amount: "ลดเป็นบาท", percent: "ลดเป็น %" };
const describe = (p: Pick<PromoCode, "kind" | "value">) =>
  p.kind === "free" ? "อบรมฟรี" : p.kind === "amount" ? `ลด ${formatMoney(p.value)}` : `ลด ${Number(p.value)}%`;
const randomCode = () => `SSC${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

/** Staff/Admin: promo codes for a session (or every session): free, baht off or percent off. */
export default function PromoCodesTab() {
  const codes = useRows<PromoCode>(() => supabase.from("training_promo_codes").select("*").order("created_at", { ascending: false }));
  const sessions = useRows<S>(() =>
    supabase.from("course_sessions").select(cols(`${SESSION_COLS}, courses(*)`)).eq("is_archived", false).neq("status", "cancelled")
      .gte("starts_on", todayBkk()).order("starts_on"),
  );
  const [uses, setUses] = useState<Map<string, number>>(new Map());
  const [f, setF] = useState({ code: randomCode(), session_id: "", kind: "free" as PromoCode["kind"], value: "", max_uses: "", expires_on: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  useEffect(() => {
    supabase.rpc("promo_code_uses").then(({ data }) => {
      const m = new Map<string, number>();
      for (const r of (data ?? []) as { promo_code_id: string; used: number }[]) m.set(r.promo_code_id, r.used);
      setUses(m);
    });
  }, [codes.rows]);

  const sessionName = (id: string | null) => {
    if (!id) return "ทุกรอบ";
    const s = sessions.rows.find((x) => x.id === id);
    return s ? `${s.courses.code} · ${sessionDateText(s)}` : "รอบที่ผ่านไปแล้ว";
  };

  async function create() {
    setMsg(null);
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return setMsg({ tone: "red", text: "โค้ดใช้ A-Z 0-9 - _ ยาว 3–30 ตัว" });
    const value = Number(f.value || 0);
    if (f.kind === "amount" && !(value > 0)) return setMsg({ tone: "red", text: "กรอกจำนวนเงินที่ลด" });
    if (f.kind === "percent" && !(value >= 1 && value <= 100)) return setMsg({ tone: "red", text: "เปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100" });
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("training_promo_codes").insert({
      code,
      session_id: f.session_id || null,
      kind: f.kind,
      value: f.kind === "free" ? 0 : value,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
      expires_on: f.expires_on || null,
      note: f.note.trim() || null,
      created_by: u.user?.id ?? null,
    });
    setBusy(false);
    if (error) {
      const dup = /duplicate|unique/i.test(error.message);
      return setMsg({ tone: "red", text: dup ? `มีโค้ด ${code} อยู่แล้ว` : errorMessage(error) });
    }
    setMsg({ tone: "green", text: `สร้างโค้ด ${code} แล้ว` });
    setF({ ...f, code: randomCode(), value: "", max_uses: "", note: "" });
    codes.reload();
  }
  async function toggle(p: PromoCode) {
    await supabase.from("training_promo_codes").update({ is_active: !p.is_active }).eq("id", p.id);
    codes.reload();
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-semibold text-navy-900">สร้างโค้ดโปรโมชั่น</h3>
        <p className="text-sm text-slate-500">ลูกค้ากรอกโค้ดตอนจอง ถ้าเป็นโค้ดอบรมฟรี ระบบจะจองให้ทันทีโดยไม่ต้องกรอกใบเสร็จหรือแนบสลิป</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="โค้ด" required>
            <div className="flex gap-2">
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono uppercase" />
              <Button variant="secondary" onClick={() => setF({ ...f, code: randomCode() })}>สุ่ม</Button>
            </div>
          </Field>
          <Field label="ใช้กับรอบอบรม">
            <Select value={f.session_id} onChange={(e) => setF({ ...f, session_id: e.target.value })}>
              <option value="">ทุกรอบ</option>
              {sessions.rows.map((s) => <option key={s.id} value={s.id}>{s.courses.code} · {sessionDateText(s)}{s.title ? ` · ${s.title}` : ""}</option>)}
            </Select>
          </Field>
          <Field label="ประเภท" required>
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PromoCode["kind"] })}>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {f.kind !== "free" && (
            <Field label={f.kind === "amount" ? "ลด (บาท)" : "ลด (%)"} required>
              <Input type="number" min={1} max={f.kind === "percent" ? 100 : undefined} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            </Field>
          )}
          <Field label="ใช้ได้กี่ครั้ง" hint="เว้นว่าง = ไม่จำกัด · ยกเลิกการจองแล้วสิทธิ์คืน">
            <Input type="number" min={1} value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} />
          </Field>
          <Field label="ใช้ได้ถึงวันที่" hint="เว้นว่าง = ไม่หมดอายุ">
            <Input type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="หมายเหตุ (เห็นเฉพาะทีมงาน)"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="เช่น สำหรับลูกค้าบริษัท ก / วิทยากรรับเชิญ" /></Field>
          </div>
        </div>
        {msg && <div className="mt-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        <Button className="mt-4" onClick={create} loading={busy}>สร้างโค้ด</Button>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-navy-900">โค้ดทั้งหมด</h3>
        {codes.loading ? (
          <Loading />
        ) : codes.rows.length ? (
          <div className="divide-y divide-slate-100">
            {codes.rows.map((p) => {
              const used = uses.get(p.id) ?? 0;
              const expired = Boolean(p.expires_on && p.expires_on < todayBkk());
              const full = p.max_uses != null && used >= p.max_uses;
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="font-mono font-semibold text-navy-900">{p.code}</span>
                  <Badge tone="green">{describe(p)}</Badge>
                  <span className="text-slate-600">{sessionName(p.session_id)}</span>
                  <span className="text-slate-500">ใช้แล้ว {used}{p.max_uses != null ? `/${p.max_uses}` : ""} ครั้ง</span>
                  {p.expires_on && <span className="text-slate-500">ถึง {new Date(`${p.expires_on}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>}
                  {p.note && <span className="text-slate-400">· {p.note}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {!p.is_active ? <Badge>ปิดแล้ว</Badge> : expired ? <Badge tone="amber">หมดอายุ</Badge> : full ? <Badge tone="amber">ใช้ครบแล้ว</Badge> : <Badge tone="navy">ใช้ได้</Badge>}
                    <Button variant="secondary" className="!px-3 !py-1 text-xs" onClick={() => toggle(p)}>{p.is_active ? "ปิดโค้ด" : "เปิดใช้"}</Button>
                    <Button variant="secondary" className="!px-3 !py-1 text-xs" onClick={() => navigator.clipboard?.writeText(p.code)}>คัดลอก</Button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>ยังไม่มีโค้ด</Empty>
        )}
      </Card>
    </div>
  );
}
