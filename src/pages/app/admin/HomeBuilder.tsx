// Admin editor for the home page blocks (site_settings.home.sections).
import { useState, type ReactNode } from "react";
import { FileUpload, GalleryUpload, ImageUpload } from "../../../components/ImageUpload";
import { HomeSections } from "../../../components/home/Sections";
import { Badge, Button, Field, Input, Modal, Select, Textarea, cx } from "../../../components/ui";
import { uploadSiteImage } from "../../../lib/content";
import {
  ANIM_LABEL, BG_LABEL, ICON_LABEL, SECTION_TYPES, newSection, sectionLabel, uid,
  type Anim, type Bg, type Btn, type HomeSection, type IconKey, type SectionType,
} from "../../../lib/homeSections";

const FEED_HINT: Partial<Record<SectionType, string>> = {
  about: "ข้อความดึงจากแท็บ “ข้อมูลบริษัท → เกี่ยวกับเรา”",
  products: "แสดงลิงก์สินค้า/โปรโมชั่น และรอบอบรมที่กำลังจะมาถึง",
  training: "การ์ดดึงจากรอบอบรมที่เปิดรับสมัคร",
  portfolio: "ผลงานแก้ที่เมนู “ผลงาน”",
  team: "รายชื่อแก้ที่เมนู “ทีมงาน”",
  contact: "ที่อยู่ เบอร์ และแผนที่ แก้ที่แท็บ “ข้อมูลบริษัท”",
  ad: "รูปโฆษณาแก้ที่แท็บ “โฆษณา”",
};

const VIDEO_ACCEPT = "video/mp4,video/webm";
const VIDEO_HINT = "อัปโหลดไฟล์ MP4/WebM ไม่เกิน 50 MB (ไฟล์สั้น 10–30 วินาทีโหลดเร็วที่สุด) หรือวางลิงก์ YouTube / Vimeo";

/** Short text shown on a collapsed block row. */
function summary(s: HomeSection): string {
  if ("title" in s && s.title) return s.title;
  if (s.type === "ad") return s.placement === "home_top" ? "ช่องโฆษณาบน" : "ช่องโฆษณากลาง";
  if (s.type === "modules") return s.items.map((x) => x.title).join(" · ");
  return "";
}

const PAGE_NAME = { home: "หน้าแรก", about: "หน้าเกี่ยวกับเรา" } as const;

export function HomeBuilder({ value, onChange, onReset, page = "home" }: { value: HomeSection[]; onChange: (v: HomeSection[]) => void; onReset: () => void; page?: keyof typeof PAGE_NAME }) {
  const pageName = PAGE_NAME[page];
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null); // insert position
  const [preview, setPreview] = useState(false);

  const patch = (id: string, p: Partial<HomeSection>) => onChange(value.map((s) => (s.id === id ? ({ ...s, ...p } as HomeSection) : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const insert = (type: SectionType) => {
    const s = newSection(type);
    const at = adding ?? value.length;
    onChange([...value.slice(0, at), s, ...value.slice(at)]);
    setAdding(null);
    setOpen(s.id);
  };
  const duplicate = (i: number) => {
    const copy = { ...structuredClone(value[i]), id: uid() };
    onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
    setOpen(copy.id);
  };
  const remove = (i: number) => {
    if (!confirm(`ลบบล็อก “${sectionLabel(value[i].type)}”?`)) return;
    onChange(value.filter((_, n) => n !== i));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-navy-50 p-4 ring-1 ring-navy-100">
        <p className="max-w-2xl text-sm text-navy-800">
          {pageName}ประกอบด้วยบล็อกเรียงจากบนลงล่าง กด <b>เพิ่มบล็อก</b> เพื่อใส่ภาพ วิดีโอ ตัวเลข การ์ด หรือแกลเลอรี ใช้ลูกศรสลับลำดับ กดชื่อบล็อกเพื่อแก้ไข แล้วกด <b>บันทึกทั้งหมด</b>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPreview(true)}>ดูตัวอย่าง</Button>
          <Button onClick={() => setAdding(value.length)}>+ เพิ่มบล็อก</Button>
        </div>
      </div>

      <ol className="space-y-2">
        {value.map((s, i) => {
          const isOpen = open === s.id;
          return (
            <li key={s.id} className={cx("rounded-2xl bg-white ring-1", isOpen ? "ring-navy-300 shadow-sm" : "ring-slate-200", s.hidden && "opacity-60")}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy-900">{sectionLabel(s.type)}</span>
                    {s.hidden && <Badge>ซ่อนอยู่</Badge>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{summary(s) || FEED_HINT[s.type] || ""}</span>
                </button>
                <div className="flex shrink-0 items-center">
                  <IconBtn label="เลื่อนขึ้น" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconBtn>
                  <IconBtn label="เลื่อนลง" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</IconBtn>
                  <IconBtn label={s.hidden ? "แสดง" : "ซ่อน"} onClick={() => patch(s.id, { hidden: !s.hidden })}>{s.hidden ? "◌" : "◉"}</IconBtn>
                  <IconBtn label="ทำสำเนา" onClick={() => duplicate(i)}>⧉</IconBtn>
                  <IconBtn label="ลบ" onClick={() => remove(i)} danger>✕</IconBtn>
                </div>
              </div>
              {isOpen && (
                <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                  <Editor s={s} set={(p) => patch(s.id, p)} />
                  <StyleRow s={s} set={(p) => patch(s.id, p)} />
                  <div className="flex justify-between gap-2">
                    <button type="button" className="text-sm font-medium text-navy-700 hover:underline" onClick={() => setAdding(i + 1)}>+ เพิ่มบล็อกใต้บล็อกนี้</button>
                    <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => setOpen(null)}>ย่อ</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!value.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">ยังไม่มีบล็อก กด “เพิ่มบล็อก”</p>}

      <div className="flex justify-end">
        <button type="button" className="text-xs text-slate-500 hover:text-red-600 hover:underline" onClick={() => { if (confirm(`คืนค่า${pageName}เป็นแบบเริ่มต้น? บล็อกที่เพิ่มเองจะหายเมื่อกดบันทึก`)) { onReset(); setOpen(null); } }}>
          คืนค่า{pageName}เริ่มต้น
        </button>
      </div>

      <Modal open={adding !== null} onClose={() => setAdding(null)} title="เพิ่มบล็อก" wide>
        {(["ออกแบบเอง", "ดึงข้อมูลจากระบบ"] as const).map((g) => (
          <div key={g} className="mb-5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SECTION_TYPES.filter((t) => t.group === g).map((t) => (
                <button key={t.type} type="button" onClick={() => insert(t.type)} className="rounded-xl p-3 text-left ring-1 ring-slate-200 transition hover:bg-navy-50 hover:ring-navy-300">
                  <span className="block font-medium text-navy-900">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Modal>

      {preview && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={`ตัวอย่าง${pageName}`}>
          <div className="flex items-center justify-between gap-3 bg-navy-900 px-4 py-2 text-white">
            <span className="text-sm">ตัวอย่าง{pageName} (ยังไม่บันทึก)</span>
            <button type="button" onClick={() => setPreview(false)} className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20">ปิดตัวอย่าง</button>
          </div>
          <div className="flex-1 overflow-y-auto" id="home-preview">
            <HomeSections sections={value} />
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className={cx("grid h-8 w-8 place-items-center rounded-lg text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30", danger && "hover:bg-red-50 hover:text-red-600")}>
      {children}
    </button>
  );
}

function StyleRow({ s, set }: { s: HomeSection; set: (p: Partial<HomeSection>) => void }) {
  return (
    <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
      {s.type !== "hero" && s.type !== "ad" && (
        <Field label="สีพื้นหลัง">
          <Select value={s.bg ?? ""} onChange={(e) => set({ bg: (e.target.value || undefined) as Bg | undefined })}>
            <option value="">ค่าเริ่มต้น</option>
            {(Object.keys(BG_LABEL) as Bg[]).map((k) => <option key={k} value={k}>{BG_LABEL[k]}</option>)}
          </Select>
        </Field>
      )}
      {s.type !== "ad" && (
        <Field label="แอนิเมชันตอนเลื่อนถึง">
          <Select value={s.anim ?? "fade-up"} onChange={(e) => set({ anim: e.target.value as Anim })}>
            {(Object.keys(ANIM_LABEL) as Anim[]).map((k) => <option key={k} value={k}>{ANIM_LABEL[k]}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

// --- small field helpers ----------------------------------------------------
const T = ({ label, value, on, hint, area }: { label: string; value: string; on: (v: string) => void; hint?: string; area?: boolean }) => (
  <Field label={label} hint={hint}>
    {area ? <Textarea rows={3} value={value} onChange={(e) => on(e.target.value)} /> : <Input value={value} onChange={(e) => on(e.target.value)} />}
  </Field>
);

function Heads({ s, set, sub = true }: { s: { eyebrow?: string; title: string; subtitle?: string }; set: (p: Record<string, string>) => void; sub?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {"eyebrow" in s && <T label="ข้อความเล็กเหนือหัวข้อ" value={s.eyebrow ?? ""} on={(v) => set({ eyebrow: v })} />}
      <T label="หัวข้อ" value={s.title} on={(v) => set({ title: v })} />
      {sub && "subtitle" in s && <div className="sm:col-span-2"><T label="คำอธิบาย" value={s.subtitle ?? ""} on={(v) => set({ subtitle: v })} area /></div>}
    </div>
  );
}

function Buttons({ value, on, max = 3 }: { value: Btn[]; on: (v: Btn[]) => void; max?: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">ปุ่ม</p>
      {value.map((b, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="ข้อความปุ่ม" value={b.label} onChange={(e) => on(value.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)))} />
          <Input placeholder="/products หรือ https://…" value={b.href} onChange={(e) => on(value.map((x, n) => (n === i ? { ...x, href: e.target.value } : x)))} />
          <IconBtn label="ลบปุ่ม" danger onClick={() => on(value.filter((_, n) => n !== i))}>✕</IconBtn>
        </div>
      ))}
      {value.length < max && <button type="button" className="text-sm font-medium text-navy-700 hover:underline" onClick={() => on([...value, { label: "ปุ่มใหม่", href: "/" }])}>+ เพิ่มปุ่ม</button>}
    </div>
  );
}

/** Repeating items (cards, stats, modules, slides) with add / remove / move. */
function Items<X>({ value, on, blank, render, title, max = 12 }: { value: X[]; on: (v: X[]) => void; blank: () => X; render: (x: X, set: (p: Partial<X>) => void, i: number) => ReactNode; title: string; max?: number }) {
  const mv = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    on(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {value.map((x, i) => (
        <div key={i} className="rounded-xl p-3 ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">ลำดับ {i + 1}</span>
            <div className="flex">
              <IconBtn label="เลื่อนขึ้น" disabled={i === 0} onClick={() => mv(i, -1)}>↑</IconBtn>
              <IconBtn label="เลื่อนลง" disabled={i === value.length - 1} onClick={() => mv(i, 1)}>↓</IconBtn>
              <IconBtn label="ลบ" danger onClick={() => on(value.filter((_, n) => n !== i))}>✕</IconBtn>
            </div>
          </div>
          {render(x, (p) => on(value.map((y, n) => (n === i ? { ...y, ...p } : y))), i)}
        </div>
      ))}
      {value.length < max && <button type="button" className="text-sm font-medium text-navy-700 hover:underline" onClick={() => on([...value, blank()])}>+ เพิ่ม</button>}
    </div>
  );
}

const Video = ({ label = "วิดีโอ", value, on }: { label?: string; value: string; on: (v: string) => void }) => (
  <Field label={label} hint={VIDEO_HINT}>
    <FileUpload folder="home-video" accept={VIDEO_ACCEPT} maxMb={50} upload={uploadSiteImage} value={value} onChange={on} />
  </Field>
);
const Img = ({ label = "รูปภาพ", value, on, hint }: { label?: string; value: string; on: (v: string) => void; hint?: string }) => (
  <Field label={label} hint={hint}><ImageUpload folder="home" value={value} onChange={on} /></Field>
);

// --- per-type editors ---------------------------------------------------------
function Editor({ s, set }: { s: HomeSection; set: (p: Partial<HomeSection>) => void }) {
  const p = set as (p: Record<string, unknown>) => void;
  switch (s.type) {
    case "hero":
      return (
        <div className="space-y-4">
          <Items title="ภาพ/วิดีโอพื้นหลัง (ใส่มากกว่า 1 ชุดจะเป็นสไลด์เปลี่ยนทุก 7 วินาที)" value={s.slides} on={(v) => p({ slides: v })} max={6}
            blank={() => ({ image_url: "", video_url: "" })}
            render={(x, u) => (
              <div className="grid gap-3 md:grid-cols-2">
                <Img label="ภาพ" hint="แนะนำ 1920×1080 px ใช้เป็นภาพปกระหว่างโหลดวิดีโอด้วย" value={x.image_url} on={(v) => u({ image_url: v })} />
                <Video label="วิดีโอพื้นหลัง (ไม่บังคับ)" value={x.video_url} on={(v) => u({ video_url: v })} />
              </div>
            )} />
          <div className="grid gap-3 sm:grid-cols-2">
            <T label="ป้ายเล็กเหนือหัวข้อ" value={s.badge} on={(v) => p({ badge: v })} />
            <T label="หัวข้อหลัก" value={s.title} on={(v) => p({ title: v })} />
            <div className="sm:col-span-2"><T label="ข้อความรอง" value={s.subtitle} on={(v) => p({ subtitle: v })} area /></div>
          </div>
          <Buttons value={s.buttons} on={(v) => p({ buttons: v })} />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="ความสูง">
              <Select value={s.height} onChange={(e) => p({ height: e.target.value })}>
                <option value="full">เต็มจอ</option><option value="large">ใหญ่</option><option value="medium">กลาง</option>
              </Select>
            </Field>
            <Field label="จัดข้อความ">
              <Select value={s.align} onChange={(e) => p({ align: e.target.value })}>
                <option value="left">ชิดซ้าย</option><option value="center">กึ่งกลาง</option>
              </Select>
            </Field>
            <Field label={`ความเข้มเงาทับภาพ ${s.overlay}%`}>
              <input type="range" min={0} max={90} step={5} value={s.overlay} onChange={(e) => p({ overlay: Number(e.target.value) })} className="mt-3 w-full accent-navy-700" />
            </Field>
            <Check label="แสดงชื่อแบรนด์ด้านล่าง" checked={s.show_brands} on={(v) => p({ show_brands: v })} />
          </div>
        </div>
      );
    case "modules":
      return (
        <Items title="การ์ด" value={s.items} on={(v) => p({ items: v })} max={6}
          blank={() => ({ icon: "sun" as IconKey, title: "หัวข้อ", text: "", href: "/" })}
          render={(x, u) => (
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr]">
              <Select value={x.icon} onChange={(e) => u({ icon: e.target.value as IconKey })}>
                {(Object.keys(ICON_LABEL) as IconKey[]).map((k) => <option key={k} value={k}>{ICON_LABEL[k]}</option>)}
              </Select>
              <Input placeholder="หัวข้อ" value={x.title} onChange={(e) => u({ title: e.target.value })} />
              <Input placeholder="ลิงก์ เช่น /products" value={x.href} onChange={(e) => u({ href: e.target.value })} />
              <div className="sm:col-span-3"><Input placeholder="คำอธิบาย" value={x.text} onChange={(e) => u({ text: e.target.value })} /></div>
            </div>
          )} />
      );
    case "stats":
      return (
        <div className="space-y-4">
          <Heads s={s} set={p} />
          <Items title="ตัวเลข (นับขึ้นอัตโนมัติเมื่อเลื่อนถึง)" value={s.items} on={(v) => p({ items: v })} max={6}
            blank={() => ({ value: 100, suffix: "+", label: "หัวข้อ" })}
            render={(x, u) => (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input type="number" value={x.value} onChange={(e) => u({ value: Number(e.target.value) })} />
                <Input placeholder="ต่อท้าย เช่น + หรือ MW" value={x.suffix} onChange={(e) => u({ suffix: e.target.value })} />
                <Input placeholder="คำอธิบาย" value={x.label} onChange={(e) => u({ label: e.target.value })} />
              </div>
            )} />
        </div>
      );
    case "image_text":
      return (
        <div className="space-y-4">
          <Heads s={s} set={p} />
          <T label="รายละเอียด" value={s.text} on={(v) => p({ text: v })} area />
          <Field label="จุดเด่น" hint="บรรทัดละ 1 ข้อ แสดงเป็นเครื่องหมายถูก">
            <Textarea rows={3} value={s.bullets.join("\n")} onChange={(e) => p({ bullets: e.target.value.split("\n") })} onBlur={(e) => p({ bullets: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Img value={s.image_url} on={(v) => p({ image_url: v })} />
            <Video label="หรือวิดีโอ (แทนรูป)" value={s.video_url} on={(v) => p({ video_url: v })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ตำแหน่งภาพ">
              <Select value={s.side} onChange={(e) => p({ side: e.target.value })}><option value="left">ซ้าย</option><option value="right">ขวา</option></Select>
            </Field>
            <T label="ปุ่ม: ข้อความ" value={s.button.label} on={(v) => p({ button: { ...s.button, label: v } })} />
            <T label="ปุ่ม: ลิงก์" value={s.button.href} on={(v) => p({ button: { ...s.button, href: v } })} />
          </div>
        </div>
      );
    case "video":
      return (
        <div className="space-y-4">
          <Heads s={s} set={p} />
          <div className="grid gap-3 md:grid-cols-2">
            <Video value={s.video_url} on={(v) => p({ video_url: v })} />
            <Img label="ภาพปก (ไม่บังคับ)" value={s.poster_url} on={(v) => p({ poster_url: v })} />
          </div>
          <Check label="เล่นอัตโนมัติแบบปิดเสียงและวนซ้ำ (เหมาะกับวิดีโอบรรยากาศ)" checked={s.autoplay} on={(v) => p({ autoplay: v })} />
        </div>
      );
    case "cards":
      return (
        <div className="space-y-4">
          <Heads s={s} set={p} />
          <Field label="จำนวนคอลัมน์">
            <Select value={s.columns} onChange={(e) => p({ columns: Number(e.target.value) })}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></Select>
          </Field>
          <Items title="การ์ด" value={s.items} on={(v) => p({ items: v })}
            blank={() => ({ image_url: "", title: "หัวข้อ", text: "", href: "" })}
            render={(x, u) => (
              <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
                <ImageUpload folder="home" value={x.image_url} onChange={(v) => u({ image_url: v })} />
                <div className="space-y-2">
                  <Input placeholder="หัวข้อ" value={x.title} onChange={(e) => u({ title: e.target.value })} />
                  <Textarea rows={2} placeholder="คำอธิบาย" value={x.text} onChange={(e) => u({ text: e.target.value })} />
                  <Input placeholder="ลิงก์ (ไม่บังคับ)" value={x.href} onChange={(e) => u({ href: e.target.value })} />
                </div>
              </div>
            )} />
        </div>
      );
    case "logos":
      return (
        <div className="space-y-4">
          <T label="หัวข้อ" value={s.title} on={(v) => p({ title: v })} />
          <Field label="โลโก้" hint="ถ้าไม่ใส่ จะแสดงชื่อแบรนด์จากแท็บ “ข้อมูลบริษัท” แทน ใช้ PNG พื้นใสจะสวยที่สุด">
            <GalleryUpload folder="logos" value={s.logos} onChange={(v) => p({ logos: v })} />
          </Field>
          <Check label="เลื่อนอัตโนมัติแบบวนต่อเนื่อง" checked={s.marquee} on={(v) => p({ marquee: v })} />
        </div>
      );
    case "gallery":
      return (
        <div className="space-y-4">
          <Heads s={s} set={p} sub={false} />
          <Field label="ภาพ" hint="เลือกได้หลายภาพพร้อมกัน ผู้ชมคลิกเพื่อดูภาพใหญ่">
            <GalleryUpload folder="gallery" value={s.images} onChange={(v) => p({ images: v })} />
          </Field>
        </div>
      );
    case "cta":
      return (
        <div className="space-y-4">
          <T label="หัวข้อ" value={s.title} on={(v) => p({ title: v })} />
          <T label="ข้อความ" value={s.text} on={(v) => p({ text: v })} area />
          <Img label="ภาพพื้นหลัง (ไม่บังคับ)" value={s.image_url} on={(v) => p({ image_url: v })} />
          <Buttons value={s.buttons} on={(v) => p({ buttons: v })} />
        </div>
      );
    case "text":
      return (
        <div className="space-y-4">
          <Heads s={s} set={p} sub={false} />
          <T label="ข้อความ" hint="เว้นบรรทัดเพื่อขึ้นย่อหน้าใหม่" value={s.body} on={(v) => p({ body: v })} area />
          <Field label="จัดข้อความ">
            <Select value={s.align} onChange={(e) => p({ align: e.target.value })}><option value="left">ชิดซ้าย</option><option value="center">กึ่งกลาง</option></Select>
          </Field>
        </div>
      );
    case "ad":
      return (
        <div className="space-y-3">
          <Field label="ช่องโฆษณา">
            <Select value={s.placement} onChange={(e) => p({ placement: e.target.value })}>
              <option value="home_top">หน้าแรก: ช่องบน</option><option value="home_middle">หน้าแรก: ช่องกลาง</option>
            </Select>
          </Field>
          <p className="text-sm text-slate-500">{FEED_HINT.ad}</p>
        </div>
      );
    default: // feed blocks
      return (
        <div className="space-y-3">
          {s.type !== "contact" && <Heads s={s} set={p} />}
          {(s.type === "portfolio" || s.type === "team" || s.type === "training") && (
            <Field label="จำนวนที่แสดง"><Input type="number" min={1} max={24} value={s.limit} onChange={(e) => p({ limit: Number(e.target.value) })} /></Field>
          )}
          <p className="text-sm text-slate-500">{FEED_HINT[s.type]}</p>
        </div>
      );
  }
}

function Check({ label, checked, on }: { label: string; checked: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
      <input type="checkbox" className="h-4 w-4 accent-navy-700" checked={checked} onChange={(e) => on(e.target.checked)} />
      {label}
    </label>
  );
}
