import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "../../../../components/ui";
import { errorMessage, supabase } from "../../../../lib/supabase";

interface FileRow { id: string; path: string; name: string; size: number | null; created_at: string }

export async function uploadDocFiles(docId: string, files: File[]) {
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
    const path = `${docId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
    const up = await supabase.storage.from("stock-files").upload(path, f, { contentType: f.type || undefined });
    if (up.error) throw up.error;
    const { error } = await supabase.from("stock_doc_files").insert({ doc_id: docId, path, name: f.name, size: f.size });
    if (error) throw error;
  }
}

/** Photos / files kept with a document as evidence. Before the first save they wait in `pending`. */
export function DocFiles({ docId, draft, pending, setPending, tick }: {
  docId: string | null; draft: boolean; pending: File[]; setPending: (f: File[]) => void; tick: number;
}) {
  const [rows, setRows] = useState<FileRow[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  async function load() {
    if (!docId) return setRows([]);
    const { data } = await supabase.from("stock_doc_files").select("*").eq("doc_id", docId).order("created_at");
    const list = (data ?? []) as FileRow[];
    setRows(list);
    const imgs = list.filter((f) => /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name));
    if (imgs.length) {
      const { data: urls } = await supabase.storage.from("stock-files").createSignedUrls(imgs.map((f) => f.path), 3600);
      setThumbs(Object.fromEntries((urls ?? []).filter((u) => u.signedUrl).map((u) => [u.path!, u.signedUrl as string])));
    }
  }
  useEffect(() => { load(); }, [docId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(list: FileList | null) {
    const fs = [...(list ?? [])];
    if (!fs.length) return;
    if (!docId) return setPending([...pending, ...fs]);
    setBusy(true); setErr("");
    try { await uploadDocFiles(docId, fs); await load(); } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  }
  async function open(f: FileRow) {
    const { data, error } = await supabase.storage.from("stock-files").createSignedUrl(f.path, 600);
    if (error) return setErr(errorMessage(error));
    window.open(data.signedUrl, "_blank");
  }
  async function remove(f: FileRow) {
    if (!confirm(`ลบไฟล์ ${f.name}?`)) return;
    const { error } = await supabase.from("stock_doc_files").delete().eq("id", f.id);
    if (error) return setErr(errorMessage(error));
    await supabase.storage.from("stock-files").remove([f.path]);
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-navy-900">รูป / ไฟล์แนบ</h3>
        <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => ref.current?.click()} loading={busy}>+ แนบไฟล์</Button>
        <input ref={ref} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        {!docId && pending.length > 0 && <span className="text-xs text-slate-500">จะอัปโหลดเมื่อบันทึก</span>}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {rows === null && <Spinner className="h-4 w-4" />}
        {rows?.map((f) => (
          <div key={f.id} className="group relative">
            <button onClick={() => open(f)} className="block h-20 w-20 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 hover:ring-navy-400" title={f.name}>
              {thumbs[f.path] ? <img src={thumbs[f.path]} alt={f.name} className="h-full w-full object-cover" /> : <span className="block p-1 text-[10px] break-all text-slate-600">{f.name}</span>}
            </button>
            {draft && <button onClick={() => remove(f)} className="absolute -right-1 -top-1 hidden h-5 w-5 rounded-full bg-red-600 text-xs text-white group-hover:block" aria-label="ลบ">✕</button>}
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg ring-1 ring-dashed ring-amber-400" title={f.name}>
            {f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover opacity-70" /> : <span className="block p-1 text-[10px] break-all">{f.name}</span>}
            <button onClick={() => setPending(pending.filter((_, j) => j !== i))} className="absolute right-0 top-0 h-5 w-5 rounded-bl bg-white/80 text-xs" aria-label="เอาออก">✕</button>
          </div>
        ))}
        {rows?.length === 0 && !pending.length && <p className="text-sm text-slate-500">ยังไม่มีไฟล์ เช่น รูปป้าย SN ใบส่งของ หรือรูปสภาพสินค้า</p>}
      </div>
    </div>
  );
}
