-- One App SSC · profile photo + saved billing details (ข้อมูลออกใบเสร็จ / ใบกำกับภาษี)
-- billing = {"type":"company|person|person_no_vat","name":"","tax_id":"","branch":"","address":"","phone":"","email":""}
-- It pre-fills paid course bookings and is copied onto every quote request and reservation,
-- so staff can issue the quotation / booking document under the customer's letterhead.

alter table public.profiles
  add column avatar_url text,
  add column billing jsonb check (billing is null or jsonb_typeof(billing) = 'object');

alter table public.quote_requests add column billing jsonb;
alter table public.reservations add column billing jsonb;

-- snapshot the requester's billing details when a request is created (unless the caller sent one)
create or replace function public.requests_fill_billing()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.billing is null then
    new.billing := (select p.billing from public.profiles p where p.id = new.user_id);
  end if;
  return new;
end $$;
create trigger quote_requests_fill_billing before insert on public.quote_requests
  for each row execute function public.requests_fill_billing();
create trigger reservations_fill_billing before insert on public.reservations
  for each row execute function public.requests_fill_billing();
revoke execute on function public.requests_fill_billing() from public, anon, authenticated;

-- Storage: avatars (public read) · <user_id>/<file>; each user writes only their own folder
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
