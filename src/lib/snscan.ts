// Read serial numbers from a photo: every barcode / QR in the picture (zxing, WebAssembly bundled with the
// app), and optionally the printed text (Tesseract OCR, loaded only when asked). Both run in the browser.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import ocrWorkerUrl from "tesseract.js/dist/worker.min.js?url";
import ocrCoreUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";

export interface SnCandidate { text: string; source: "barcode" | "text"; format?: string; labelled?: boolean }

let ready: Promise<typeof import("zxing-wasm/reader")> | null = null;
function zxing() {
  ready ??= import("zxing-wasm/reader").then((m) => {
    m.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) } });
    return m;
  });
  return ready;
}

// "S/N: X", "SN X", "Serial No. X" -> X (but keep a value that itself starts with SN-…)
const LABEL = /^(S\/N|SN|SERIAL(\s*NO\.?)?)(\s*[:#.]\s*|\s+)/;
const clean = (s: string) => s.trim().toUpperCase().replace(LABEL, "").replace(/\s+/g, "");

/** Big phone photos are slow to scan; shrink to at most `max` px on the long side. */
async function toImageData(file: Blob, max = 2400): Promise<ImageData> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return g.getImageData(0, 0, w, h);
}

/** Grey, contrast-stretched and at least ~2000 px wide: small label print reads much better. */
async function forOcr(file: Blob, angle = 0): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(3, Math.max(1, 2000 / bmp.width));
  const w = bmp.width * k, h = bmp.height * k;
  const rad = (-angle * Math.PI) / 180;
  const c = document.createElement("canvas");
  c.width = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  c.height = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.filter = "grayscale(1)";
  g.translate(c.width / 2, c.height / 2);
  g.rotate(rad);
  g.drawImage(bmp, -w / 2, -h / 2, w, h);
  bmp.close();
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/png"));
}

/** Barcodes in the photo, plus the photo's tilt in degrees (from the barcode corners) for straightening before OCR. */
export async function scanBarcodes(file: Blob): Promise<{ items: SnCandidate[]; angle: number }> {
  const m = await zxing();
  const img = await toImageData(file);
  const res = await m.readBarcodes(img, { maxNumberOfSymbols: 255, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true });
  const out: SnCandidate[] = [];
  const angles: number[] = [];
  for (const r of res) {
    if (!r.isValid || !r.text) continue;
    // tilt from the left edge (1D barcodes report a level top edge, so use the side)
    const { topLeft: a, bottomLeft: b } = r.position;
    angles.push((-Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI);
    // a QR may hold several values (one per line or separated by ; ,)
    for (const part of r.text.split(/[\r\n;,|]+/)) {
      const t = clean(part);
      if (t.length >= 4 && t.length <= 60 && !/^HTTPS?:/.test(t)) out.push({ text: t, source: "barcode", format: r.format });
    }
  }
  angles.sort((x, y) => x - y);
  return { items: out, angle: angles.length ? angles[Math.floor(angles.length / 2)] : 0 };
}

/** SN-looking tokens in plain text, one line at a time ("S/N: X" lines are marked as labelled). */
export function textCandidates(text: string): SnCandidate[] {
  const out: SnCandidate[] = [];
  for (const line of text.split("\n")) {
    const L = line.toUpperCase();
    const labelled = /\b(S\/?N|SERIAL)\b/.test(L);
    const body = L.replace(/.*\b(S\/N|SN|SERIAL(\s*NO\.?)?)(\s*[:#.]\s*|\s+)/, "");
    for (const tok of body.match(/[A-Z0-9][A-Z0-9\-/.]{4,}[A-Z0-9]/g) ?? []) {
      // a serial has digits and is not a date, a price or a plain word
      if (!/\d/.test(tok) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(tok) || /^\d{1,3}(\.\d+)?$/.test(tok)) continue;
      out.push({ text: tok, source: "text", labelled: labelled || undefined });
    }
  }
  return out;
}

export const MAX_PDF_PAGES = 20;

/** A PDF as page images (for barcodes / OCR) plus the text layer of each page when it has one (exported PDFs). */
export async function pdfPages(file: Blob): Promise<{ images: Blob[]; text: string[]; total: number }> {
  const { loadPdfjs } = await import("./deliveries");
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const images: Blob[] = [], text: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PDF_PAGES); p++) {
    const page = await doc.getPage(p);
    // text layer: group items into lines by their baseline
    const tc = await page.getTextContent();
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      (lines.get(y) ?? lines.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    text.push([...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.sort((a, b) => a.x - b.x).map((t) => t.s).join(" ")).join("\n"));
    // page image ~2400 px wide
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(4, 2400 / v1.width) });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    images.push(await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("render"))), "image/png")));
    page.cleanup();
  }
  const total = doc.numPages;
  await doc.destroy();
  return { images, text, total };
}

export async function scanText(file: Blob, angle = 0, onProgress?: (p: number) => void): Promise<SnCandidate[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { workerPath: ocrWorkerUrl, corePath: ocrCoreUrl, langPath: "/tesseract", logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && onProgress?.(m.progress) });
  try {
    // labels and packing lists: text is scattered between barcodes, so look for sparse text
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(await forOcr(file, Math.abs(angle) > 1 && Math.abs(angle) < 45 ? angle : 0));
    const out = textCandidates(data.text);
    return out;
  } finally {
    await worker.terminate();
  }
}
