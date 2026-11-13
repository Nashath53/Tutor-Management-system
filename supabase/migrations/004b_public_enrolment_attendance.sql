-- =====================================================================
-- Mentora — 004 FUNCTIONS, PART 2 of 4 — website forms, teachers, enquiries, enrolments, attendance
-- Run the four 004 files in order: 004a → 004b → 004c → 004d.
-- HOW: open a NEW query tab in Supabase SQL Editor (it must be empty),
--      paste THIS WHOLE FILE, make sure nothing is highlighted, click Run.
-- Safe to run again: every function uses "create or replace".
-- Function bodies use NAMED dollar quotes (dollar-fn-dollar) so a copy/paste
-- slip can't silently run two functions together.
-- =====================================================================
-- =====================================================================
-- PUBLIC (website visitors, no login)
-- =====================================================================
create or replace function public.submit_student_enquiry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_phone text := p->>'phone'; v_subject public.subjects;
begin
  if length(trim(coalesce(p->>'student_name', ''))) < 2 then raise exception 'Student name is required.'; end if;
  if v_phone !~ '^94\d{9}$' then raise exception 'A valid Sri Lankan mobile number is required.'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'Guardian/student consent is required.'; end if;
  if length(coalesce(p->>'requirements', '')) > 1000 or length(coalesce(p->>'referral_note', '')) > 200 then raise exception 'Text is too long.'; end if;
  perform public._rate_limit('enquiry', v_phone, 5, 60);
  if public._nz(p->>'subject_id') is not null then select * into v_subject from public.subjects where id = (p->>'subject_id')::uuid; end if;
  insert into public.student_enquiries (student_name, guardian_name, phone, whatsapp, email, subject_id, subject_name, class_id, grade, medium, class_mode,
    class_type, preferred_join_date, requirements, referral_sources, referral_note, consent, language, status)
  values (trim(p->>'student_name'), public._nz(p->>'guardian_name'), v_phone, public._nz(p->>'whatsapp'), public._nz(p->>'email'),
    v_subject.id, coalesce(v_subject.name_en, public._nz(p->>'subject_name')), (public._nz(p->>'class_id'))::uuid, public._nz(p->>'grade'),
    public._nz(p->>'medium'), public._nz(p->>'class_mode'), public._nz(p->>'class_type'), (public._nz(p->>'preferred_join_date'))::date,
    public._nz(p->>'requirements'), public._jarr(p->'referral_sources'), public._nz(p->>'referral_note'), true, coalesce(public._nz(p->>'language'), 'en'), 'new')
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $fn$;

create or replace function public.submit_teacher_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_phone text := p->>'phone'; v_ids uuid[];
begin
  if length(trim(coalesce(p->>'full_name', ''))) < 2 then raise exception 'Full name is required.'; end if;
  if v_phone !~ '^94\d{9}$' then raise exception 'A valid Sri Lankan mobile number is required.'; end if;
  v_ids := array(select x::uuid from unnest(public._jarr(p->'subject_ids')) x);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Select at least one subject.'; end if;
  if exists (select 1 from unnest(public._jarr(p->'certificate_paths') || coalesce(public._nz(p->>'cv_path'), 'applications/')) f where f not like 'applications/%') then
    raise exception 'Invalid document path.';
  end if;
  perform public._rate_limit('teacher_app', v_phone, 3, 60);
  insert into public.teacher_applications (full_name, phone, whatsapp, email, living_place, subject_ids, subject_names, grades, mediums, class_types, class_modes,
    qualifications, experience_years, experience_details, available_days, preferred_times, additional_info, cv_path, certificate_paths, status)
  values (trim(p->>'full_name'), v_phone, public._nz(p->>'whatsapp'), public._nz(p->>'email'), public._nz(p->>'living_place'), v_ids,
    (select string_agg(name_en, ', ') from public.subjects where id = any(v_ids)),
    public._jarr(p->'grades'), public._jarr(p->'mediums'), public._jarr(p->'class_types'), public._jarr(p->'class_modes'),
    left(coalesce(p->>'qualifications', ''), 1500), coalesce((public._nz(p->>'experience_years'))::integer, 0), left(public._nz(p->>'experience_details'), 1500),
    public._jarr(p->'available_days'), public._jarr(p->'preferred_times'), left(public._nz(p->>'additional_info'), 1500),
    public._nz(p->>'cv_path'), public._jarr(p->'certificate_paths'), 'new')
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $fn$;

-- Records that WhatsApp was OPENED (not that a message was sent). Only within 2 hours of submitting.
create or replace function public.mark_whatsapp_opened(p_kind text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  if p_kind = 'teacher' then
    update public.teacher_applications set whatsapp_opened_at = now() where id = p_id and whatsapp_opened_at is null and created_at > now() - interval '2 hours';
  else
    update public.student_enquiries set whatsapp_opened_at = now() where id = p_id and whatsapp_opened_at is null and created_at > now() - interval '2 hours';
  end if;
  return true;
end $fn$;

-- Only SAFE public fields. Never phone, email, bank, notes, unverified qualifications or documents.
create or replace function public.get_public_teachers() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(x order by x->>'display_name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', t.id, 'display_name', coalesce(t.display_name, t.full_name), 'photo_url', t.photo_url, 'bio_en', t.bio_en, 'bio_ta', t.bio_ta,
      'experience_years', t.experience_years, 'mediums', t.mediums, 'class_modes', t.class_modes,
      'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name_en', s.name_en, 'name_ta', s.name_ta, 'grades', ts.grades) order by s.sort_order)
                   from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id where ts.teacher_id = t.id), '[]'::jsonb),
      'qualifications', coalesce((select jsonb_agg(jsonb_build_object('title', q.title, 'institution', q.institution, 'year', q.year))
                   from public.teacher_qualifications q where q.teacher_id = t.id and q.is_verified and q.is_public), '[]'::jsonb)
    ) x from public.teachers t where t.is_public and t.status = 'active') z
$fn$;

create or replace function public.get_public_classes() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'subject_id', c.subject_id, 'subject_code', s.code, 'subject_name_en', s.name_en, 'subject_name_ta', s.name_ta,
    'title_en', c.title_en, 'title_ta', c.title_ta, 'grade', c.grade, 'medium', c.medium, 'class_mode', c.class_mode, 'class_type', c.class_type,
    'schedule_en', c.schedule_en, 'schedule_ta', c.schedule_ta, 'location', c.location, 'rate_per_session', c.rate_per_session,
    'trial_enabled', c.trial_enabled, 'trial_group_link', case when c.trial_enabled then c.trial_group_link end,
    'teachers', coalesce((select jsonb_agg(coalesce(t.display_name, t.full_name)) from public.class_teachers ct join public.teachers t on t.id = ct.teacher_id
                          where ct.class_id = c.id and t.is_public and t.status = 'active'), '[]'::jsonb)
  ) order by s.sort_order, c.grade), '[]'::jsonb)
  from public.classes c join public.subjects s on s.id = c.subject_id
  where c.is_public and c.is_active and s.is_active
$fn$;

-- =====================================================================
-- TEACHERS
-- =====================================================================
create or replace function public.approve_teacher_application(p_application_id uuid) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare a public.teacher_applications; v_tid uuid; sid uuid;
begin
  perform public._assert_admin();
  select * into a from public.teacher_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if a.status = 'approved' then raise exception 'This application is already approved.'; end if;
  insert into public.teachers (full_name, display_name, phone, whatsapp, email, living_place, experience_years, experience_details, mediums, class_modes, is_public, status, application_id)
  values (a.full_name, a.full_name, a.phone, a.whatsapp, a.email, a.living_place, a.experience_years, a.experience_details, a.mediums, a.class_modes, false, 'active', a.id)
  returning id into v_tid;
  foreach sid in array a.subject_ids loop
    insert into public.teacher_subjects (teacher_id, subject_id, grades) values (v_tid, sid, a.grades) on conflict do nothing;
  end loop;
  if length(a.qualifications) > 0 then
    insert into public.teacher_qualifications (teacher_id, title, is_verified, is_public) values (v_tid, left(a.qualifications, 200), false, true);
  end if;
  update public.teacher_applications set status = 'approved', teacher_id = v_tid, reviewed_at = now(), reviewed_by = auth.uid() where id = a.id;
  perform public._audit('approve_teacher_application', 'teacher_applications', a.id::text, jsonb_build_object('teacher_id', v_tid));
  return v_tid;   -- profile stays PRIVATE until the admin verifies qualifications and ticks "public"
end $fn$;

-- =====================================================================
-- ENQUIRIES & ADMISSIONS
-- =====================================================================
create or replace function public.convert_enquiry(p_enquiry_id uuid, p_class_id uuid, p_as_trial boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare q public.student_enquiries; v_sid uuid; e public.enrollments;
begin
  perform public._assert_staff();
  select * into q from public.student_enquiries where id = p_enquiry_id for update;
  if not found then raise exception 'Enquiry not found.'; end if;
  v_sid := q.student_id;
  if v_sid is null then
    insert into public.students (full_name, grade, phone, whatsapp, email, guardian_name, guardian_phone, guardian_consent, guardian_consent_at, referral_sources, referral_note, status)
    values (q.student_name, q.grade, q.phone, q.whatsapp, q.email, q.guardian_name, q.phone, q.consent, case when q.consent then q.created_at end, q.referral_sources, q.referral_note, 'active')
    returning id into v_sid;
  end if;
  e := public._new_enrollment(v_sid, p_class_id, p_as_trial);
  update public.student_enquiries set student_id = v_sid, status = case when p_as_trial then 'trial' else 'converted' end where id = q.id;
  return jsonb_build_object('student_id', v_sid, 'enrollment_id', e.id, 'enrollment_code', e.enrollment_code);
end $fn$;

create or replace function public.create_enrollment(p_student_id uuid, p_class_id uuid, p_as_trial boolean default true) returns public.enrollments
language plpgsql security definer set search_path = public as $fn$
begin perform public._assert_staff(); return public._new_enrollment(p_student_id, p_class_id, p_as_trial); end $fn$;

create or replace function public.request_paid_admission(p_enrollment_id uuid) returns public.enrollments
language plpgsql security definer set search_path = public as $fn$
declare e public.enrollments;
begin
  select * into e from public.enrollments where id = p_enrollment_id for update;
  if not found then raise exception 'Enrolment not found.'; end if;
  if not (public.is_staff() or e.student_id = public.my_student_id()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if not (e.status = 'trial_completed' or (e.status = 'trial' and public.is_staff())) then
    raise exception 'Paid admission can be requested after completing the free trial sessions.';
  end if;
  update public.enrollments set status = 'admission_requested', admission_requested_at = now() where id = e.id;
  perform public._charge_admission_fee(e.id);
  perform public._audit('request_paid_admission', 'enrollments', e.id::text);
  select * into e from public.enrollments where id = e.id;
  return e;   -- NOTE: no paid access yet. Admin must verify payment and approve.
end $fn$;

create or replace function public.waive_admission_fee(p_enrollment_id uuid, p_reason text) returns public.enrollments
language plpgsql security definer set search_path = public as $fn$
declare e public.enrollments; v_fee uuid;
begin
  perform public._assert_admin();
  if public._nz(p_reason) is null then raise exception 'A reason is required to waive the admission fee.'; end if;
  select * into e from public.enrollments where id = p_enrollment_id for update;
  if not found then raise exception 'Enrolment not found.'; end if;
  if e.admission_fee_waived then raise exception 'Admission fee is already waived.'; end if;
  select id into v_fee from public.fee_ledger where enrollment_id = e.id and entry_type = 'admission_fee' and reversed_at is null;
  if v_fee is not null then perform public._reverse_ledger(v_fee, 'Admission fee waived: ' || p_reason); end if;
  update public.enrollments set admission_fee_waived = true where id = e.id returning * into e;
  perform public._audit('waive_admission_fee', 'enrollments', e.id::text, jsonb_build_object('reason', p_reason));
  return e;
end $fn$;

create or replace function public.enrollment_payment_status(p_enrollment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v_sid uuid;
begin
  select student_id into v_sid from public.enrollments where id = p_enrollment_id;
  if v_sid is null then raise exception 'Enrolment not found.'; end if;
  if not (public.is_staff() or v_sid = public.my_student_id()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  return public._payment_status(p_enrollment_id);
end $fn$;

create or replace function public.approve_enrollment(p_enrollment_id uuid, p_paid_from date default null, p_override boolean default false, p_reason text default null) returns public.enrollments
language plpgsql security definer set search_path = public as $fn$
declare e public.enrollments; ps jsonb; ok boolean;
begin
  perform public._assert_admin();
  select * into e from public.enrollments where id = p_enrollment_id for update;
  if not found then raise exception 'Enrolment not found.'; end if;
  if e.status <> 'admission_requested' then raise exception 'Only enrolments with a paid-admission request can be approved.'; end if;
  ps := public._payment_status(e.id);
  ok := (ps->>'satisfied')::boolean;
  if not ok and not coalesce(p_override, false) then
    raise exception 'Minimum payment not met: LKR % verified of LKR % required.', ps->>'paid', ps->>'required';
  end if;
  if not ok and public._nz(p_reason) is null then raise exception 'A reason is required to approve without the minimum payment.'; end if;
  update public.enrollments set status = 'approved', approved_at = now(), approved_by = auth.uid(),
    paid_from_date = coalesce(p_paid_from, public.lk_today()), approval_override_reason = case when ok then null else p_reason end
  where id = e.id returning * into e;
  perform public._audit('approve_enrollment', 'enrollments', e.id::text, ps || jsonb_build_object('override', not ok));
  return e;
end $fn$;

create or replace function public.set_enrollment_status(p_enrollment_id uuid, p_status text, p_reason text default null) returns public.enrollments
language plpgsql security definer set search_path = public as $fn$
declare e public.enrollments; allowed text[];
begin
  perform public._assert_admin();
  select * into e from public.enrollments where id = p_enrollment_id for update;
  if not found then raise exception 'Enrolment not found.'; end if;
  allowed := case p_status
    when 'suspended' then array['approved']
    when 'withdrawn' then array['trial','trial_completed','admission_requested','approved','suspended']
    when 'rejected'  then array['admission_requested','trial','trial_completed']
    when 'approved'  then array['suspended'] else array[]::text[] end;
  if not (e.status = any(allowed)) then raise exception 'Cannot change status from % to %.', e.status, p_status; end if;
  update public.enrollments set status = p_status,
    notes = concat_ws(E'\n', notes, public.lk_today()::text || ': ' || p_status || coalesce(' — ' || public._nz(p_reason), ''))
  where id = e.id returning * into e;
  perform public._audit('set_enrollment_status', 'enrollments', e.id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
  return e;
end $fn$;

-- =====================================================================
-- ATTENDANCE  (trial sessions never create charges; no duplicate charges)
-- =====================================================================
create or replace function public.upsert_session(p_class_id uuid, p_session_date date, p_topic text default null) returns public.class_sessions
language plpgsql security definer set search_path = public as $fn$
declare s public.class_sessions;
begin
  perform public._assert_staff();
  insert into public.class_sessions (class_id, session_date, topic, created_by) values (p_class_id, p_session_date, public._nz(p_topic), auth.uid())
  on conflict (class_id, session_date) do update set topic = coalesce(public.class_sessions.topic, excluded.topic)
  returning * into s;
  return s;
end $fn$;

create or replace function public.mark_attendance(p_session_id uuid, p_rows jsonb, p_client_uuid uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare ses public.class_sessions; cls public.classes; r jsonb; e public.enrollments; v_status text; v_trial boolean;
  a_id uuid; charge_id uuid; should boolean; billable text[]; ids uuid[] := '{}';
  saved int := 0; charged int := 0; reversed int := 0; trial int := 0; result jsonb; prev jsonb;
begin
  perform public._assert_staff();
  if p_client_uuid is not null then
    select b.result into prev from public.attendance_batches b where b.client_uuid = p_client_uuid;
    if found then return prev || jsonb_build_object('duplicate', true); end if;   -- offline draft already synced
  end if;
  select * into ses from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found.'; end if;
  if ses.status = 'cancelled' then raise exception 'This session was cancelled.'; end if;
  select * into cls from public.classes where id = ses.class_id;
  billable := public._jarr(coalesce(public._setting('billing')->'billable_statuses', '["present","late"]'::jsonb));
  for r in select * from jsonb_array_elements(p_rows) loop
    select * into e from public.enrollments where id = (r->>'enrollment_id')::uuid;
    if not found or e.class_id <> ses.class_id then raise exception 'An enrolment does not belong to this class.'; end if;
    v_status := r->>'status';
    if v_status not in ('present','late','absent','excused','trial') then raise exception 'Invalid attendance status.'; end if;
    v_trial := e.status = 'trial';
    if v_trial and v_status in ('present','late','trial') then v_status := 'trial';
    elsif not v_trial and v_status = 'trial' then v_status := 'present'; end if;
    insert into public.attendance (session_id, enrollment_id, student_id, class_id, status, is_trial, marked_by, marked_at)
    values (ses.id, e.id, e.student_id, e.class_id, v_status, v_trial, auth.uid(), now())
    on conflict (session_id, enrollment_id) do update set status = excluded.status, is_trial = excluded.is_trial, marked_by = excluded.marked_by, marked_at = now()
    returning id into a_id;
    saved := saved + 1; ids := ids || e.id;
    if v_trial and v_status = 'trial' then trial := trial + 1; end if;
    select id into charge_id from public.fee_ledger where enrollment_id = e.id and session_id = ses.id and entry_type = 'session_charge' and reversed_at is null;
    should := e.status = 'approved' and ses.session_date >= coalesce(e.paid_from_date, ses.session_date)
              and v_status = any(billable) and not v_trial and cls.rate_per_session > 0;
    if should and charge_id is null then
      insert into public.fee_ledger (student_id, enrollment_id, class_id, session_id, attendance_id, entry_type, amount, description, entry_date, created_by)
      values (e.student_id, e.id, e.class_id, ses.id, a_id, 'session_charge', cls.rate_per_session, 'Session ' || ses.session_date || ' — ' || e.enrollment_code, ses.session_date, auth.uid());
      charged := charged + 1;
    elsif not should and charge_id is not null then
      perform public._reverse_ledger(charge_id, 'Attendance changed to ' || v_status);
      reversed := reversed + 1;
    end if;
  end loop;
  perform public._recount_trials(ids);
  update public.class_sessions set status = 'held' where id = ses.id and status = 'scheduled';
  result := jsonb_build_object('saved', saved, 'charged', charged, 'reversed', reversed, 'trial', trial);
  if p_client_uuid is not null then
    insert into public.attendance_batches (client_uuid, session_id, result, created_by) values (p_client_uuid, ses.id, result, auth.uid());
  end if;
  perform public._audit('mark_attendance', 'class_sessions', ses.id::text, result);
  return result;
end $fn$;

create or replace function public.cancel_session(p_session_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare ses public.class_sessions; l record; n int := 0; ids uuid[];
begin
  perform public._assert_staff();
  select * into ses from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found.'; end if;
  if ses.status = 'cancelled' then raise exception 'Session is already cancelled.'; end if;
  update public.class_sessions set status = 'cancelled', cancel_reason = public._nz(p_reason) where id = ses.id;
  for l in select id from public.fee_ledger where session_id = ses.id and entry_type = 'session_charge' and reversed_at is null loop
    perform public._reverse_ledger(l.id, 'Session cancelled'); n := n + 1;
  end loop;
  select array_agg(enrollment_id) into ids from public.attendance where session_id = ses.id;
  update public.attendance set status = 'cancelled' where session_id = ses.id;
  perform public._recount_trials(coalesce(ids, '{}'));
  perform public._audit('cancel_session', 'class_sessions', ses.id::text, jsonb_build_object('reason', p_reason, 'reversed', n));
  return jsonb_build_object('reversed', n);
end $fn$;
