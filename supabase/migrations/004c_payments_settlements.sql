-- =====================================================================
-- Mentora — 004 FUNCTIONS, PART 3 of 4 — payments, receipts, statements, cash, teacher settlements, dashboard
-- Run the four 004 files in order: 004a → 004b → 004c → 004d.
-- HOW: open a NEW query tab in Supabase SQL Editor (it must be empty),
--      paste THIS WHOLE FILE, make sure nothing is highlighted, click Run.
-- Safe to run again: every function uses "create or replace".
-- Function bodies use NAMED dollar quotes (dollar-fn-dollar) so a copy/paste
-- slip can't silently run two functions together.
-- =====================================================================
-- =====================================================================
-- PAYMENTS  (only VERIFIED payments count; receipts only after verification)
-- =====================================================================
create or replace function public._payment_ref() returns text
language sql security definer set search_path = public as $fn$
  select 'MP-' || to_char(public.lk_today(), 'YYMM') || '-' || lpad(public.next_serial('PAY-' || to_char(public.lk_today(), 'YYMM'))::text, 4, '0')
$fn$;

create or replace function public.create_bank_payment(p_amount numeric, p_student_id uuid default null, p_note text default null, p_paid_on date default null) returns public.payments
language plpgsql security definer set search_path = public as $fn$
declare v_sid uuid; p public.payments; amt numeric := round(p_amount, 2);
begin
  v_sid := case when public.is_staff() and p_student_id is not null then p_student_id else public.my_student_id() end;
  if v_sid is null then raise exception 'Student account not linked.'; end if;
  if not (amt > 0 and amt < 1000000) then raise exception 'Enter a valid amount.'; end if;
  perform public._rate_limit('bank_payment', v_sid::text, 10, 60);
  insert into public.payments (payment_ref, student_id, method, amount, claimed_amount, paid_on, status, notes, created_by)
  values (public._payment_ref(), v_sid, 'bank_transfer', amt, amt, coalesce(p_paid_on, public.lk_today()), 'pending', left(public._nz(p_note), 300), auth.uid())
  returning * into p;
  perform public._audit('create_bank_payment', 'payments', p.id::text, jsonb_build_object('amount', amt));
  return p;   -- status 'pending' — it does NOT reduce the balance until an admin verifies it
end $fn$;

create or replace function public.mark_receipt_sent(p_payment_id uuid) returns public.payments
language plpgsql security definer set search_path = public as $fn$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if not (public.is_staff() or p.student_id = public.my_student_id()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p.status = 'pending' then update public.payments set status = 'receipt_sent', receipt_sent_at = now() where id = p.id returning * into p; end if;
  return p;   -- "receipt sent" is only a note for staff. It never grants paid access.
end $fn$;

create or replace function public.verify_payment(p_payment_id uuid, p_approve boolean, p_verified_amount numeric default null, p_bank_reference text default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare p public.payments; r public.receipts; amt numeric;
begin
  perform public._assert_admin();
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if p.status not in ('pending','receipt_sent') then raise exception 'This payment has already been processed.'; end if;
  if not p_approve then
    if public._nz(p_reason) is null then raise exception 'A reason is required to reject a payment.'; end if;
    update public.payments set status = 'rejected', rejection_reason = p_reason, verified_by = auth.uid(), verified_at = now() where id = p.id returning * into p;
    perform public._audit('reject_payment', 'payments', p.id::text, jsonb_build_object('reason', p_reason));
    return jsonb_build_object('payment', to_jsonb(p));
  end if;
  amt := round(coalesce(p_verified_amount, p.amount), 2);
  if not (amt > 0) then raise exception 'Verified amount must be greater than zero.'; end if;
  if public._nz(p_bank_reference) is null then raise exception 'Enter the bank transaction reference you verified.'; end if;
  update public.payments set status = 'verified', amount = amt, bank_reference = p_bank_reference, verified_by = auth.uid(), verified_at = now()
  where id = p.id returning * into p;
  perform public._allocate(p.id);
  r := public._issue_receipt(p.id);
  perform public._audit('verify_payment', 'payments', p.id::text, jsonb_build_object('amount', amt, 'receipt', r.receipt_no));
  return jsonb_build_object('payment', to_jsonb(p), 'receipt', to_jsonb(r));
end $fn$;

create or replace function public.record_cash_payment(p_student_id uuid, p_amount numeric, p_paid_on date default null, p_method text default 'cash',
  p_collector_name text default null, p_notes text default null, p_client_uuid uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare p public.payments; r public.receipts; amt numeric := round(p_amount, 2); m text := coalesce(p_method, 'cash'); v_me text;
begin
  perform public._assert_staff();
  if p_client_uuid is not null then
    select * into p from public.payments where client_uuid = p_client_uuid;
    if found then
      select * into r from public.receipts where payment_id = p.id;
      return jsonb_build_object('payment', to_jsonb(p), 'receipt', to_jsonb(r), 'duplicate', true);
    end if;
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then raise exception 'Student not found.'; end if;
  if not (amt > 0 and amt < 1000000) then raise exception 'Enter a valid amount.'; end if;
  if m not in ('cash','representative_cash') then raise exception 'Invalid cash method.'; end if;
  if m = 'representative_cash' and public._nz(p_collector_name) is null then raise exception 'Enter the authorised representative''s name.'; end if;
  select full_name into v_me from public.profiles where id = auth.uid();
  insert into public.payments (payment_ref, student_id, method, amount, claimed_amount, paid_on, status, collected_by, collector_name, notes, client_uuid, verified_by, verified_at, created_by)
  values (public._payment_ref(), p_student_id, m, amt, amt, coalesce(p_paid_on, public.lk_today()), 'verified', auth.uid(), coalesce(public._nz(p_collector_name), v_me),
          left(public._nz(p_notes), 300), p_client_uuid, auth.uid(), now(), auth.uid())
  returning * into p;
  perform public._allocate(p.id);
  r := public._issue_receipt(p.id);
  perform public._audit('record_cash_payment', 'payments', p.id::text, jsonb_build_object('amount', amt, 'receipt', r.receipt_no, 'method', m));
  return jsonb_build_object('payment', to_jsonb(p), 'receipt', to_jsonb(r));
end $fn$;

create or replace function public.reverse_payment(p_payment_id uuid, p_reason text) returns public.payments
language plpgsql security definer set search_path = public as $fn$
declare p public.payments;
begin
  perform public._assert_admin();
  if public._nz(p_reason) is null then raise exception 'A reason is required to reverse a payment.'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if p.status <> 'verified' then raise exception 'Only verified payments can be reversed.'; end if;
  update public.payments set status = 'reversed' where id = p.id returning * into p;
  update public.payment_allocations set reversed_at = now() where payment_id = p.id and reversed_at is null;
  update public.receipts set is_void = true, void_reason = p_reason where payment_id = p.id;
  insert into public.payment_reversals (payment_id, reason, reversed_by) values (p.id, p_reason, auth.uid());
  perform public._audit('reverse_payment', 'payments', p.id::text, jsonb_build_object('reason', p_reason, 'amount', p.amount));
  return p;
end $fn$;

create or replace function public.add_ledger_adjustment(p_student_id uuid, p_amount numeric, p_description text, p_enrollment_id uuid default null) returns public.fee_ledger
language plpgsql security definer set search_path = public as $fn$
declare l public.fee_ledger; e public.enrollments; amt numeric := round(p_amount, 2);
begin
  perform public._assert_admin();
  if amt = 0 or amt is null then raise exception 'Amount cannot be zero.'; end if;
  if public._nz(p_description) is null then raise exception 'Description is required.'; end if;
  if p_enrollment_id is not null then select * into e from public.enrollments where id = p_enrollment_id and student_id = p_student_id; end if;
  insert into public.fee_ledger (student_id, enrollment_id, class_id, entry_type, amount, description, created_by)
  values (p_student_id, e.id, e.class_id, 'adjustment', amt, p_description, auth.uid()) returning * into l;
  perform public._audit('add_ledger_adjustment', 'fee_ledger', l.id::text, jsonb_build_object('amount', amt, 'description', p_description));
  return l;
end $fn$;

create or replace function public.get_student_statement(p_student_id uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v_start date := date_trunc('month', p_month)::date; v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  opening numeric; charges jsonb; pays jsonb; tc numeric; tp numeric; adm numeric;
begin
  if not (public.is_staff() or p_student_id = public.my_student_id()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select coalesce((select sum(amount) from public.fee_ledger where student_id = p_student_id and entry_date < v_start), 0)
       - coalesce((select sum(amount) from public.payments where student_id = p_student_id and status = 'verified' and paid_on < v_start), 0) into opening;
  select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object('enrollment_code', e.enrollment_code) order by l.entry_date, l.created_at), '[]'::jsonb),
         coalesce(sum(l.amount), 0), coalesce(sum(l.amount) filter (where l.entry_type = 'admission_fee'), 0)
    into charges, tc, adm
    from public.fee_ledger l left join public.enrollments e on e.id = l.enrollment_id
    where l.student_id = p_student_id and l.entry_date >= v_start and l.entry_date < v_end;
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('receipt_no', r.receipt_no) order by p.paid_on), '[]'::jsonb), coalesce(sum(p.amount), 0)
    into pays, tp
    from public.payments p left join public.receipts r on r.payment_id = p.id
    where p.student_id = p_student_id and p.status = 'verified' and p.paid_on >= v_start and p.paid_on < v_end;
  return jsonb_build_object('month', v_start, 'opening_balance', round(opening, 2), 'charges', charges, 'payments', pays,
    'total_charges', round(tc, 2), 'total_paid', round(tp, 2), 'closing_balance', round(opening + tc - tp, 2), 'admission_fees', round(adm, 2));
end $fn$;

create or replace function public.save_cash_reconciliation(p_date date, p_collector_id uuid default null, p_counted numeric default 0, p_notes text default null) returns public.cash_reconciliations
language plpgsql security definer set search_path = public as $fn$
declare expected numeric; r public.cash_reconciliations; v_name text;
begin
  perform public._assert_staff();
  select coalesce(round(sum(amount), 2), 0) into expected from public.payments
   where method in ('cash','representative_cash') and status = 'verified' and paid_on = p_date and (p_collector_id is null or collected_by = p_collector_id);
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.cash_reconciliations (reconciliation_date, collector_id, collector_name, expected_amount, counted_amount, difference, notes, reconciled_by)
  values (p_date, p_collector_id, v_name, expected, round(p_counted, 2), round(p_counted - expected, 2), public._nz(p_notes), auth.uid()) returning * into r;
  perform public._audit('save_cash_reconciliation', 'cash_reconciliations', r.id::text, jsonb_build_object('expected', expected, 'counted', p_counted));
  return r;
end $fn$;

-- =====================================================================
-- TEACHER SETTLEMENTS
-- Commission: intro_rate (0%) in the teacher's FIRST eligible month for the first N (20) eligible students,
-- then standard_rate (5%) of eligible COLLECTED class revenue. Admission fees & refunds excluded.
-- WHT (statutory) is separate and only applied when enabled in Settings (confirm with an accountant).
-- =====================================================================
create or replace function public.generate_settlement(p_teacher_id uuid, p_month date, p_adjustments numeric default 0, p_notes text default null) returns public.teacher_settlements
language plpgsql security definer set search_path = public as $fn$
declare t public.teachers; v_start date := date_trunc('month', p_month)::date; ex public.teacher_settlements; s public.teacher_settlements;
  cm jsonb := public._setting('commission'); tx jsonb := public._setting('tax');
  v_first date; v_is_first boolean; v_cap int; v_intro uuid[] := '{}'; v_intro_rate numeric; v_std_rate numeric;
  v_lines jsonb; v_gross numeric; v_comm numeric; v_adj numeric := round(coalesce(p_adjustments, 0), 2); v_before numeric; v_wht numeric := 0;
begin
  perform public._assert_admin();
  select * into t from public.teachers where id = p_teacher_id;
  if not found then raise exception 'Teacher not found.'; end if;
  select * into ex from public.teacher_settlements where teacher_id = t.id and period_month = v_start for update;
  if found and ex.status <> 'draft' then raise exception 'This settlement is already approved. It cannot be recalculated.'; end if;
  v_cap := coalesce((cm->>'intro_student_cap')::int, 20);
  v_intro_rate := coalesce((cm->>'intro_rate')::numeric, 0);
  v_std_rate := coalesce((cm->>'standard_rate')::numeric, 5);

  drop table if exists _lines;
  create temp table _lines on commit drop as
    select date_trunc('month', p.verified_at at time zone 'Asia/Colombo')::date as month, a.student_id, l.class_id,
           round(a.amount * ct.allocation_percent / 100, 2) as share
    from public.payment_allocations a
    join public.payments p on p.id = a.payment_id and p.status = 'verified'
    join public.fee_ledger l on l.id = a.ledger_id and l.entry_type = 'session_charge'      -- class revenue only (no admission fees)
    join public.class_teachers ct on ct.class_id = l.class_id and ct.teacher_id = t.id
    where a.reversed_at is null;                                                             -- reversed/refunded money excluded

  v_first := coalesce(t.first_eligible_month, (select min(month) from _lines));
  if t.first_eligible_month is null and v_first is not null then update public.teachers set first_eligible_month = v_first where id = t.id; end if;
  v_is_first := v_first = v_start;
  if v_is_first then
    select coalesce(array_agg(student_id), '{}') into v_intro from (
      select e.student_id from public.enrollments e join public.class_teachers ct on ct.class_id = e.class_id and ct.teacher_id = t.id
      where e.approved_at is not null group by e.student_id order by min(e.approved_at) limit v_cap) z;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', class_id, 'student_id', student_id, 'revenue', revenue, 'rate', rate,
           'commission', round(revenue * rate / 100, 2), 'class_code', class_code, 'student_code', student_code)), '[]'::jsonb),
         coalesce(sum(revenue), 0), coalesce(sum(round(revenue * rate / 100, 2)), 0)
    into v_lines, v_gross, v_comm
  from (select x.class_id, x.student_id, round(sum(x.share), 2) as revenue,
               case when v_is_first and x.student_id = any(v_intro) then v_intro_rate else v_std_rate end as rate,
               c.title_en as class_code, st.student_code
        from _lines x join public.classes c on c.id = x.class_id join public.students st on st.id = x.student_id
        where x.month = v_start group by x.class_id, x.student_id, c.title_en, st.student_code) g;

  v_before := round(v_gross + v_adj - v_comm, 2);
  if coalesce((tx->>'wht_enabled')::boolean, false) and v_before > coalesce((tx->>'wht_threshold')::numeric, 100000) then
    v_wht := round(v_before * coalesce((tx->>'wht_rate')::numeric, 5) / 100, 2);
  end if;

  insert into public.teacher_settlements (teacher_id, period_month, gross_revenue, adjustments, commission_amount, statutory_deductions, net_payable, status, notes, details, created_by)
  values (t.id, v_start, v_gross, v_adj, v_comm, v_wht, round(v_before - v_wht, 2), 'draft', coalesce(public._nz(p_notes), ex.notes),
          jsonb_build_object('is_first_eligible_month', v_is_first, 'first_eligible_month', v_first, 'intro_students', coalesce(array_length(v_intro, 1), 0),
                             'lines', v_lines, 'commission_settings', cm, 'tax_settings', tx), auth.uid())
  on conflict (teacher_id, period_month) do update set gross_revenue = excluded.gross_revenue, adjustments = excluded.adjustments,
    commission_amount = excluded.commission_amount, statutory_deductions = excluded.statutory_deductions, net_payable = excluded.net_payable,
    notes = excluded.notes, details = excluded.details
  returning * into s;
  drop table if exists _lines;
  perform public._audit('generate_settlement', 'teacher_settlements', s.id::text, jsonb_build_object('gross', v_gross, 'commission', v_comm, 'wht', v_wht));
  return s;
end $fn$;

create or replace function public.update_settlement_status(p_settlement_id uuid, p_status text, p_bank_reference text default null, p_settlement_date date default null) returns public.teacher_settlements
language plpgsql security definer set search_path = public as $fn$
declare s public.teacher_settlements;
begin
  perform public._assert_admin();
  select * into s from public.teacher_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Settlement not found.'; end if;
  if p_status = 'approved' and s.status <> 'draft' then raise exception 'Only draft settlements can be approved.'; end if;
  if p_status = 'paid' then
    if s.status <> 'approved' then raise exception 'Approve the settlement before marking it paid.'; end if;
    if public._nz(p_bank_reference) is null then raise exception 'Enter the bank transfer reference.'; end if;
  end if;
  if p_status not in ('approved','paid') then raise exception 'Invalid status.'; end if;
  update public.teacher_settlements set status = p_status,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    bank_reference = coalesce(public._nz(p_bank_reference), bank_reference),
    settlement_date = case when p_status = 'paid' then coalesce(p_settlement_date, public.lk_today()) else settlement_date end
  where id = s.id returning * into s;
  perform public._audit('update_settlement_status', 'teacher_settlements', s.id::text, jsonb_build_object('status', p_status, 'bank_reference', p_bank_reference));
  return s;
end $fn$;

-- =====================================================================
-- ADMIN DASHBOARD
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
    'outstanding_total', round((select coalesce(sum(amount), 0) from public.fee_ledger) - (select coalesce(sum(amount), 0) from public.payments where status = 'verified'), 2)
  );
end $fn$;
