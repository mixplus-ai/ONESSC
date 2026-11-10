import { WrenchIcon } from "../../components/icons";
import { ButtonLink } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useSiteSettings } from "../../lib/content";

const STEPS = [
  { n: 1, title: "กรอกแบบฟอร์มแจ้งเคลม", text: "เลือกแบรนด์ ประเภท และรุ่นสินค้า กรอก S/N ตัวที่เสีย แนบรูปหรือไฟล์ แล้วรับเลขเคลมทันที" },
  { n: 2, title: "ทีมงานดำเนินการ", text: "เจ้าหน้าที่รับเรื่องและอัปเดตสถานะ เมื่อเสร็จจะอัปโหลดใบเคลมสินค้าให้ดาวน์โหลดไปรับสินค้า" },
  { n: 3, title: "ส่งของเคลมกลับ", text: "ส่งตัวเก่าคืนและกรอก S/N ในระบบ ต้องตรงกับที่แจ้งไว้ ทีมงานตรวจรับครบแล้วปิดงาน" },
];

export default function ClaimsInfo() {
  const { session } = useAuth();
  const s = useSiteSettings();
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sun-500/15 text-sun-600"><WrenchIcon className="h-7 w-7" /></span>
          <h1 className="mt-5 text-3xl font-bold text-navy-900">แจ้งเคลมสินค้า</h1>
          <p className="mt-3 text-slate-600">แจ้งเคลมสินค้าทุกแบรนด์ของบริษัทออนไลน์ แล้วติดตามสถานะได้จากแดชบอร์ดของคุณ ไม่ต้องโทรถาม</p>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((x) => (
            <li key={x.n} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-800 font-bold text-white">{x.n}</span>
              <h2 className="mt-3 font-semibold text-navy-900">{x.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{x.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/app/claims/new" variant="sun">แจ้งเคลม</ButtonLink>
          <ButtonLink to="/app/claims" variant="secondary">ติดตามสถานะเคลม</ButtonLink>
          {s.company.line_oa_url && <ButtonLink to={s.company.line_oa_url} variant="ghost">คุยกับฝ่ายบริการทาง LINE</ButtonLink>}
        </div>
        {!session && <p className="mt-4 text-center text-sm text-slate-500">ต้องเข้าสู่ระบบก่อนแจ้งเคลม ยังไม่มีบัญชี? สมัครสมาชิกได้ฟรีด้วยอีเมล</p>}
      </div>
    </div>
  );
}
