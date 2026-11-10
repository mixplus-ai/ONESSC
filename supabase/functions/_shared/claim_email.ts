// Thai claim e-mails: status updates for the customer, "มีเคลมใหม่" for the service team. Pure functions.

export interface DueClaimEmail {
  event_id: number;
  audience: "customer" | "staff";
  to_email: string;
  full_name: string | null;
  claim_id: string;
  claim_no: string;
  status: "submitted" | "in_progress" | "done" | "returned" | "closed" | "rejected";
  note: string | null;
  product_type: string | null;
  model: string | null;
  company_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  delivery_type: string | null;
  handler: string | null;
  created_at: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const TYPE: Record<string, string> = { inverter: "Inverter", optimizer: "Optimizer", accessory: "Accessories", panel: "Solar Panel", battery: "Battery", other: "อื่นๆ" };
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

const CUSTOMER: Record<string, { subject: string; lead: string }> = {
  submitted: { subject: "ได้รับแจ้งเคลมแล้ว", lead: "เราได้รับแจ้งเคลมของคุณแล้ว ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็ว" },
  in_progress: { subject: "กำลังดำเนินการเคลม", lead: "ทีมงานรับเรื่องและกำลังดำเนินการเคลมของคุณ" },
  done: { subject: "ดำเนินการเคลมเสร็จแล้ว", lead: "ดำเนินการเสร็จแล้ว ดาวน์โหลดใบเคลมสินค้าเพื่อแจ้งรับสินค้าได้ที่หน้าเคลมของฉัน จากนั้นส่งตัวเก่าคืนและกรอก S/N ในระบบ" },
  closed: { subject: "ปิดงานเคลมแล้ว", lead: "ทีมงานได้รับของคืนครบและปิดงานเคลมนี้แล้ว ขอบคุณที่ใช้บริการ" },
  rejected: { subject: "ผลการพิจารณาเคลม", lead: "เคลมนี้ไม่ผ่านการพิจารณาหรือถูกยกเลิก รายละเอียดตามข้อความจากทีมงานด้านล่าง" },
};

export function buildClaimEmail(e: DueClaimEmail, ctx: { siteUrl: string; note?: string | null }) {
  const base = ctx.siteUrl.replace(/\/$/, "");
  const staff = e.audience === "staff";
  const url = staff ? `${base}/app/admin/claims?tab=queue` : `${base}/app/claims`;
  const c = CUSTOMER[e.status] ?? CUSTOMER.in_progress;
  const subject = staff ? `มีเคลมใหม่ ${e.claim_no} · ${e.company_name ?? e.contact_name ?? ""}`.trim() : `${c.subject} · เลขเคลม ${e.claim_no}`;
  const lead = staff ? "มีลูกค้าแจ้งเคลมใหม่ในระบบ รอเจ้าหน้าที่รับเรื่อง" : c.lead;
  const rows: [string, string][] = [
    ["เลขเคลม", esc(e.claim_no)],
    ["สินค้า", esc([e.product_type && (TYPE[e.product_type] ?? e.product_type), e.model].filter(Boolean).join(" · ") || "-")],
  ];
  if (staff) {
    rows.push(["ลูกค้า", esc([e.contact_name, e.contact_phone].filter(Boolean).join(" · "))]);
    if (e.company_name) rows.push(["บริษัท", esc(e.company_name)]);
    rows.push(["การรับสินค้า", e.delivery_type === "shipping" ? "จัดส่ง" : "รับเองที่คลัง"]);
  } else if (e.handler) rows.push(["ผู้รับเรื่อง", esc(e.handler)]);
  const name = e.full_name?.trim();
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Tahoma,'Noto Sans Thai',sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#16235a;color:#fff;border-radius:12px 12px 0 0;padding:18px 22px">
    <div style="font-size:13px;color:#fcd34d;font-weight:bold">SSC One App · งานบริการและเคลม</div>
    <div style="font-size:19px;font-weight:bold;margin-top:4px">${esc(staff ? "มีเคลมใหม่" : c.subject)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:22px;font-size:15px;line-height:1.6">
    ${staff ? "" : `<p style="margin:0 0 12px">เรียน คุณ${esc(name || e.to_email)}</p>`}
    <p style="margin:0 0 16px">${lead}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:7px 10px 7px 0;color:#64748b;white-space:nowrap;border-top:1px solid #e2e8f0">${k}</td><td style="padding:7px 0;border-top:1px solid #e2e8f0">${v}</td></tr>`).join("")}
    </table>
    ${e.note && !staff ? `<p style="margin:16px 0 0;padding:12px 14px;background:#f8fafc;border-radius:8px">${nl2br(e.note)}</p>` : ""}
    ${ctx.note && !staff ? `<p style="margin:16px 0 0;color:#334155">${nl2br(ctx.note)}</p>` : ""}
    <p style="margin:22px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">${staff ? "เปิดคิวเคลม" : "ดูสถานะเคลม"}</a></p>
  </div>
  <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">อีเมลนี้ส่งอัตโนมัติจากระบบ SSC One App</p>
</div></body></html>`;
  const text = [
    staff ? "" : `เรียน คุณ${name || e.to_email}`,
    lead,
    "",
    ...rows.map(([k, v]) => `${k}: ${v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")}`),
    e.note && !staff ? `\n${e.note}` : "",
    ctx.note && !staff ? `\n${ctx.note}` : "",
    "",
    url,
  ].filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
  return { subject, html, text };
}
