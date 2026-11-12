-- Speed: RLS policies called is_staff_or_admin() / has_perm('x') / auth.uid() once PER ROW.
-- On claim_units (8,7k rows) one 1,000-row page took ~1.8 s; wrapped in (select ...) Postgres
-- evaluates them once per query (InitPlan) and the same page takes a few ms.
-- Only calls that do not depend on the row are wrapped, so who can see/write what does not change.
do $$
declare
  p record;
  q text;
  c text;
  sql text;
  wrap constant text := '(select public.\1())';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := p.qual;
    c := p.with_check;
    -- zero-argument helpers that only look at the current user
    q := regexp_replace(q, '(?<!SELECT )(?<![.\w])(?:public\.)?(is_admin|is_staff_or_admin|my_company_id|current_app_role)\(\)', wrap, 'g');
    c := regexp_replace(c, '(?<!SELECT )(?<![.\w])(?:public\.)?(is_admin|is_staff_or_admin|my_company_id|current_app_role)\(\)', wrap, 'g');
    -- has_perm with a constant key
    q := regexp_replace(q, '(?<!SELECT )(?<![.\w])(?:public\.)?has_perm\(((?:''[^'']*''::text))\)', '(select public.has_perm(\1))', 'g');
    c := regexp_replace(c, '(?<!SELECT )(?<![.\w])(?:public\.)?has_perm\(((?:''[^'']*''::text))\)', '(select public.has_perm(\1))', 'g');
    -- auth.uid() that is not already inside a select
    q := regexp_replace(q, '(?<!SELECT |select )auth\.uid\(\)', '(select auth.uid())', 'g');
    c := regexp_replace(c, '(?<!SELECT |select )auth\.uid\(\)', '(select auth.uid())', 'g');

    if q is distinct from p.qual or c is distinct from p.with_check then
      sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
      if q is not null then sql := sql || format(' using (%s)', q); end if;
      if c is not null then sql := sql || format(' with check (%s)', c); end if;
      execute sql;
    end if;
  end loop;
end $$;
