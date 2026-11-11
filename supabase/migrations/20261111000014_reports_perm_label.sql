-- One App SSC · the "reports" permission now opens รายงานและส่งออก (/app/admin/reports).
-- Each report also needs that page's own permission (e.g. งานเคลม needs claims.view), and rows follow RLS.
update public.permission_keys
   set label = 'รายงานและส่งออกข้อมูล',
       description = 'เปิดหน้า รายงานและส่งออก เห็นเฉพาะรายงานของหน้าที่มีสิทธิ์อยู่แล้ว'
 where key = 'reports';
