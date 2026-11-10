import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal } from "./ui";

interface Controls { stop: () => void }

/**
 * Camera barcode / QR scan for serial numbers. Uses the browser's BarcodeDetector when it exists
 * (Chrome, Android) and falls back to ZXing (iPhone Safari, Firefox), loaded only when the camera opens.
 */
export function SnScanner({ open, onClose, onScan, multi }: { open: boolean; onClose: () => void; onScan: (sn: string) => void; multi?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    setErr("");
    setLast([]);
    let controls: Controls | null = null;
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    let lastText = "";
    let lastAt = 0;
    const hit = (text: string) => {
      const t = text.trim();
      if (!t) return;
      const now = Date.now();
      if (t === lastText && now - lastAt < 2500) return;
      lastText = t;
      lastAt = now;
      if (navigator.vibrate) navigator.vibrate(60);
      onScan(t);
      setLast((l) => [t, ...l].slice(0, 5));
      if (!multi) onClose();
    };
    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (BD) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (!alive || !video.current) return;
          video.current.srcObject = stream;
          await video.current.play();
          const det = new BD({ formats: ["code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "qr_code", "data_matrix", "itf"] });
          const loop = async () => {
            if (!alive || !video.current) return;
            try {
              const codes = await det.detect(video.current);
              if (codes[0]) hit(codes[0].rawValue);
            } catch { /* frame not ready */ }
            raf = window.setTimeout(loop, 250) as unknown as number;
          };
          loop();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (!alive || !video.current) return;
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromVideoDevice(undefined, video.current, (res) => { if (res) hit(res.getText()); });
        }
      } catch (e) {
        setErr(e instanceof Error && e.name === "NotAllowedError" ? "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์กล้องในเบราว์เซอร์" : "เปิดกล้องไม่ได้ในอุปกรณ์นี้");
      }
    })();
    return () => {
      alive = false;
      clearTimeout(raf);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, multi]);

  return (
    <Modal open={open} onClose={onClose} title="สแกน SN ด้วยกล้อง" footer={<Button variant="secondary" onClick={onClose}>{multi ? "เสร็จ" : "ปิด"}</Button>}>
      {err ? <Alert>{err}</Alert> : (
        <div className="space-y-3">
          <video ref={video} className="aspect-[4/3] w-full rounded-xl bg-black object-cover" muted playsInline />
          <p className="text-xs text-slate-500">เล็งบาร์โค้ดหรือ QR บนฉลากสินค้าให้อยู่กลางภาพ{multi ? " สแกนต่อได้หลายตัว" : ""}</p>
          {last.length > 0 && <p className="text-sm">สแกนแล้ว: <span className="font-mono">{last.join(", ")}</span></p>}
        </div>
      )}
    </Modal>
  );
}

export function ScanButton({ onScan, multi, className }: { onScan: (sn: string) => void; multi?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "shrink-0 rounded-lg px-2 text-slate-500 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"} title="สแกนด้วยกล้อง" aria-label="สแกนด้วยกล้อง">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 8v8M10 8v8M13 8v8M16 8v8" /></svg>
      </button>
      <SnScanner open={open} onClose={() => setOpen(false)} onScan={onScan} multi={multi} />
    </>
  );
}
