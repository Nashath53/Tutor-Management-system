-- =====================================================================
-- Mentora — 004 FUNCTIONS, PART 4 of 4 — login profiles and EXECUTE permissions (run this LAST)
-- Run the four 004 files in order: 004a → 004b → 004c → 004d.
-- HOW: open a NEW query tab in Supabase SQL Editor (it must be empty),
--      paste THIS WHOLE FILE, make sure nothing is highlighted, click Run.
-- Safe to run again: every function uses "create or replace".
-- Function bodies use NAMED dollar quotes (dollar-fn-dollar) so a copy/paste
-- slip can't silently run two functions together.
-- =====================================================================
-- =====================================================================
-- LOGINS: create a profile for every new auth user; link to a student by email
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_sid uuid;
begin
  select id into v_sid from public.students s where lower(s.email) = lower(new.email)
    and not exists (select 1 from public.profiles p where p.student_id = s.id) order by created_at limit 1;
  insert into public.profiles (id, role, full_name, email, student_id)
  values (new.id, 'student', coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email, v_sid)
  on conflict (id) do nothing;
  return new;
end $fn$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- If the student record gets its email AFTER the login was created, link them automatically.
create or replace function public.link_student_profile() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    update public.profiles set student_id = new.id
    where role = 'student' and student_id is null and lower(email) = lower(new.email)
      and not exists (select 1 from public.profiles p2 where p2.student_id = new.id);
  end if;
  return new;
end $fn$;
drop trigger if exists students_link_profile on public.students;
create trigger students_link_profile after insert or update of email on public.students for each row execute function public.link_student_profile();

create or replace function public.link_user_profile(p_user_id uuid, p_student_id uuid) returns public.profiles
language plpgsql security definer set search_path = public as $fn$
declare pr public.profiles;
begin
  perform public._assert_admin();
  update public.profiles set student_id = p_student_id where id = p_user_id and role = 'student' returning * into pr;
  if not found then raise exception 'Student login not found.'; end if;
  perform public._audit('link_user_profile', 'profiles', p_user_id::text, jsonb_build_object('student_id', p_student_id));
  return pr;
end $fn$;

-- =====================================================================
-- EXECUTE PERMISSIONS: internal helpers are private; public RPCs are explicit.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_role(), public.is_admin(), public.is_staff(), public.my_student_id(), public.my_class_ids(boolean), public.lk_today() to anon, authenticated;
grant execute on function public.submit_student_enquiry(jsonb), public.submit_teacher_application(jsonb), public.mark_whatsapp_opened(text, uuid),
  public.get_public_teachers(), public.get_public_classes() to anon, authenticated;
grant execute on function
  public.approve_teacher_application(uuid), public.convert_enquiry(uuid, uuid, boolean), public.create_enrollment(uuid, uuid, boolean),
  public.request_paid_admission(uuid), public.waive_admission_fee(uuid, text), public.enrollment_payment_status(uuid),
  public.approve_enrollment(uuid, date, boolean, text), public.set_enrollment_status(uuid, text, text),
  public.upsert_session(uuid, date, text), public.mark_attendance(uuid, jsonb, uuid), public.cancel_session(uuid, text),
  public.create_bank_payment(numeric, uuid, text, date), public.mark_receipt_sent(uuid),
  public.verify_payment(uuid, boolean, numeric, text, text), public.record_cash_payment(uuid, numeric, date, text, text, text, uuid),
  public.reverse_payment(uuid, text), public.add_ledger_adjustment(uuid, numeric, text, uuid), public.get_student_statement(uuid, date),
  public.save_cash_reconciliation(date, uuid, numeric, text), public.generate_settlement(uuid, date, numeric, text),
  public.update_settlement_status(uuid, text, text, date), public.get_dashboard_stats(), public.link_user_profile(uuid, uuid)
to authenticated;
