import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldIcon } from "../../components/icons";
import { Alert, Button, Input, Loading } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { formatThaiDate } from "../../lib/training";

interface Result {
  cert_no: string;
  full_name: string | null;
  name_en: string | null;
  course_code: string;
  course_title: string;
  session_date: string;
  issued_at: string;
  expires_on: string | null;
  valid: boolean;
}

/** Public certificate check — the QR printed on every certificate opens this page. */
export default function VerifyCert() {
  const { certNo } = useParams();
  const nav = useNavigate();
  const [res, setRes] = useState<Result | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!certNo) return setRes(undefined);
    setLoading(true);
    supabase.rpc("verify_certificate", { p_cert_no: certNo }).then(({ data }) => {
      setRes(((data as Result[] | null) ?? [])[0] ?? null);
      setLoading(false);
    });
  }, [certNo]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get("no") || "").trim();
    if (v) nav(`/verify/${encodeURIComponent(v)}`);
  }

  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-navy-700"><ShieldIcon className="h-6 w-6" /></span>
        <h1 className="mt-4 text-2xl font-bold text-navy-900">ตรวจสอบใบประกาศ</h1>
        <form onSubmit={submit} className="mt-5 flex gap-2">
          <Input name="no" defaultValue={certNo ?? ""} placeholder="เช่น SSC-OM-2026-0001" />
          <Button type="submit">ตรวจสอบ</Button>
        </form>
        <div className="mt-6">
          {loading && <Loading />}
          {!loading && res === null && <Alert>ไม่พบใบประกาศเลขที่นี้ในระบบ</Alert>}
          {!loading && res && (
            <div className={`rounded-2xl p-5 ring-1 ${res.valid ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}>
              <p className={`text-sm font-semibold ${res.valid ? "text-emerald-700" : "text-amber-800"}`}>
                {res.valid ? "✓ ใบประกาศถูกต้องและยังไม่หมดอายุ" : "ใบประกาศนี้หมดอายุแล้ว"}
              </p>
              <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-slate-500">เลขที่</dt><dd className="font-mono">{res.cert_no}</dd>
                <dt className="text-slate-500">ชื่อ</dt><dd className="font-semibold text-navy-900">{res.full_name}{res.name_en ? ` (${res.name_en})` : ""}</dd>
                <dt className="text-slate-500">หลักสูตร</dt><dd>{res.course_title}</dd>
                <dt className="text-slate-500">วันที่อบรม</dt><dd>{formatThaiDate(res.session_date, { day: "numeric", month: "long", year: "numeric" })}</dd>
                <dt className="text-slate-500">หมดอายุ</dt><dd>{res.expires_on ? formatThaiDate(res.expires_on, { day: "numeric", month: "long", year: "numeric" }) : "ไม่มีวันหมดอายุ"}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
