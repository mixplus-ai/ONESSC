/** Demo build: set VITE_DEMO_MODE=1 on a separate Netlify site that points at a separate demo Supabase project. */
export const DEMO = import.meta.env.VITE_DEMO_MODE === "1";
export const DEMO_PASSWORD = "Demo1234";

export interface DemoAccount { login: string; name: string; role: string; shows: string }
export const DEMO_ACCOUNTS: { group: string; items: DemoAccount[] }[] = [
  { group: "ผู้ดูแลระบบ", items: [
    { login: "admin", name: "คุณอรวรรณ", role: "Admin", shows: "เห็นทุกเมนู ตั้งค่า สิทธิ์ผู้ใช้ อนุมัติใบยอดยกมา" },
  ] },
  { group: "พนักงาน (Staff)", items: [
    { login: "sales", name: "คุณธนพล", role: "ฝ่ายขาย", shows: "ใบเสนอราคา การจอง ราคาเฉพาะบริษัท แต้มบริษัท รายงาน" },
    { login: "service", name: "คุณวิศรุต", role: "ฝ่ายบริการ", shows: "คิวเคลม ผัง 5 ขั้น RMA ค่าส่ง คำขอแก้ SN" },
    { login: "service2", name: "คุณกมลชนก", role: "ดูแลเคลม", shows: "รับเรื่องและเปลี่ยนสถานะเคลม (สิทธิ์จำกัด)" },
    { login: "stock", name: "คุณสมศักดิ์", role: "เจ้าหน้าที่คลัง", shows: "สร้างร่างเอกสารคลัง ตรวจนับ ตารางส่งของ" },
    { login: "approver", name: "คุณนภาพร", role: "หัวหน้าคลัง", shows: "อนุมัติ/ยืนยันตัดสต๊อก ผู้ตรวจเอกสาร" },
    { login: "training", name: "คุณปิยะนุช", role: "ฝ่ายอบรม", shows: "รอบอบรม เช็กชื่อ ใบประกาศ คูปอง เนื้อหาเว็บ" },
  ] },
  { group: "ลูกค้า", items: [
    { login: "somchai", name: "สมชาย ใจดี", role: "สมาร์ท โซลาร์ฯ", shows: "เคลมปิดแล้ว ใบเสนอราคา แต้มบริษัท ใบประกาศ" },
    { login: "suda", name: "สุดา ทองดี", role: "บ้านแดด", shows: "เคลมรอส่งของคืน การจองสินค้า" },
    { login: "jirapat", name: "จิรภัทร รุ่งเรือง", role: "ไทยเอนเนอร์ยี่ฯ", shows: "เคลมแบตเตอรี่ แนบสลิปค่าส่ง อบรมแบบมีค่าใช้จ่าย" },
    { login: "wanida", name: "วนิดา ศรีสุข", role: "สมาร์ท โซลาร์ฯ", shows: "คำขอแก้ SN อบรมวันนี้ (เช็กอินได้)" },
    { login: "chaiwat", name: "ชัยวัฒน์ เพิ่มพูน", role: "รออนุมัติบริษัท", shows: "บัญชีที่ยังไม่ได้ผูกบริษัท" },
    { login: "mali", name: "มาลี ดวงดี", role: "ลูกค้าทั่วไป", shows: "ไม่มีบริษัท ยังไม่ทำแบบประเมินอบรม" },
  ] },
];
export const demoEmail = (login: string) => `${login}@ssc-demo.test`;
