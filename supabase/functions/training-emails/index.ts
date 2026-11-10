// training-emails: sends booking confirmations and the N-days-before reminder.
//
// pg_cron calls it every hour (supabase/cron/training_emails_schedule.sql) with header x-cron-secret,
// checked like stock-sync against the Vault secret through public.verify_cron_secret().
// It asks public.training_emails_due() what to send and records each result with public.record_training_email().
//
// Sender: training_settings.email_from / email_from_name (Admin sets them in the back office).
// Mail provider, from Edge Function secrets (one of the two):
//   SMTP_PASS                → Gmail App Password; SMTP over TLS to smtp.gmail.com:465 as email_from
//                              (SMTP_HOST / SMTP_PORT / SMTP_USER override the defaults)
//   RESEND_API_KEY           → Resend HTTP API (email_from must be on a domain verified in Resend)
// Optional: SITE_URL (default https://onessc.netlify.app).
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { buildTrainingEmail, type DueEmail } from "../_shared/training_email.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Mail = { to: string; subject: string; html: string; text: string };
type Sender = (m: Mail) => Promise<void>;

function makeSender(address: string | null, name: string | null): Sender | string {
  const addr = address ?? Deno.env.get("SMTP_USER");
  if (!addr) return "ยังไม่ได้ตั้งอีเมลผู้ส่งในหลังบ้าน";
  const from = name ? `${name.replace(/["<>]/g, "")} <${addr}>` : addr;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    return async (m) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    };
  }
  const host = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
  const user = Deno.env.get("SMTP_USER") ?? addr;
  const pass = Deno.env.get("SMTP_PASS");
  if (!pass) return "ยังไม่ได้ใส่ SMTP_PASS (App Password ของ Gmail) ใน Edge Function secrets";
  const port = Number(Deno.env.get("SMTP_PORT") ?? 465);
  // Supabase Edge Functions block outbound ports 25 and 587, so use implicit TLS on 465.
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return async (m) => {
    await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const secret = req.headers.get("x-cron-secret");
  const envSecret = Deno.env.get("CRON_SECRET");
  let ok = Boolean(secret && envSecret && secret === envSecret);
  if (!ok && secret) {
    const { data } = await db.rpc("verify_cron_secret", { p_secret: secret });
    ok = data === true;
  }
  if (!ok) return json({ error: "cron secret ไม่ถูกต้อง" }, 401);

  const { data: cfg } = await db.from("training_settings").select("email_enabled, pay_info, email_note, email_from, email_from_name").eq("id", 1).single();
  if (!cfg) return json({ error: "ไม่พบ training_settings" }, 500);
  const body = await req.json().catch(() => ({})) as { test_to?: string };
  if (!cfg.email_enabled && !body.test_to) return json({ sent: 0, skipped: "email_enabled = false" });

  const send = makeSender(cfg.email_from, cfg.email_from_name);
  if (typeof send === "string") return json({ error: send }, 500);
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://onessc.netlify.app";

  // {"test_to": "..."}: one sample e-mail to check the mail settings (works while sending is off)
  if (body.test_to) {
    const sample: DueEmail = {
      registration_id: "test", kind: "confirm", reg_code: "TR-TEST", to_email: body.test_to, full_name: "ทดสอบระบบ",
      course_code: "TEST", course_title: "อีเมลทดสอบจาก SSC One App", session_title: null,
      starts_on: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), ends_on: null,
      start_time: "09:00:00", end_time: "16:00:00", location: "ทดสอบ", map_url: null,
      total: 0, pay_status: "free", coupon_code: null, days_left: 5,
    };
    try {
      await send({ to: body.test_to, ...buildTrainingEmail(sample, { siteUrl, payInfo: cfg.pay_info, note: cfg.email_note }) });
      return json({ test: "sent", to: body.test_to });
    } catch (x) {
      return json({ test: "failed", error: x instanceof Error ? x.message : String(x) }, 500);
    }
  }

  const { data: due, error } = await db.rpc("training_emails_due", { p_limit: 100 });
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  const failed: string[] = [];
  for (const e of (due ?? []) as DueEmail[]) {
    const mail = buildTrainingEmail(e, { siteUrl, payInfo: cfg.pay_info, note: cfg.email_note });
    let err: string | null = null;
    try {
      await send({ to: e.to_email, ...mail });
      sent++;
    } catch (x) {
      err = (x instanceof Error ? x.message : String(x)).slice(0, 500);
      failed.push(`${e.reg_code}/${e.kind}: ${err}`);
    }
    await db.rpc("record_training_email", { p_registration_id: e.registration_id, p_kind: e.kind, p_to: e.to_email, p_error: err });
  }
  return json({ sent, failed });
});
