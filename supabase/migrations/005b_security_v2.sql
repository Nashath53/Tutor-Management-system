-- =====================================================================
-- Mentora — 005b SECURITY UPGRADE (teacher role + rules for new tables)
-- Run AFTER 005a. Safe to run again (every policy is dropped then re-created).
-- Plain English:
--   • Teachers sign in and see ONLY their own classes, rosters (names + IDs),
--     sessions, attendance, settlements and submissions. Never other teachers'
--     bank details, never student phone numbers (unless the admin allows it).
--   • Students see only their own requests, poll answers and the content they
--     are allowed to see. Visitors (not signed in) use safe functions only.
--   • What a teacher/cashier may do is stored in app_settings.permissions and
--     only an ADMIN can change it.
-- =====================================================================

-- ---------- Role helpers ----------
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select p.role = 'teacher' and t.status = 'active'
    from public.profiles p join public.teachers t on t.id = p.teacher_id where p.id = auth.uid()), false)
$fn$;

create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $fn$
  select p.teacher_id from public.profiles p join public.teachers t on t.id = p.teacher_id
  where p.id = auth.uid() and p.role = 'teacher' and t.status = 'active'
$fn$;

create or replace function public.my_teacher_class_ids() returns setof uuid
language sql stable security definer set search_path = public as $fn$
  select class_id from public.class_teachers where teacher_id = public.my_teacher_id()
$fn$;

-- Permission switch from app_settings.permissions (admins always have every permission).
create or replace function public.has_perm(p_key text) returns boolean
language sql stable security definer set search_path = public as $fn$
  select case
    when public.is_admin() then true
    when public.my_role() in ('cashier','teacher') then
      coalesce(((select value from public.app_settings where key = 'permissions') -> public.my_role() ->> p_key)::boolean, false)
    else false end
$fn$;

-- ---------- Enable RLS on the new tables ----------
do $$ declare t text; begin
  foreach t in array array['resources','community_links','teacher_media','reviews','audience_feedback','complaints',
    'timetable_slots','timetable_change_requests','attendance_disputes','profile_change_requests','class_poll_responses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Requests/answers can only be written through the functions in 005c
revoke insert, update, delete on public.attendance_disputes, public.profile_change_requests,
  public.class_poll_responses, public.timetable_change_requests from authenticated;

-- ---------- Existing tables: let teachers read their own things ----------
drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select using (
  (is_public and is_active) or public.is_staff() or id in (select public.my_class_ids()) or id in (select public.my_teacher_class_ids()));

drop policy if exists class_teachers_staff_read on public.class_teachers;
create policy class_teachers_staff_read on public.class_teachers for select using (public.is_staff() or teacher_id = public.my_teacher_id());

drop policy if exists sessions_read on public.class_sessions;
create policy sessions_read on public.class_sessions for select using (
  public.is_staff() or class_id in (select public.my_class_ids()) or class_id in (select public.my_teacher_class_ids()));

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select using (
  public.is_staff() or student_id = public.my_student_id()
  or (class_id in (select public.my_teacher_class_ids()) and public.has_perm('roster_view')));

drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select using (
  public.is_staff() or student_id = public.my_student_id()
  or (class_id in (select public.my_teacher_class_ids()) and public.has_perm('roster_view')));

drop policy if exists teachers_self_read on public.teachers;
create policy teachers_self_read on public.teachers for select using (id = public.my_teacher_id());
drop policy if exists teacher_quals_self_read on public.teacher_qualifications;
create policy teacher_quals_self_read on public.teacher_qualifications for select using (teacher_id = public.my_teacher_id());
drop policy if exists teacher_subjects_self_read on public.teacher_subjects;
create policy teacher_subjects_self_read on public.teacher_subjects for select using (teacher_id = public.my_teacher_id());

drop policy if exists settlements_teacher_read on public.teacher_settlements;
create policy settlements_teacher_read on public.teacher_settlements for select using (
  teacher_id = public.my_teacher_id() and public.has_perm('earnings_view'));

drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select using (
  public.is_staff() or (auth.uid() is not null and is_published and (class_id is null or class_id in (select public.my_class_ids())
    or class_id in (select public.my_teacher_class_ids()))));

-- Recordings: "All classes" (class_id NULL) = every student with an approved enrolment.
-- Expired or unapproved recordings are hidden from students automatically.
drop policy if exists recordings_read on public.recordings;
create policy recordings_read on public.recordings for select using (
  public.is_staff()
  or teacher_id = public.my_teacher_id()
  or (class_id in (select public.my_teacher_class_ids()))
  or (is_published and status = 'approved' and (expires_at is null or expires_at > now())
      and (class_id in (select public.my_class_ids(true)) or (class_id is null and exists (select public.my_class_ids(true))))));

-- ---------- New tables ----------
drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select using (
  public.is_staff()
  or teacher_id = public.my_teacher_id()
  or (public.my_teacher_id() is not null and status = 'approved')
  or (public.my_student_id() is not null and status = 'approved' and (expires_at is null or expires_at > now()) and (
        (access = 'free' and (class_id is null or class_id in (select public.my_class_ids())))
     or (access = 'enrolled' and (class_id in (select public.my_class_ids(true))
          or (class_id is null and exists (select 1 from public.enrollments e join public.classes c on c.id = e.class_id
               where e.student_id = public.my_student_id() and e.status = 'approved'
                 and (resources.subject_id is null or c.subject_id = resources.subject_id)
                 and (resources.grade is null or c.grade = resources.grade))))))));
drop policy if exists resources_admin_write on public.resources;
create policy resources_admin_write on public.resources for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists community_read on public.community_links;
create policy community_read on public.community_links for select using (public.is_staff() or (auth.uid() is not null and is_active));
drop policy if exists community_admin_write on public.community_links;
create policy community_admin_write on public.community_links for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists teacher_media_read on public.teacher_media;
create policy teacher_media_read on public.teacher_media for select using (public.is_admin() or teacher_id = public.my_teacher_id());
drop policy if exists teacher_media_admin_write on public.teacher_media;
create policy teacher_media_admin_write on public.teacher_media for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists reviews_admin on public.reviews;
create policy reviews_admin on public.reviews for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists feedback_admin on public.audience_feedback;
create policy feedback_admin on public.audience_feedback for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists complaints_staff_read on public.complaints;
create policy complaints_staff_read on public.complaints for select using (public.is_staff());
drop policy if exists complaints_admin_write on public.complaints;
create policy complaints_admin_write on public.complaints for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists timetable_read on public.timetable_slots;
create policy timetable_read on public.timetable_slots for select using (
  public.is_staff() or public.my_teacher_id() is not null or class_id in (select public.my_class_ids()));
drop policy if exists timetable_admin_write on public.timetable_slots;
create policy timetable_admin_write on public.timetable_slots for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists tt_requests_read on public.timetable_change_requests;
create policy tt_requests_read on public.timetable_change_requests for select using (public.is_staff() or teacher_id = public.my_teacher_id());

drop policy if exists disputes_read on public.attendance_disputes;
create policy disputes_read on public.attendance_disputes for select using (public.is_staff() or student_id = public.my_student_id());

drop policy if exists pcr_read on public.profile_change_requests;
create policy pcr_read on public.profile_change_requests for select using (
  public.is_admin() or student_id = public.my_student_id() or teacher_id = public.my_teacher_id());

drop policy if exists poll_read on public.class_poll_responses;
create policy poll_read on public.class_poll_responses for select using (student_id = public.my_student_id());

-- ---------- Storage: private student profile photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "students upload own photo" on storage.objects;
create policy "students upload own photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and (storage.foldername(name))[1] = public.my_student_id()::text);
drop policy if exists "read student photos" on storage.objects;
create policy "read student photos" on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and ((storage.foldername(name))[1] = public.my_student_id()::text or public.is_staff()));

-- Audit admin edits on the new master-data tables
do $$ declare t text; begin
  foreach t in array array['resources','community_links','teacher_media','reviews','complaints','timetable_slots'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

grant execute on function public.is_teacher(), public.my_teacher_id(), public.my_teacher_class_ids(), public.has_perm(text) to authenticated;
revoke execute on function public.is_teacher(), public.my_teacher_id(), public.my_teacher_class_ids(), public.has_perm(text) from anon;
