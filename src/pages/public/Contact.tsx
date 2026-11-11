import { useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { PageBanner, PageHeading } from "../../components/banners";
import { SectionHeading, TeamCard } from "../../components/cards";
import { ChatIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon } from "../../components/icons";
import { Alert, Button, Field, Input, Select, Textarea } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { companyLocations, mapEmbedSrc, mapLink, usePublishedTeam, useSiteSettings } from "../../lib/content";
import type { CompanyLocation } from "../../lib/types";
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

function LocationCard({ l, n }: { l: CompanyLocation; n: number }) {
  const src = mapEmbedSrc(l.map, l.address);
  const link = mapLink(l.map, l.address);
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      {src ? (
        <iframe src={src} title={`แผนที่ ${l.name}`} className="aspect-[16/10] w-full border-0 bg-slate-100" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      ) : (
        <div className="grid aspect-[16/10] place-items-center bg-navy-50 text-navy-300"><PinIcon className="h-10 w-10" /></div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-sun-500 text-sm font-bold text-white">{n + 1}</span>
          <h3 className="text-lg font-semibold text-navy-900">{l.name || "สถานที่ตั้ง"}</h3>
        </div>
        <dl className="mt-3 flex-1 space-y-2 text-sm">
          {l.address && <Row icon={PinIcon}><span className="whitespace-pre-line">{l.address}</span></Row>}
          {l.phone && <Row icon={PhoneIcon}>{l.phone.split(/[,\n]/).map((p) => p.trim()).filter(Boolean).map((p, i) => <a key={i} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="mr-3 font-medium text-navy-800 hover:underline">{p}</a>)}</Row>}
          {l.email && <Row icon={MailIcon}><a href={`mailto:${l.email}`} className="font-medium text-navy-800 hover:underline">{l.email}</a></Row>}
          {l.hours && <Row icon={ClockIcon}><span className="whitespace-pre-line">{l.hours}</span></Row>}
          {l.contact_name && <Row icon={ChatIcon}>ผู้ติดต่อ: {l.contact_name}</Row>}
          {l.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs whitespace-pre-line text-amber-900">{l.note}</p>}
        </dl>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700">
            <PinIcon className="h-4 w-4" /> นำทางด้วย Google Maps
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, children }: { icon: typeof PinIcon; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 text-slate-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sun-600" />
      <dd>{children}</dd>
    </div>
  );
}

export function ContactBlock({ heading = true }: { heading?: boolean }) {
  const { company } = useSiteSettings();
  const locations = companyLocations(company);
  const items = [
    company.line_oa_url && { icon: ChatIcon, label: "LINE OA", value: "แอดไลน์คุยกับเซลล์", href: company.line_oa_url },
    company.email && { icon: MailIcon, label: "อีเมล", value: company.email, href: `mailto:${company.email}` },
    // with the old single-address setup these already show on the location card
    company.locations?.length && company.phone && { icon: PhoneIcon, label: "โทรกลาง", value: company.phone, href: `tel:${company.phone}` },
    company.locations?.length && company.office_hours && { icon: ClockIcon, label: "เวลาทำการ", value: company.office_hours },
  ].filter(Boolean) as { icon: typeof PinIcon; label: string; value: string; href?: string }[];

  return (
    <section className="container-x py-20" id="contact">
      {heading && <PageHeading page="contact" />}
      {locations.length > 0 && (
        <div className={`mb-10 grid gap-6 ${locations.length > 1 ? "md:grid-cols-2" : ""} ${locations.length > 2 ? "lg:grid-cols-3" : ""}`}>
          {locations.map((l, n) => <LocationCard key={l.id} l={l} n={n} />)}
        </div>
      )}
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
      <PageBanner page="contact" imageOnly />
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
