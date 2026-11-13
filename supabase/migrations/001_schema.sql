-- =====================================================================
-- Mentora Learning Centre — 001 SCHEMA
-- Run this FIRST in Supabase → SQL Editor → New query → paste → Run.
-- Creates all tables, constraints, code generators and protective triggers.
-- Safe to read: every table has a short comment explaining what it is for.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Helpers ----------
create or replace function public.lk_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Colombo')::date $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- Settings & counters ----------
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,          -- public = readable by the website (fees, bank, contact)
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.app_settings is 'Configurable business rules: admission fee, trial sessions, billing, commission, tax, bank, contact.';

create table public.code_counters (
  prefix text primary key,                            -- e.g. STUDENT, ENR-MMPE, RCPT-2026
  last_value integer not null default 0
);
comment on table public.code_counters is 'Atomic serial counters used to generate unique codes (never edit by hand).';

-- ---------- Subjects & teachers ----------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{1,3}$'),   -- letter used in enrolment codes (M = Maths)
  name_en text not null, name_ta text,
  description_en text, description_ta text,
  icon text default 'bi-book',
  grades text[] not null default '{}',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, phone text not null check (phone ~ '^94\d{9}$'), whatsapp text, email text, living_place text,
  subject_ids uuid[] not null default '{}', subject_names text,
  grades text[] not null default '{}', mediums text[] not null default '{}', class_types text[] not null default '{}', class_modes text[] not null default '{}',
  qualifications text not null default '', experience_years integer not null default 0 check (experience_years between 0 and 70),
  experience_details text, available_days text[] not null default '{}', preferred_times text[] not null default '{}', additional_info text,
  cv_path text, certificate_paths text[] not null default '{}',          -- paths in the PRIVATE teacher-documents bucket
  status text not null default 'new' check (status in ('new','under_review','approved','rejected')),
  admin_notes text, reviewed_at timestamptz, reviewed_by uuid, teacher_id uuid,
  whatsapp_opened_at timestamptz,                      -- "WhatsApp opened" ≠ "message sent"
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_code text unique,                            -- MT-001 (generated)
  full_name text not null, display_name text,
  phone text, whatsapp text, email text, living_place text,
  photo_url text, bio_en text, bio_ta text,
  experience_years integer default 0, experience_details text,
  mediums text[] not null default '{}', class_modes text[] not null default '{}',
  is_public boolean not null default false,            -- only admin-approved profiles are public
  status text not null default 'active' check (status in ('active','inactive')),
  application_id uuid references public.teacher_applications(id),
  bank_name text, bank_account_name text, bank_account_number text, bank_branch text,   -- PRIVATE
  first_eligible_month date,                           -- first month with eligible collected revenue (commission intro)
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.teacher_applications add constraint teacher_applications_teacher_fk foreign key (teacher_id) references public.teachers(id);

create table public.teacher_qualifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null, institution text, year integer check (year between 1950 and 2100),
  is_verified boolean not null default false, is_public boolean not null default true,
  verified_at timestamptz, verified_by uuid, document_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid not null references public.subjects(id),
  grades text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (teacher_id, subject_id)
);

-- ---------- Classes ----------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id),
  title_en text not null, title_ta text,
  grade text not null,
  medium text not null check (medium in ('english','tamil','sinhala')),
  class_mode text not null check (class_mode in ('physical','online','hybrid')),
  class_type text not null default 'group' check (class_type in ('group','individual','revision','paper_class')),
  schedule_en text, schedule_ta text, location text,
  rate_per_session numeric(12,2) not null default 0 check (rate_per_session >= 0),
  trial_enabled boolean not null default true,
  trial_group_link text,                               -- shared with trial students (public)
  is_public boolean not null default true, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.class_private (
  class_id uuid primary key references public.classes(id) on delete cascade,
  paid_group_link text, online_meeting_link text,      -- only approved students can read
  updated_at timestamptz not null default now()
);

create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id),
  allocation_percent numeric(5,2) not null default 100 check (allocation_percent > 0 and allocation_percent <= 100),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (class_id, teacher_id)
);

-- ---------- Students & enquiries ----------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text unique,                            -- MA-0001 (generated)
  full_name text not null check (length(trim(full_name)) >= 2),
  date_of_birth date, grade text, school text,
  phone text check (phone is null or phone ~ '^94\d{9}$'), whatsapp text, email text,
  guardian_name text, guardian_phone text, guardian_relationship text,
  guardian_consent boolean not null default false, guardian_consent_at timestamptz,
  referral_sources text[] not null default '{}', referral_note text,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index students_email_idx on public.students (lower(email));

create table public.student_enquiries (
  id uuid primary key default gen_random_uuid(),
  student_name text not null, guardian_name text,
  phone text not null check (phone ~ '^94\d{9}$'), whatsapp text, email text,
  subject_id uuid references public.subjects(id), subject_name text, class_id uuid references public.classes(id),
  grade text, medium text, class_mode text, class_type text, preferred_join_date date, requirements text,
  referral_sources text[] not null default '{}', referral_note text,
  consent boolean not null default false, language text default 'en',
  status text not null default 'new' check (status in ('new','contacted','trial','converted','closed')),
  admin_notes text, student_id uuid references public.students(id),
  whatsapp_opened_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Profiles (one per login) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('admin','cashier','student')),
  full_name text, email text,
  student_id uuid unique references public.students(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Login → role. New sign-ups are students. Promote staff with: update profiles set role = ''admin'' where email = ''...'';';

-- ---------- Enrolments ----------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  enrollment_code text not null unique,                -- MMPE-001 = Mentora · Maths · Physical · English · serial
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  status text not null check (status in ('trial','trial_completed','admission_requested','approved','suspended','withdrawn','rejected')),
  trial_sessions_used integer not null default 0,
  admission_fee_required boolean not null default false,
  admission_fee_amount numeric(12,2) not null default 0,
  admission_fee_waived boolean not null default false,
  admission_fee_charged boolean not null default false,   -- charged once per student per class enrolment
  admission_requested_at timestamptz, approved_at timestamptz, approved_by uuid,
  paid_from_date date,                                 -- first paid session must be on/after this date
  approval_override_reason text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index enrollments_one_active_per_class on public.enrollments (student_id, class_id) where status not in ('withdrawn','rejected');

-- ---------- Sessions & attendance ----------
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  session_date date not null, topic text,
  status text not null default 'scheduled' check (status in ('scheduled','held','cancelled')),
  cancel_reason text, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (class_id, session_date)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id),
  enrollment_id uuid not null references public.enrollments(id),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  status text not null check (status in ('present','late','absent','excused','trial','cancelled')),
  is_trial boolean not null default false,             -- trial attendance never creates a charge
  marked_by uuid, marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, enrollment_id)
);

create table public.attendance_batches (
  client_uuid uuid primary key,                        -- idempotency key from offline drafts (prevents double-sync)
  session_id uuid references public.class_sessions(id),
  result jsonb, created_by uuid, created_at timestamptz not null default now()
);

-- ---------- Money ----------
create table public.fee_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  enrollment_id uuid references public.enrollments(id),
  class_id uuid references public.classes(id),
  session_id uuid references public.class_sessions(id),
  attendance_id uuid references public.attendance(id),
  entry_type text not null check (entry_type in ('session_charge','admission_fee','adjustment','reversal')),
  amount numeric(12,2) not null,                       -- + charge, − credit/reversal
  description text, entry_date date not null default public.lk_today(),
  reversal_of uuid references public.fee_ledger(id),
  reversed_at timestamptz,
  created_by uuid, created_at timestamptz not null default now()
);
-- No duplicate session charges / admission fees (DB-level guarantee):
create unique index fee_ledger_one_session_charge on public.fee_ledger (enrollment_id, session_id) where entry_type = 'session_charge' and reversed_at is null;
create unique index fee_ledger_one_admission_fee on public.fee_ledger (enrollment_id) where entry_type = 'admission_fee' and reversed_at is null;
create index fee_ledger_student_idx on public.fee_ledger (student_id, entry_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_ref text not null unique,                    -- MP-2611-0001
  student_id uuid not null references public.students(id),
  method text not null check (method in ('bank_transfer','cash','representative_cash')),
  amount numeric(12,2) not null check (amount > 0),
  claimed_amount numeric(12,2),
  paid_on date not null default public.lk_today(),
  status text not null default 'pending' check (status in ('pending','receipt_sent','verified','rejected','reversed')),
  bank_reference text, receipt_sent_at timestamptz,
  verified_by uuid, verified_at timestamptz, rejection_reason text,
  collected_by uuid, collector_name text, notes text,
  client_uuid uuid unique,                             -- idempotency key for offline cash drafts
  created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index payments_student_idx on public.payments (student_id, status);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  ledger_id uuid not null references public.fee_ledger(id),
  student_id uuid not null references public.students(id),
  enrollment_id uuid references public.enrollments(id),
  class_id uuid references public.classes(id),
  amount numeric(12,2) not null check (amount > 0),
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,                     -- MR-2026-000001 (issued only after backend confirmation)
  payment_id uuid not null unique references public.payments(id),
  student_id uuid not null references public.students(id),
  amount numeric(12,2) not null,
  issued_by uuid, issued_at timestamptz not null default now(),
  is_void boolean not null default false, void_reason text,
  created_at timestamptz not null default now()
);

create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  reason text not null, reversed_by uuid,
  created_at timestamptz not null default now()
);

create table public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  reconciliation_date date not null, collector_id uuid, collector_name text,
  expected_amount numeric(12,2) not null, counted_amount numeric(12,2) not null, difference numeric(12,2) not null,
  notes text, reconciled_by uuid, created_at timestamptz not null default now()
);

create table public.teacher_settlements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id),
  period_month date not null check (extract(day from period_month) = 1),
  gross_revenue numeric(12,2) not null default 0, adjustments numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,   -- Mentora commission (NOT tax)
  statutory_deductions numeric(12,2) not null default 0, -- WHT etc. (separate from commission)
  net_payable numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  notes text, details jsonb not null default '{}'::jsonb,
  bank_reference text, settlement_date date, approved_by uuid, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (teacher_id, period_month)
);

-- ---------- Content ----------
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,   -- null = everyone
  title_en text not null, title_ta text, body_en text, body_ta text,
  is_published boolean not null default true, published_at timestamptz default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title_en text not null, title_ta text,
  drive_url text not null check (drive_url ~* '^https://'),
  recorded_on date, is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Audit & rate limits ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid default auth.uid(),
  action text not null, table_name text, record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

create table public.rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null, key text not null,
  created_at timestamptz not null default now()
);
create index rate_limits_lookup on public.rate_limits (bucket, key, created_at);

-- ---------- updated_at triggers ----------
do $$ declare t text; begin
  foreach t in array array['subjects','teacher_applications','teachers','teacher_qualifications','classes','class_private','class_teachers',
    'students','student_enquiries','profiles','enrollments','class_sessions','payments','teacher_settlements','notices','recordings'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------- Code generators ----------
create or replace function public.next_serial(p_prefix text) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into public.code_counters (prefix, last_value) values (p_prefix, 1)
  on conflict (prefix) do update set last_value = public.code_counters.last_value + 1
  returning last_value into v;
  return v;
end $$;

create or replace function public.assign_student_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.student_code := 'MA-' || lpad(public.next_serial('STUDENT')::text, 4, '0');   -- always generated, never typed
  return new;
end $$;
create trigger students_code before insert on public.students for each row execute function public.assign_student_code();

create or replace function public.assign_teacher_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.teacher_code := 'MT-' || lpad(public.next_serial('TEACHER')::text, 3, '0');
  return new;
end $$;
create trigger teachers_code before insert on public.teachers for each row execute function public.assign_teacher_code();

-- Codes can never be changed after creation.
-- The trigger argument lists the columns that must never change on that table.
create or replace function public.lock_codes() returns trigger
language plpgsql as $$
declare col text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if n->col is distinct from o->col then
      raise exception '% cannot be changed (%.%). Void/reverse and re-issue instead.', initcap(replace(col, '_', ' ')), tg_table_name, col;
    end if;
  end loop;
  return new;
end $$;
create trigger students_lock before update on public.students for each row execute function public.lock_codes('student_code');
create trigger teachers_lock before update on public.teachers for each row execute function public.lock_codes('teacher_code');
create trigger enrollments_lock before update on public.enrollments for each row execute function public.lock_codes('enrollment_code');
create trigger receipts_lock before update on public.receipts for each row execute function public.lock_codes('receipt_no', 'amount', 'payment_id', 'student_id');

-- ---------- Never delete money / audit records ----------
create or replace function public.forbid_delete() returns trigger
language plpgsql as $$ begin raise exception '% records can never be deleted. Use an audited reversal instead.', tg_table_name; end $$;
do $$ declare t text; begin
  foreach t in array array['payments','fee_ledger','payment_allocations','receipts','payment_reversals','audit_log','attendance','enrollments','teacher_settlements','cash_reconciliations'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.forbid_delete()', t || '_nodelete', t);
  end loop;
end $$;
create or replace function public.forbid_update() returns trigger
language plpgsql as $$ begin raise exception 'The audit log is append-only.'; end $$;
create trigger audit_log_noupdate before update on public.audit_log for each row execute function public.forbid_update();
