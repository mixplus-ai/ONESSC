import { useSiteSettings } from "../../lib/content";

export default function Privacy() {
  const { company } = useSiteSettings();
  return (
    <div className="container-x py-16">
      <article className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white p-6 text-slate-700 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <h1 className="text-2xl font-bold text-navy-900">นโยบายความเป็นส่วนตัว</h1>
        <p>{company.name_th} ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>
        <h2 className="text-lg font-semibold text-navy-900">ข้อมูลที่เราเก็บ</h2>
        <p>ชื่อ อีเมล เบอร์โทร LINE ID ตำแหน่ง ชื่อบริษัทและเลขประจำตัวผู้เสียภาษีที่คุณกรอก รวมถึงประวัติการใช้งาน เช่น การจอง การอบรม แต้มสะสม และการเคลม</p>
        <h2 className="text-lg font-semibold text-navy-900">วัตถุประสงค์</h2>
        <p>เพื่อให้บริการตามบัญชีของคุณ ติดต่อกลับ ออกใบเสนอราคา ใบเสร็จ ใบประกาศ บริหารแต้มสะสม และดูแลงานเคลม</p>
        <h2 className="text-lg font-semibold text-navy-900">การเปิดเผยข้อมูล</h2>
        <p>เราไม่ขายข้อมูลของคุณ ข้อมูลเปิดให้เฉพาะพนักงานที่ได้รับสิทธิ์ และผู้ใช้ในบริษัทเดียวกันเห็นเฉพาะข้อมูลระดับบริษัท</p>
        <h2 className="text-lg font-semibold text-navy-900">สิทธิ์ของคุณ</h2>
        <p>คุณขอเข้าถึง แก้ไข หรือลบข้อมูล และถอนความยินยอมได้ โดยติดต่อ {company.email || "ฝ่ายบริการลูกค้า"}</p>
      </article>
    </div>
  );
}
