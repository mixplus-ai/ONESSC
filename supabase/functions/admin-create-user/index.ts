// Admin-only: create a Staff/Admin/User account and email them an invite link.
// Deploy: supabase functions deploy admin-create-user
// Needs the default SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY secrets
// (Supabase provides these to every Edge Function automatically).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["admin", "staff", "user"] as const;
const DEPARTMENTS = ["sales", "service", "coordination", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Who is calling? Must be an active admin.
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: isAdmin, error: roleErr } = await caller.rpc("is_admin");
  if (roleErr || isAdmin !== true) return json({ error: "เฉพาะ Admin เท่านั้น" }, 403);
  const { data: me } = await caller.auth.getUser();

  // 2) Validate input
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "staff");
  const department = body.department ? String(body.department) : null;
  const perms = Array.isArray(body.perms) ? body.perms.map(String) : [];
  const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "อีเมลไม่ถูกต้อง" }, 400);
  if (!ROLES.includes(role as (typeof ROLES)[number])) return json({ error: "บทบาทไม่ถูกต้อง" }, 400);
  if (department && !DEPARTMENTS.includes(department)) return json({ error: "แผนกไม่ถูกต้อง" }, 400);

  // 3) Invite the user (Supabase sends the "set your password" email)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (inviteErr || !invited.user) {
    const msg = inviteErr?.message?.includes("already") ? "อีเมลนี้มีบัญชีอยู่แล้ว ให้ปรับสิทธิ์จากรายชื่อผู้ใช้แทน" : inviteErr?.message;
    return json({ error: msg ?? "สร้างบัญชีไม่สำเร็จ" }, 400);
  }

  // 4) Set role, department and staff permissions (service role bypasses the guard trigger)
  const userId = invited.user.id;
  const { error: updErr } = await admin
    .from("profiles")
    .update({ role, department, full_name: fullName || null })
    .eq("id", userId);
  if (updErr) return json({ error: updErr.message }, 500);

  if (role === "staff" && perms.length) {
    const { error: permErr } = await admin
      .from("staff_permissions")
      .insert(perms.map((perm) => ({ user_id: userId, perm, granted_by: me.user?.id ?? null })));
    if (permErr) return json({ error: permErr.message }, 500);
  }

  await admin.from("audit_logs").insert({
    actor_id: me.user?.id ?? null,
    actor_email: me.user?.email ?? null,
    action: "invite",
    table_name: "auth.users",
    record_id: userId,
    new_data: { email, role, department, perms },
  });

  return json({ id: userId, email, role });
});
