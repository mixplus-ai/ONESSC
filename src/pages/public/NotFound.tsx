import { ButtonLink } from "../../components/ui";

export default function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <p className="text-6xl font-bold text-navy-200">404</p>
      <h1 className="mt-4 text-xl font-semibold text-navy-900">ไม่พบหน้าที่คุณค้นหา</h1>
      <ButtonLink to="/" className="mt-6">กลับหน้าแรก</ButtonLink>
    </div>
  );
}
