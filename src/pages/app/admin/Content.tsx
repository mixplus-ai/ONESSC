import { useEffect, useState } from "react";
import { Gate } from "../../../components/AppLayout";
import { ImageUpload } from "../../../components/ImageUpload";
import { Alert, Badge, Button, Card, Field, Input, PageTitle, Textarea, cx } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { DEFAULT_SETTINGS, PAGE_LABEL, PLACEMENT_LABEL, loadSettings } from "../../../lib/content";
import { errorMessage, supabase } from "../../../lib/supabase";
import type { AdBanner, AdPlacement, PageKey, SiteSettings } from "../../../lib/types";
import { Tabs } from "../MyRequests";

type Tab = "company" | "home" | "pages" | "ads";

const PAGE_PATH: Record<PageKey, string> = {
  about: "/about",
  products: "/products",
  promotions: "/promotions",
  training: "/training",
  portfolio: "/portfolio",
  claims: "/claims",
  team: "/team",
  contact: "/contact",
};

const MODULE_LABEL = ["การ์ด 1 (ลิงก์ไปหน้าสินค้า)", "การ์ด 2 (ลิงก์ไปหน้าอบรม)", "การ์ด 3 (ลิงก์ไปหน้าแจ้งเคลม)", "การ์ด 4 (ลิงก์ไปหน้าสมัครสมาชิก)"];

const today = () => new Date().toISOString().slice(0, 10);

function adState(b: AdBanner): { label: string; tone: "green" | "amber" | "slate" } {
  if (!b.active) return { label: "ปิดอยู่", tone: "slate" };
  if (!b.image_url) return { label: "ยังไม่มีรูป", tone: "amber" };
  if (b.starts_at && b.starts_at > today()) return { label: `เริ่ม ${b.starts_at}`, tone: "amber" };
  if (b.ends_at && b.ends_at < today()) return { label: "หมดเวลาแล้ว", tone: "slate" };
  return { label: "กำลังแสดง", tone: "green" };
}

export default function Content() {
  const { can, session } = useAuth();
  const [s, setS] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("company");
  const [page, setPage] = useState<PageKey>("products");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  useEffect(() => {
    loadSettings(true).then((x) => setS(structuredClone(x)));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (fn: (prev: SiteSettings) => SiteSettings) => {
    setS(fn);
    setDirty(true);
  };
  const set = <K extends "company" | "hero" | "about" | "home">(k: K, field: keyof SiteSettings[K], v: unknown) =>
    update((prev) => ({ ...prev, [k]: { ...prev[k], [field]: v } }));
  const setPageField = (key: PageKey, field: keyof SiteSettings["pages"][PageKey], v: string) =>
    update((prev) => ({ ...prev, pages: { ...prev.pages, [key]: { ...prev.pages[key], [field]: v } } }));
  const setModule = (i: number, field: "title" | "text", v: string) =>
    update((prev) => ({ ...prev, home: { ...prev.home, modules: prev.home.modules.map((m, n) => (n === i ? { ...m, [field]: v } : m)) } }));
  const setAnnouncement = (field: keyof SiteSettings["ads"]["announcement"], v: unknown) =>
    update((prev) => ({ ...prev, ads: { ...prev.ads, announcement: { ...prev.ads.announcement, [field]: v } } }));
  const setBanners = (fn: (list: AdBanner[]) => AdBanner[]) => update((prev) => ({ ...prev, ads: { ...prev.ads, banners: fn(prev.ads.banners) } }));
  const setBanner = (id: string, patch: Partial<AdBanner>) => setBanners((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  async function save() {
    setBusy(true);
    setMsg(null);
    const rows = (Object.keys(s) as (keyof SiteSettings)[]).map((key) => ({
      key,
      value: s[key],
      updated_at: new Date().toISOString(),
      updated_by: session?.user.id ?? null,
    }));
    const { error } = await supabase.from("site_settings").upsert(rows);
    setBusy(false);
    if (error) return setMsg({ tone: "red", text: errorMessage(error) });
    await loadSettings(true);
    setDirty(false);
    setMsg({ tone: "green", text: "บันทึกแล้ว หน้าเว็บอัปเดตทันที" });
  }

  const lines = (arr: string[]) => arr.join("\n");
  const toArr = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
  const pg = s.pages[page];
  const activeCount = s.ads.banners.filter((b) => adState(b).tone === "green").length;

  return (
    <Gate allow={can("site_content")}>
      <PageTitle
        title="เนื้อหาหน้าเว็บ"
        subtitle="ข้อมูลบริษัท โลโก้ แบนเนอร์และข้อความทุกหน้า และรูปโฆษณา"
        actions={
          <div className="flex items-center gap-3">
            {dirty && <span className="text-sm text-amber-600">ยังไม่ได้บันทึก</span>}
            <Button onClick={save} loading={busy}>บันทึกทั้งหมด</Button>
          </div>
        }
      />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "company", label: "ข้อมูลบริษัท" },
          { key: "home", label: "หน้าแรก" },
          { key: "pages", label: "แบนเนอร์แต่ละหน้า" },
          { key: "ads", label: "โฆษณา", count: activeCount },
        ]}
      />

      {tab === "company" && (
        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 font-semibold text-navy-900">ข้อมูลบริษัท</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="โลโก้" hint="แสดงที่หัวเว็บและท้ายเว็บ ใช้ไฟล์ PNG พื้นใสหรือ SVG สูงอย่างน้อย 72 px ถ้าไม่ใส่จะใช้ไอคอนพระอาทิตย์">
                  <ImageUpload folder="logo" value={s.company.logo_url} onChange={(v) => set("company", "logo_url", v)} />
                </Field>
              </div>
              <Field label="ชื่อบริษัท (ไทย)"><Input value={s.company.name_th} onChange={(e) => set("company", "name_th", e.target.value)} /></Field>
              <Field label="ชื่อบริษัท (อังกฤษ)"><Input value={s.company.name_en} onChange={(e) => set("company", "name_en", e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="สโลแกน"><Input value={s.company.tagline} onChange={(e) => set("company", "tagline", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="ที่อยู่"><Textarea rows={2} value={s.company.address} onChange={(e) => set("company", "address", e.target.value)} /></Field></div>
              <Field label="เบอร์โทร"><Input value={s.company.phone} onChange={(e) => set("company", "phone", e.target.value)} /></Field>
              <Field label="อีเมล"><Input type="email" value={s.company.email} onChange={(e) => set("company", "email", e.target.value)} /></Field>
              <Field label="ลิงก์ LINE OA" hint="ใช้กับปุ่ม “คุยกับเซลล์”"><Input value={s.company.line_oa_url} onChange={(e) => set("company", "line_oa_url", e.target.value)} /></Field>
              <Field label="ลิงก์ Facebook"><Input value={s.company.facebook_url} onChange={(e) => set("company", "facebook_url", e.target.value)} /></Field>
              <Field label="เวลาทำการ"><Input value={s.company.office_hours} onChange={(e) => set("company", "office_hours", e.target.value)} /></Field>
              <Field label="ลิงก์ฝังแผนที่ Google Maps" hint="Google Maps → แชร์ → ฝังแผนที่ → คัดลอกค่า src ของ iframe">
                <Input value={s.company.map_embed_url} onChange={(e) => set("company", "map_embed_url", e.target.value)} placeholder="https://www.google.com/maps/embed?..." />
              </Field>
            </div>
          </Card>
          <Card>
            <h3 className="mb-4 font-semibold text-navy-900">เกี่ยวกับเรา</h3>
            <div className="grid gap-4">
              <Field label="ประวัติบริษัท"><Textarea rows={4} value={s.about.history} onChange={(e) => set("about", "history", e.target.value)} /></Field>
              <Field label="วิสัยทัศน์"><Textarea rows={2} value={s.about.vision} onChange={(e) => set("about", "vision", e.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="แบรนด์ที่เป็นตัวแทน" hint="บรรทัดละ 1 แบรนด์"><Textarea rows={4} value={lines(s.about.brands)} onChange={(e) => set("about", "brands", toArr(e.target.value))} /></Field>
                <Field label="ใบรับรอง" hint="บรรทัดละ 1 รายการ"><Textarea rows={4} value={lines(s.about.certificates)} onChange={(e) => set("about", "certificates", toArr(e.target.value))} /></Field>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "home" && (
        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 font-semibold text-navy-900">แบนเนอร์หลัก (Hero)</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="ป้ายเล็กเหนือหัวข้อ"><Input value={s.home.badge} onChange={(e) => set("home", "badge", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="ข้อความหลัก"><Input value={s.hero.title} onChange={(e) => set("hero", "title", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="ข้อความรอง"><Textarea rows={2} value={s.hero.subtitle} onChange={(e) => set("hero", "subtitle", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="ภาพพื้นหลัง" hint="แนะนำ 1920×800 px ขึ้นไป ไม่เกิน 5 MB"><ImageUpload folder="hero" value={s.hero.image_url} onChange={(v) => set("hero", "image_url", v)} /></Field></div>
              <Field label="ปุ่มหลัก: ข้อความ"><Input value={s.hero.cta_primary_label} onChange={(e) => set("hero", "cta_primary_label", e.target.value)} /></Field>
              <Field label="ปุ่มหลัก: ลิงก์"><Input value={s.hero.cta_primary_href} onChange={(e) => set("hero", "cta_primary_href", e.target.value)} /></Field>
              <Field label="ปุ่มรอง: ข้อความ"><Input value={s.hero.cta_secondary_label} onChange={(e) => set("hero", "cta_secondary_label", e.target.value)} /></Field>
              <Field label="ปุ่มรอง: ลิงก์"><Input value={s.hero.cta_secondary_href} onChange={(e) => set("hero", "cta_secondary_href", e.target.value)} /></Field>
            </div>
          </Card>
          <Card>
            <h3 className="mb-4 font-semibold text-navy-900">การ์ด 4 ช่องใต้แบนเนอร์</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {s.home.modules.map((m, i) => (
                <div key={i} className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-medium text-slate-500">{MODULE_LABEL[i]}</p>
                  <Input value={m.title} onChange={(e) => setModule(i, "title", e.target.value)} placeholder="หัวข้อ" />
                  <Textarea rows={2} value={m.text} onChange={(e) => setModule(i, "text", e.target.value)} placeholder="คำอธิบาย" />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="mb-4 font-semibold text-navy-900">หัวข้อแต่ละส่วนในหน้าแรก</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="หัวข้อส่วนเกี่ยวกับเรา"><Input value={s.home.about_title} onChange={(e) => set("home", "about_title", e.target.value)} /></Field></div>
              <Field label="กล่องสินค้า: หัวข้อ"><Input value={s.home.products_title} onChange={(e) => set("home", "products_title", e.target.value)} /></Field>
              <Field label="กล่องสินค้า: ข้อความปุ่ม"><Input value={s.home.products_button} onChange={(e) => set("home", "products_button", e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="กล่องสินค้า: คำอธิบาย"><Textarea rows={2} value={s.home.products_text} onChange={(e) => set("home", "products_text", e.target.value)} /></Field></div>
              <Field label="ผลงาน: หัวข้อ"><Input value={s.home.portfolio_title} onChange={(e) => set("home", "portfolio_title", e.target.value)} /></Field>
              <Field label="ผลงาน: คำอธิบาย"><Input value={s.home.portfolio_subtitle} onChange={(e) => set("home", "portfolio_subtitle", e.target.value)} /></Field>
              <Field label="ทีมงาน: หัวข้อ"><Input value={s.home.team_title} onChange={(e) => set("home", "team_title", e.target.value)} /></Field>
              <Field label="ทีมงาน: คำอธิบาย"><Input value={s.home.team_subtitle} onChange={(e) => set("home", "team_subtitle", e.target.value)} /></Field>
            </div>
          </Card>
        </div>
      )}

      {tab === "pages" && (
        <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
          <div className="flex flex-wrap gap-1 lg:flex-col">
            {(Object.keys(PAGE_LABEL) as PageKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setPage(k)}
                className={cx("rounded-lg px-3 py-2 text-left text-sm font-medium", page === k ? "bg-navy-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-navy-200")}
              >
                {PAGE_LABEL[k]}
                {s.pages[k].image_url && <span className="ml-1.5 text-xs opacity-70">· มีรูป</span>}
              </button>
            ))}
          </div>
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-navy-900">หัวหน้า: {PAGE_LABEL[page]}</h3>
              <a href={PAGE_PATH[page]} target="_blank" rel="noreferrer" className="text-sm text-navy-700 underline">เปิดหน้านี้ (บันทึกก่อนเพื่อดูผล)</a>
            </div>
            <div className="grid gap-4">
              <Field label="ข้อความเล็กเหนือหัวข้อ" hint="เว้นว่างได้"><Input value={pg.eyebrow} onChange={(e) => setPageField(page, "eyebrow", e.target.value)} /></Field>
              <Field label="หัวข้อ" hint={page === "about" ? "เว้นว่างเพื่อใช้ชื่อบริษัท" : undefined}><Input value={pg.title} onChange={(e) => setPageField(page, "title", e.target.value)} /></Field>
              <Field label="คำอธิบาย" hint={page === "about" ? "เว้นว่างเพื่อใช้สโลแกน" : undefined}><Textarea rows={3} value={pg.subtitle} onChange={(e) => setPageField(page, "subtitle", e.target.value)} /></Field>
              <Field label="รูปแบนเนอร์" hint="ใส่รูปแล้วหัวหน้าจะเป็นแบนเนอร์เต็มความกว้างพร้อมข้อความทับ แนะนำ 1920×600 px ไม่เกิน 5 MB">
                <ImageUpload folder={`pages/${page}`} value={pg.image_url} onChange={(v) => setPageField(page, "image_url", v)} />
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === "ads" && (
        <div className="space-y-6">
          <Card>
            <h3 className="mb-1 font-semibold text-navy-900">แถบประกาศบนสุดของเว็บ</h3>
            <p className="mb-4 text-sm text-slate-500">แถบสีเหลืองเหนือเมนู แสดงทุกหน้า เหมาะกับโปรโมชั่นสั้นๆ หรือประกาศวันหยุด</p>
            <div className="grid gap-4 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
              <Field label="ข้อความ"><Input value={s.ads.announcement.text} onChange={(e) => setAnnouncement("text", e.target.value)} placeholder="เช่น ลดพิเศษ 10% ถึง 31 ธ.ค. นี้" /></Field>
              <Field label="ลิงก์ (ถ้ามี)"><Input value={s.ads.announcement.href} onChange={(e) => setAnnouncement("href", e.target.value)} placeholder="/promotions" /></Field>
              <label className="flex items-center gap-2 pb-2.5 text-sm">
                <input type="checkbox" checked={s.ads.announcement.active} onChange={(e) => setAnnouncement("active", e.target.checked)} /> แสดง
              </label>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-navy-900">แบนเนอร์โฆษณา</h3>
                <p className="text-sm text-slate-500">เลือกได้ว่าจะแสดงที่หน้าไหน ตั้งวันเริ่มและวันสิ้นสุดได้ ถ้าตำแหน่งเดียวกันมีหลายรูปจะสลับกันทุก 6 วินาที</p>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  setBanners((list) => [
                    { id: crypto.randomUUID(), title: "", image_url: "", mobile_image_url: "", href: "", placements: ["home_top"], active: true, starts_at: "", ends_at: "" },
                    ...list,
                  ])
                }
              >
                + เพิ่มแบนเนอร์
              </Button>
            </div>
            {s.ads.banners.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">ยังไม่มีแบนเนอร์โฆษณา</p>
            ) : (
              <div className="space-y-4">
                {s.ads.banners.map((b, i) => {
                  const st = adState(b);
                  const move = (d: number) =>
                    setBanners((list) => {
                      const next = [...list];
                      const j = i + d;
                      if (j < 0 || j >= next.length) return list;
                      [next[i], next[j]] = [next[j], next[i]];
                      return next;
                    });
                  const togglePlace = (p: AdPlacement) =>
                    setBanner(b.id, { placements: b.placements.includes(p) ? b.placements.filter((x) => x !== p) : [...b.placements, p] });
                  return (
                    <div key={b.id} className="rounded-xl p-4 ring-1 ring-slate-200">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-navy-900">#{i + 1}</span>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <button className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(-1)} aria-label="เลื่อนขึ้น">↑</button>
                          <button className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" disabled={i === s.ads.banners.length - 1} onClick={() => move(1)} aria-label="เลื่อนลง">↓</button>
                          <label className="ml-2 flex items-center gap-1.5">
                            <input type="checkbox" checked={b.active} onChange={(e) => setBanner(b.id, { active: e.target.checked })} /> เปิดใช้
                          </label>
                          <button
                            className="ml-2 rounded px-2 py-1 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (confirm("ลบแบนเนอร์นี้? (มีผลเมื่อกดบันทึก)")) setBanners((list) => list.filter((x) => x.id !== b.id));
                            }}
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="รูปสำหรับจอคอม" hint="แนะนำ 1600×400 px (ป๊อปอัป 1080×1080)">
                          <ImageUpload folder="ads" value={b.image_url} onChange={(v) => setBanner(b.id, { image_url: v })} />
                        </Field>
                        <Field label="รูปสำหรับมือถือ (ถ้ามี)" hint="แนะนำ 800×600 px ไม่ใส่จะใช้รูปจอคอม">
                          <ImageUpload folder="ads" value={b.mobile_image_url} onChange={(v) => setBanner(b.id, { mobile_image_url: v })} />
                        </Field>
                        <Field label="ชื่อ / ข้อความแทนรูป"><Input value={b.title} onChange={(e) => setBanner(b.id, { title: e.target.value })} placeholder="เช่น โปรอินเวอร์เตอร์ ธ.ค." /></Field>
                        <Field label="ลิงก์เมื่อกดรูป" hint="หน้าในเว็บเช่น /promotions หรือลิงก์เต็ม https://"><Input value={b.href} onChange={(e) => setBanner(b.id, { href: e.target.value })} /></Field>
                        <Field label="เริ่มแสดง"><Input type="date" value={b.starts_at} onChange={(e) => setBanner(b.id, { starts_at: e.target.value })} /></Field>
                        <Field label="สิ้นสุด"><Input type="date" value={b.ends_at} onChange={(e) => setBanner(b.id, { ends_at: e.target.value })} /></Field>
                      </div>
                      <div className="mt-3">
                        <p className="mb-1.5 text-sm font-medium text-slate-700">แสดงที่</p>
                        <div className="flex flex-wrap gap-2">
                          {(Object.keys(PLACEMENT_LABEL) as AdPlacement[]).map((p) => (
                            <button
                              key={p}
                              onClick={() => togglePlace(p)}
                              className={cx("rounded-full px-3 py-1 text-xs font-medium ring-1", b.placements.includes(p) ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-600 ring-slate-300")}
                            >
                              {PLACEMENT_LABEL[p]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <p className="text-sm text-slate-500">
            รูปโปรโมชั่นและแพ็กเกจแก้ได้ที่เมนู “โปรโมชั่น” รูปสินค้าแก้ที่ “สินค้า” รูปผลงานและทีมงานแก้ที่เมนู “ผลงาน” และ “ทีมงาน”
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end"><Button onClick={save} loading={busy}>บันทึกทั้งหมด</Button></div>
    </Gate>
  );
}
