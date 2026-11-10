import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Gate } from "../../../components/AppLayout";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageTitle, Select } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useRows } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import { DEPARTMENT_LABEL, ROLE_LABEL, type AppRole, type PermissionKey, type Profile } from "../../../lib/types";

const STAFF_DEPTS = ["sales", "service", "coordination", "other"];

function AccessEditor({ user, permKeys, onDone }: { user: Profile; permKeys: PermissionKey[]; onDone: () => void }) {
  const [role, setRole] = useState<AppRole>(user.role);
  const [dept, setDept] = useState(user.department ?? "");
  const [active, setActive] = useState(user.is_active);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("staff_permissions").select("perm").eq("user_id", user.id).then(({ data }) => setPerms(new Set((data ?? []).map((r) => r.perm as string))));
  }, [user.id]);

  async function save() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("admin_set_user_access", {
      p_user_id: user.id,
      p_role: role,
      p_department: role === "user" ? null : dept || null,
      p_is_active: active,
      p_perms: role === "staff" ? [...perms] : [],
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onDone();
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="บทบาท">
          <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            {(["user", "staff", "admin"] as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        {role !== "user" && (
          <Field label="แผนก">
            <Select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">-</option>
              {STAFF_DEPTS.map((d) => <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>)}
            </Select>
          </Field>
        )}
        <Field label="สถานะบัญชี">
          <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
            <option value="1">ใช้งาน</option>
            <option value="0">ระงับ</option>
          </Select>
        </Field>
      </div>
      {role === "staff" && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">สิทธิ์เพิ่มเติมของ Staff</p>
          <p className="mb-3 text-xs text-slate-500">ทุก Staff ทำได้เสมอ: อนุมัติผูกบริษัท ปรับราคาเฉพาะลูกค้า ตอบใบเสนอราคา จัดการแต้มบริษัท อัปเดตสถานะเคลม (เมื่อโมดูลพร้อม)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {permKeys.map((k) => (
              <label key={k.key} className="flex items-start gap-3 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={perms.has(k.key)}
                  onChange={(e) => {
                    const next = new Set(perms);
                    if (e.target.checked) next.add(k.key);
                    else next.delete(k.key);
                    setPerms(next);
                  }}
                />
                <span>
                  <span className="font-medium text-slate-800">{k.label}</span>
                  {k.description && <span className="block text-xs text-slate-500">{k.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {err && <Alert>{err}</Alert>}
      <div className="flex gap-2">
        <Button onClick={save} loading={busy}>บันทึกสิทธิ์</Button>
        <Button variant="ghost" onClick={onDone}>ยกเลิก</Button>
      </div>
    </div>
  );
}

function InviteForm({ permKeys, onDone }: { permKeys: PermissionKey[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [role, setRole] = useState<AppRole>("staff");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: f.get("email"),
        full_name: f.get("full_name"),
        role,
        department: f.get("department") || null,
        perms: f.getAll("perms"),
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    setBusy(false);
    if (error || data?.error) {
      let text = data?.error as string | undefined;
      if (!text && error && "context" in error) {
        try {
          text = (await (error.context as Response).json()).error;
        } catch {
          /* ignore */
        }
      }
      return setMsg({ tone: "red", text: text ?? errorMessage(error) });
    }
    form.reset();
    setMsg({ tone: "green", text: `ส่งอีเมลเชิญไปที่ ${data.email} แล้ว ผู้ใช้กดลิงก์เพื่อตั้งรหัสผ่าน` });
    onDone();
  }

  return (
    <Card className="mb-6">
      <h3 className="font-semibold text-navy-900">สร้างบัญชี Staff / Admin</h3>
      <p className="mt-1 text-sm text-slate-500">ระบบส่งอีเมลเชิญให้ตั้งรหัสผ่านเอง ถ้าคนนั้นสมัครเป็น User ไว้แล้ว ให้เปลี่ยนบทบาทจากรายชื่อด้านล่างแทน</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="อีเมล" required><Input name="email" type="email" required /></Field>
        <Field label="ชื่อ-นามสกุล"><Input name="full_name" /></Field>
        <Field label="บทบาท">
          <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label="แผนก">
          <Select name="department" defaultValue="">
            <option value="">-</option>
            {STAFF_DEPTS.map((d) => <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>)}
          </Select>
        </Field>
        {role === "staff" && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-4">
            {permKeys.map((k) => (
              <label key={k.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="perms" value={k.key} className="h-4 w-4" /> {k.label}
              </label>
            ))}
          </div>
        )}
        {msg && <div className="sm:col-span-2 lg:col-span-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" loading={busy}>ส่งคำเชิญ</Button></div>
      </form>
    </Card>
  );
}

export default function Users() {
  const { isAdmin, profile: me } = useAuth();
  const users = useRows<Profile>(() => supabase.from("profiles").select("*").order("created_at", { ascending: false }));
  const permKeys = useRows<PermissionKey>(() => supabase.from("permission_keys").select("*").order("sort"));
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | AppRole>("");
  const [editing, setEditing] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.rows.filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!s || [u.email, u.full_name, u.phone, u.company_name, u.tax_id].some((v) => v?.toLowerCase().includes(s))),
    );
  }, [users.rows, q, roleFilter]);

  return (
    <Gate allow={isAdmin}>
      <PageTitle
        title="ผู้ใช้และสิทธิ์"
        subtitle={`ทั้งหมด ${users.rows.length} บัญชี`}
        actions={<Button onClick={() => setShowInvite((s) => !s)}>{showInvite ? "ปิด" : "+ สร้างบัญชี Staff"}</Button>}
      />
      {showInvite && <InviteForm permKeys={permKeys.rows} onDone={users.reload} />}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input placeholder="ค้นหาอีเมล ชื่อ เบอร์ บริษัท เลขผู้เสียภาษี" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | AppRole)} className="max-w-[10rem]">
          <option value="">ทุกบทบาท</option>
          {(["admin", "staff", "user"] as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      {users.loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>ไม่พบผู้ใช้</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((u) => (
            <Card key={u.id} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">
                    {u.full_name || "(ยังไม่ระบุชื่อ)"} {u.id === me?.id && <span className="text-xs font-normal text-slate-500">(คุณ)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{[u.email, u.phone, u.company_name].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={u.role === "admin" ? "red" : u.role === "staff" ? "navy" : "slate"}>{ROLE_LABEL[u.role]}</Badge>
                  {u.department && <Badge>{DEPARTMENT_LABEL[u.department]}</Badge>}
                  {!u.is_active && <Badge tone="red">ระงับ</Badge>}
                  <Button variant="secondary" className="!py-1.5" onClick={() => setEditing(editing === u.id ? null : u.id)}>
                    {editing === u.id ? "ปิด" : "แก้สิทธิ์"}
                  </Button>
                </div>
              </div>
              {editing === u.id && (
                <AccessEditor
                  user={u}
                  permKeys={permKeys.rows}
                  onDone={() => {
                    setEditing(null);
                    users.reload();
                  }}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </Gate>
  );
}
