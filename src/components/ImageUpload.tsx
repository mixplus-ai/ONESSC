import { useRef, useState } from "react";
import { uploadSiteImage } from "../lib/content";
import { errorMessage } from "../lib/supabase";
import { ImageIcon, XIcon } from "./icons";
import { Spinner } from "./ui";

/** Single image picker that uploads to the site-media bucket and returns the public URL. */
type Uploader = (file: File, folder: string) => Promise<string>;

export function ImageUpload({ value, onChange, folder, label = "อัปโหลดรูป", upload = uploadSiteImage }: { value: string; onChange: (url: string) => void; folder: string; label?: string; upload?: Uploader }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">
            {busy && <Spinner className="h-4 w-4" />} {label}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              <XIcon className="h-4 w-4" /> ลบ
            </button>
          )}
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

/** Multi-image gallery editor. */
export function GalleryUpload({ value, onChange, folder, upload = uploadSiteImage }: { value: string[]; onChange: (urls: string[]) => void; folder: string; upload?: Uploader }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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
