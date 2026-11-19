import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Alert } from "./ui";

/** Team member id when the signed-in Staff is a salesperson limited to their own customers (no customers.all), else null. */
export function useSalesScope() {
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    supabase.rpc("my_sales_scope").then(({ data }) => live && setScope((data as string | null) ?? null));
    return () => {
      live = false;
    };
  }, []);
  return scope;
}

/** Banner on the customer pages for a salesperson who sees only their own customers. */
export function SalesScopeNote({ pending }: { pending?: boolean }) {
  const scope = useSalesScope();
  if (!scope) return null;
  return (
    <div className="mb-4">
      <Alert tone="navy">
        แสดงเฉพาะลูกค้าของบริษัทที่คุณเป็นเซลล์ดูแล
        {pending ? " · ผู้ใช้ที่ขอผูกบริษัทใหม่ หัวหน้าเซลล์หรือ Admin จะเป็นผู้อนุมัติและกำหนดเซลล์ให้" : " · ลูกค้าบริษัทอื่นให้หัวหน้าเซลล์หรือ Admin กำหนดเซลล์ในหน้าลูกค้า"}
      </Alert>
    </div>
  );
}
