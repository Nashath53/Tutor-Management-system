-- =====================================================================
-- Mentora — 005c FUNCTIONS UPGRADE (run AFTER 005a and 005b)
-- HOW: Supabase → SQL Editor → New query (empty) → paste THIS WHOLE FILE → Run.
-- Safe to run again. IMPORTANT: if you ever re-run 004d, run this file again
-- afterwards (004d resets function permissions).
-- Like 004, these functions are the ONLY way to do the sensitive actions.
-- Each checks the caller's role itself and writes to audit_log.
-- The browser demo (js/services/demo/demo-rpc.js) mirrors these 1:1.
-- =====================================================================

-- ---------- small helpers ----------
create or replace function public._lk_now() returns timestamp
language sql stable as $fn$ select (now() at time zone 'Asia/Colombo') $fn$;

-- Approved link hosts for recordings/resources submitted by teachers
create or replace function public._allowed_link(p_url text) returns boolean
language sql immutable as $fn$
  select p_url ~* '^https://([a-z0-9-]+\.)*(drive\.google\.com|docs\.google\.com|youtube\.com|youtu\.be|zoom\.us|meet\.google\.com|t\.me|telegram\.me|dropbox\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|mentora\.lk)(/|$)'
$fn$;

-- Next start time (as timestamptz) of a class from its active timetable, skipping cancelled sessions.
create or replace function public._next_class_start(p_class_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $fn$
  select min(((d::date + s.start_time) at time zone 'Asia/Colombo'))
  from public.timetable_slots s,
       generate_series(public._lk_now()::date, public._lk_now()::date + 7, interval '1 day') d
  where s.class_id = p_class_id and s.is_active
    and extract(isodow from d) = s.weekday
    and (d::date + s.start_time) > public._lk_now()
    and not exists (select 1 from public.class_sessions cs where cs.class_id = p_class_id and cs.session_date = d::date and cs.status = 'cancelled')
$fn$;

-- Can the caller mark attendance for this class?
create or replace function public._assert_can_mark(p_class_id uuid) returns void
language plpgsql stable security definer set search_path = public as $fn$
begin
  if public.is_admin() then return; end if;
  if public.my_role() = 'cashier' and public.has_perm('attendance_mark') then return; end if;
  if public.my_teacher_id() is not null and public.has_perm('attendance_mark')
     and p_class_id in (select public.my_teacher_class_ids()) then return; end if;
  raise exception 'You do not have permission to mark attendance for this class.' using errcode = '42501';
end $fn$;

-- =====================================================================
-- PUBLIC (website visitors)
-- =====================================================================
create or replace function public._teacher_stats(p_teacher_id uuid) returns jsonb
language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'student_count', (select count(distinct e.student_id) from public.enrollments e join public.class_teachers ct on ct.class_id = e.class_id
                      where ct.teacher_id = p_teacher_id and e.status in ('trial','trial_completed','admission_requested','approved','completed')),
    'rating_avg', (select round(avg(rating)::numeric, 1) from public.reviews where teacher_id = p_teacher_id and status = 'approved'),
    'rating_count', (select count(*) from public.reviews where teacher_id = p_teacher_id and status = 'approved'))
$fn$;

-- Only SAFE public fields. Never phone, email, bank, notes, unverified qualifications or documents.
create or replace function public.get_public_teachers() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(x order by (x->>'student_count')::int desc, x->>'display_name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', t.id, 'display_name', coalesce(t.display_name, t.full_name), 'photo_url', t.photo_url, 'bio_en', t.bio_en, 'bio_ta', t.bio_ta,
      'headline_en', t.headline_en, 'headline_ta', t.headline_ta, 'specialties', t.specialties,
      'experience_years', t.experience_years, 'mediums', t.mediums, 'class_modes', t.class_modes,
      'linkedin_url', t.linkedin_url, 'facebook_url', t.facebook_url, 'youtube_url', t.youtube_url, 'website_url', t.website_url,
      'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name_en', s.name_en, 'name_ta', s.name_ta, 'grades', ts.grades) order by s.sort_order)
                   from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id where ts.teacher_id = t.id), '[]'::jsonb),
      'qualifications', coalesce((select jsonb_agg(jsonb_build_object('title', q.title, 'institution', q.institution, 'year', q.year))
                   from public.teacher_qualifications q where q.teacher_id = t.id and q.is_verified and q.is_public), '[]'::jsonb)
    ) || public._teacher_stats(t.id) x from public.teachers t where t.is_public and t.status = 'active') z
$fn$;

create or replace function public.get_public_teacher(p_teacher_id uuid) returns jsonb
language sql stable security definer set search_path = public as $fn$
  select (select x from jsonb_array_elements(public.get_public_teachers()) x where x->>'id' = p_teacher_id::text) || jsonb_build_object(
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('reviewer_name', r.reviewer_name, 'reviewer_role', r.reviewer_role, 'grade', r.grade,
                 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at) order by r.created_at desc)
                 from (select * from public.reviews where teacher_id = p_teacher_id and status = 'approved' order by created_at desc limit 30) r), '[]'::jsonb),
    'rating_breakdown', coalesce((select jsonb_object_agg(rating, n) from (select rating, count(*) n from public.reviews
                 where teacher_id = p_teacher_id and status = 'approved' group by rating) b), '{}'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'url', m.url, 'starts_at', m.starts_at) order by m.starts_at nulls last, m.created_at desc)
                 from public.teacher_media m where m.teacher_id = p_teacher_id and m.status = 'approved'
                   and (m.kind = 'youtube' or m.starts_at is null or m.starts_at > now() - interval '3 hours')), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title_en', c.title_en, 'title_ta', c.title_ta, 'grade', c.grade,
                 'medium', c.medium, 'class_mode', c.class_mode, 'schedule_en', c.schedule_en, 'schedule_ta', c.schedule_ta, 'rate_per_session', c.rate_per_session))
                 from public.classes c join public.class_teachers ct on ct.class_id = c.id
                 where ct.teacher_id = p_teacher_id and c.is_public and c.is_active), '[]'::jsonb))
  where exists (select 1 from public.teachers t where t.id = p_teacher_id and t.is_public and t.status = 'active')
$fn$;

create or replace function public.get_public_classes() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'subject_id', c.subject_id, 'subject_code', s.code, 'subject_name_en', s.name_en, 'subject_name_ta', s.name_ta,
    'title_en', c.title_en, 'title_ta', c.title_ta, 'grade', c.grade, 'medium', c.medium, 'class_mode', c.class_mode, 'class_type', c.class_type,
    'schedule_en', c.schedule_en, 'schedule_ta', c.schedule_ta, 'location', c.location, 'rate_per_session', c.rate_per_session,
    'trial_enabled', c.trial_enabled, 'trial_group_link', case when c.trial_enabled then c.trial_group_link end,
    'teachers', coalesce((select jsonb_agg(coalesce(t.display_name, t.full_name)) from public.class_teachers ct join public.teachers t on t.id = ct.teacher_id
                          where ct.class_id = c.id and t.is_public and t.status = 'active'), '[]'::jsonb),
    'teacher_list', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(t.display_name, t.full_name))) from public.class_teachers ct
                          join public.teachers t on t.id = ct.teacher_id where ct.class_id = c.id and t.is_public and t.status = 'active'), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('weekday', ts.weekday, 'start_time', ts.start_time, 'end_time', ts.end_time) order by ts.weekday, ts.start_time)
                          from public.timetable_slots ts where ts.class_id = c.id and ts.is_active), '[]'::jsonb),
    'student_count', (select count(*) from public.enrollments e where e.class_id = c.id and e.status in ('trial','trial_completed','admission_requested','approved'))
  ) order by s.sort_order, c.grade), '[]'::jsonb)
  from public.classes c join public.subjects s on s.id = c.subject_id
  where c.is_public and c.is_active and s.is_active
$fn$;

create or replace function public.get_public_stats() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'students', (select count(*) from public.students where status = 'active'),
    'teachers', (select count(*) from public.teachers where is_public and status = 'active'),
    'classes', (select count(*) from public.classes where is_public and is_active),
    'subjects', (select count(*) from public.subjects where is_active),
    'rating_avg', (select round(avg(rating)::numeric, 1) from public.reviews where status = 'approved'),
    'rating_count', (select count(*) from public.reviews where status = 'approved'))
$fn$;

-- Testimonials = approved reviews about Mentora (teacher_id NULL) + featured teacher reviews.
create or replace function public.get_public_testimonials() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('reviewer_name', r.reviewer_name, 'reviewer_role', r.reviewer_role, 'grade', r.grade,
    'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
    'teacher_name', (select coalesce(t.display_name, t.full_name) from public.teachers t where t.id = r.teacher_id))), '[]'::jsonb)
  from (select * from public.reviews where status = 'approved' and (teacher_id is null or is_featured)
        order by is_featured desc, created_at desc limit 12) r
$fn$;

create or replace function public.submit_review(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_tid uuid := (public._nz(p->>'teacher_id'))::uuid; v_phone text := public._nz(p->>'phone');
begin
  if v_phone is not null and v_phone !~ '^94\d{9}$' then raise exception 'Enter a valid Sri Lankan mobile number.'; end if;
  if v_tid is not null and not exists (select 1 from public.teachers where id = v_tid and is_public and status = 'active') then
    raise exception 'Teacher not found.'; end if;
  if length(coalesce(p->>'comment', '')) > 1000 then raise exception 'Text is too long.'; end if;
  perform public._rate_limit('review', coalesce(v_phone, 'anon'), case when v_phone is null then 20 else 3 end, 60);
  insert into public.reviews (teacher_id, reviewer_name, reviewer_role, grade, rating, comment, phone)
  values (v_tid, trim(p->>'reviewer_name'), coalesce(public._nz(p->>'reviewer_role'), 'student'), public._nz(p->>'grade'),
          (p->>'rating')::int, trim(p->>'comment'), v_phone)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end $fn$;

create or replace function public.submit_feedback(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if coalesce(public._nz(p->>'improve'), public._nz(p->>'ideas'), '') = '' and coalesce(jsonb_array_length(p->'needs'), 0) = 0 then
    raise exception 'Please tell us at least one need or idea.'; end if;
  if length(coalesce(p->>'improve', '')) > 1500 or length(coalesce(p->>'ideas', '')) > 1500 then raise exception 'Text is too long.'; end if;
  perform public._rate_limit('feedback', coalesce(public._nz(p->>'contact'), 'anon'), 30, 60);
  insert into public.audience_feedback (name, role, grade, needs, rating, improve, ideas, contact)
  values (public._nz(p->>'name'), public._nz(p->>'role'), public._nz(p->>'grade'), public._jarr(p->'needs'),
          (public._nz(p->>'rating'))::int, public._nz(p->>'improve'), public._nz(p->>'ideas'), public._nz(p->>'contact'))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $fn$;

create or replace function public.submit_complaint(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare c public.complaints; v_phone text := p->>'phone';
begin
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'Name is required.'; end if;
  if v_phone !~ '^94\d{9}$' then raise exception 'A valid Sri Lankan mobile number is required.'; end if;
  if length(trim(coalesce(p->>'details', ''))) < 10 then raise exception 'Please describe the problem.'; end if;
  if length(coalesce(p->>'details', '')) > 2000 then raise exception 'Text is too long.'; end if;
  perform public._rate_limit('complaint', v_phone, 3, 60);
  insert into public.complaints (reference_no, name, phone, email, category, subject, details)
  values ('pending', trim(p->>'name'), v_phone, public._nz(p->>'email'), coalesce(public._nz(p->>'category'), 'other'),
          coalesce(public._nz(p->>'subject'), 'Complaint'), trim(p->>'details'))
  returning * into c;
  return jsonb_build_object('id', c.id, 'reference_no', c.reference_no);
end $fn$;

-- =====================================================================
-- PERMISSIONS (who can do what) — read by every signed-in user, edited by admin in Settings
-- =====================================================================
create or replace function public.get_my_permissions() returns jsonb
language sql stable security definer set search_path = public as $fn$
  select case when public.is_admin() then jsonb_build_object('all', true)
    else coalesce((select value -> public.my_role() from public.app_settings where key = 'permissions'), '{}'::jsonb) end
$fn$;

-- =====================================================================
-- TEACHERS (admin)
-- =====================================================================
create or replace function public.remove_teacher(p_teacher_id uuid, p_reason text) returns public.teachers
language plpgsql security definer set search_path = public as $fn$
declare t public.teachers;
begin
  perform public._assert_admin();
  if public._nz(p_reason) is null then raise exception 'A reason is required.'; end if;
  -- Soft removal: the record stays for settlements/history; the profile goes offline and the login stops working.
  update public.teachers set status = 'removed', is_public = false, removed_at = now(), removed_reason = trim(p_reason)
  where id = p_teacher_id returning * into t;
  if not found then raise exception 'Teacher not found.'; end if;
  update public.timetable_slots set teacher_id = null where teacher_id = p_teacher_id;
  perform public._audit('remove_teacher', 'teachers', t.id::text, jsonb_build_object('reason', p_reason));
  return t;
end $fn$;

create or replace function public.restore_teacher(p_teacher_id uuid) returns public.teachers
language plpgsql security definer set search_path = public as $fn$
declare t public.teachers;
begin
  perform public._assert_admin();
  update public.teachers set status = 'active', removed_at = null, removed_reason = null where id = p_teacher_id and status = 'removed' returning * into t;
  if not found then raise exception 'Teacher is not removed.'; end if;
  perform public._audit('restore_teacher', 'teachers', t.id::text, '{}');
  return t;
end $fn$;

-- Give a teacher a portal login: create the user in Supabase Auth first, then link it here by email.
create or replace function public.link_teacher_login(p_email text, p_teacher_id uuid) returns public.profiles
language plpgsql security definer set search_path = public as $fn$
declare pr public.profiles;
begin
  perform public._assert_admin();
  select * into pr from public.profiles where lower(email) = lower(trim(p_email));
  if not found then raise exception 'No login with this email yet. Create it in Supabase → Authentication → Users first.'; end if;
  if pr.role in ('admin','cashier') then raise exception 'This login belongs to a staff member.'; end if;
  if pr.student_id is not null and p_teacher_id is not null then raise exception 'This login is linked to a student.'; end if;
  update public.profiles set role = case when p_teacher_id is null then 'student' else 'teacher' end, teacher_id = p_teacher_id
  where id = pr.id returning * into pr;
  perform public._audit('link_teacher_login', 'profiles', pr.id::text, jsonb_build_object('teacher_id', p_teacher_id));
  return pr;
end $fn$;

-- Roster for teachers (names + IDs only; phone only if the admin allows it)
create or replace function public.teacher_roster(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare show_phone boolean := public.is_staff() or public.has_perm('student_contacts_view');
begin
  if not (public.is_staff() or (p_class_id in (select public.my_teacher_class_ids()) and public.has_perm('roster_view'))) then
    raise exception 'You can only view rosters of your own classes.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('enrollment_id', e.id, 'enrollment_code', e.enrollment_code, 'status', e.status,
      'trial_sessions_used', e.trial_sessions_used, 'student_id', s.id, 'student_code', s.student_code, 'full_name', s.full_name, 'grade', s.grade,
      'phone', case when show_phone then s.phone end) order by s.full_name)
    from public.enrollments e join public.students s on s.id = e.student_id
    where e.class_id = p_class_id and e.status in ('trial','trial_completed','admission_requested','approved','suspended')), '[]'::jsonb);
end $fn$;

create or replace function public.get_my_reviews() returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if public.my_teacher_id() is null or not public.has_perm('reviews_view') then raise exception 'Not allowed.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('reviewer_name', reviewer_name, 'reviewer_role', reviewer_role, 'rating', rating,
    'comment', comment, 'created_at', created_at) order by created_at desc)
    from public.reviews where teacher_id = public.my_teacher_id() and status = 'approved'), '[]'::jsonb);
end $fn$;

-- =====================================================================
-- ENROLMENT STATUS (adds 'completed')
-- =====================================================================
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
    when 'approved'  then array['suspended']
    when 'completed' then array['approved','suspended'] else array[]::text[] end;
  if not (e.status = any(allowed)) then raise exception 'Cannot change status from % to %.', e.status, p_status; end if;
  update public.enrollments set status = p_status,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    notes = concat_ws(E'\n', notes, public.lk_today()::text || ': ' || p_status || coalesce(' — ' || public._nz(p_reason), ''))
  where id = e.id returning * into e;
  perform public._audit('set_enrollment_status', 'enrollments', e.id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
  return e;
end $fn$;

-- =====================================================================
-- ATTENDANCE (teachers can mark if allowed; off-timetable sessions need a reason)
-- =====================================================================
-- start_session = upsert_session + the timetable check. (upsert_session is kept for older code.)
create or replace function public.start_session(p_class_id uuid, p_session_date date, p_topic text default null, p_off_schedule_reason text default null)
returns public.class_sessions
language plpgsql security definer set search_path = public as $fn$
declare s public.class_sessions; has_tt boolean; on_tt boolean;
begin
  perform public._assert_can_mark(p_class_id);
  select * into s from public.class_sessions where class_id = p_class_id and session_date = p_session_date;
  if not found then
    select exists (select 1 from public.timetable_slots where class_id = p_class_id and is_active),
           exists (select 1 from public.timetable_slots where class_id = p_class_id and is_active and weekday = extract(isodow from p_session_date))
      into has_tt, on_tt;
    if has_tt and not on_tt and public._nz(p_off_schedule_reason) is null then
      raise exception 'This date is not on the class timetable. Please enter a reason for the extra/rescheduled session.';
    end if;
    insert into public.class_sessions (class_id, session_date, topic, created_by, off_schedule_reason)
    values (p_class_id, p_session_date, public._nz(p_topic), auth.uid(), case when has_tt and not on_tt then trim(p_off_schedule_reason) end)
    returning * into s;
    if has_tt and not on_tt then
      perform public._audit('off_schedule_session', 'class_sessions', s.id::text, jsonb_build_object('reason', p_off_schedule_reason));
    end if;
  elsif public._nz(p_topic) is not null and s.topic is null then
    update public.class_sessions set topic = public._nz(p_topic) where id = s.id returning * into s;
  end if;
  return s;
end $fn$;

create or replace function public.upsert_session(p_class_id uuid, p_session_date date, p_topic text default null) returns public.class_sessions
language sql security definer set search_path = public as $fn$ select public.start_session(p_class_id, p_session_date, p_topic, null) $fn$;

create or replace function public.mark_attendance(p_session_id uuid, p_rows jsonb, p_client_uuid uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare ses public.class_sessions; cls public.classes; r jsonb; e public.enrollments; v_status text; v_trial boolean;
  a_id uuid; charge_id uuid; should boolean; billable text[]; ids uuid[] := '{}';
  saved int := 0; charged int := 0; reversed int := 0; trial int := 0; result jsonb; prev jsonb;
begin
  if p_client_uuid is not null then
    select b.result into prev from public.attendance_batches b where b.client_uuid = p_client_uuid;
    if found then return prev || jsonb_build_object('duplicate', true); end if;   -- offline draft already synced
  end if;
  select * into ses from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found.'; end if;
  perform public._assert_can_mark(ses.class_id);
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

-- Student: "This attendance mark is wrong" → admin reviews.
create or replace function public.request_attendance_correction(p_attendance_id uuid, p_requested_status text, p_reason text) returns public.attendance_disputes
language plpgsql security definer set search_path = public as $fn$
declare a public.attendance; d public.attendance_disputes;
begin
  select * into a from public.attendance where id = p_attendance_id;
  if not found or a.student_id is distinct from public.my_student_id() then raise exception 'Attendance record not found.'; end if;
  if a.status = 'cancelled' then raise exception 'This session was cancelled.'; end if;
  if p_requested_status not in ('present','late','absent','excused') then raise exception 'Invalid status.'; end if;
  if p_requested_status = a.status or (a.status = 'trial' and p_requested_status = 'present') then raise exception 'That is already the recorded status.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Please explain what happened.'; end if;
  if exists (select 1 from public.attendance_disputes where attendance_id = a.id and status = 'pending') then
    raise exception 'A request for this session is already waiting for review.'; end if;
  perform public._rate_limit('att_dispute', a.student_id::text, 10, 1440);
  insert into public.attendance_disputes (attendance_id, student_id, class_id, session_id, current_status, requested_status, reason)
  values (a.id, a.student_id, a.class_id, a.session_id, a.status, p_requested_status, trim(p_reason)) returning * into d;
  return d;
end $fn$;

create or replace function public.resolve_attendance_correction(p_id uuid, p_approve boolean, p_note text default null) returns public.attendance_disputes
language plpgsql security definer set search_path = public as $fn$
declare d public.attendance_disputes; a public.attendance;
begin
  perform public._assert_admin();
  select * into d from public.attendance_disputes where id = p_id for update;
  if not found or d.status <> 'pending' then raise exception 'Request not found or already handled.'; end if;
  if p_approve then
    select * into a from public.attendance where id = d.attendance_id;
    perform public.mark_attendance(a.session_id, jsonb_build_array(jsonb_build_object('enrollment_id', a.enrollment_id, 'status', d.requested_status)));
  elsif public._nz(p_note) is null then raise exception 'Give a short reason for rejecting.'; end if;
  update public.attendance_disputes set status = case when p_approve then 'approved' else 'rejected' end,
    resolved_by = auth.uid(), resolution_note = public._nz(p_note), resolved_at = now() where id = d.id returning * into d;
  perform public._audit('resolve_attendance_correction', 'attendance_disputes', d.id::text, jsonb_build_object('approve', p_approve, 'note', p_note));
  return d;
end $fn$;

-- =====================================================================
-- TIMETABLE (admin edits directly; teachers send change requests)
-- =====================================================================
create or replace function public.request_timetable_change(p_action text, p_class_id uuid, p_slot_id uuid, p_proposed jsonb, p_reason text)
returns public.timetable_change_requests
language plpgsql security definer set search_path = public as $fn$
declare r public.timetable_change_requests;
begin
  if public.my_teacher_id() is null or not public.has_perm('timetable_request') then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_class_id not in (select public.my_teacher_class_ids()) then raise exception 'You can only request changes for your own classes.'; end if;
  if p_action not in ('create','update','delete') then raise exception 'Invalid action.'; end if;
  if p_action <> 'create' and not exists (select 1 from public.timetable_slots where id = p_slot_id and class_id = p_class_id) then
    raise exception 'Timetable slot not found.'; end if;
  if p_action <> 'delete' and ((p_proposed->>'weekday')::int not between 1 and 7 or (p_proposed->>'end_time')::time <= (p_proposed->>'start_time')::time) then
    raise exception 'Check the day and times.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Please give a reason for the change.'; end if;
  insert into public.timetable_change_requests (action, slot_id, class_id, proposed, reason, teacher_id, requested_by)
  values (p_action, p_slot_id, p_class_id, coalesce(p_proposed, '{}'::jsonb), trim(p_reason), public.my_teacher_id(), auth.uid()) returning * into r;
  return r;
end $fn$;

create or replace function public.review_timetable_change(p_id uuid, p_approve boolean, p_note text default null) returns public.timetable_change_requests
language plpgsql security definer set search_path = public as $fn$
declare r public.timetable_change_requests; p jsonb;
begin
  perform public._assert_admin();
  select * into r from public.timetable_change_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'Request not found or already handled.'; end if;
  p := r.proposed;
  if p_approve then
    if r.action = 'create' then
      insert into public.timetable_slots (class_id, weekday, start_time, end_time, room, teacher_id, notes)
      values (r.class_id, (p->>'weekday')::int, (p->>'start_time')::time, (p->>'end_time')::time, public._nz(p->>'room'), r.teacher_id, public._nz(p->>'notes'));
    elsif r.action = 'update' then
      update public.timetable_slots set weekday = (p->>'weekday')::int, start_time = (p->>'start_time')::time, end_time = (p->>'end_time')::time,
        room = public._nz(p->>'room'), notes = public._nz(p->>'notes') where id = r.slot_id;
    else
      update public.timetable_slots set is_active = false where id = r.slot_id;
    end if;
  end if;
  update public.timetable_change_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), review_note = public._nz(p_note), reviewed_at = now() where id = r.id returning * into r;
  perform public._audit('review_timetable_change', 'timetable_change_requests', r.id::text, jsonb_build_object('approve', p_approve));
  return r;
end $fn$;

-- =====================================================================
-- "WILL YOU JOIN TOMORROW?" POLL — answers are temporary
-- =====================================================================
create or replace function public._purge_polls() returns void
language sql security definer set search_path = public as $fn$
  delete from public.class_poll_responses where starts_at <= now()
$fn$;

-- Student: open polls (classes starting within the next N hours) + my answer
create or replace function public.get_my_polls() returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare cfg jsonb := public._setting('poll'); hrs int := coalesce((cfg->>'hours_before')::int, 24);
begin
  perform public._purge_polls();
  if public.my_student_id() is null or not coalesce((cfg->>'enabled')::boolean, true) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('class_id', c.id, 'title_en', c.title_en, 'title_ta', c.title_ta, 'starts_at', x.st,
      'my_answer', (select answer from public.class_poll_responses r where r.class_id = c.id and r.student_id = public.my_student_id() and r.starts_at = x.st)))
    from public.classes c cross join lateral (select public._next_class_start(c.id) st) x
    where c.id in (select public.my_class_ids()) and x.st is not null and x.st <= now() + make_interval(hours => hrs)), '[]'::jsonb);
end $fn$;

create or replace function public.answer_class_poll(p_class_id uuid, p_answer boolean) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare st timestamptz := public._next_class_start(p_class_id); hrs int := coalesce((public._setting('poll')->>'hours_before')::int, 24);
begin
  perform public._purge_polls();
  if public.my_student_id() is null or p_class_id not in (select public.my_class_ids()) then raise exception 'You are not enrolled in this class.'; end if;
  if st is null or st > now() + make_interval(hours => hrs) then raise exception 'This poll is not open yet.'; end if;
  insert into public.class_poll_responses (class_id, session_date, starts_at, student_id, answer)
  values (p_class_id, (st at time zone 'Asia/Colombo')::date, st, public.my_student_id(), p_answer)
  on conflict (class_id, session_date, student_id) do update set answer = excluded.answer, created_at = now();
  return jsonb_build_object('ok', true, 'starts_at', st);
end $fn$;

-- Staff / teachers: live counts for the open polls (no names — just numbers)
create or replace function public.get_poll_counts() returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare hrs int := coalesce((public._setting('poll')->>'hours_before')::int, 24);
begin
  perform public._purge_polls();
  if not (public.is_staff() or (public.my_teacher_id() is not null and public.has_perm('poll_view'))) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('class_id', c.id, 'title_en', c.title_en, 'grade', c.grade, 'starts_at', x.st,
      'yes', (select count(*) from public.class_poll_responses r where r.class_id = c.id and r.starts_at = x.st and r.answer),
      'no', (select count(*) from public.class_poll_responses r where r.class_id = c.id and r.starts_at = x.st and not r.answer),
      'enrolled', (select count(*) from public.enrollments e where e.class_id = c.id and e.status in ('trial','trial_completed','admission_requested','approved'))) order by x.st)
    from public.classes c cross join lateral (select public._next_class_start(c.id) st) x
    where c.is_active and x.st is not null and x.st <= now() + make_interval(hours => hrs)
      and (public.is_staff() or c.id in (select public.my_teacher_class_ids()))), '[]'::jsonb);
end $fn$;

-- =====================================================================
-- CONTENT submitted by teachers (pending until an admin approves)
-- =====================================================================
create or replace function public.submit_recording(p jsonb) returns public.recordings
language plpgsql security definer set search_path = public as $fn$
declare r public.recordings; v_class uuid := (public._nz(p->>'class_id'))::uuid;
begin
  if public.my_teacher_id() is null or not public.has_perm('content_submit') then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if v_class is null or v_class not in (select public.my_teacher_class_ids()) then raise exception 'Choose one of your own classes.'; end if;
  if not public._allowed_link(p->>'drive_url') then raise exception 'Use a Google Drive, YouTube, Zoom, OneDrive or Dropbox https link.'; end if;
  insert into public.recordings (class_id, title_en, title_ta, drive_url, recorded_on, topic, expires_at, is_published, status, teacher_id, submitted_by)
  values (v_class, trim(p->>'title_en'), public._nz(p->>'title_ta'), trim(p->>'drive_url'), coalesce((public._nz(p->>'recorded_on'))::date, public.lk_today()),
          public._nz(p->>'topic'), (public._nz(p->>'expires_at'))::timestamptz, true, 'pending', public.my_teacher_id(), auth.uid())
  returning * into r;
  return r;
end $fn$;

create or replace function public.submit_resource(p jsonb) returns public.resources
language plpgsql security definer set search_path = public as $fn$
declare r public.resources; v_class uuid := (public._nz(p->>'class_id'))::uuid;
begin
  if public.my_teacher_id() is null or not public.has_perm('content_submit') then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if v_class is not null and v_class not in (select public.my_teacher_class_ids()) then raise exception 'Choose one of your own classes.'; end if;
  if not public._allowed_link(p->>'url') then raise exception 'Use a Google Drive, YouTube, Telegram, OneDrive or Dropbox https link.'; end if;
  insert into public.resources (title_en, title_ta, description, kind, url, topic, grade, subject_id, class_id, access, expires_at, status, teacher_id, submitted_by)
  values (trim(p->>'title_en'), public._nz(p->>'title_ta'), public._nz(p->>'description'), coalesce(public._nz(p->>'kind'), 'link'), trim(p->>'url'),
          public._nz(p->>'topic'), public._nz(p->>'grade'), (public._nz(p->>'subject_id'))::uuid, v_class, coalesce(public._nz(p->>'access'), 'free'),
          (public._nz(p->>'expires_at'))::timestamptz, 'pending', public.my_teacher_id(), auth.uid())
  returning * into r;
  return r;
end $fn$;

create or replace function public.submit_teacher_media(p jsonb) returns public.teacher_media
language plpgsql security definer set search_path = public as $fn$
declare m public.teacher_media;
begin
  if public.my_teacher_id() is null then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if not public._allowed_link(p->>'url') then raise exception 'Use a YouTube, Zoom or Google Meet https link.'; end if;
  insert into public.teacher_media (teacher_id, kind, title, url, starts_at, submitted_by)
  values (public.my_teacher_id(), coalesce(public._nz(p->>'kind'), 'youtube'), trim(p->>'title'), trim(p->>'url'), (public._nz(p->>'starts_at'))::timestamptz, auth.uid())
  returning * into m;
  return m;
end $fn$;

-- Teacher deletes own PENDING item at once; an APPROVED item gets a "please remove" flag for the admin.
create or replace function public.teacher_delete_content(p_table text, p_id uuid) returns text
language plpgsql security definer set search_path = public as $fn$
declare st text; owner uuid;
begin
  if public.my_teacher_id() is null then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_table not in ('recordings','resources','teacher_media') then raise exception 'Invalid item.'; end if;
  execute format('select status, teacher_id from public.%I where id = $1', p_table) into st, owner using p_id;
  if owner is distinct from public.my_teacher_id() then raise exception 'You can only remove your own items.'; end if;
  if st = 'pending' or st = 'rejected' then
    execute format('delete from public.%I where id = $1', p_table) using p_id; return 'deleted';
  end if;
  if p_table = 'teacher_media' then raise exception 'Ask the admin to remove approved videos.'; end if;
  execute format('update public.%I set delete_requested = true where id = $1', p_table) using p_id;
  return 'delete_requested';
end $fn$;

create or replace function public.review_content(p_table text, p_id uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $fn$
begin
  perform public._assert_admin();
  if p_table not in ('recordings','resources','teacher_media','reviews') then raise exception 'Invalid item.'; end if;
  if p_action = 'delete' then
    execute format('delete from public.%I where id = $1', p_table) using p_id;
  elsif p_action in ('approve','reject') then
    execute format('update public.%I set status = $2, reviewed_by = auth.uid() where id = $1', p_table)
      using p_id, case when p_action = 'approve' then 'approved' else 'rejected' end;
    if p_table in ('recordings','resources') then
      execute format('update public.%I set review_note = $2, delete_requested = false where id = $1', p_table) using p_id, public._nz(p_note);
    end if;
    if p_table = 'reviews' then update public.reviews set reviewed_at = now() where id = p_id; end if;
  else raise exception 'Invalid action.'; end if;
  perform public._audit('review_content', p_table, p_id::text, jsonb_build_object('action', p_action, 'note', p_note));
  return p_action;
end $fn$;

-- =====================================================================
-- PROFILE (students edit name/photo directly; contact details need approval)
-- =====================================================================
create or replace function public.update_my_profile(p_full_name text default null, p_photo_path text default null) returns public.students
language plpgsql security definer set search_path = public as $fn$
declare s public.students;
begin
  if public.my_student_id() is null then raise exception 'Only students can use this.'; end if;
  if p_full_name is not null and length(trim(p_full_name)) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
  if p_photo_path is not null and p_photo_path <> '' and p_photo_path not like public.my_student_id()::text || '/%' and p_photo_path not like 'data:image/%' then
    raise exception 'Invalid photo.'; end if;
  update public.students set full_name = coalesce(public._nz(p_full_name), full_name),
    photo_path = case when p_photo_path is null then photo_path else nullif(p_photo_path, '') end
  where id = public.my_student_id() returning * into s;
  update public.profiles set full_name = s.full_name where id = auth.uid();
  perform public._audit('update_my_profile', 'students', s.id::text, jsonb_build_object('name', p_full_name, 'photo', p_photo_path is not null));
  return s;
end $fn$;

create or replace function public.request_profile_change(p_changes jsonb) returns public.profile_change_requests
language plpgsql security definer set search_path = public as $fn$
declare r public.profile_change_requests; k text; v text; diff jsonb := '{}'::jsonb; cur jsonb; allowed text[];
  v_sid uuid := public.my_student_id(); v_tid uuid := public.my_teacher_id();
begin
  if v_sid is not null then
    allowed := array['email','phone','whatsapp','guardian_phone','guardian_name','address','school'];
    select to_jsonb(s) into cur from public.students s where id = v_sid;
  elsif v_tid is not null then
    allowed := array['display_name','bio_en','bio_ta','headline_en','headline_ta','specialties','linkedin_url','facebook_url','youtube_url','website_url','photo_url'];
    select to_jsonb(t) into cur from public.teachers t where id = v_tid;
  else raise exception 'Not allowed.' using errcode = '42501'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any(allowed)) then raise exception 'The field % cannot be changed here.', k; end if;
    v := p_changes->>k;
    if k in ('phone','whatsapp','guardian_phone') and v is not null and v <> '' and v !~ '^94\d{9}$' then raise exception 'Enter a valid Sri Lankan mobile number (94XXXXXXXXX).'; end if;
    if k = 'email' and v is not null and v <> '' and v !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
    if k like '%_url' and v is not null and v <> '' and v !~* '^https://' then raise exception 'Links must start with https://'; end if;
    if (cur->k) is distinct from (p_changes->k) then diff := diff || jsonb_build_object(k, jsonb_build_object('from', cur->k, 'to', p_changes->k)); end if;
  end loop;
  if diff = '{}'::jsonb then raise exception 'Nothing changed.'; end if;
  if exists (select 1 from public.profile_change_requests where status = 'pending' and (student_id = v_sid or teacher_id = v_tid)) then
    raise exception 'You already have a change request waiting for approval.'; end if;
  insert into public.profile_change_requests (subject_type, student_id, teacher_id, changes, requested_by)
  values (case when v_sid is not null then 'student' else 'teacher' end, v_sid, v_tid, diff, auth.uid()) returning * into r;
  return r;
end $fn$;

create or replace function public.review_profile_change(p_id uuid, p_approve boolean, p_note text default null) returns public.profile_change_requests
language plpgsql security definer set search_path = public as $fn$
declare r public.profile_change_requests; k text; sets text := '';
begin
  perform public._assert_admin();
  select * into r from public.profile_change_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'Request not found or already handled.'; end if;
  if p_approve then
    for k in select jsonb_object_keys(r.changes) loop
      if k = 'specialties' then
        sets := sets || format(', %I = public._jarr(%L::jsonb)', k, (r.changes->k->'to')::text);
      else
        sets := sets || format(', %I = %L', k, nullif(r.changes->k->>'to', ''));
      end if;
    end loop;
    execute format('update public.%I set %s where id = $1', case when r.subject_type = 'student' then 'students' else 'teachers' end, substr(sets, 3))
      using coalesce(r.student_id, r.teacher_id);
  end if;
  update public.profile_change_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), review_note = public._nz(p_note), reviewed_at = now() where id = r.id returning * into r;
  perform public._audit('review_profile_change', 'profile_change_requests', r.id::text, jsonb_build_object('approve', p_approve, 'changes', r.changes));
  return r;
end $fn$;

-- =====================================================================
-- DELETES THAT NEED A SAFETY NET (admin only, reason + full snapshot in audit_log)
-- =====================================================================
create or replace function public.delete_settlement(p_id uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = public as $fn$
declare s public.teacher_settlements;
begin
  perform public._assert_admin();
  if public._nz(p_reason) is null then raise exception 'A reason is required.'; end if;
  select * into s from public.teacher_settlements where id = p_id for update;
  if not found then raise exception 'Settlement not found.'; end if;
  if s.status = 'paid' then raise exception 'A PAID settlement cannot be deleted — money has already left the bank.'; end if;
  perform public._audit('delete_settlement', 'teacher_settlements', s.id::text, jsonb_build_object('reason', p_reason, 'snapshot', to_jsonb(s)));
  perform set_config('mentora.allow_delete', 'teacher_settlements', true);
  delete from public.teacher_settlements where id = s.id;
  perform set_config('mentora.allow_delete', '', true);
  return true;
end $fn$;

create or replace function public.delete_cash_reconciliation(p_id uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = public as $fn$
declare c public.cash_reconciliations;
begin
  perform public._assert_admin();
  if public._nz(p_reason) is null then raise exception 'A reason is required.'; end if;
  select * into c from public.cash_reconciliations where id = p_id for update;
  if not found then raise exception 'Reconciliation not found.'; end if;
  perform public._audit('delete_cash_reconciliation', 'cash_reconciliations', c.id::text, jsonb_build_object('reason', p_reason, 'snapshot', to_jsonb(c)));
  perform set_config('mentora.allow_delete', 'cash_reconciliations', true);
  delete from public.cash_reconciliations where id = c.id;
  perform set_config('mentora.allow_delete', '', true);
  return true;
end $fn$;

-- =====================================================================
-- ADMIN DASHBOARD (more counters for the new inboxes)
-- =====================================================================
create or replace function public.get_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare m date := date_trunc('month', public.lk_today())::date;
begin
  perform public._assert_staff();
  return jsonb_build_object(
    'students', (select count(*) from public.students where status = 'active'),
    'teachers', (select count(*) from public.teachers where status = 'active'),
    'active_enrollments', (select count(*) from public.enrollments where status = 'approved'),
    'trial_enrollments', (select count(*) from public.enrollments where status in ('trial','trial_completed')),
    'admission_requests', (select count(*) from public.enrollments where status = 'admission_requested'),
    'new_enquiries', (select count(*) from public.student_enquiries where status = 'new'),
    'new_applications', (select count(*) from public.teacher_applications where status = 'new'),
    'payments_to_verify', (select count(*) from public.payments where status in ('pending','receipt_sent')),
    'collected_this_month', (select coalesce(round(sum(amount), 2), 0) from public.payments where status = 'verified' and paid_on >= m),
    'outstanding_total', round((select coalesce(sum(amount), 0) from public.fee_ledger) - (select coalesce(sum(amount), 0) from public.payments where status = 'verified'), 2),
    'pending_reviews', (select count(*) from public.reviews where status = 'pending'),
    'open_complaints', (select count(*) from public.complaints where status in ('new','in_progress')),
    'new_feedback', (select count(*) from public.audience_feedback where status = 'new'),
    'pending_requests', (select count(*) from public.profile_change_requests where status = 'pending')
                      + (select count(*) from public.attendance_disputes where status = 'pending')
                      + (select count(*) from public.timetable_change_requests where status = 'pending')
                      + (select count(*) from public.recordings where status = 'pending' or delete_requested)
                      + (select count(*) from public.resources where status = 'pending' or delete_requested)
                      + (select count(*) from public.teacher_media where status = 'pending')
  );
end $fn$;

-- =====================================================================
-- EXECUTE PERMISSIONS for the functions in this file
-- =====================================================================
revoke execute on function public._lk_now(), public._allowed_link(text), public._next_class_start(uuid), public._assert_can_mark(uuid),
  public._teacher_stats(uuid), public._purge_polls() from public, anon, authenticated;

revoke execute on function
  public.get_public_teachers(), public.get_public_teacher(uuid), public.get_public_classes(), public.get_public_stats(), public.get_public_testimonials(),
  public.submit_review(jsonb), public.submit_feedback(jsonb), public.submit_complaint(jsonb),
  public.get_my_permissions(), public.remove_teacher(uuid, text), public.restore_teacher(uuid), public.link_teacher_login(text, uuid),
  public.teacher_roster(uuid), public.get_my_reviews(), public.set_enrollment_status(uuid, text, text),
  public.start_session(uuid, date, text, text), public.upsert_session(uuid, date, text), public.mark_attendance(uuid, jsonb, uuid),
  public.request_attendance_correction(uuid, text, text), public.resolve_attendance_correction(uuid, boolean, text),
  public.request_timetable_change(text, uuid, uuid, jsonb, text), public.review_timetable_change(uuid, boolean, text),
  public.get_my_polls(), public.answer_class_poll(uuid, boolean), public.get_poll_counts(),
  public.submit_recording(jsonb), public.submit_resource(jsonb), public.submit_teacher_media(jsonb),
  public.teacher_delete_content(text, uuid), public.review_content(text, uuid, text, text),
  public.update_my_profile(text, text), public.request_profile_change(jsonb), public.review_profile_change(uuid, boolean, text),
  public.delete_settlement(uuid, text), public.delete_cash_reconciliation(uuid, text), public.get_dashboard_stats()
from public, anon;

grant execute on function public.get_public_teachers(), public.get_public_teacher(uuid), public.get_public_classes(), public.get_public_stats(),
  public.get_public_testimonials(), public.submit_review(jsonb), public.submit_feedback(jsonb), public.submit_complaint(jsonb) to anon, authenticated;

grant execute on function
  public.get_my_permissions(), public.remove_teacher(uuid, text), public.restore_teacher(uuid), public.link_teacher_login(text, uuid),
  public.teacher_roster(uuid), public.get_my_reviews(), public.set_enrollment_status(uuid, text, text),
  public.start_session(uuid, date, text, text), public.upsert_session(uuid, date, text), public.mark_attendance(uuid, jsonb, uuid),
  public.request_attendance_correction(uuid, text, text), public.resolve_attendance_correction(uuid, boolean, text),
  public.request_timetable_change(text, uuid, uuid, jsonb, text), public.review_timetable_change(uuid, boolean, text),
  public.get_my_polls(), public.answer_class_poll(uuid, boolean), public.get_poll_counts(),
  public.submit_recording(jsonb), public.submit_resource(jsonb), public.submit_teacher_media(jsonb),
  public.teacher_delete_content(text, uuid), public.review_content(text, uuid, text, text),
  public.update_my_profile(text, text), public.request_profile_change(jsonb), public.review_profile_change(uuid, boolean, text),
  public.delete_settlement(uuid, text), public.delete_cash_reconciliation(uuid, text), public.get_dashboard_stats()
to authenticated;

-- OPTIONAL: purge old poll answers every 15 minutes even if nobody opens the app.
-- Supabase → Database → Extensions → enable "pg_cron", then run:
--   select cron.schedule('mentora-purge-polls', '*/15 * * * *', $$select public._purge_polls()$$);

-- Role helpers from 005b (re-granted here so re-running 004d → 005c always works)
grant execute on function public.is_teacher(), public.my_teacher_id(), public.my_teacher_class_ids(), public.has_perm(text) to authenticated;
