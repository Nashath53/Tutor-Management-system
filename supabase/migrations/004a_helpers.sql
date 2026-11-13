-- =====================================================================
-- Mentora — 004 FUNCTIONS, PART 1 of 4 — internal helper functions
-- Run the four 004 files in order: 004a → 004b → 004c → 004d.
-- HOW: open a NEW query tab in Supabase SQL Editor (it must be empty),
--      paste THIS WHOLE FILE, make sure nothing is highlighted, click Run.
-- Safe to run again: every function uses "create or replace".
-- Function bodies use NAMED dollar quotes (dollar-fn-dollar) so a copy/paste
-- slip can't silently run two functions together.
-- =====================================================================
-- These run FOURTH (after 001–003). These are the ONLY way to change enrolments, attendance,
-- charges, payments, receipts and settlements. Each one:
--   • is SECURITY DEFINER with a fixed search_path (cannot be hijacked)
--   • checks the caller's role itself (never trusts the browser)
--   • writes to audit_log
-- The browser demo (js/services/demo/demo-rpc.js) mirrors these 1:1.

-- ---------- internal helpers ----------
create or replace function public._setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $fn$
  select coalesce((select value from public.app_settings where key = p_key), '{}'::jsonb)
$fn$;

create or replace function public._assert_admin() returns void
language plpgsql stable security definer set search_path = public as $fn$
begin if not public.is_admin() then raise exception 'Only administrators can do this.' using errcode = '42501'; end if; end $fn$;

create or replace function public._assert_staff() returns void
language plpgsql stable security definer set search_path = public as $fn$
begin if not public.is_staff() then raise exception 'Only staff members can do this.' using errcode = '42501'; end if; end $fn$;

create or replace function public._audit(p_action text, p_table text, p_id text, p_details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $fn$
  insert into public.audit_log (actor_id, action, table_name, record_id, details) values (auth.uid(), p_action, p_table, p_id, coalesce(p_details, '{}'::jsonb))
$fn$;

create or replace function public._rate_limit(p_bucket text, p_key text, p_max integer, p_minutes integer) returns void
language plpgsql security definer set search_path = public as $fn$
declare hits integer;
begin
  delete from public.rate_limits where created_at < now() - interval '1 day';
  select count(*) into hits from public.rate_limits where bucket = p_bucket and key = p_key and created_at > now() - make_interval(mins => p_minutes);
  if hits >= p_max then raise exception 'Too many submissions. Please try again later.'; end if;
  insert into public.rate_limits (bucket, key) values (p_bucket, p_key);
end $fn$;

create or replace function public._jarr(p jsonb) returns text[]
language sql immutable as $fn$
  select case when p is null or jsonb_typeof(p) = 'null' then '{}'::text[]
              when jsonb_typeof(p) = 'array' then array(select jsonb_array_elements_text(p))
              else array[p #>> '{}'] end
$fn$;

create or replace function public._nz(p text) returns text
language sql immutable as $fn$ select nullif(trim(p), '') $fn$;

-- Open (unpaid) amount of a ledger charge = amount − active allocations from verified payments
create or replace function public._open_amount(p_ledger_id uuid) returns numeric
language sql stable security definer set search_path = public as $fn$
  select round(l.amount - coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                                    where a.ledger_id = l.id and a.reversed_at is null and p.status = 'verified'), 0), 2)
  from public.fee_ledger l where l.id = p_ledger_id
$fn$;

create or replace function public._reverse_ledger(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $fn$
declare l public.fee_ledger;
begin
  select * into l from public.fee_ledger where id = p_id for update;
  if not found or l.reversed_at is not null then return; end if;
  update public.fee_ledger set reversed_at = now() where id = p_id;
  update public.payment_allocations set reversed_at = now() where ledger_id = p_id and reversed_at is null;   -- money becomes credit again
  insert into public.fee_ledger (student_id, enrollment_id, class_id, session_id, entry_type, amount, description, entry_date, reversal_of, created_by)
  values (l.student_id, l.enrollment_id, l.class_id, l.session_id, 'reversal', -l.amount, 'Reversal: ' || coalesce(p_reason, l.description), public.lk_today(), l.id, auth.uid());
end $fn$;

-- Allocate a verified payment to the oldest open charges (FIFO). Any remainder stays as credit.
create or replace function public._allocate(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare p public.payments; rem numeric; c record; open_amt numeric; amt numeric;
begin
  select * into p from public.payments where id = p_payment_id;
  rem := round(p.amount - coalesce((select sum(amount) from public.payment_allocations where payment_id = p.id and reversed_at is null), 0), 2);
  for c in select * from public.fee_ledger
           where student_id = p.student_id and amount > 0 and reversed_at is null and entry_type in ('session_charge','admission_fee','adjustment')
           order by entry_date, created_at loop
    exit when rem <= 0;
    open_amt := public._open_amount(c.id);
    continue when open_amt <= 0;
    amt := round(least(rem, open_amt), 2);
    insert into public.payment_allocations (payment_id, ledger_id, student_id, enrollment_id, class_id, amount)
    values (p.id, c.id, c.student_id, c.enrollment_id, c.class_id, amt);
    rem := round(rem - amt, 2);
  end loop;
end $fn$;

create or replace function public._issue_receipt(p_payment_id uuid) returns public.receipts
language plpgsql security definer set search_path = public as $fn$
declare p public.payments; r public.receipts; y text := to_char(public.lk_today(), 'YYYY');
begin
  select * into p from public.payments where id = p_payment_id;
  if p.status <> 'verified' then raise exception 'Receipts are issued only for verified payments.'; end if;
  insert into public.receipts (receipt_no, payment_id, student_id, amount, issued_by)
  values ('MR-' || y || '-' || lpad(public.next_serial('RCPT-' || y)::text, 6, '0'), p.id, p.student_id, p.amount, auth.uid())
  returning * into r;
  return r;
end $fn$;

create or replace function public._charge_admission_fee(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare e public.enrollments; fee jsonb := public._setting('admission_fee'); amt numeric;
begin
  select * into e from public.enrollments where id = p_enrollment_id for update;
  if not coalesce((fee->>'enabled')::boolean, false) or e.admission_fee_waived or e.admission_fee_charged then return; end if;
  amt := coalesce((fee->>'amount')::numeric, 0);
  if amt <= 0 then return; end if;
  insert into public.fee_ledger (student_id, enrollment_id, class_id, entry_type, amount, description, created_by)
  values (e.student_id, e.id, e.class_id, 'admission_fee', amt, 'Admission fee — ' || e.enrollment_code, auth.uid());
  update public.enrollments set admission_fee_required = true, admission_fee_amount = amt, admission_fee_charged = true where id = e.id;
end $fn$;

create or replace function public._payment_status(p_enrollment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare charges numeric; paid numeric; pct numeric; required numeric;
begin
  select coalesce(round(sum(amount), 2), 0) into charges from public.fee_ledger where enrollment_id = p_enrollment_id;
  select coalesce(round(sum(a.amount), 2), 0) into paid
    from public.payment_allocations a join public.payments p on p.id = a.payment_id join public.fee_ledger l on l.id = a.ledger_id
    where l.enrollment_id = p_enrollment_id and l.amount > 0 and a.reversed_at is null and p.status = 'verified';
  pct := coalesce((public._setting('billing')->>'min_payment_percent')::numeric, 100);
  required := round(greatest(charges, 0) * pct / 100, 2);
  return jsonb_build_object('charges', charges, 'paid', paid, 'required', required, 'min_payment_percent', pct, 'satisfied', paid >= required);
end $fn$;

create or replace function public._recount_trials(p_enrollment_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $fn$
declare lim integer := coalesce((public._setting('trial')->>'sessions')::integer, 2); e record; cnt integer;
begin
  for e in select * from public.enrollments where id = any(p_enrollment_ids) and status in ('trial','trial_completed') loop
    select count(*) into cnt from public.attendance where enrollment_id = e.id and is_trial and status = 'trial';
    update public.enrollments set trial_sessions_used = cnt,
      status = case when e.status = 'trial' and cnt >= lim then 'trial_completed'
                    when e.status = 'trial_completed' and cnt < lim then 'trial' else e.status end
    where id = e.id;
  end loop;
end $fn$;

-- Enrolment code: M + subject code + mode (P/O/H) + medium (E/T/S) + '-' + serial per prefix → MMPE-001
create or replace function public._new_enrollment(p_student_id uuid, p_class_id uuid, p_as_trial boolean) returns public.enrollments
language plpgsql security definer set search_path = public as $fn$
declare c public.classes; s public.subjects; prefix text; e public.enrollments;
begin
  select * into c from public.classes where id = p_class_id;
  if not found then raise exception 'Class not found.'; end if;
  if not exists (select 1 from public.students where id = p_student_id) then raise exception 'Student not found.'; end if;
  if p_as_trial and not c.trial_enabled then raise exception 'Free trial is not enabled for this class.'; end if;
  if exists (select 1 from public.enrollments where student_id = p_student_id and class_id = p_class_id and status not in ('withdrawn','rejected')) then
    raise exception 'This student already has an active enrolment in this class.';
  end if;
  select * into s from public.subjects where id = c.subject_id;
  prefix := 'M' || s.code || case c.class_mode when 'online' then 'O' when 'hybrid' then 'H' else 'P' end
                          || case c.medium when 'tamil' then 'T' when 'sinhala' then 'S' else 'E' end;
  insert into public.enrollments (enrollment_code, student_id, class_id, status, admission_requested_at)
  values (prefix || '-' || lpad(public.next_serial('ENR-' || prefix)::text, 3, '0'), p_student_id, p_class_id,
          case when p_as_trial then 'trial' else 'admission_requested' end, case when p_as_trial then null else now() end)
  returning * into e;
  if not p_as_trial then perform public._charge_admission_fee(e.id); select * into e from public.enrollments where id = e.id; end if;
  perform public._audit('create_enrollment', 'enrollments', e.id::text, jsonb_build_object('code', e.enrollment_code, 'as_trial', p_as_trial));
  return e;
end $fn$;
