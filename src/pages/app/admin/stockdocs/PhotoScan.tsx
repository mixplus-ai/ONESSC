import { useRef, useState } from "react";
import { Alert, Button, Modal, cx } from "../../../../components/ui";
import { errorMessage } from "../../../../lib/supabase";
import { MAX_PDF_PAGES, pdfPages, scanBarcodes, scanText, textCandidates, type SnCandidate } from "../../../../lib/snscan";
import { snKey } from "../../../../lib/stockdocs";

// one-character slip (OCR reading 8 for B, 1 for I …) of a value we already have
function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 6) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

interface Row extends SnCandidate { key: string; on: boolean; photo: number; dup: boolean }

/** Attach or take photos of SN labels / a packing list; read every barcode (and text if asked) and pick what to add. */
export function PhotoScan({ knownSkus, existing, onAdd }: { knownSkus: Set<string>; existing: Set<string>; onAdd: (sns: string[], photos: File[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);      // originals (photos / PDFs) kept as evidence
  const [pages, setPages] = useState<Blob[]>([]);      // what is scanned: each photo, each PDF page
  const [urls, setUrls] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [angles, setAngles] = useState<number[]>([]);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const merge = (prev: Row[], found: SnCandidate[], photo: number) => {
    const seen = new Set(prev.map((r) => r.key));
    const add: Row[] = [];
    for (const c of found) {
      const key = snKey(c.text);
      if (seen.has(key)) continue;
      // text read that is the same SN as a barcode with one misread character: keep the barcode only
      if (c.source === "text" && [...prev, ...add].some((r) => r.source === "barcode" && near(r.key, key))) continue;
      seen.add(key);
      const isSku = knownSkus.has(c.text);
      const dup = existing.has(key);
      add.push({ ...c, key, photo, dup, on: !dup && !isSku && (c.source === "barcode" || !!c.labelled) });
    }
    return [...prev, ...add];
  };

  const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  async function pick(list: FileList | null) {
    const fs = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || isPdf(f));
    if (!fs.length) return;
    urls.forEach((u) => URL.revokeObjectURL(u));
    setFiles(fs);
    setErr("");
    setRows([]);
    // PDFs become one image per page; a PDF with a text layer gives its SNs straight from the text
    const pg: Blob[] = [];
    const fromText: { at: number; items: SnCandidate[] }[] = [];
    for (const f of fs) {
      if (!isPdf(f)) { pg.push(f); continue; }
      setBusy(`กำลังเปิด PDF ${f.name}`);
      try {
        const r = await pdfPages(f);
        r.text.forEach((t, j) => t.trim() && fromText.push({ at: pg.length + j, items: textCandidates(t) }));
        pg.push(...r.images);
        if (r.total > MAX_PDF_PAGES) setErr(`${f.name} มี ${r.total} หน้า อ่านเฉพาะ ${MAX_PDF_PAGES} หน้าแรก`);
      } catch (e) { setErr(`เปิด ${f.name} ไม่ได้: ${errorMessage(e)}`); }
    }
    setPages(pg);
    setUrls(pg.map((f) => URL.createObjectURL(f)));
    let acc: Row[] = [];
    const ang: number[] = [];
    for (let i = 0; i < pg.length; i++) {
      setBusy(`กำลังอ่านบาร์โค้ด หน้า ${i + 1}/${pg.length}`);
      try { const r = await scanBarcodes(pg[i]); ang[i] = r.angle; acc = merge(acc, r.items, i); } catch (e) { ang[i] = 0; setErr(errorMessage(e)); }
      setRows(acc);
    }
    // barcodes first so a text value that repeats a barcode is dropped
    for (const t of fromText) acc = merge(acc, t.items, t.at);
    setRows(acc);
    setAngles(ang);
    setBusy("");
    if (!acc.length && pg.length) await readText(pg, acc, ang);
  }

  async function readText(fs = pages, start = rows ?? [], ang = angles) {
    let acc = start;
    for (let i = 0; i < fs.length; i++) {
      setBusy(`กำลังอ่านตัวอักษร หน้า ${i + 1}/${fs.length}`);
      try {
        acc = merge(acc, await scanText(fs[i], ang[i] ?? 0, (p) => setBusy(`กำลังอ่านตัวอักษร หน้า ${i + 1}/${fs.length} · ${Math.round(p * 100)}%`)), i);
      } catch (e) { setErr("อ่านตัวอักษรไม่สำเร็จ: " + errorMessage(e)); }
      setRows(acc);
    }
    setBusy("");
  }

  const close = () => { urls.forEach((u) => URL.revokeObjectURL(u)); setUrls([]); setFiles([]); setPages([]); setRows(null); setErr(""); };
  const chosen = (rows ?? []).filter((r) => r.on);

  return (
    <>
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>📷 แนบรูป / PDF / ถ่ายรูป</Button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <Modal open={rows !== null} onClose={close} wide title="อ่าน SN จากรูปหรือ PDF"
        footer={<>
          <label className="mr-auto flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> เก็บรูป / PDF ไว้กับเอกสารเป็นหลักฐาน</label>
          <Button variant="ghost" onClick={close}>ปิด</Button>
          <Button disabled={!chosen.length || !!busy} onClick={() => { onAdd(chosen.map((r) => r.text), keep ? files : []); close(); }}>เพิ่ม {chosen.length} SN ที่เลือก</Button>
        </>}>
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <div className="space-y-2">
            {urls.map((u, i) => <img key={u} src={u} alt={`หน้า ${i + 1}`} className="w-full rounded-lg ring-1 ring-slate-200" />)}
          </div>
          <div className="space-y-3">
            {busy && <Alert tone="navy">{busy}…</Alert>}
            {err && <Alert>{err}</Alert>}
            {rows && rows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-500">พบ {rows.length} รายการ · เลือก {chosen.length}</span>
                  <button className="text-navy-700 hover:underline" onClick={() => setRows(rows.map((r) => ({ ...r, on: !r.dup })))}>เลือกทั้งหมด</button>
                  <button className="text-navy-700 hover:underline" onClick={() => setRows(rows.map((r) => ({ ...r, on: false })))}>ไม่เลือกเลย</button>
                </div>
                <div className="max-h-[50vh] space-y-1 overflow-y-auto">
                  {rows.map((r, i) => (
                    <label key={r.key} className={cx("flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1", r.on ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200")}>
                      <input type="checkbox" checked={r.on} disabled={r.dup} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))} />
                      <input value={r.text} onChange={(e) => { const t = e.target.value.toUpperCase(); setRows(rows.map((x, j) => j === i ? { ...x, text: t } : x)); }}
                        className="min-w-0 flex-1 rounded border-0 bg-transparent p-0 font-mono text-sm focus:ring-0" />
                      <span className="shrink-0 text-xs text-slate-500">
                        {r.dup ? "มีในเอกสารแล้ว" : knownSkus.has(r.text) ? "น่าจะเป็นรหัสสินค้า" : r.source === "barcode" ? `บาร์โค้ด${r.format ? ` ${r.format}` : ""}` : r.labelled ? "ตัวอักษร (หลัง S/N)" : "ตัวอักษร ตรวจก่อน"}
                        {pages.length > 1 ? ` · หน้า ${r.photo + 1}` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {rows && !rows.length && !busy && <Alert tone="amber">ไม่พบบาร์โค้ดหรือ SN ในรูป ลองถ่ายให้ใกล้และชัดขึ้น หรือพิมพ์เอง</Alert>}
            {!busy && pages.length > 0 && (
              <p className="text-xs text-slate-500">
                ต้องการอ่าน SN ที่พิมพ์เป็นตัวอักษรด้วย (ไม่มีบาร์โค้ด)?{" "}
                <button className="font-semibold text-navy-700 hover:underline" onClick={() => readText()}>อ่านตัวอักษรในรูป</button>
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
