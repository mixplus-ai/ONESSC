-- Migration 19: every row-independent helper in a public policy is wrapped in (select ...).
do $$
declare n int;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(?<!SELECT )(?<![.\w])(is_admin|is_staff_or_admin|my_company_id|has_perm)\(';
  if n > 0 then raise exception 'initplan: % policies still call a helper per row', n; end if;
  select count(*) into n from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(?<!SELECT |select )auth\.uid\(\)';
  if n > 0 then raise exception 'initplan: % policies call auth.uid() per row', n; end if;
end $$;
\echo 'ALL INITPLAN TESTS PASSED'
