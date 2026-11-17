-- Training check-out: codes hidden, no check-out = no points, staff check-out/undo, course files bucket.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'staff@co.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'u1@co.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'u2@co.test', '{}');
update public.profiles set role = 'staff' where email = 'staff@co.test';
insert into public.staff_permissions (user_id, perm) values ('00000000-0000-0000-0000-0000000000b1', 'courses');
update public.training_settings set cert_requires_evaluation = false where id = 1;
grant select, insert on storage.objects to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
insert into public.courses (id, code, title, hours) values ('21000000-0000-0000-0000-000000000001', 'CO', 'Checkout course', 3);
insert into public.course_sessions (id, course_id, starts_on, start_time, ends_on, end_time, checkin_code, checkout_code, lat, lng)
values ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001',
        (now() at time zone 'Asia/Bangkok' - interval '3 hours')::date, (now() at time zone 'Asia/Bangkok' - interval '3 hours')::time,
        (now() at time zone 'Asia/Bangkok' + interval '10 minutes')::date, (now() at time zone 'Asia/Bangkok' + interval '10 minutes')::time,
        '121212', '343434', 13.7, 100.6);
insert into public.course_materials (id, course_id, kind, title, file_path, visibility)
values ('61000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'file', 'สไลด์', '21000000-0000-0000-0000-000000000001/a.pdf', 'attended');
insert into storage.objects (bucket_id, name) values ('training-materials', '21000000-0000-0000-0000-000000000001/a.pdf');
do $$ begin
  assert public.session_checkout_code('31000000-0000-0000-0000-000000000001') = '343434', 'staff reads check-out code';
end $$;
reset role;
insert into public.training_registrations (id, code, user_id, session_id) values
  ('71000000-0000-0000-0000-000000000001', 'TR-T-1', '00000000-0000-0000-0000-0000000000c1', '31000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000002', 'TR-T-2', '00000000-0000-0000-0000-0000000000c2', '31000000-0000-0000-0000-000000000001');
set local role authenticated;

-- user 1: cannot read codes; files locked before check-in
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$ begin
  begin
    perform checkout_code from public.course_sessions limit 1;
    assert false, 'checkout_code must be hidden';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.session_checkout_code('31000000-0000-0000-0000-000000000001');
    assert false, 'user cannot read check-out code';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from storage.objects where bucket_id = 'training-materials') = 0, 'file locked before check-in';
  begin
    perform public.check_out('31000000-0000-0000-0000-000000000001', '343434', 13.7, 100.6);
    assert false, 'check-out needs check-in';
  exception when raise_exception then null;
  end;
  begin
    perform public.check_in('31000000-0000-0000-0000-000000000001', '343434', 13.7, 100.6);
    assert false, 'check-out code does not check in';
  exception when raise_exception then null;
  end;
end $$;
do $$
declare v jsonb;
begin
  v := public.check_in('31000000-0000-0000-0000-000000000001', '121212', 13.7001, 100.6);
  assert (v ->> 'points')::numeric = 0, 'no points at check-in';
  assert (select count(*) from storage.objects where bucket_id = 'training-materials') = 1, 'file unlocked after check-in';
  begin
    perform public.check_out('31000000-0000-0000-0000-000000000001', '121212', 13.7, 100.6);
    assert false, 'wrong check-out code';
  exception when raise_exception then null;
  end;
  begin
    perform public.check_out('31000000-0000-0000-0000-000000000001', '343434', 13.702, 100.6);
    assert false, 'check-out > 100 m';
  exception when raise_exception then null;
  end;
  -- no evaluation required: check-out → certificate → points straight away
  v := public.check_out('31000000-0000-0000-0000-000000000001', '343434', 13.7005, 100.6, 'qr');
  assert v ->> 'cert_no' is not null and (v ->> 'points')::numeric = 3, 'cert + 3 points after check-out: ' || v::text;
  assert public.point_balance('personal', auth.uid()) = 3, 'balance 3';
  -- user cannot write check-out columns directly
  update public.training_registrations set checked_out_at = null where id = '71000000-0000-0000-0000-000000000001';
  assert (select checked_out_at from public.training_registrations where id = '71000000-0000-0000-0000-000000000001') is not null, 'not writable';
end $$;

-- user 2 checks in but never checks out → no certificate, no points
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  perform public.check_in('31000000-0000-0000-0000-000000000001', '121212', 13.7, 100.6);
  begin
    perform public.submit_evaluation('71000000-0000-0000-0000-000000000002', '{"q":5}'::jsonb);
    assert false, 'no evaluation before check-out';
  exception when raise_exception then null;
  end;
  assert public.point_balance('personal', auth.uid()) = 0, 'no check-out = no points';
end $$;

-- staff: certificate needs check-out; check out on their behalf; undo takes points back
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
declare r public.training_registrations;
begin
  begin
    perform public.issue_certificate('71000000-0000-0000-0000-000000000002');
    assert false, 'staff cannot issue before check-out';
  exception when raise_exception then null;
  end;
  r := public.staff_check_out('71000000-0000-0000-0000-000000000002');
  assert r.check_out_method = 'staff' and r.cert_no is not null and r.points_awarded = 3, 'staff check-out → cert + points';
  r := public.staff_check_out('71000000-0000-0000-0000-000000000002', true, 'สแกนผิดคน');
  assert r.checked_out_at is null and r.points_awarded is null, 'undo check-out';
  assert public.point_balance('personal', '00000000-0000-0000-0000-0000000000c2') = 0, 'points taken back';
end $$;

-- someone not booked cannot see the file
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', true);
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'training-materials') = 0, 'outsider sees no file';
end $$;
reset role;
rollback;
\echo ALL TRAINING CHECKOUT TESTS PASSED
