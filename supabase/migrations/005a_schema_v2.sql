-- =====================================================================
-- Mentora — 005a SCHEMA UPGRADE (version 2 features)
-- Run AFTER 001 → 004d. Then run 005b and 005c in order.
-- HOW: Supabase → SQL Editor → New query (empty) → paste THIS WHOLE FILE → Run.
-- Safe to run again: everything uses "if not exists" / "drop … if exists".
-- Nothing here deletes existing data. It only ADDS tables and columns.
--
-- What this adds (plain English):
--   • Teacher logins (role = 'teacher') linked to a teacher record
--   • Enrolment status 'completed' and teacher status 'removed' (soft delete)
--   • Public reviews / testimonials (admin must approve), audience survey, complaints
--   • Teacher public extras: social links, YouTube videos, free Zoom sessions
--   • Timetable + teacher change requests (admin approves)
--   • Attendance correction requests from students
--   • "Will you join tomorrow?" poll (answers are deleted after the class starts)
--   • Learning resources library (papers, notes, mind maps, YouTube, Telegram)
--   • Community group links by grade/subject
--   • Student profile change requests (email/phone need admin approval)
-- =====================================================================

-- ---------- Wider status / role lists ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','cashier','teacher','student'));
alter table public.profiles add column if not exists teacher_id uuid unique references public.teachers(id);

alter table public.enrollments drop constraint if exists enrollments_status_check;
alter table public.enrollments add constraint enrollments_status_check
  check (status in ('trial','trial_completed','admission_requested','approved','suspended','withdrawn','rejected','completed'));
alter table public.enrollments add column if not exists completed_at timestamptz;
-- A student who COMPLETED a course may enrol in the same class again later.
drop index if exists public.enrollments_one_active_per_class;
create unique index enrollments_one_active_per_class on public.enrollments (student_id, class_id)
  where status not in ('withdrawn','rejected','completed');

alter table public.teachers drop constraint if exists teachers_status_check;
alter table public.teachers add constraint teachers_status_check check (status in ('active','inactive','removed'));
alter table public.teachers add column if not exists headline_en text;
alter table public.teachers add column if not exists headline_ta text;
alter table public.teachers add column if not exists specialties text[] not null default '{}';
alter table public.teachers add column if not exists linkedin_url text;
alter table public.teachers add column if not exists facebook_url text;
alter table public.teachers add column if not exists youtube_url text;
alter table public.teachers add column if not exists website_url text;
alter table public.teachers add column if not exists removed_at timestamptz;
alter table public.teachers add column if not exists removed_reason text;

alter table public.students add column if not exists photo_path text;   -- private bucket student-photos (or data URL in demo)

-- ---------- Sessions: reason when a class runs outside the timetable ----------
alter table public.class_sessions add column if not exists off_schedule_reason text;

-- ---------- Recordings: "All classes", deadline, teacher submissions ----------
alter table public.recordings alter column class_id drop not null;          -- NULL = all classes
alter table public.recordings add column if not exists expires_at timestamptz;   -- NULL = stays until an admin removes it
alter table public.recordings add column if not exists status text not null default 'approved';
alter table public.recordings drop constraint if exists recordings_status_check;
alter table public.recordings add constraint recordings_status_check check (status in ('pending','approved','rejected'));
alter table public.recordings add column if not exists teacher_id uuid references public.teachers(id);
alter table public.recordings add column if not exists submitted_by uuid;
alter table public.recordings add column if not exists reviewed_by uuid;
alter table public.recordings add column if not exists review_note text;
alter table public.recordings add column if not exists delete_requested boolean not null default false;
alter table public.recordings add column if not exists topic text;

-- ---------- Learning resources ----------
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title_en text not null, title_ta text, description text,
  kind text not null check (kind in ('past_paper','model_paper','short_note','mindmap','youtube','telegram','link','other')),
  url text not null check (url ~* '^https://'),
  topic text, grade text, subject_id uuid references public.subjects(id),
  class_id uuid references public.classes(id) on delete cascade,           -- optional: only for one class
  access text not null default 'free' check (access in ('free','enrolled')), -- free = every signed-in student (of that grade/subject)
  expires_at timestamptz,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  teacher_id uuid references public.teachers(id), submitted_by uuid, reviewed_by uuid, review_note text,
  delete_requested boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.resources is 'Papers, short notes, mind maps, YouTube videos and Telegram links for students.';

create table if not exists public.community_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null check (platform in ('whatsapp','telegram','facebook','youtube','other')),
  url text not null check (url ~* '^https://'),
  grade text, subject_id uuid references public.subjects(id),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.community_links is 'Official Mentora groups/channels by grade and subject (shown to signed-in students).';

-- ---------- Teacher public media (YouTube + free Zoom sessions) ----------
create table if not exists public.teacher_media (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  kind text not null check (kind in ('youtube','free_session')),
  title text not null, url text not null check (url ~* '^https://'),
  starts_at timestamptz,                                  -- free sessions only
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid, reviewed_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Reviews & testimonials (one table) ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.teachers(id) on delete cascade,   -- NULL = testimonial about Mentora
  reviewer_name text not null check (length(trim(reviewer_name)) between 2 and 80),
  reviewer_role text not null default 'student' check (reviewer_role in ('student','parent','teacher','other')),
  grade text,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (length(trim(comment)) between 5 and 1000),
  phone text,                                  -- PRIVATE: lets the admin verify the reviewer; never public
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  is_featured boolean not null default false,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists reviews_teacher_idx on public.reviews (teacher_id, status);

-- ---------- Audience survey ----------
create table if not exists public.audience_feedback (
  id uuid primary key default gen_random_uuid(),
  name text, role text check (role in ('student','parent','teacher','other')), grade text,
  needs text[] not null default '{}',          -- e.g. past_papers, model_papers, revision, online, new_subjects, career
  rating integer check (rating between 1 and 5),
  improve text, ideas text, contact text,
  status text not null default 'new' check (status in ('new','reviewed')),
  created_at timestamptz not null default now()
);

-- ---------- Complaints ----------
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,                    -- MC-2611-0001
  name text not null, phone text not null check (phone ~ '^94\d{9}$'), email text,
  category text not null check (category in ('teaching','fees','facility','staff','online','other')),
  subject text not null, details text not null,
  status text not null default 'new' check (status in ('new','in_progress','resolved','closed')),
  admin_notes text, resolved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Timetable ----------
create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 7),    -- 1 = Monday … 7 = Sunday
  start_time time not null, end_time time not null check (end_time > start_time),
  room text, teacher_id uuid references public.teachers(id),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists timetable_class_idx on public.timetable_slots (class_id, weekday);

create table if not exists public.timetable_change_requests (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('create','update','delete')),
  slot_id uuid references public.timetable_slots(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  proposed jsonb not null default '{}'::jsonb,                 -- { weekday, start_time, end_time, room, notes }
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  teacher_id uuid references public.teachers(id), requested_by uuid,
  reviewed_by uuid, review_note text, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Attendance correction requests ----------
create table if not exists public.attendance_disputes (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  session_id uuid not null references public.class_sessions(id),
  current_status text not null, requested_status text not null check (requested_status in ('present','late','absent','excused')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  resolved_by uuid, resolution_note text, resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists attendance_disputes_one_open on public.attendance_disputes (attendance_id) where status = 'pending';

-- ---------- Profile change requests (student email/phone, teacher public profile) ----------
create table if not exists public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('student','teacher')),
  student_id uuid references public.students(id),
  teacher_id uuid references public.teachers(id),
  changes jsonb not null,                                  -- { field: { from, to } }
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid, reviewed_by uuid, review_note text, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- "Will you join tomorrow's class?" poll (temporary data) ----------
create table if not exists public.class_poll_responses (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  session_date date not null,
  starts_at timestamptz not null,                          -- answers are deleted once this time has passed
  student_id uuid not null references public.students(id) on delete cascade,
  answer boolean not null,
  created_at timestamptz not null default now(),
  unique (class_id, session_date, student_id)
);

-- ---------- updated_at triggers for new tables ----------
do $$ declare t text; begin
  foreach t in array array['resources','community_links','teacher_media','reviews','complaints','timetable_slots'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------- Allow audited deletes from inside approved functions ONLY ----------
-- Money/audit tables still refuse DELETE. The two new admin functions
-- delete_settlement() and delete_cash_reconciliation() switch this on for one
-- statement inside their own transaction (and write a full snapshot to audit_log first).
create or replace function public.forbid_delete() returns trigger
language plpgsql as $fn$
begin
  if coalesce(current_setting('mentora.allow_delete', true), '') = tg_table_name then return old; end if;
  raise exception '% records can never be deleted. Use an audited reversal instead.', tg_table_name;
end $fn$;

-- Complaint reference numbers
create or replace function public.assign_complaint_ref() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare yymm text := to_char(public.lk_today(), 'YYMM');
begin
  new.reference_no := 'MC-' || yymm || '-' || lpad(public.next_serial('COMPLAINT-' || yymm)::text, 4, '0');
  return new;
end $fn$;
drop trigger if exists complaints_ref on public.complaints;
create trigger complaints_ref before insert on public.complaints for each row execute function public.assign_complaint_ref();

-- Default settings for the new features (only inserted if missing)
insert into public.app_settings (key, value, is_public) values
  ('social', '{"facebook":"","instagram":"","youtube":"","tiktok":"","telegram":""}', true),
  ('map', '{"lat":7.2083,"lng":79.8358,"zoom":15,"label":"Mentora Learning Centre, Negombo"}', true),
  ('poll', '{"enabled":true,"hours_before":24}', true),
  ('permissions', '{
     "cashier": {"students_edit": true, "enrollments_manage": true, "attendance_mark": true, "payments_record": true, "timetable_view": true, "reports_view": true},
     "teacher": {"attendance_mark": false, "roster_view": true, "student_contacts_view": false, "earnings_view": true, "content_submit": true, "timetable_request": true, "poll_view": true, "reviews_view": true}
   }', false)
on conflict (key) do nothing;
