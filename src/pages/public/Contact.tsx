import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { SectionHeading, TeamCard } from "../../components/cards";
import { ChatIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon } from "../../components/icons";
import { Alert, Button, Field, Input, Select, Textarea } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { usePublishedTeam, useSiteSettings } from "../../lib/content";
import { errorMessage, supabase, supabaseConfigured } from "../../lib/supabase";

const TOPICS: Record<string, string> = {
  general: "สอบถามทั่วไป",
  quotation: "ขอใบเสนอราคา",
  product: "สอบถามสินค้า",
  training: "อบรมและกิจกรรม",
  service: "งานบริการ / เคลม",
};

function ContactForm() {
  const [params] = useSearchParams();
  const { session, profile } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      name: String(f.get("name") || "").trim(),
      company: String(f.get("company") || "").trim() || null,
      phone: String(f.get("phone") || "").trim() || null,
      email: String(f.get("email") || "").trim() || null,
      topic: String(f.get("topic") || "general"),
      message: String(f.get("message") || "").trim(),
      user_id: session?.user.id ?? null,
    };
    if (!row.phone && !row.email) return setErr("กรุณากรอกเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่อง");
    setBusy(true);
    setErr("");
    const { error } = supabaseConfigured ? await supabase.from("contact_messages").insert(row) : { error: { message: "ยังไม่ได้เชื่อมต่อฐานข้อมูล" } };
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setSent(true);
  }

  if (sent) return <Alert tone="green">ได้รับข้อความของคุณแล้ว ทีมงานจะติดต่อกลับโดยเร็วที่สุด ขอบคุณค่ะ</Alert>;

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="ชื่อ-นามสกุล" required>
        <Input name="name" required maxLength={200} defaultValue={profile?.full_name ?? ""} autoComplete="name" />
      </Field>
      <Field label="บริษัท">
        <Input name="company" maxLength={200} defaultValue={profile?.company_name ?? ""} autoComplete="organization" />
      </Field>
      <Field label="เบอร์โทร">
        <Input name="phone" type="tel" maxLength={50} defaultValue={profile?.phone ?? ""} autoComplete="tel" />
      </Field>
      <Field label="อีเมล">
        <Input name="email" type="email" maxLength={200} defaultValue={profile?.email ?? ""} autoComplete="email" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="เรื่อง">
          <Select name="topic" defaultValue={TOPICS[params.get("topic") ?? ""] ? params.get("topic")! : "general"}>
            {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="ข้อความ" required>
          <Textarea name="message" required maxLength={5000} rows={5} placeholder="รายละเอียดที่ต้องการสอบถาม เช่น รุ่นสินค้า จำนวน สถานที่ติดตั้ง" />
        </Field>
      </div>
      {err && <div className="sm:col-span-2"><Alert>{err}</Alert></div>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>ส่งข้อความ</Button>
      </div>
    </form>
  );
}

export function ContactBlock() {
  const { company } = useSiteSettings();
  const items = [
    company.address && { icon: PinIcon, label: "ที่อยู่", value: company.address },
    company.phone && { icon: PhoneIcon, label: "โทร", value: company.phone, href: `tel:${company.phone}` },
    company.email && { icon: MailIcon, label: "อีเมล", value: company.email, href: `mailto:${company.email}` },
    company.line_oa_url && { icon: ChatIcon, label: "LINE OA", value: "แอดไลน์คุยกับเซลล์", href: company.line_oa_url },
    company.office_hours && { icon: ClockIcon, label: "เวลาทำการ", value: company.office_hours },
  ].filter(Boolean) as { icon: typeof PinIcon; label: string; value: string; href?: string }[];

  return (
    <section className="container-x py-20" id="contact">
      <SectionHeading eyebrow="ติดต่อเรา" title="ติดต่อบริษัท" subtitle="ส่งข้อความถึงทีมงาน หรือติดต่อผ่านช่องทางด้านล่าง" />
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          {items.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700"><Icon /></span>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                {href ? (
                  <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="font-medium text-navy-800 hover:underline">{value}</a>
                ) : (
                  <p className="font-medium whitespace-pre-line text-navy-800">{value}</p>
                )}
              </div>
            </div>
          ))}
          {company.map_embed_url && (
            <iframe
              src={company.map_embed_url}
              title="แผนที่บริษัท"
              className="mt-4 aspect-video w-full rounded-2xl ring-1 ring-slate-200"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

export default function Contact() {
  const team = usePublishedTeam();
  return (
    <>
      <ContactBlock />
      {team.rows.length > 0 && (
        <section className="bg-white py-16">
          <div className="container-x">
            <SectionHeading title="ติดต่อพนักงาน" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {team.rows.map((m) => <TeamCard key={m.id} m={m} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
