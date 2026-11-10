-- One App SSC · Phase 4 follow-up: a customer sees only the claims they submitted themselves
-- (owner's rule 2026-11-10: ลูกค้าเห็นเฉพาะเคลมที่ตัวเองแจ้ง · Admin / Staff เห็นทุกเคลม).
-- Before this, colleagues in the same approved company could also see each other's claims.

create or replace function public.can_see_claim(p_claim uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.claims c where c.id = p_claim and c.user_id = auth.uid())
$$;

create or replace function public.my_claims()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id, 'claim_no', c.claim_no, 'legacy_ref', c.legacy_ref, 'status', c.status,
      'product_type', c.product_type, 'model', c.model, 'brand', b.name, 'qty', c.qty,
      'company_name', c.company_name, 'contact_name', c.contact_name, 'contact_phone', c.contact_phone,
      'installer_name', c.installer_name, 'site_name', c.site_name, 'symptom', c.symptom,
      'details', c.details, 'reported_sns', c.reported_sns, 'returned_sns', c.returned_sns,
      'delivery_type', c.delivery_type, 'delivery_address', c.delivery_address,
      'case_id', c.case_id, 'customer_note', c.customer_note, 'claim_doc_path', c.claim_doc_path,
      'returned_at', c.returned_at, 'closed_at', c.closed_at, 'created_at', c.created_at, 'updated_at', c.updated_at,
      'mine', c.user_id = auth.uid(),
      'handler', (select coalesce(p.full_name, 'เจ้าหน้าที่') from public.profiles p where p.id = c.assigned_to),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'path', f.path, 'file_name', f.file_name, 'created_at', f.created_at) order by f.created_at), '[]'::jsonb)
                  from public.claim_files f where f.claim_id = c.id and f.kind in ('customer', 'claim_doc')),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                   from public.claim_events e where e.claim_id = c.id)
    ) as x
    from public.claims c
    left join public.brands b on b.id = c.brand_id
    where c.user_id = auth.uid()
  ) s
$$;
