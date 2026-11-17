import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { openPrivateFile, type Material } from "../lib/training";
import { Button } from "./ui";

/** Customer download list: files of a session and of its course (RLS shows only what the user may open). */
export function TrainingFileList({ sessionId, courseId, title = "เอกสารอบรม", reloadKey }: { sessionId: string; courseId: string; title?: string; reloadKey?: unknown }) {
  const [rows, setRows] = useState<Material[] | null>(null);
  useEffect(() => {
    supabase.from("course_materials").select("*").or(`session_id.eq.${sessionId},course_id.eq.${courseId}`).order("sort")
      .then(({ data }) => setRows((data ?? []) as Material[]));
  }, [sessionId, courseId, reloadKey]);
  if (!rows?.length) return null;
  return (
    <div className="rounded-xl bg-emerald-50 p-4 text-left text-sm">
      <p className="font-semibold text-emerald-900">{title}</p>
      <ul className="mt-2 space-y-2">
        {rows.map((m) => (
          <li key={m.id}>
            {m.file_path ? (
              <button className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left ring-1 ring-emerald-200 hover:ring-emerald-400" onClick={() => openPrivateFile("training-materials", m.file_path!)}>
                <span className="min-w-0 truncate">📄 {m.title}</span><span className="shrink-0 font-semibold text-emerald-700">ดาวน์โหลด</span>
              </button>
            ) : (
              <a href={m.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200 hover:ring-emerald-400">
                <span className="min-w-0 truncate">{m.kind === "video" ? "🎬" : "🔗"} {m.title}</span><span className="shrink-0 font-semibold text-emerald-700">เปิด</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Staff: pick several files at once; can be pressed again to add more. */
export function PickFiles({ onPick, label = "+ เพิ่มไฟล์ (เลือกได้หลายไฟล์)", disabled }: { onPick: (files: File[]) => void; label?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="secondary" className="!px-3 !py-1.5" disabled={disabled} onClick={() => ref.current?.click()}>{label}</Button>
      <input ref={ref} type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onPick(f); }} />
    </>
  );
}
