// Builds the Thai training e-mails (confirmation and reminder). Pure functions: no Deno or network,
// so the template can be checked with Node too.

export interface DueEmail {
  registration_id: string;
  kind: "confirm" | "reminder";
  reg_code: string;
  to_email: string;
  full_name: string | null;
  course_code: string;
  course_title: string;
  session_title: string | null;
  starts_on: string; // YYYY-MM-DD
  ends_on: string | null;
  start_time: string; // HH:MM:SS
  end_time: string;
  location: string | null;
  map_url: string | null;
  total: number | string;
  pay_status: string;
  coupon_code: string | null;
  days_left: number;
}
export interface EmailContext {
  siteUrl: string; // e.g. https://onessc.netlify.app
  payInfo?: string | null;
  note?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

export function thaiDate(d: string) {
  return new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
const hhmm = (t: string) => t.slice(0, 5);
const money = (n: number) => `${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`;

export function buildTrainingEmail(e: DueEmail, ctx: EmailContext): { subject: string; html: string; text: string } {
  const name = e.full_name?.trim() || e.to_email;
  const date = e.ends_on && e.ends_on !== e.starts_on ? `${thaiDate(e.starts_on)} – ${thaiDate(e.ends_on)}` : thaiDate(e.starts_on);
  const time = `${hhmm(e.start_time)}–${hhmm(e.end_time)} น.`;
  const total = Number(e.total);
  const unpaid = total > 0 && (e.pay_status === "unpaid" || e.pay_status === "pending");
  const myUrl = `${ctx.siteUrl.replace(/\/$/, "")}/app/training`;

  const subject = e.kind === "confirm"
    ? `ยืนยันการลงทะเบียนอบรม ${e.course_title} (${e.reg_code})`
    : `แจ้งเตือน: อีก ${e.days_left} วันถึงวันอบรม ${e.course_title}`;
  const lead = e.kind === "confirm"
    ? "ขอบคุณที่ลงทะเบียนอบรมกับ SSC รายละเอียดการลงทะเบียนของคุณมีดังนี้"
    : `อีก ${e.days_left} วันจะถึงวันอบรมที่คุณลงทะเบียนไว้ ขอแจ้งรายละเอียดอีกครั้ง`;

  const rows: [string, string][] = [
    ["หลักสูตร", `${esc(e.course_title)}${e.session_title ? `<br><span style="color:#64748b">${esc(e.session_title)}</span>` : ""}`],
    ["วันที่", esc(date)],
    ["เวลา", esc(time)],
  ];
  if (e.location) rows.push(["สถานที่", e.map_url ? `<a href="${esc(e.map_url)}" style="color:#1e3a8a">${esc(e.location)}</a>` : esc(e.location)]);
  rows.push(["เลขที่ลงทะเบียน", esc(e.reg_code)]);
  if (total > 0) rows.push(["ค่าอบรม", `${esc(money(total))}${e.pay_status === "paid" ? " · ชำระแล้ว" : e.pay_status === "pending" ? " · รอตรวจสอบสลิป" : " · ยังไม่ชำระ"}`]);
  else if (e.coupon_code) rows.push(["ค่าอบรม", `ฟรี (โค้ด ${esc(e.coupon_code)})`]);
  else rows.push(["ค่าอบรม", "ฟรี"]);

  const payBlock = unpaid && e.pay_status === "unpaid"
    ? `<p style="margin:16px 0 0;padding:12px 14px;background:#fffbeb;border-radius:8px;color:#78350f">
         กรุณาชำระค่าอบรม ${esc(money(total))} และแนบสลิปที่ <a href="${esc(myUrl)}" style="color:#78350f">การอบรมของฉัน</a>
         ${ctx.payInfo ? `<br>${nl2br(ctx.payInfo)}` : ""}</p>`
    : "";
  const remind = e.kind === "reminder"
    ? `<p style="margin:16px 0 0">วันอบรมให้เช็กอินด้วยการสแกน QR หรือกรอกรหัส 6 หลักที่จุดลงทะเบียน (เปิดตำแหน่ง GPS ในมือถือไว้) หากไม่สะดวกเข้าร่วม กรุณาเลื่อนหรือยกเลิกล่วงหน้าที่หน้า <a href="${esc(myUrl)}" style="color:#1e3a8a">การอบรมของฉัน</a></p>`
    : `<p style="margin:16px 0 0">ดูรายละเอียด เลื่อนรอบ หรือยกเลิกได้ที่หน้า <a href="${esc(myUrl)}" style="color:#1e3a8a">การอบรมของฉัน</a></p>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Tahoma,'Noto Sans Thai',sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#16235a;color:#fff;border-radius:12px 12px 0 0;padding:18px 22px">
    <div style="font-size:13px;color:#fcd34d;font-weight:bold">SSC One App · อบรมและกิจกรรม</div>
    <div style="font-size:19px;font-weight:bold;margin-top:4px">${e.kind === "confirm" ? "ยืนยันการลงทะเบียนอบรม" : "แจ้งเตือนก่อนวันอบรม"}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:22px;font-size:15px;line-height:1.6">
    <p style="margin:0 0 12px">เรียน คุณ${esc(name)}</p>
    <p style="margin:0 0 16px">${lead}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:7px 10px 7px 0;color:#64748b;white-space:nowrap;vertical-align:top;border-top:1px solid #e2e8f0">${k}</td><td style="padding:7px 0;border-top:1px solid #e2e8f0">${v}</td></tr>`).join("")}
    </table>
    ${payBlock}
    ${remind}
    ${ctx.note ? `<p style="margin:16px 0 0;color:#334155">${nl2br(ctx.note)}</p>` : ""}
    <p style="margin:22px 0 0"><a href="${esc(myUrl)}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">เปิดการอบรมของฉัน</a></p>
  </div>
  <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">อีเมลนี้ส่งอัตโนมัติจากระบบ SSC One App</p>
</div></body></html>`;

  const text = [
    `เรียน คุณ${name}`,
    "",
    lead,
    "",
    `หลักสูตร: ${e.course_title}${e.session_title ? ` (${e.session_title})` : ""}`,
    `วันที่: ${date}`,
    `เวลา: ${time}`,
    e.location ? `สถานที่: ${e.location}${e.map_url ? ` ${e.map_url}` : ""}` : null,
    `เลขที่ลงทะเบียน: ${e.reg_code}`,
    total > 0 ? `ค่าอบรม: ${money(total)}` : "ค่าอบรม: ฟรี",
    unpaid && e.pay_status === "unpaid" && ctx.payInfo ? `\nการชำระเงิน: ${ctx.payInfo}` : null,
    ctx.note ? `\n${ctx.note}` : null,
    "",
    `การอบรมของฉัน: ${myUrl}`,
  ].filter((l) => l !== null).join("\n");

  return { subject, html, text };
}
