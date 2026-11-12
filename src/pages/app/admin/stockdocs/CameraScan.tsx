import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "../../../../components/ui";
import { readFrame } from "../../../../lib/snscan";

// short beep + buzz so the person scanning knows without looking at the screen
let audio: AudioContext | null = null;
export function beep(ok = true) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = ok ? 1200 : 300;
    g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + (ok ? 0.08 : 0.25));
  } catch { /* no sound */ }
  try { navigator.vibrate?.(ok ? 40 : [80, 60, 80]); } catch { /* no vibration */ }
}

/**
 * Live barcode scanning with the phone camera: point at labels one after another, each new SN is
 * passed to onScan once (the same code is ignored while it stays in view).
 */
export function CameraScan({ onScan, label = "📷 สแกนด้วยกล้อง", last }: { onScan: (sns: string[]) => void; label?: string; last?: { text: string; tone: "green" | "amber" | "red" | "navy" } | null }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [count, setCount] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const seen = new Map<string, number>();
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (e) {
        setErr(location.protocol !== "https:" && location.hostname !== "localhost" ? "ต้องเปิดเว็บแบบ https จึงจะใช้กล้องได้" : "เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์ (" + (e as Error).message + ")");
        return;
      }
      if (stop) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      while (!stop) {
        if (v.videoWidth) {
          // centre band of the frame, at most 1280 px wide: quick enough for ~4 reads a second on a phone
          const k = Math.min(1, 1280 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * k); canvas.height = Math.round(v.videoHeight * k);
          const g = canvas.getContext("2d", { willReadFrequently: true })!;
          g.drawImage(v, 0, 0, canvas.width, canvas.height);
          try {
            const now = Date.now();
            const fresh = (await readFrame(g.getImageData(0, 0, canvas.width, canvas.height))).filter((t) => {
              const prev = seen.get(t);
              seen.set(t, now);
              return !prev || now - prev > 3000;
            });
            if (fresh.length && !stop) { setCount((c) => c + fresh.length); cb.current(fresh); }
          } catch (e) { setErr((e as Error).message); }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [open]);

  return (
    <>
      <Button variant="secondary" onClick={() => { setErr(""); setCount(0); setOpen(true); }}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="สแกนบาร์โค้ดด้วยกล้อง"
        footer={<Button onClick={() => setOpen(false)}>เสร็จ ({count} SN)</Button>}>
        {err ? <p className="text-sm text-red-600">{err}</p> : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={video} playsInline muted className="block max-h-[60vh] w-full object-contain" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}
        <p className={`mt-2 min-h-6 rounded px-2 py-1 text-center font-mono text-sm ${last ? { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", navy: "bg-navy-50 text-navy-800" }[last.tone] : "text-slate-500"}`}>
          {last?.text ?? "เล็งกล้องที่บาร์โค้ดทีละชิ้น ระบบจะบันทึกให้เอง"}
        </p>
      </Modal>
    </>
  );
}
