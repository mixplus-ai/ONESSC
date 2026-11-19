-- Course detail page: rich content per course (topics/agenda, objectives, audience,
-- instructors, what you get, what to bring, FAQ, gallery). One jsonb column so the
-- admin form can grow without more migrations. Read by the existing courses_select
-- policy (anon + authenticated), written by courses_write (perm "courses").
alter table public.courses add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.courses drop constraint if exists courses_details_object;
alter table public.courses add constraint courses_details_object check (jsonb_typeof(details) = 'object');
comment on column public.courses.details is
  'Course page content: {objectives[], audience[], prerequisites[], topics[{title,detail,time}], instructors[{name,role,bio,photo_url}], includes[], bring[], faqs[{q,a}], gallery[]}';
