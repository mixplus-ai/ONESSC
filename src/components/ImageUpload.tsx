import { useRef, useState } from "react";
import { uploadSiteImage } from "../lib/content";
import { errorMessage } from "../lib/supabase";
import { ImageIcon, XIcon } from "./icons";
import { Spinner } from "./ui";

/** Single image picker that uploads to the site-media bucket and returns the public URL. */
type Uploader = (file: File, folder: string) => Promise<string>;

/** Recommended image size, shown next to the upload button; a picked image with another shape gets a warning. */
export interface ImageSize { w: number; h: number; note?: string }
export const IMAGE_SIZES = {
  product: { w: 1000, h: 1000, note: "สี่เหลี่ยมจัตุรัส พื้นขาวหรือโปร่งใส สินค้าอยู่กลางภาพ" },
  packageCover: { w: 1600, h: 900, note: "แนวนอน 16:9" },
  promoBanner: { w: 1920, h: 480, note: "แนวนอนยาว 4:1 ขอบบน-ล่างอาจถูกตัด" },
  brandLogo: { w: 600, h: 300, note: "PNG พื้นโปร่งใส" },
  person: { w: 600, h: 600, note: "สี่เหลี่ยมจัตุรัส หน้าอยู่กลางภาพ" },
} satisfies Record<string, ImageSize>;

const readSize = (file: File) =>
  new Promise<{ w: number; h: number } | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });

/** Warning text when the picked image's shape or size is off from the recommendation, else "". */
async function sizeWarning(file: File, size?: ImageSize): Promise<string> {
  if (!size) return "";
  const d = await readSize(file);
  if (!d) return "";
  const off = Math.abs(d.w / d.h - size.w / size.h) / (size.w / size.h);
  if (off > 0.03) return `${file.name}: ${d.w}×${d.h} px สัดส่วนไม่ตรงกับที่แนะนำ (${size.w}×${size.h}) รูปอาจถูกเว้นขอบหรือตัดขอบ`;
  if (d.w < size.w * 0.6) return `${file.name}: ${d.w}×${d.h} px เล็กกว่าที่แนะนำ อาจไม่คมชัด`;
  return "";
}

export function SizeHint({ size }: { size: ImageSize }) {
  return (
    <p className="text-xs text-slate-500">
      ขนาดแนะนำ <span className="font-semibold text-navy-800">{size.w.toLocaleString()}×{size.h.toLocaleString()} px</span>
      {size.note && ` · ${size.note}`} · JPG/PNG/WebP ไม่เกิน 5 MB
    </p>
  );
}

export function ImageUpload({ value, onChange, folder, label = "อัปโหลดรูป", upload = uploadSiteImage, size }: { value: string; onChange: (url: string) => void; folder: string; label?: string; upload?: Uploader; size?: ImageSize }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">
              {busy && <Spinner className="h-4 w-4" />} {label}
            </button>
            {value && (
              <button type="button" onClick={() => { onChange(""); setWarn(""); }} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <XIcon className="h-4 w-4" /> ลบ
              </button>
            )}
          </div>
          {size && <SizeHint size={size} />}
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 5 MB");
          setBusy(true);
          setErr("");
          setWarn(await sizeWarning(file, size));
          try {
            onChange(await upload(file, folder));
          } catch (x) {
            setErr(errorMessage(x));
          } finally {
            setBusy(false);
          }
        }}
      />
      {warn && <p className="mt-1 text-xs text-amber-700">{warn}</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** Multi-image gallery editor. */
export function GalleryUpload({ value, onChange, folder, upload = uploadSiteImage, size }: { value: string[]; onChange: (urls: string[]) => void; folder: string; upload?: Uploader; size?: ImageSize }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((src, i) => (
          <div key={src + i} className="relative h-20 w-28 overflow-hidden rounded-lg ring-1 ring-slate-200">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white" aria-label="ลบรูป">
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => ref.current?.click()} className="grid h-20 w-28 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-navy-600">
          {busy ? <Spinner className="h-5 w-5" /> : "+ เพิ่มรูป"}
        </button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setErr("");
          setWarn((await Promise.all(files.map((f) => sizeWarning(f, size)))).filter(Boolean).join("\n"));
          try {
            const urls: string[] = [];
            for (const f of files) {
              if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name} ใหญ่เกิน 5 MB`);
              urls.push(await upload(f, folder));
            }
            onChange([...value, ...urls]);
          } catch (x) {
            setErr(errorMessage(x));
          } finally {
            setBusy(false);
          }
        }}
      />
      {size && <div className="mt-1"><SizeHint size={size} /></div>}
      {warn && <p className="mt-1 whitespace-pre-line text-xs text-amber-700">{warn}</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** URL field with an "upload file" button (PDF datasheets, manuals, quotation files). */
export function FileUpload({ value, onChange, folder, upload, accept = "application/pdf", maxMb = 20 }: { value: string; onChange: (url: string) => void; folder: string; upload: Uploader; accept?: string; maxMb?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="วางลิงก์ หรืออัปโหลดไฟล์"
          className="block w-full min-w-0 rounded-lg border-0 px-3 py-2.5 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-navy-600"
        />
        <button type="button" onClick={() => ref.current?.click()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">
          {busy && <Spinner className="h-4 w-4" />} อัปโหลด
        </button>
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > maxMb * 1024 * 1024) return setErr(`ไฟล์ใหญ่เกิน ${maxMb} MB`);
          setBusy(true);
          setErr("");
          try {
            onChange(await upload(file, folder));
          } catch (x) {
            setErr(errorMessage(x));
          } finally {
            setBusy(false);
          }
        }}
      />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
