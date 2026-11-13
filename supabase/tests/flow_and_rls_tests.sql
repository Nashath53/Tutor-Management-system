-- =====================================================================
-- Mentora — automated database tests (business rules + student isolation)
-- HOW TO RUN: Supabase → SQL Editor → paste this whole file → Run.
-- Everything runs inside ONE transaction and is ROLLED BACK at the end,
-- so no test data is left behind. A broken rule stops the script with
-- "TEST FAILED: ...". If everything is fine the Results tab shows one row: ALL TESTS PASSED.
-- =====================================================================
begin;

-- ---------- fixtures (created as the database owner) ----------
create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'test.admin@mentora.test'),
  ('00000000-0000-0000-0000-00000000c001', 'test.cashier@mentora.test');
update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'cashier' where id = '00000000-0000-0000-0000-00000000c001';

with x as (insert into public.students (full_name, email, guardian_consent) values ('Test Student One', 'test.s1@mentora.test', true) returning id) insert into t_ids select 's1', id from x;
with x as (insert into public.students (full_name, email, guardian_consent) values ('Test Student Two', 'test.s2@mentora.test', true) returning id) insert into t_ids select 's2', id from x;
-- logins created AFTER the student rows → linked automatically by email (handle_new_user)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'test.s1@mentora.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'test.s2@mentora.test');

insert into t_ids select 'subj', id from public.subjects where code = 'M';
with x as (insert into public.teachers (full_name, status, is_public, phone, bank_account_number)
  values ('Test Teacher', 'active', true, '94770000001', 'SECRET-ACC-999') returning id) insert into t_ids select 't1', id from x;
with x as (insert into public.classes (subject_id, title_en, grade, medium, class_mode, rate_per_session, trial_enabled, is_public)
  values ((select v from t_ids where k = 'subj'), 'Test Grade 10 Maths', '10', 'english', 'physical', 1000, true, true) returning id) insert into t_ids select 'c1', id from x;
insert into public.class_teachers (class_id, teacher_id, allocation_percent, is_primary)
  values ((select v from t_ids where k = 'c1'), (select v from t_ids where k = 't1'), 100, true);

do $t$ begin
  assert (select student_id from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = (select v from t_ids where k = 's1'),
    'TEST FAILED: student login was not linked by email';
  assert (select student_code from public.students where id = (select v from t_ids where k = 's1')) ~ '^MA-\d{4}$', 'TEST FAILED: student code format MA-0001';
end $t$;

-- =====================================================================
-- 1) ADMIN FLOW: free trial → paid admission → approval → billing
-- =====================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001"}';

insert into t_ids select 'e1', (public.create_enrollment((select v from t_ids where k = 's1'), (select v from t_ids where k = 'c1'), true)).id;
do $t$ begin
  assert (select enrollment_code from public.enrollments where id = (select v from t_ids where k = 'e1')) ~ '^MMPE-\d{3}$', 'TEST FAILED: enrolment code should look like MMPE-001';
end $t$;

-- two trial sessions
insert into t_ids select 'ses1', (public.upsert_session((select v from t_ids where k = 'c1'), current_date - 20)).id;
insert into t_ids select 'ses2', (public.upsert_session((select v from t_ids where k = 'c1'), current_date - 13)).id;
select public.mark_attendance((select v from t_ids where k = 'ses1'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'present')));
select public.mark_attendance((select v from t_ids where k = 'ses2'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'present')));
do $t$ begin
  assert (select count(*) from public.fee_ledger where enrollment_id = (select v from t_ids where k = 'e1')) = 0, 'TEST FAILED: trial sessions must never create charges';
  assert (select status from public.attendance where session_id = (select v from t_ids where k = 'ses1')) = 'trial', 'TEST FAILED: trial attendance should be marked trial';
  assert (select status from public.enrollments where id = (select v from t_ids where k = 'e1')) = 'trial_completed', 'TEST FAILED: 2 trial sessions should complete the trial';
end $t$;

-- paid admission: admission fee LKR 250 charged ONCE
select public.request_paid_admission((select v from t_ids where k = 'e1'));
do $t$ begin
  assert (select count(*) from public.fee_ledger where enrollment_id = (select v from t_ids where k = 'e1') and entry_type = 'admission_fee') = 1, 'TEST FAILED: admission fee should be charged once';
  assert (select amount from public.fee_ledger where enrollment_id = (select v from t_ids where k = 'e1') and entry_type = 'admission_fee') = 250, 'TEST FAILED: admission fee should be 250';
end $t$;

-- approval must FAIL while nothing is paid
do $t$ begin
  begin
    perform public.approve_enrollment((select v from t_ids where k = 'e1'));
    raise exception 'TEST FAILED: approval without payment should be blocked';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $t$;

-- =====================================================================
-- 2) STUDENT FLOW: bank transfer + "receipt sent" does NOT grant access
-- =====================================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1"}';
insert into t_ids select 'p1', (public.create_bank_payment(250)).id;
select public.mark_receipt_sent((select v from t_ids where k = 'p1'));
do $t$ begin
  assert (select status from public.payments where id = (select v from t_ids where k = 'p1')) = 'receipt_sent', 'TEST FAILED: receipt_sent status';
  assert (select count(*) from public.receipts where payment_id = (select v from t_ids where k = 'p1')) = 0, 'TEST FAILED: no receipt before verification';
  assert ((public.enrollment_payment_status((select v from t_ids where k = 'e1')))->>'paid')::numeric = 0, 'TEST FAILED: unverified payment must not count';
end $t$;
-- a student must not be able to verify their own payment
do $t$ begin
  begin
    perform public.verify_payment((select v from t_ids where k = 'p1'), true, 250, 'FAKE');
    raise exception 'TEST FAILED: student verified own payment';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $t$;

-- admin verifies → receipt issued → approve works
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001"}';
select public.verify_payment((select v from t_ids where k = 'p1'), true, 250, 'BANK-TX-1');
select public.approve_enrollment((select v from t_ids where k = 'e1'), current_date - 7);
do $t$ begin
  assert (select count(*) from public.receipts where payment_id = (select v from t_ids where k = 'p1')) = 1, 'TEST FAILED: receipt after verification';
  assert (select status from public.enrollments where id = (select v from t_ids where k = 'e1')) = 'approved', 'TEST FAILED: approval';
end $t$;

-- first paid session: charged once, no duplicates, reversal on absent
insert into t_ids select 'ses3', (public.upsert_session((select v from t_ids where k = 'c1'), current_date - 6)).id;
select public.mark_attendance((select v from t_ids where k = 'ses3'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'present')));
select public.mark_attendance((select v from t_ids where k = 'ses3'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'late')));
do $t$ begin
  assert (select count(*) from public.fee_ledger where session_id = (select v from t_ids where k = 'ses3') and entry_type = 'session_charge') = 1, 'TEST FAILED: duplicate session charge';
end $t$;
select public.mark_attendance((select v from t_ids where k = 'ses3'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'absent')));
do $t$ begin
  assert (select coalesce(sum(amount), 0) from public.fee_ledger where session_id = (select v from t_ids where k = 'ses3')) = 0, 'TEST FAILED: absent should reverse the charge';
end $t$;
select public.mark_attendance((select v from t_ids where k = 'ses3'), jsonb_build_array(jsonb_build_object('enrollment_id', (select v from t_ids where k = 'e1'), 'status', 'present')));

-- cash payment (offline-safe: same client_uuid twice = one payment)
select public.record_cash_payment((select v from t_ids where k = 's1'), 1000, current_date, 'cash', null, null, '11111111-1111-1111-1111-111111111111');
select public.record_cash_payment((select v from t_ids where k = 's1'), 1000, current_date, 'cash', null, null, '11111111-1111-1111-1111-111111111111');
do $t$ begin
  assert (select count(*) from public.payments where client_uuid = '11111111-1111-1111-1111-111111111111') = 1, 'TEST FAILED: duplicate offline cash payment';
end $t$;

-- money tables can never be deleted (audited reversals only)
do $t$ begin
  begin
    delete from public.payments where id = (select v from t_ids where k = 'p1');
    if found then raise exception 'TEST FAILED: payment was deleted'; end if;
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  assert (select count(*) from public.payments where id = (select v from t_ids where k = 'p1')) = 1, 'TEST FAILED: payment row missing';
end $t$;

-- settlement: first eligible month & first 20 students → 0% commission; admission fee excluded
insert into t_ids select 'st1', (public.generate_settlement((select v from t_ids where k = 't1'), current_date)).id;
do $t$ declare s public.teacher_settlements; begin
  select * into s from public.teacher_settlements where id = (select v from t_ids where k = 'st1');
  assert s.gross_revenue = 1000, 'TEST FAILED: settlement revenue should be 1000 (admission fee excluded), got ' || s.gross_revenue;
  assert s.commission_amount = 0, 'TEST FAILED: intro month commission should be 0';
end $t$;
-- calling it twice in one transaction must work (draft recalculation)
select public.generate_settlement((select v from t_ids where k = 't1'), current_date);

-- =====================================================================
-- 3) STUDENT ISOLATION (RLS)
-- =====================================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2"}';   -- Student Two
do $t$ begin
  assert (select count(*) from public.students) = 1, 'TEST FAILED: student two can see other students';
  assert (select count(*) from public.payments) = 0, 'TEST FAILED: student two can see student one''s payments';
  assert (select count(*) from public.fee_ledger) = 0, 'TEST FAILED: student two can see student one''s ledger';
  assert (select count(*) from public.enrollments) = 0, 'TEST FAILED: student two can see other enrolments';
  assert (select count(*) from public.receipts) = 0, 'TEST FAILED: student two can see other receipts';
  assert (select count(*) from public.teacher_settlements) = 0, 'TEST FAILED: student can see settlements';
  assert (select count(*) from public.audit_log) = 0, 'TEST FAILED: student can see audit log';
  begin
    perform public.get_student_statement((select v from t_ids where k = 's1'), current_date);
    raise exception 'TEST FAILED: student two read student one''s statement';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $t$;
-- a student cannot promote themselves to admin
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b2';
do $t$ begin
  assert not public.is_admin(), 'TEST FAILED: student promoted themselves to admin';
end $t$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1"}';   -- Student One
do $t$ begin
  assert (select count(*) from public.students) = 1, 'TEST FAILED: student one should see exactly their own record';
  assert (select count(*) from public.payments) = 2, 'TEST FAILED: student one should see their 2 payments';
  assert (select count(*) from public.fee_ledger) > 0, 'TEST FAILED: student one should see their ledger';
end $t$;

-- cashier: can record cash, cannot verify bank transfers or approve
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001"}';
do $t$ begin
  begin
    perform public.approve_enrollment((select v from t_ids where k = 'e1'));
    raise exception 'TEST FAILED: cashier approved an enrolment';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $t$;

-- anonymous website visitor
set local role anon;
set local request.jwt.claims = '{}';
do $t$ begin
  begin perform 1 from public.students limit 1; raise exception 'TEST FAILED: anon can read students';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.teachers limit 1; raise exception 'TEST FAILED: anon can read private teacher table';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.payments limit 1; raise exception 'TEST FAILED: anon can read payments';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.get_public_teachers()) >= 1, 'TEST FAILED: public teacher list empty';
  assert not (select bool_or(t::text like '%SECRET-ACC-999%') from public.get_public_teachers() t), 'TEST FAILED: private teacher bank details are public';
  assert (select count(*) from public.app_settings where key in ('billing', 'commission', 'tax')) = 0, 'TEST FAILED: anon can read private settings';
end $t$;
select (public.submit_student_enquiry('{"student_name":"Web Visitor","phone":"94771112233","consent":true}'::jsonb))->>'id' is not null as enquiry_saved;

reset role;
do $t$ begin raise notice 'ALL TESTS PASSED'; end $t$;
rollback;
-- Supabase's SQL Editor doesn't show NOTICE messages, so this row is the visible "pass" signal.
-- It only appears if every test above succeeded (any failure stops the script earlier).
select 'ALL TESTS PASSED' as result;
