import { Link } from "react-router-dom";
import { Alert } from "../../../components/ui";
import { useRows } from "../../../lib/content";
import { supabase } from "../../../lib/supabase";

/**
 * Prices, promotions and packages are set per SKU (product_variants). A product without any SKU
 * cannot appear in those lists, so tell staff which products those are and where to add a code.
 */
export function NoSkuNotice({ what }: { what: string }) {
  const list = useRows<{ id: string; name: string; product_variants: { id: string }[] }>(() =>
    supabase.from("products").select("id, name, product_variants(id)").order("name"),
  );
  const missing = list.rows.filter((p) => !(p.product_variants ?? []).length);
  if (!missing.length) return null;
  return (
    <div className="mb-4">
      <Alert tone="amber">
        <p className="font-semibold">สินค้า {missing.length.toLocaleString("th-TH")} รายการยังไม่มีรหัสสินค้า (SKU) จึงยังไม่ขึ้นใน{what}</p>
        <p className="mt-1 text-sm">{missing.map((p) => p.name).join(" · ")}</p>
        <p className="mt-1 text-sm">
          ไปที่ <Link to="/app/admin/products?nosku=1" className="font-semibold underline">สินค้า</Link> → กด “แก้ไข” → “+ เพิ่มรหัสสินค้า” (ใช้รหัสตามไฟล์สต๊อก หรือกด “สร้างรหัสให้” ถ้ายังไม่มีในสต๊อก) แล้วบันทึก
        </p>
      </Alert>
    </div>
  );
}
