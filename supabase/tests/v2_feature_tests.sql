-- =====================================================================
-- Mentora — tests for the version 2 features (run AFTER 005a–005c)
-- HOW: Supabase → SQL Editor → paste this whole file → Run.
-- Everything is ROLLED BACK at the end. Success = one row "ALL V2 TESTS PASSED".
-- =====================================================================
begin;
create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a002', 'v2.admin@mentora.test'),
  ('00000000-0000-0000-0000-00000000d001', 'v2.teacher@mentora.test'),
  ('00000000-0000-0000-0000-00000000d002', 'v2.teacher2@mentora.test');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a002';

with x as (insert into public.students (full_name, email, guardian_consent, phone) values ('V2 Student', 'v2.s1@mentora.test', true, '94771234567') returning id) insert into t_ids select 's1', id from x;
with x as (insert into public.students (full_name, email, guardian_consent) values ('V2 Other', 'v2.s2@mentora.test', true) returning id) insert into t_ids select 's2', id from x;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'v2.s1@mentora.test'), ('00000000-0000-0000-0000-0000000000e2', 'v2.s2@mentora.test');

insert into t_ids select 'subj', id from public.subjects where code = 'M';
with x as (insert into public.teachers (full_name, status, is_public, bank_account_number) values ('V2 Teacher', 'active', true, 'BANK-SECRET-1') returning id) insert into t_ids select 't1', id from x;
with x as (insert into public.teachers (full_name, status, is_public) values ('V2 Teacher Two', 'active', true) returning id) insert into t_ids select 't2', id from x;
with x as (insert into public.classes (subject_id, title_en, grade, medium, class_mode, rate_per_session, is_public)
  values ((select v from t_ids where k = 'subj'), 'V2 Maths', '10', 'english', 'physical', 1000, true) returning id) insert into t_ids select 'c1', id from x;
with x as (insert into public.classes (subject_id, title_en, grade, medium, class_mode, rate_per_session, is_public)
  values ((select v from t_ids where k = 'subj'), 'V2 Other Class', '11', 'english', 'physical', 1000, true) returning id) insert into t_ids select 'c2', id from x;
insert into public.class_teachers (class_id, teacher_id, allocation_percent, is_primary) values
  ((select v from t_ids where k = 'c1'), (select v from t_ids where k = 't1'), 100, true),
  ((select v from t_ids where k = 'c2'), (select v from t_ids where k = 't2'), 100, true);
-- timetable: class 1 runs every day of the week EXCEPT the weekday of (today - 3)
insert into public.timetable_slots (class_id, weekday, start_time, end_time)
  select (select v from t_ids where k = 'c1'), d, '23:58', '23:59' from generate_series(1, 7) d
  where d <> extract(isodow from current_date - 3);

set local role authenticated;
-- ---------- admin links teacher logins ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002"}';
select public.link_teacher_login('v2.teacher@mentora.test', (select v from t_ids where k = 't1'));
select public.link_teacher_login('v2.teacher2@mentora.test', (select v from t_ids where k = 't2'));
insert into t_ids select 'e1', (public.create_enrollment((select v from t_ids where k = 's1'), (select v from t_ids where k = 'c1'), false)).id;
insert into t_ids select 'e2', (public.create_enrollment((select v from t_ids where k = 's2'), (select v from t_ids where k = 'c2'), true)).id;
select public.approve_enrollment((select v from t_ids where k = 'e1'), current_date - 30, true, 'test override');

-- off-timetable date needs a reason
do $t$ begin
  begin
    perform public.start_session((select v from t_ids where k = 'c1'), current_date - 3, null, null);
    raise exception 'TEST FAILED: off-timetable session without reason';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
end $t$;
insert into t_ids select 'ses1', (public.start_session((select v from t_ids where k = 'c1'), current_date - 3, 'Extra', 'Exam revision')).id;
insert into t_ids select 'ses2', (public.start_session((select v from t_ids where k = 'c1'), current_date - 2)).id;
do $t$ begin
  assert (select off_schedule_reason from public.class_sessions where id = (select v from t_ids where k = 'ses1')) = 'Exam revision', 'TEST FAILED: off-schedule reason not saved';
end $t$;

-- ---------- teacher: own classes only, no private data ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d001"}';
do $t$ begin
  assert public.is_teacher(), 'TEST FAILED: teacher role';
  assert (select count(*) from public.teachers) = 1, 'TEST FAILED: teacher sees other teachers';
  assert (select count(*) from public.students) = 0, 'TEST FAILED: teacher can read the students table directly';
  assert (select count(*) from public.payments) = 0, 'TEST FAILED: teacher sees payments';
  assert (select count(*) from public.enrollments where class_id = (select v from t_ids where k = 'c2')) = 0, 'TEST FAILED: teacher sees another teacher''s roster';
  assert jsonb_array_length(public.teacher_roster((select v from t_ids where k = 'c1'))) = 1, 'TEST FAILED: roster';
  assert (public.teacher_roster((select v from t_ids where k = 'c1'))->0->>'phone') is null, 'TEST FAILED: phone shown without permission';
  begin perform public.teacher_roster((select v from t_ids where k = 'c2')); raise exception 'TEST FAILED: other roster';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  -- attendance marking is OFF for teachers by default
  begin perform public.mark_attendance((select v from t_ids where k = 'ses2'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'present')));
    raise exception 'TEST FAILED: teacher marked attendance without permission';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  -- a teacher cannot edit permissions
  update public.app_settings set value = jsonb_set(value, '{teacher,attendance_mark}', 'true') where key = 'permissions';
  assert not public.has_perm('attendance_mark'), 'TEST FAILED: teacher changed own permissions';
end $t$;
-- teacher submits a recording → pending, link must be allowed
do $t$ begin
  begin perform public.submit_recording(jsonb_build_object('class_id', (select v from t_ids where k = 'c1'), 'title_en', 'Bad', 'drive_url', 'https://evil.example.com/x'));
    raise exception 'TEST FAILED: unknown link host accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
end $t$;
insert into t_ids select 'r1', (public.submit_recording(jsonb_build_object('class_id', (select v from t_ids where k = 'c1'), 'title_en', 'Lesson 1', 'drive_url', 'https://drive.google.com/file/d/abc'))).id;
select public.request_timetable_change('update', (select v from t_ids where k = 'c1'),
  (select id from public.timetable_slots where class_id = (select v from t_ids where k = 'c1') limit 1),
  '{"weekday":3,"start_time":"16:00","end_time":"18:00"}', 'School exam week');

-- ---------- student: recording hidden until approved; poll; corrections ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
do $t$ begin
  assert (select count(*) from public.recordings where id = (select v from t_ids where k = 'r1')) = 0, 'TEST FAILED: pending recording visible to student';
end $t$;
select public.answer_class_poll((select v from t_ids where k = 'c1'), true);
do $t$ begin
  assert jsonb_array_length(public.get_my_polls()) = 1, 'TEST FAILED: poll should be open';
  assert (public.get_my_polls()->0->>'my_answer')::boolean, 'TEST FAILED: poll answer not saved';
  begin perform public.answer_class_poll((select v from t_ids where k = 'c2'), true); raise exception 'TEST FAILED: poll for other class';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  -- name change is direct, phone change needs approval
  perform public.update_my_profile('V2 Student Renamed', null);
  assert (select full_name from public.students) = 'V2 Student Renamed', 'TEST FAILED: name change';
  perform public.request_profile_change('{"phone":"94770000999"}');
  assert (select phone from public.students) = '94771234567', 'TEST FAILED: phone changed without approval';
  begin update public.students set phone = '94770000111'; exception when others then null; end;
  assert (select phone from public.students) = '94771234567', 'TEST FAILED: student updated own phone directly';
end $t$;

-- staff marks attendance; student asks for a correction
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002"}';
select public.mark_attendance((select v from t_ids where k = 'ses2'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'absent')));
do $t$ begin
  assert (public.get_poll_counts()->0->>'yes')::int = 1, 'TEST FAILED: poll count for admin';
end $t$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
insert into t_ids select 'd1', (public.request_attendance_correction((select id from public.attendance where session_id = (select v from t_ids where k = 'ses2')), 'present', 'I was in the class, front row')).id;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002"}';
select public.resolve_attendance_correction((select v from t_ids where k = 'd1'), true, 'Checked with teacher');
select public.review_profile_change((select id from public.profile_change_requests where student_id = (select v from t_ids where k = 's1')), true);
select public.review_content('recordings', (select v from t_ids where k = 'r1'), 'approve');
select public.review_timetable_change((select id from public.timetable_change_requests limit 1), true);
do $t$ begin
  assert (select status from public.attendance where session_id = (select v from t_ids where k = 'ses2')) = 'present', 'TEST FAILED: correction not applied';
  assert (select count(*) from public.fee_ledger where session_id = (select v from t_ids where k = 'ses2') and reversed_at is null) = 1, 'TEST FAILED: correction should create the charge';
  assert (select phone from public.students where id = (select v from t_ids where k = 's1')) = '94770000999', 'TEST FAILED: approved phone change';
  assert exists (select 1 from public.timetable_slots where class_id = (select v from t_ids where k = 'c1') and weekday = 3 and start_time = '16:00'), 'TEST FAILED: timetable change';
end $t$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
do $t$ begin
  assert (select count(*) from public.recordings where id = (select v from t_ids where k = 'r1')) = 1, 'TEST FAILED: approved recording hidden';
end $t$;

-- ---------- other student sees nothing of student 1 ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
do $t$ begin
  assert (select count(*) from public.recordings) = 0, 'TEST FAILED: trial student sees approved-only recordings';
  assert (select count(*) from public.attendance_disputes) = 0, 'TEST FAILED: sees other disputes';
  assert (select count(*) from public.profile_change_requests) = 0, 'TEST FAILED: sees other profile requests';
  assert (select count(*) from public.class_poll_responses) = 0, 'TEST FAILED: sees other poll answers';
  begin perform public.get_poll_counts(); raise exception 'TEST FAILED: student read poll counts';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
end $t$;

-- ---------- settlements / reconciliations: delete only via audited admin function ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002"}';
insert into t_ids select 'st1', (public.generate_settlement((select v from t_ids where k = 't1'), current_date)).id;
insert into t_ids select 'cr1', (public.save_cash_reconciliation(current_date, null, 0, 'test')).id;
do $t$ begin
  begin delete from public.teacher_settlements where id = (select v from t_ids where k = 'st1'); exception when others then null; end;
  assert (select count(*) from public.teacher_settlements where id = (select v from t_ids where k = 'st1')) = 1, 'TEST FAILED: direct settlement delete';
  perform public.delete_settlement((select v from t_ids where k = 'st1'), 'Created by mistake');
  assert (select count(*) from public.teacher_settlements where id = (select v from t_ids where k = 'st1')) = 0, 'TEST FAILED: delete_settlement';
  perform public.delete_cash_reconciliation((select v from t_ids where k = 'cr1'), 'Duplicate');
  assert (select count(*) from public.cash_reconciliations where id = (select v from t_ids where k = 'cr1')) = 0, 'TEST FAILED: delete_cash_reconciliation';
  assert (select count(*) from public.audit_log where action in ('delete_settlement','delete_cash_reconciliation')) = 2, 'TEST FAILED: delete not audited';
  -- payments still can never be deleted
  begin delete from public.payments; exception when others then null; end;
  perform public.set_enrollment_status((select v from t_ids where k = 'e1'), 'completed', 'Course finished');
  assert (select status from public.enrollments where id = (select v from t_ids where k = 'e1')) = 'completed', 'TEST FAILED: completed status';
  perform public.remove_teacher((select v from t_ids where k = 't2'), 'Left the centre');
end $t$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d002"}';
do $t$ begin
  assert not public.is_teacher(), 'TEST FAILED: removed teacher can still sign in as teacher';
  assert (select count(*) from public.classes where id = (select v from t_ids where k = 'c2') and not is_public) = 0, 'TEST FAILED';
end $t$;

-- ---------- public visitor ----------
set local role anon;
set local request.jwt.claims = '{}';
select public.submit_review(jsonb_build_object('teacher_id', (select v from t_ids where k = 't1'), 'reviewer_name', 'Parent A', 'rating', 5, 'comment', 'Excellent teacher'));
select public.submit_feedback('{"needs":["past_papers"],"ideas":"More model papers"}');
do $t$ declare r jsonb; begin
  r := public.submit_complaint('{"name":"Visitor","phone":"94771112222","category":"facility","details":"The hall fan is broken"}');
  assert r->>'reference_no' ~ '^MC-\d{4}-\d{4}$', 'TEST FAILED: complaint reference ' || coalesce(r->>'reference_no', 'null');
  begin perform 1 from public.reviews limit 1; raise exception 'TEST FAILED: anon reads reviews';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.complaints limit 1; raise exception 'TEST FAILED: anon reads complaints';
  exception when insufficient_privilege then null; end;
  r := public.get_public_teacher((select v from t_ids where k = 't1'));
  assert r is not null, 'TEST FAILED: public teacher profile';
  assert jsonb_array_length(r->'reviews') = 0, 'TEST FAILED: unapproved review is public';
  assert r::text not like '%BANK-SECRET-1%', 'TEST FAILED: bank details public';
  assert (r->>'student_count')::int = 1, 'TEST FAILED: student count ' || (r->>'student_count');
  assert public.get_public_teacher((select v from t_ids where k = 't2')) is null, 'TEST FAILED: removed teacher still public';
end $t$;

reset role;
do $t$ begin raise notice 'ALL V2 TESTS PASSED'; end $t$;
rollback;
select 'ALL V2 TESTS PASSED' as result;
