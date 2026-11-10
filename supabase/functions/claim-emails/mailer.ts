// Mail sender for claim-emails (same setup as training-emails):
//   SMTP_PASS      → Gmail App Password; SMTP over TLS to smtp.gmail.com:465 (SMTP_HOST / SMTP_PORT / SMTP_USER override)
//   RESEND_API_KEY → Resend HTTP API (the sender must be on a domain verified in Resend)
import nodemailer from "npm:nodemailer@6.9.16";

export type Mail = { to: string; subject: string; html: string; text: string };
export type Sender = (m: Mail) => Promise<void>;

export function makeSender(address: string | null, name: string | null): Sender | string {
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
