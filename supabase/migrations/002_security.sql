-- =====================================================================
-- Mentora — 002 SECURITY (Row Level Security)
-- Run SECOND. Principle: the browser only has the public "anon" key, so the
-- DATABASE decides who can see/change what. Money tables have NO write policies:
-- they can only change through the audited functions in the 004a–004d files.
-- =====================================================================

-- ---------- Role helpers (security definer so policies can read profiles safely) ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','cashier') from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid() and role = 'student'
$$;
-- Classes the signed-in student is enrolled in (any live status / approved only)
create or replace function public.my_class_ids(p_approved_only boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  select class_id from public.enrollments
  where student_id = public.my_student_id()
    and (case when p_approved_only then status = 'approved' else status in ('trial','trial_completed','admission_requested','approved') end)
$$;

-- ---------- Enable RLS on EVERY table ----------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Settings ----------
create policy settings_read on public.app_settings for select using (is_public or public.is_staff());
create policy settings_admin_write on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
-- code_counters, rate_limits, attendance_batches: no policies = no direct access at all.

-- ---------- Profiles ----------
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());
-- (No insert policy: profiles are created by the handle_new_user trigger. No one can change their own role.)

-- ---------- Subjects (public catalogue) ----------
create policy subjects_read on public.subjects for select using (is_active or public.is_staff());
create policy subjects_admin_write on public.subjects for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Teachers (PRIVATE — public site uses get_public_teachers()) ----------
create policy teachers_admin on public.teachers for all using (public.is_admin()) with check (public.is_admin());
create policy teacher_quals_admin on public.teacher_qualifications for all using (public.is_admin()) with check (public.is_admin());
create policy teacher_subjects_admin on public.teacher_subjects for all using (public.is_admin()) with check (public.is_admin());
create policy teacher_apps_admin_read on public.teacher_applications for select using (public.is_admin());
create policy teacher_apps_admin_update on public.teacher_applications for update using (public.is_admin()) with check (public.is_admin());
-- (Applications are INSERTED only through submit_teacher_application().)

-- ---------- Classes ----------
create policy classes_read on public.classes for select using (
  (is_public and is_active) or public.is_staff() or id in (select public.my_class_ids()));
create policy classes_admin_write on public.classes for all using (public.is_admin()) with check (public.is_admin());
create policy class_private_read on public.class_private for select using (
  public.is_staff() or class_id in (select public.my_class_ids(true)));       -- paid links: APPROVED students only
create policy class_private_admin_write on public.class_private for all using (public.is_admin()) with check (public.is_admin());
create policy class_teachers_staff_read on public.class_teachers for select using (public.is_staff());
create policy class_teachers_admin_write on public.class_teachers for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Students (isolation: a student sees ONLY their own row) ----------
create policy students_read on public.students for select using (public.is_staff() or id = public.my_student_id());
create policy students_staff_insert on public.students for insert with check (public.is_staff());
create policy students_staff_update on public.students for update using (public.is_staff()) with check (public.is_staff());

create policy enquiries_staff_read on public.student_enquiries for select using (public.is_staff());
create policy enquiries_staff_update on public.student_enquiries for update using (public.is_staff()) with check (public.is_staff());

-- ---------- Enrolments / sessions / attendance (writes via functions only) ----------
create policy enrollments_read on public.enrollments for select using (public.is_staff() or student_id = public.my_student_id());
create policy sessions_read on public.class_sessions for select using (public.is_staff() or class_id in (select public.my_class_ids()));
create policy attendance_read on public.attendance for select using (public.is_staff() or student_id = public.my_student_id());

-- ---------- Money (READ only; every write goes through audited functions) ----------
create policy ledger_read on public.fee_ledger for select using (public.is_staff() or student_id = public.my_student_id());
create policy payments_read on public.payments for select using (public.is_staff() or student_id = public.my_student_id());
create policy allocations_read on public.payment_allocations for select using (public.is_staff() or student_id = public.my_student_id());
create policy receipts_read on public.receipts for select using (public.is_staff() or student_id = public.my_student_id());
create policy reversals_read on public.payment_reversals for select using (public.is_staff());
create policy reconciliations_read on public.cash_reconciliations for select using (public.is_staff());
create policy settlements_admin_read on public.teacher_settlements for select using (public.is_admin());

-- ---------- Content ----------
create policy notices_read on public.notices for select using (
  public.is_staff() or (auth.uid() is not null and is_published and (class_id is null or class_id in (select public.my_class_ids()))));
create policy notices_admin_write on public.notices for all using (public.is_admin()) with check (public.is_admin());
create policy recordings_read on public.recordings for select using (
  public.is_staff() or (is_published and class_id in (select public.my_class_ids(true))));
create policy recordings_admin_write on public.recordings for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Audit ----------
create policy audit_admin_read on public.audit_log for select using (public.is_admin());

-- ---------- Table privileges (defence in depth on top of RLS) ----------
revoke all on all tables in schema public from anon;
grant select on public.app_settings, public.subjects, public.classes to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;   -- RLS above still decides row access
revoke all on public.code_counters, public.rate_limits, public.attendance_batches from anon, authenticated;
revoke insert, update, delete on public.fee_ledger, public.payments, public.payment_allocations, public.receipts,
  public.payment_reversals, public.cash_reconciliations, public.teacher_settlements, public.enrollments,
  public.attendance, public.class_sessions, public.audit_log from authenticated;
grant usage on all sequences in schema public to authenticated;

-- ---------- Generic audit trigger for admin edits to master data ----------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare changed jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k not in ('updated_at') and to_jsonb(new)->k is distinct from to_jsonb(old)->k then
        changed := changed || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old)->k, 'to', to_jsonb(new)->k));
      end if;
    end loop;
    if changed = '{}'::jsonb then return new; end if;
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values (auth.uid(), lower(tg_op) || '_' || tg_table_name, tg_table_name,
          coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key', to_jsonb(new)->>'class_id'),
          case when tg_op = 'UPDATE' then changed else '{}'::jsonb end);
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['app_settings','subjects','teachers','teacher_qualifications','classes','class_private','class_teachers','students','profiles'] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.audit_row_change()', t || '_audit', t);
  end loop;
end $$;
