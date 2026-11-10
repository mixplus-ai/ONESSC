import { useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "../../../components/ui";
import { downloadCanvas, printCanvas, renderCertificate, type CertData, type CertTemplate } from "../../../lib/training";

/** Renders a certificate on a canvas and offers PNG download / print-to-PDF. */
export function CertificateView({ template, data }: { template: Pick<CertTemplate, "image_url" | "config"> | null; data: CertData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const key = JSON.stringify([template?.image_url, template?.config, data]);

  useEffect(() => {
    if (!ref.current) return;
    setBusy(true);
    renderCertificate(ref.current, template, data)
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function safe(fn: () => void) {
    try {
      fn();
    } catch {
      setErr("บันทึกไฟล์ไม่ได้ เพราะรูปแม่แบบอยู่ต่างโดเมน กรุณาให้ทีมงานอัปโหลดรูปแม่แบบใหม่ในหลังบ้าน");
    }
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl ring-1 ring-slate-200">
        <canvas ref={ref} className="block h-auto w-full" />
        {busy && <div className="absolute inset-0 grid place-items-center bg-white/60"><Spinner /></div>}
      </div>
      {err && <div className="mt-2"><Alert tone="amber">{err}</Alert></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => safe(() => downloadCanvas(ref.current!, data.certNo))}>ดาวน์โหลด PNG</Button>
        <Button variant="secondary" disabled={busy} onClick={() => safe(() => printCanvas(ref.current!, data.certNo))}>พิมพ์ / บันทึก PDF</Button>
      </div>
    </div>
  );
}
