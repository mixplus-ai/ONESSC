-- One App SSC · Phase 3.2: training e-mails
--
-- confirm  = sent soon after a booking (course, date, place, what to pay)
-- reminder = sent N days before the session (default 5) to everyone still registered
-- The training-emails edge function runs every hour from pg_cron (supabase/cron/training_emails_schedule.sql),
-- asks training_emails_due() what to send, sends it, and records the result with record_training_email().
-- Nothing is sent until an Admin turns on email_enabled in อบรมและกิจกรรม → ตั้งค่า.

alter table public.training_settings
  add column email_enabled boolean not null default false,
  add column confirm_email boolean not null default true,
  add column reminder_days_before int not null default 5 check (reminder_days_before between 1 and 30),
  add column email_note text;   -- extra text at the bottom of every e-mail (e.g. what to bring, contact)

create table public.training_email_log (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references public.training_registrations (id) on delete cascade,
  kind             text not null check (kind in ('confirm', 'reminder')),
  to_email         text,
  status           text not null check (status in ('sent', 'failed')),
  attempts         int not null default 1,
  error            text,
  sent_at          timestamptz,
  updated_at       timestamptz not null default now(),
  unique (registration_id, kind)
);
alter table public.training_email_log enable row level security;
create policy training_email_log_select on public.training_email_log for select to authenticated
  using (public.is_staff_or_admin());

-- What the edge function should send now. Service role only.
create or replace function public.training_emails_due(p_limit int default 100)
returns table (
  registration_id uuid, kind text, reg_code text, to_email text, full_name text,
  course_code text, course_title text, session_title text, starts_on date, ends_on date,
  start_time time, end_time time, location text, map_url text,
  total numeric, pay_status text, coupon_code text, days_left int)
language sql stable security definer set search_path = ''
as $$
  with cfg as (select * from public.training_settings where id = 1),
  base as (
    select r.*, p.email, p.full_name as pname, s.title as stitle, s.starts_on as s_on, s.ends_on as s_end,
           s.start_time as s_st, s.end_time as s_et, s.location as sloc, s.map_url as smap,
           c.code as ccode, c.title as ctitle
      from public.training_registrations r
      join public.profiles p on p.id = r.user_id
      join public.course_sessions s on s.id = r.session_id
      join public.courses c on c.id = s.course_id
     where r.status = 'registered' and s.status <> 'cancelled' and not s.is_archived
       and s.starts_on >= public.bkk_today() and p.email is not null
  ),
  todo as (
    -- confirmation: bookings from the last 2 days (so turning e-mail on does not mail every old booking)
    select b.*, 'confirm'::text as k from base b, cfg
     where cfg.email_enabled and cfg.confirm_email and b.created_at >= now() - interval '2 days'
    union all
    -- reminder: N days before; skipped when the booking itself was made inside that window
    select b.*, 'reminder'::text from base b, cfg
     where cfg.email_enabled
       and b.s_on - public.bkk_today() between 1 and cfg.reminder_days_before
       and b.s_on - (b.created_at at time zone 'Asia/Bangkok')::date > cfg.reminder_days_before
  )
  select t.id, t.k, t.code, t.email, t.pname, t.ccode, t.ctitle, t.stitle, t.s_on, t.s_end, t.s_st, t.s_et,
         t.sloc, t.smap, t.total, t.pay_status, t.coupon_code, t.s_on - public.bkk_today()
    from todo t
    left join public.training_email_log l on l.registration_id = t.id and l.kind = t.k
   where l.id is null or (l.status = 'failed' and l.attempts < 3)
   order by t.s_on, t.k
   limit p_limit
$$;

create or replace function public.record_training_email(p_registration_id uuid, p_kind text, p_to text, p_error text default null)
returns void language sql security definer set search_path = ''
as $$
  insert into public.training_email_log (registration_id, kind, to_email, status, error, sent_at)
  values (p_registration_id, p_kind, p_to, case when p_error is null then 'sent' else 'failed' end, p_error,
          case when p_error is null then now() end)
  on conflict (registration_id, kind) do update
     set status = excluded.status, error = excluded.error, to_email = excluded.to_email,
         sent_at = coalesce(excluded.sent_at, public.training_email_log.sent_at),
         attempts = public.training_email_log.attempts + 1, updated_at = now()
$$;

revoke execute on function public.training_emails_due(int) from public, anon, authenticated;
revoke execute on function public.record_training_email(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.training_emails_due(int) to service_role;
grant execute on function public.record_training_email(uuid, text, text, text) to service_role;
