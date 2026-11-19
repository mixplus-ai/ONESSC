import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "../../../../components/ui";
import { FILE_KINDS, type FileKind } from "../../../../lib/stockdocs";
import { errorMessage, supabase } from "../../../../lib/supabase";

export interface FileRow { id: string; path: string; name: string; size: number | null; created_at: string; kind: FileKind }
export interface PendingFile { file: File; kind: FileKind }

export const isImage = (name: string) => /\.(jpe?g|png|webp|heic|gif)$/i.test(name);

export async function uploadDocFiles(docId: string, files: PendingFile[]) {
  for (const { file: f, kind } of files) {
    const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
    const path = `${docId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
    const up = await supabase.storage.from("stock-files").upload(path, f, { contentType: f.type || undefined });
    if (up.error) throw up.error;
    const { error } = await supabase.from("stock_doc_files").insert({ doc_id: docId, path, name: f.name, size: f.size, kind });
    if (error) throw error;
  }
}

/** Files of a document with a signed link for each image (for the screen and the printed detail sheet). */
export async function loadDocFiles(docId: string, ttl = 3600) {
  const { data } = await supabase.from("stock_doc_files").select("*").eq("doc_id", docId).order("created_at");
  const list = (data ?? []) as FileRow[];
  const imgs = list.filter((f) => isImage(f.name));
  let urls: Record<string, string> = {};
  if (imgs.length) {
    const { data: u } = await supabase.storage.from("stock-files").createSignedUrls(imgs.map((f) => f.path), ttl);
    urls = Object.fromEntries((u ?? []).filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl as string]));
  }
  return { list, urls };
}

/**
 * Photos / files kept with a document as evidence. Before the first save they wait in `pending`.
 * With `kinds` (documents that travel on a truck) the files are grouped: plate, vehicle papers, driver papers, goods on the truck, other.
 */
export function DocFiles({ docId, draft, pending, setPending, tick, kinds }: {
  docId: string | null; draft: boolean; pending: PendingFile[]; setPending: (f: PendingFile[]) => void; tick: number; kinds?: boolean;
}) {
  const [rows, setRows] = useState<FileRow[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<FileKind | "">("");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<FileKind>("other");

  async function load() {
    if (!docId) return setRows([]);
    const { list, urls } = await loadDocFiles(docId);
    setRows(list);
    setThumbs(urls);
  }
  useEffect(() => { load(); }, [docId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(list: FileList | null, kind: FileKind) {
    const fs = [...(list ?? [])].map((file) => ({ file, kind }));
    if (!fs.length) return;
    if (!docId) return setPending([...pending, ...fs]);
    setBusy(kind); setErr("");
    try { await uploadDocFiles(docId, fs); await load(); } catch (e) { setErr(errorMessage(e)); }
    setBusy("");
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
  async function relabel(f: FileRow, kind: FileKind) {
    const { error } = await supabase.from("stock_doc_files").update({ kind }).eq("id", f.id);
    if (error) return setErr(errorMessage(error));
    load();
  }
  function pick(kind: FileKind) { setTarget(kind); ref.current?.click(); }

  const groups = kinds ? FILE_KINDS : FILE_KINDS.filter((k) => k.kind === "other");
  const kindOf = (k: FileKind) => (kinds ? k : "other");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-navy-900">{kinds ? "รูปรถ คนขับ และสินค้า" : "รูป / ไฟล์แนบ"}</h3>
        {!kinds && <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => pick("other")} loading={busy === "other"}>+ แนบไฟล์</Button>}
        <input ref={ref} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => { add(e.target.files, target); e.target.value = ""; }} />
        {!docId && pending.length > 0 && <span className="text-xs text-slate-500">จะอัปโหลดเมื่อบันทึก</span>}
      </div>
      {kinds && <p className="mt-1 text-xs text-slate-500">รูปในหมวดเหล่านี้จะแสดงในใบรายละเอียดตอนพิมพ์</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      {rows === null && <Spinner className="mt-2 h-4 w-4" />}
      <div className={kinds ? "mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "mt-2"}>
        {groups.map((g) => {
          const mine = (rows ?? []).filter((f) => kindOf(f.kind ?? "other") === g.kind);
          const pend = pending.map((p, i) => ({ ...p, i })).filter((p) => kindOf(p.kind) === g.kind);
          return (
            <div key={g.kind} className={kinds ? "rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200" : ""}>
              {kinds && (
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-navy-900">{g.label}</span>
                  <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => pick(g.kind)} loading={busy === g.kind}>+ เพิ่มรูป</Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {mine.map((f) => (
                  <div key={f.id} className="group relative">
                    <button onClick={() => open(f)} className="block h-20 w-20 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 hover:ring-navy-400" title={f.name}>
                      {thumbs[f.path] ? <img src={thumbs[f.path]} alt={f.name} className="h-full w-full object-cover" /> : <span className="block p-1 text-[10px] break-all text-slate-600">{f.name}</span>}
                    </button>
                    {draft && <button onClick={() => remove(f)} className="absolute -right-1 -top-1 hidden h-5 w-5 rounded-full bg-red-600 text-xs text-white group-hover:block" aria-label="ลบ">✕</button>}
                    {draft && kinds && (
                      <select value={f.kind ?? "other"} onChange={(e) => relabel(f, e.target.value as FileKind)} className="mt-0.5 block w-20 rounded border-0 bg-transparent p-0 text-[10px] text-slate-500" aria-label="ย้ายหมวด">
                        {FILE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {pend.map(({ file: f, i }) => (
                  <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg ring-1 ring-dashed ring-amber-400" title={f.name}>
                    {f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover opacity-70" /> : <span className="block p-1 text-[10px] break-all">{f.name}</span>}
                    <button onClick={() => setPending(pending.filter((_, j) => j !== i))} className="absolute right-0 top-0 h-5 w-5 rounded-bl bg-white/80 text-xs" aria-label="เอาออก">✕</button>
                  </div>
                ))}
                {rows && !mine.length && !pend.length && <p className="text-xs text-slate-400">{kinds ? "ยังไม่มีรูป" : "ยังไม่มีไฟล์ เช่น รูปป้าย SN ใบส่งของ หรือรูปสภาพสินค้า"}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
