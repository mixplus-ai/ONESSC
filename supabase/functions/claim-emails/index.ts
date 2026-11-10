// claim-emails: mails claim status changes to customers and new-claim alerts to the service team.
//
// pg_cron calls it every 10 minutes (supabase/cron/claim_emails_schedule.sql) with header x-cron-secret,
// checked like the other cron functions against the Vault secret through public.verify_cron_secret().
// It asks public.claim_emails_due() what to send and records each result with public.record_claim_email().
// Sender: claim_settings.email_from / email_from_name (งานบริการและเคลม → ตั้งค่า); falls back to
// training_settings.email_from. Mail secrets as in _shared/mailer.ts. Optional: SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildClaimEmail, type DueClaimEmail } from "../_shared/claim_email.ts";
import { makeSender } from "./mailer.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const secret = req.headers.get("x-cron-secret");
  const envSecret = Deno.env.get("CRON_SECRET");
  let ok = Boolean(secret && envSecret && secret === envSecret);
  if (!ok && secret) {
    const { data } = await db.rpc("verify_cron_secret", { p_secret: secret });
    ok = data === true;
  }
  if (!ok) return json({ error: "cron secret ไม่ถูกต้อง" }, 401);

  const { data: cfg } = await db.from("claim_settings").select("email_enabled, email_from, email_from_name, email_note").eq("id", 1).single();
  if (!cfg) return json({ error: "ไม่พบ claim_settings" }, 500);
  const body = await req.json().catch(() => ({})) as { test_to?: string };
  if (!cfg.email_enabled && !body.test_to) return json({ sent: 0, skipped: "email_enabled = false" });

  let from = cfg.email_from as string | null;
  if (!from) {
    const { data: t } = await db.from("training_settings").select("email_from").eq("id", 1).maybeSingle();
    from = (t?.email_from as string | null) ?? null;
  }
  const send = makeSender(from, cfg.email_from_name);
  if (typeof send === "string") return json({ error: send }, 500);
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://onessc.netlify.app";

  if (body.test_to) {
    const sample: DueClaimEmail = {
      event_id: 0, audience: "customer", to_email: body.test_to, full_name: "ทดสอบระบบ", claim_id: "test", claim_no: "26-TEST",
      status: "done", note: "อีเมลทดสอบจากงานบริการและเคลม", product_type: "inverter", model: "SE10K", company_name: null,
      contact_name: null, contact_phone: null, delivery_type: "pickup", handler: "ทีมบริการ", created_at: new Date().toISOString(),
    };
    try {
      await send({ to: body.test_to, ...buildClaimEmail(sample, { siteUrl, note: cfg.email_note }) });
      return json({ test: "sent", to: body.test_to });
    } catch (x) {
      return json({ test: "failed", error: x instanceof Error ? x.message : String(x) }, 500);
    }
  }

  const { data: due, error } = await db.rpc("claim_emails_due", { p_limit: 100 });
  if (error) return json({ error: error.message }, 500);
  let sent = 0;
  const failed: string[] = [];
  for (const e of (due ?? []) as DueClaimEmail[]) {
    let err: string | null = null;
    try {
      await send({ to: e.to_email, ...buildClaimEmail(e, { siteUrl, note: cfg.email_note }) });
      sent++;
    } catch (x) {
      err = (x instanceof Error ? x.message : String(x)).slice(0, 500);
      failed.push(`${e.claim_no}/${e.status}/${e.audience}: ${err}`);
    }
    await db.rpc("record_claim_email", { p_event_id: e.event_id, p_to: e.to_email, p_audience: e.audience, p_error: err });
  }
  return json({ sent, failed });
});
