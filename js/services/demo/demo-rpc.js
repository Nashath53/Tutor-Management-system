/**
 * DEMO versions of the PostgreSQL functions in supabase/migrations/004a–004d_*.sql.
 * Same names, same arguments, same business rules — so the UI can be tested offline.
 */
import { uuid } from '../../utils/ids.js';
const pad = (n, w) => (String(n).length >= w ? String(n) : String(n).padStart(w, '0'));

const fail = (msg) => { throw new Error(msg); };
const now = () => new Date().toISOString();
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const PHONE = /^94\d{9}$/;

export function createDemoRpc(db, ctx) {
  const T = db.t;
  const setting = (k) => (T.app_settings.find((r) => r.key === k) || {}).value || {};
  const me = () => ctx.profile();
  const isAdmin = () => me()?.role === 'admin';
  const isStaff = () => ['admin', 'cashier'].includes(me()?.role);
  const assertAdmin = () => { if (!isAdmin()) fail('Only administrators can do this.'); };
  const assertStaff = () => { if (!isStaff()) fail('Only staff members can do this.'); };
  const myStudentId = () => me()?.student_id || null;
  const audit = (action, table, id, details = {}) => db.insert('audit_log', { id: uuid(), actor_id: me()?.id || null, action, table_name: table, record_id: id, details });

  const rateLimit = (bucket, key, max, minutes) => {
    const since = Date.now() - minutes * 60000;
    const hits = T.rate_limits.filter((r) => r.bucket === bucket && r.key === key && Date.parse(r.created_at) > since).length;
    if (hits >= max) fail('Too many submissions. Please try again later.');
    db.insert('rate_limits', { bucket, key });
  };

  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  // ---------- ledger helpers ----------
  const activeAllocations = (ledgerId) => T.payment_allocations.filter((a) => a.ledger_id === ledgerId && !a.reversed_at && db.find('payments', a.payment_id)?.status === 'verified');
  const openAmount = (l) => round2(Number(l.amount) - activeAllocations(l.id).reduce((s, a) => s + Number(a.amount), 0));

  function reverseLedger(id, reason) {
    const l = db.find('fee_ledger', id);
    if (!l || l.reversed_at) return null;
    l.reversed_at = now();
    T.payment_allocations.filter((a) => a.ledger_id === id && !a.reversed_at).forEach((a) => { a.reversed_at = now(); });
    return db.insert('fee_ledger', {
      student_id: l.student_id, enrollment_id: l.enrollment_id, class_id: l.class_id, session_id: l.session_id,
      entry_type: 'reversal', amount: -Number(l.amount), description: `Reversal: ${reason || l.description}`,
      entry_date: today(), reversal_of: l.id, created_by: me()?.id
    });
  }

  function allocate(payment) {
    let rem = round2(Number(payment.amount) - T.payment_allocations.filter((a) => a.payment_id === payment.id && !a.reversed_at).reduce((s, a) => s + Number(a.amount), 0));
    const charges = T.fee_ledger
      .filter((l) => l.student_id === payment.student_id && Number(l.amount) > 0 && !l.reversed_at && ['session_charge', 'admission_fee', 'adjustment'].includes(l.entry_type))
      .sort((a, b) => (a.entry_date + a.created_at).localeCompare(b.entry_date + b.created_at));
    for (const c of charges) {
      if (rem <= 0) break;
      const open = openAmount(c);
      if (open <= 0) continue;
      const amt = round2(Math.min(rem, open));
      db.insert('payment_allocations', { payment_id: payment.id, ledger_id: c.id, student_id: c.student_id, enrollment_id: c.enrollment_id, class_id: c.class_id, amount: amt });
      rem = round2(rem - amt);
    }
  }

  function issueReceipt(payment) {
    const y = new Date().getFullYear();
    return db.insert('receipts', {
      receipt_no: `MR-${y}-${pad(db.nextSerial('RCPT-' + y), 6)}`,
      payment_id: payment.id, student_id: payment.student_id, amount: payment.amount,
      issued_by: me()?.id, issued_at: now(), is_void: false
    });
  }

  function chargeAdmissionFee(e) {
    const fee = setting('admission_fee');
    if (!fee.enabled || e.admission_fee_waived || e.admission_fee_charged) return;
    const amount = Number(fee.amount || 0);
    if (amount <= 0) return;
    db.insert('fee_ledger', { student_id: e.student_id, enrollment_id: e.id, class_id: e.class_id, entry_type: 'admission_fee', amount, description: `Admission fee — ${e.enrollment_code}`, entry_date: today(), created_by: me()?.id });
    Object.assign(e, { admission_fee_required: true, admission_fee_amount: amount, admission_fee_charged: true });
  }

  function paymentStatus(e) {
    const ledger = T.fee_ledger.filter((l) => l.enrollment_id === e.id);
    const charges = round2(ledger.reduce((s, l) => s + Number(l.amount), 0));
    const paid = round2(ledger.filter((l) => l.amount > 0).reduce((s, l) => s + activeAllocations(l.id).reduce((x, a) => x + Number(a.amount), 0), 0));
    const pct = Number(setting('billing').min_payment_percent ?? 100);
    const required = round2(Math.max(charges, 0) * pct / 100);
    return { charges, paid, required, min_payment_percent: pct, satisfied: paid >= required };
  }

  function recountTrials(classId, enrollmentIds) {
    const limit = Number(setting('trial').sessions || 2);
    enrollmentIds.forEach((id) => {
      const e = db.find('enrollments', id);
      if (!e || !['trial', 'trial_completed'].includes(e.status)) return;
      const cnt = T.attendance.filter((a) => a.enrollment_id === id && a.class_id === classId && a.is_trial && a.status === 'trial').length;
      e.trial_sessions_used = cnt;
      if (e.status === 'trial' && cnt >= limit) e.status = 'trial_completed';
      else if (e.status === 'trial_completed' && cnt < limit) e.status = 'trial';
    });
  }

  function newEnrollment(studentId, classId, asTrial) {
    const c = db.find('classes', classId) || fail('Class not found.');
    if (!db.find('students', studentId)) fail('Student not found.');
    if (asTrial && !c.trial_enabled) fail('Free trial is not enabled for this class.');
    if (T.enrollments.some((e) => e.student_id === studentId && e.class_id === classId && !['withdrawn', 'rejected'].includes(e.status))) fail('This student already has an active enrolment in this class.');
    const s = db.find('subjects', c.subject_id);
    const prefix = 'M' + s.code + ({ online: 'O', hybrid: 'H' }[c.class_mode] || 'P') + ({ tamil: 'T', sinhala: 'S' }[c.medium] || 'E');
    const code = `${prefix}-${pad(db.nextSerial('ENR-' + prefix), 3)}`;
    const e = db.insert('enrollments', {
      enrollment_code: code, student_id: studentId, class_id: classId,
      status: asTrial ? 'trial' : 'admission_requested', trial_sessions_used: 0,
      admission_fee_required: false, admission_fee_amount: 0, admission_fee_waived: false, admission_fee_charged: false,
      admission_requested_at: asTrial ? null : now()
    });
    if (!asTrial) chargeAdmissionFee(e);
    audit('create_enrollment', 'enrollments', e.id, { code, as_trial: !!asTrial });
    return e;
  }

  return {
    // ---------------- Public ----------------
    submit_student_enquiry({ p }) {
      const name = String(p.student_name || '').trim();
      if (name.length < 2) fail('Student name is required.');
      if (!PHONE.test(p.phone || '')) fail('A valid Sri Lankan mobile number is required.');
      if (!p.consent) fail('Guardian/student consent is required.');
      rateLimit('enquiry', p.phone, 5, 60);
      const subject = p.subject_id ? db.find('subjects', p.subject_id) : null;
      const r = db.insert('student_enquiries', {
        student_name: name, guardian_name: p.guardian_name || null, phone: p.phone, whatsapp: p.whatsapp || null, email: p.email || null,
        subject_id: p.subject_id || null, subject_name: subject?.name_en || p.subject_name || null, class_id: p.class_id || null,
        grade: p.grade || null, medium: p.medium || null, class_mode: p.class_mode || null, class_type: p.class_type || null,
        preferred_join_date: p.preferred_join_date || null, requirements: p.requirements || null,
        referral_sources: arr(p.referral_sources), referral_note: p.referral_note || null, consent: true,
        language: p.language || 'en', status: 'new'
      });
      return { id: r.id };
    },

    submit_teacher_application({ p }) {
      if (String(p.full_name || '').trim().length < 2) fail('Full name is required.');
      if (!PHONE.test(p.phone || '')) fail('A valid Sri Lankan mobile number is required.');
      const ids = arr(p.subject_ids);
      if (!ids.length) fail('Select at least one subject.');
      rateLimit('teacher_app', p.phone, 3, 60);
      const r = db.insert('teacher_applications', {
        full_name: p.full_name.trim(), phone: p.phone, whatsapp: p.whatsapp || null, email: p.email || null, living_place: p.living_place || null,
        subject_ids: ids, subject_names: ids.map((id) => db.find('subjects', id)?.name_en).filter(Boolean).join(', '),
        grades: arr(p.grades), mediums: arr(p.mediums), class_types: arr(p.class_types), class_modes: arr(p.class_modes),
        qualifications: p.qualifications || '', experience_years: Number(p.experience_years || 0), experience_details: p.experience_details || null,
        available_days: arr(p.available_days), preferred_times: arr(p.preferred_times), additional_info: p.additional_info || null,
        cv_path: p.cv_path || null, certificate_paths: arr(p.certificate_paths), status: 'new'
      });
      return { id: r.id };
    },

    mark_whatsapp_opened({ p_kind, p_id }) {
      const table = p_kind === 'teacher' ? 'teacher_applications' : 'student_enquiries';
      const r = db.find(table, p_id);
      if (r && !r.whatsapp_opened_at) r.whatsapp_opened_at = now();
      return true;
    },

    get_public_teachers() {
      return T.teachers.filter((t) => t.is_public && t.status === 'active').map((t) => ({
        id: t.id, display_name: t.display_name || t.full_name, photo_url: t.photo_url, bio_en: t.bio_en, bio_ta: t.bio_ta,
        experience_years: t.experience_years, mediums: t.mediums || [], class_modes: t.class_modes || [],
        subjects: T.teacher_subjects.filter((x) => x.teacher_id === t.id).map((x) => { const s = db.find('subjects', x.subject_id); return s && { id: s.id, name_en: s.name_en, name_ta: s.name_ta, grades: x.grades }; }).filter(Boolean),
        qualifications: T.teacher_qualifications.filter((q) => q.teacher_id === t.id && q.is_verified && q.is_public !== false).map((q) => ({ title: q.title, institution: q.institution, year: q.year }))
      })).sort((a, b) => a.display_name.localeCompare(b.display_name));
    },

    get_public_classes() {
      return T.classes.filter((c) => c.is_public && c.is_active).map((c) => {
        const s = db.find('subjects', c.subject_id) || {};
        const teachers = T.class_teachers.filter((ct) => ct.class_id === c.id).map((ct) => db.find('teachers', ct.teacher_id)).filter((t) => t && t.is_public && t.status === 'active').map((t) => t.display_name || t.full_name);
        return {
          id: c.id, subject_id: c.subject_id, subject_code: s.code, subject_name_en: s.name_en, subject_name_ta: s.name_ta,
          title_en: c.title_en, title_ta: c.title_ta, grade: c.grade, medium: c.medium, class_mode: c.class_mode, class_type: c.class_type,
          schedule_en: c.schedule_en, schedule_ta: c.schedule_ta, location: c.location, rate_per_session: c.rate_per_session,
          trial_enabled: c.trial_enabled, trial_group_link: c.trial_enabled ? c.trial_group_link : null, teachers
        };
      });
    },

    // ---------------- Teachers ----------------
    approve_teacher_application({ p_application_id }) {
      assertAdmin();
      const a = db.find('teacher_applications', p_application_id) || fail('Application not found.');
      if (a.status === 'approved') fail('This application is already approved.');
      const t = db.insert('teachers', {
        full_name: a.full_name, display_name: a.full_name, phone: a.phone, whatsapp: a.whatsapp, email: a.email, living_place: a.living_place,
        experience_years: a.experience_years, experience_details: a.experience_details, mediums: a.mediums, class_modes: a.class_modes,
        is_public: false, status: 'active', application_id: a.id
      });
      a.subject_ids.forEach((sid) => db.insert('teacher_subjects', { teacher_id: t.id, subject_id: sid, grades: a.grades }));
      if (a.qualifications) db.insert('teacher_qualifications', { teacher_id: t.id, title: a.qualifications.slice(0, 200), is_verified: false, is_public: true });
      Object.assign(a, { status: 'approved', teacher_id: t.id, reviewed_at: now() });
      audit('approve_teacher_application', 'teacher_applications', a.id, { teacher_id: t.id });
      return t.id;
    },

    // ---------------- Enquiries / admissions ----------------
    convert_enquiry({ p_enquiry_id, p_class_id, p_as_trial }) {
      assertStaff();
      const q = db.find('student_enquiries', p_enquiry_id) || fail('Enquiry not found.');
      let studentId = q.student_id;
      if (!studentId) {
        const s = db.insert('students', {
          full_name: q.student_name, grade: q.grade, phone: q.phone, whatsapp: q.whatsapp, email: q.email,
          guardian_name: q.guardian_name, guardian_phone: q.phone, guardian_consent: !!q.consent, guardian_consent_at: q.consent ? q.created_at : null,
          referral_sources: q.referral_sources, referral_note: q.referral_note, status: 'active'
        });
        studentId = s.id;
      }
      const e = newEnrollment(studentId, p_class_id, p_as_trial);
      Object.assign(q, { student_id: studentId, status: p_as_trial ? 'trial' : 'converted' });
      return { student_id: studentId, enrollment_id: e.id, enrollment_code: e.enrollment_code };
    },

    create_enrollment({ p_student_id, p_class_id, p_as_trial }) {
      assertStaff();
      return newEnrollment(p_student_id, p_class_id, p_as_trial);
    },

    request_paid_admission({ p_enrollment_id }) {
      const e = db.find('enrollments', p_enrollment_id) || fail('Enrolment not found.');
      if (!(isStaff() || e.student_id === myStudentId())) fail('Not allowed.');
      if (!(e.status === 'trial_completed' || (e.status === 'trial' && isStaff()))) fail('Paid admission can be requested after completing the free trial sessions.');
      Object.assign(e, { status: 'admission_requested', admission_requested_at: now() });
      chargeAdmissionFee(e);
      audit('request_paid_admission', 'enrollments', e.id);
      return e;
    },

    waive_admission_fee({ p_enrollment_id, p_reason }) {
      assertAdmin();
      if (!String(p_reason || '').trim()) fail('A reason is required to waive the admission fee.');
      const e = db.find('enrollments', p_enrollment_id) || fail('Enrolment not found.');
      if (e.admission_fee_waived) fail('Admission fee is already waived.');
      const fee = T.fee_ledger.find((l) => l.enrollment_id === e.id && l.entry_type === 'admission_fee' && !l.reversed_at);
      if (fee) reverseLedger(fee.id, 'Admission fee waived: ' + p_reason);
      e.admission_fee_waived = true;
      audit('waive_admission_fee', 'enrollments', e.id, { reason: p_reason });
      return e;
    },

    enrollment_payment_status({ p_enrollment_id }) {
      const e = db.find('enrollments', p_enrollment_id) || fail('Enrolment not found.');
      if (!(isStaff() || e.student_id === myStudentId())) fail('Not allowed.');
      return paymentStatus(e);
    },

    approve_enrollment({ p_enrollment_id, p_paid_from, p_override, p_reason }) {
      assertAdmin();
      const e = db.find('enrollments', p_enrollment_id) || fail('Enrolment not found.');
      if (e.status !== 'admission_requested') fail('Only enrolments with a paid-admission request can be approved.');
      const ps = paymentStatus(e);
      if (!ps.satisfied && !p_override) fail(`Minimum payment not met: LKR ${ps.paid.toFixed(2)} verified of LKR ${ps.required.toFixed(2)} required.`);
      if (!ps.satisfied && !String(p_reason || '').trim()) fail('A reason is required to approve without the minimum payment.');
      Object.assign(e, { status: 'approved', approved_at: now(), approved_by: me()?.id, paid_from_date: p_paid_from || today(), approval_override_reason: ps.satisfied ? null : p_reason });
      audit('approve_enrollment', 'enrollments', e.id, { ...ps, override: !ps.satisfied });
      return e;
    },

    set_enrollment_status({ p_enrollment_id, p_status, p_reason }) {
      assertAdmin();
      const e = db.find('enrollments', p_enrollment_id) || fail('Enrolment not found.');
      const allowed = { suspended: ['approved'], withdrawn: ['trial', 'trial_completed', 'admission_requested', 'approved', 'suspended'], rejected: ['admission_requested', 'trial', 'trial_completed'], approved: ['suspended'] };
      if (!allowed[p_status]?.includes(e.status)) fail(`Cannot change status from ${e.status} to ${p_status}.`);
      e.status = p_status;
      e.notes = [e.notes, `${today()}: ${p_status}${p_reason ? ' — ' + p_reason : ''}`].filter(Boolean).join('\n');
      audit('set_enrollment_status', 'enrollments', e.id, { status: p_status, reason: p_reason });
      return e;
    },

    // ---------------- Attendance ----------------
    upsert_session({ p_class_id, p_session_date, p_topic }) {
      assertStaff();
      let s = T.class_sessions.find((x) => x.class_id === p_class_id && x.session_date === p_session_date);
      if (!s) s = db.insert('class_sessions', { class_id: p_class_id, session_date: p_session_date, topic: p_topic || null, status: 'scheduled', created_by: me()?.id });
      else if (p_topic && !s.topic) s.topic = p_topic;
      return s;
    },

    mark_attendance({ p_session_id, p_rows, p_client_uuid }) {
      assertStaff();
      if (p_client_uuid) {
        const b = db.find('attendance_batches', p_client_uuid);
        if (b) return { ...b.result, duplicate: true };
      }
      const ses = db.find('class_sessions', p_session_id) || fail('Session not found.');
      if (ses.status === 'cancelled') fail('This session was cancelled.');
      const cls = db.find('classes', ses.class_id);
      const billable = setting('billing').billable_statuses || ['present', 'late'];
      let saved = 0, charged = 0, reversed = 0, trial = 0;
      for (const r of p_rows) {
        const e = db.find('enrollments', r.enrollment_id);
        if (!e || e.class_id !== ses.class_id) fail('An enrolment does not belong to this class.');
        let status = r.status;
        if (!['present', 'late', 'absent', 'excused', 'trial'].includes(status)) fail('Invalid attendance status.');
        const isTrial = e.status === 'trial';
        if (isTrial && ['present', 'late', 'trial'].includes(status)) status = 'trial';
        else if (!isTrial && status === 'trial') status = 'present';
        let a = T.attendance.find((x) => x.session_id === ses.id && x.enrollment_id === e.id);
        if (a) Object.assign(a, { status, is_trial: isTrial, marked_by: me()?.id, marked_at: now() });
        else a = db.insert('attendance', { session_id: ses.id, enrollment_id: e.id, student_id: e.student_id, class_id: e.class_id, status, is_trial: isTrial, marked_by: me()?.id, marked_at: now() });
        saved++;
        if (isTrial && status === 'trial') trial++;
        const charge = T.fee_ledger.find((l) => l.enrollment_id === e.id && l.session_id === ses.id && l.entry_type === 'session_charge' && !l.reversed_at);
        const shouldCharge = e.status === 'approved' && ses.session_date >= (e.paid_from_date || ses.session_date) && billable.includes(status) && !isTrial && Number(cls.rate_per_session) > 0;
        if (shouldCharge && !charge) {
          db.insert('fee_ledger', { student_id: e.student_id, enrollment_id: e.id, class_id: e.class_id, session_id: ses.id, attendance_id: a.id, entry_type: 'session_charge', amount: Number(cls.rate_per_session), description: `Session ${ses.session_date} — ${e.enrollment_code}`, entry_date: ses.session_date, created_by: me()?.id });
          charged++;
        } else if (!shouldCharge && charge) {
          reverseLedger(charge.id, `Attendance changed to ${status}`);
          reversed++;
        }
      }
      recountTrials(ses.class_id, p_rows.map((r) => r.enrollment_id));
      if (ses.status === 'scheduled') ses.status = 'held';
      const result = { saved, charged, reversed, trial };
      if (p_client_uuid) db.insert('attendance_batches', { client_uuid: p_client_uuid, session_id: ses.id, result, created_by: me()?.id });
      audit('mark_attendance', 'class_sessions', ses.id, result);
      return result;
    },

    cancel_session({ p_session_id, p_reason }) {
      assertStaff();
      const ses = db.find('class_sessions', p_session_id) || fail('Session not found.');
      if (ses.status === 'cancelled') fail('Session is already cancelled.');
      Object.assign(ses, { status: 'cancelled', cancel_reason: p_reason || null });
      let reversed = 0;
      T.fee_ledger.filter((l) => l.session_id === ses.id && l.entry_type === 'session_charge' && !l.reversed_at).forEach((l) => { reverseLedger(l.id, 'Session cancelled'); reversed++; });
      const ids = [];
      T.attendance.filter((a) => a.session_id === ses.id).forEach((a) => { a.status = 'cancelled'; ids.push(a.enrollment_id); });
      recountTrials(ses.class_id, ids);
      audit('cancel_session', 'class_sessions', ses.id, { reason: p_reason, reversed });
      return { reversed };
    },

    // ---------------- Payments ----------------
    create_bank_payment({ p_amount, p_student_id, p_note, p_paid_on }) {
      const studentId = isStaff() && p_student_id ? p_student_id : myStudentId();
      if (!studentId) fail('Student account not linked.');
      const amount = round2(p_amount);
      if (!(amount > 0 && amount < 1000000)) fail('Enter a valid amount.');
      const yymm = today().slice(2, 7).replace('-', '');
      const p = db.insert('payments', {
        payment_ref: `MP-${yymm}-${pad(db.nextSerial('PAY-' + yymm), 4)}`, student_id: studentId, method: 'bank_transfer',
        amount, claimed_amount: amount, paid_on: p_paid_on || today(), status: 'pending', notes: p_note || null, created_by: me()?.id
      });
      audit('create_bank_payment', 'payments', p.id, { amount });
      return p;
    },

    mark_receipt_sent({ p_payment_id }) {
      const p = db.find('payments', p_payment_id) || fail('Payment not found.');
      if (!(isStaff() || p.student_id === myStudentId())) fail('Not allowed.');
      if (p.status === 'pending') Object.assign(p, { status: 'receipt_sent', receipt_sent_at: now() });
      return p;
    },

    verify_payment({ p_payment_id, p_approve, p_verified_amount, p_bank_reference, p_reason }) {
      assertAdmin();
      const p = db.find('payments', p_payment_id) || fail('Payment not found.');
      if (!['pending', 'receipt_sent'].includes(p.status)) fail('This payment has already been processed.');
      if (!p_approve) {
        if (!String(p_reason || '').trim()) fail('A reason is required to reject a payment.');
        Object.assign(p, { status: 'rejected', rejection_reason: p_reason, verified_by: me()?.id, verified_at: now() });
        audit('reject_payment', 'payments', p.id, { reason: p_reason });
        return { payment: p };
      }
      const amount = round2(p_verified_amount ?? p.amount);
      if (!(amount > 0)) fail('Verified amount must be greater than zero.');
      if (!String(p_bank_reference || '').trim()) fail('Enter the bank transaction reference you verified.');
      Object.assign(p, { status: 'verified', amount, bank_reference: p_bank_reference, verified_by: me()?.id, verified_at: now() });
      allocate(p);
      const receipt = issueReceipt(p);
      audit('verify_payment', 'payments', p.id, { amount, receipt: receipt.receipt_no });
      return { payment: p, receipt };
    },

    record_cash_payment({ p_student_id, p_amount, p_paid_on, p_method, p_collector_name, p_notes, p_client_uuid }) {
      assertStaff();
      if (p_client_uuid) {
        const existing = T.payments.find((x) => x.client_uuid === p_client_uuid);
        if (existing) return { payment: existing, receipt: T.receipts.find((r) => r.payment_id === existing.id), duplicate: true };
      }
      if (!db.find('students', p_student_id)) fail('Student not found.');
      const amount = round2(p_amount);
      if (!(amount > 0 && amount < 1000000)) fail('Enter a valid amount.');
      const method = p_method || 'cash';
      if (!['cash', 'representative_cash'].includes(method)) fail('Invalid cash method.');
      if (method === 'representative_cash' && !String(p_collector_name || '').trim()) fail('Enter the authorised representative’s name.');
      const yymm = today().slice(2, 7).replace('-', '');
      const p = db.insert('payments', {
        payment_ref: `MP-${yymm}-${pad(db.nextSerial('PAY-' + yymm), 4)}`, student_id: p_student_id, method, amount, claimed_amount: amount,
        paid_on: p_paid_on || today(), status: 'verified', collected_by: me()?.id, collector_name: p_collector_name || me()?.full_name,
        notes: p_notes || null, client_uuid: p_client_uuid || null, verified_by: me()?.id, verified_at: now(), created_by: me()?.id
      });
      allocate(p);
      const receipt = issueReceipt(p);
      audit('record_cash_payment', 'payments', p.id, { amount, receipt: receipt.receipt_no });
      return { payment: p, receipt };
    },

    reverse_payment({ p_payment_id, p_reason }) {
      assertAdmin();
      if (!String(p_reason || '').trim()) fail('A reason is required to reverse a payment.');
      const p = db.find('payments', p_payment_id) || fail('Payment not found.');
      if (p.status !== 'verified') fail('Only verified payments can be reversed.');
      p.status = 'reversed';
      T.payment_allocations.filter((a) => a.payment_id === p.id && !a.reversed_at).forEach((a) => { a.reversed_at = now(); });
      const r = T.receipts.find((x) => x.payment_id === p.id);
      if (r) Object.assign(r, { is_void: true, void_reason: p_reason });
      db.insert('payment_reversals', { payment_id: p.id, reason: p_reason, reversed_by: me()?.id });
      audit('reverse_payment', 'payments', p.id, { reason: p_reason });
      return p;
    },

    add_ledger_adjustment({ p_student_id, p_amount, p_description, p_enrollment_id }) {
      assertAdmin();
      const amount = round2(p_amount);
      if (!amount) fail('Amount cannot be zero.');
      if (!String(p_description || '').trim()) fail('Description is required.');
      const e = p_enrollment_id ? db.find('enrollments', p_enrollment_id) : null;
      const l = db.insert('fee_ledger', { student_id: p_student_id, enrollment_id: e?.id || null, class_id: e?.class_id || null, entry_type: 'adjustment', amount, description: p_description, entry_date: today(), created_by: me()?.id });
      audit('add_ledger_adjustment', 'fee_ledger', l.id, { amount });
      return l;
    },

    get_student_statement({ p_student_id, p_month }) {
      if (!(isStaff() || p_student_id === myStudentId())) fail('Not allowed.');
      const start = p_month.slice(0, 7) + '-01';
      const [y, m] = start.split('-').map(Number);
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const L = T.fee_ledger.filter((l) => l.student_id === p_student_id);
      const P = T.payments.filter((p) => p.student_id === p_student_id && p.status === 'verified');
      const opening = round2(L.filter((l) => l.entry_date < start).reduce((s, l) => s + Number(l.amount), 0) - P.filter((p) => p.paid_on < start).reduce((s, p) => s + Number(p.amount), 0));
      const charges = L.filter((l) => l.entry_date >= start && l.entry_date < end).sort((a, b) => a.entry_date.localeCompare(b.entry_date)).map((l) => ({ ...l, enrollment_code: db.find('enrollments', l.enrollment_id)?.enrollment_code || null }));
      const payments = P.filter((p) => p.paid_on >= start && p.paid_on < end).map((p) => ({ ...p, receipt_no: T.receipts.find((r) => r.payment_id === p.id)?.receipt_no || null }));
      const total_charges = round2(charges.reduce((s, l) => s + Number(l.amount), 0));
      const total_paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
      return { month: start, opening_balance: opening, charges, payments, total_charges, total_paid, closing_balance: round2(opening + total_charges - total_paid), admission_fees: round2(charges.filter((c) => c.entry_type === 'admission_fee').reduce((s, c) => s + Number(c.amount), 0)) };
    },

    save_cash_reconciliation({ p_date, p_collector_id, p_counted, p_notes }) {
      assertStaff();
      const expected = round2(T.payments.filter((p) => ['cash', 'representative_cash'].includes(p.method) && p.status === 'verified' && p.paid_on === p_date && (!p_collector_id || p.collected_by === p_collector_id)).reduce((s, p) => s + Number(p.amount), 0));
      const counted = round2(p_counted);
      return db.insert('cash_reconciliations', { reconciliation_date: p_date, collector_id: p_collector_id || null, collector_name: me()?.full_name, expected_amount: expected, counted_amount: counted, difference: round2(counted - expected), notes: p_notes || null, reconciled_by: me()?.id });
    },

    // ---------------- Teacher finance ----------------
    generate_settlement({ p_teacher_id, p_month, p_adjustments, p_notes }) {
      assertAdmin();
      const t = db.find('teachers', p_teacher_id) || fail('Teacher not found.');
      const start = p_month.slice(0, 7) + '-01';
      const existing = T.teacher_settlements.find((s) => s.teacher_id === t.id && s.period_month === start);
      if (existing && existing.status !== 'draft') fail('This settlement is already approved. It cannot be recalculated.');
      const cm = setting('commission'); const tx = setting('tax');
      const share = new Map(T.class_teachers.filter((ct) => ct.teacher_id === t.id).map((ct) => [ct.class_id, Number(ct.allocation_percent)]));
      const monthOf = (iso) => iso.slice(0, 7) + '-01';
      const lines = T.payment_allocations.filter((a) => !a.reversed_at).map((a) => {
        const p = db.find('payments', a.payment_id); const l = db.find('fee_ledger', a.ledger_id);
        if (!p || p.status !== 'verified' || !l || l.entry_type !== 'session_charge' || !share.has(l.class_id)) return null;
        return { month: monthOf(p.verified_at), student_id: a.student_id, class_id: l.class_id, share: round2(Number(a.amount) * share.get(l.class_id) / 100) };
      }).filter(Boolean);
      const firstMonth = t.first_eligible_month || lines.map((l) => l.month).sort()[0] || null;
      if (!t.first_eligible_month && firstMonth) t.first_eligible_month = firstMonth;
      const isFirst = firstMonth === start;
      const cap = Number(cm.intro_student_cap ?? 20);
      const introStudents = isFirst ? [...new Map(
        T.enrollments.filter((e) => e.approved_at && share.has(e.class_id)).sort((a, b) => a.approved_at.localeCompare(b.approved_at)).map((e) => [e.student_id, e])
      ).keys()].slice(0, cap) : [];
      const monthLines = lines.filter((l) => l.month === start);
      const byKey = new Map();
      monthLines.forEach((l) => {
        const k = l.class_id + '|' + l.student_id;
        const rate = isFirst && introStudents.includes(l.student_id) ? Number(cm.intro_rate ?? 0) : Number(cm.standard_rate ?? 5);
        const cur = byKey.get(k) || { class_id: l.class_id, student_id: l.student_id, revenue: 0, rate, commission: 0 };
        cur.revenue = round2(cur.revenue + l.share);
        cur.commission = round2(cur.revenue * rate / 100);
        byKey.set(k, cur);
      });
      const detail = [...byKey.values()].map((d) => ({ ...d, class_code: db.find('classes', d.class_id)?.title_en, student_code: db.find('students', d.student_id)?.student_code }));
      const gross = round2(detail.reduce((s, d) => s + d.revenue, 0));
      const commission = round2(detail.reduce((s, d) => s + d.commission, 0));
      const adjustments = round2(p_adjustments || 0);
      const payBeforeTax = round2(gross + adjustments - commission);
      const wht = tx.wht_enabled && payBeforeTax > Number(tx.wht_threshold || 100000) ? round2(payBeforeTax * Number(tx.wht_rate || 5) / 100) : 0;
      const row = {
        teacher_id: t.id, period_month: start, gross_revenue: gross, adjustments, commission_amount: commission, statutory_deductions: wht,
        net_payable: round2(payBeforeTax - wht), status: 'draft', notes: p_notes || existing?.notes || null,
        details: { is_first_eligible_month: isFirst, first_eligible_month: firstMonth, intro_students: introStudents.length, lines: detail, commission_settings: cm, tax_settings: tx }, created_by: me()?.id
      };
      const s = existing ? Object.assign(existing, row, { updated_at: now() }) : db.insert('teacher_settlements', row);
      audit('generate_settlement', 'teacher_settlements', s.id, { gross, commission, wht });
      return s;
    },

    update_settlement_status({ p_settlement_id, p_status, p_bank_reference, p_settlement_date }) {
      assertAdmin();
      const s = db.find('teacher_settlements', p_settlement_id) || fail('Settlement not found.');
      if (p_status === 'approved' && s.status !== 'draft') fail('Only draft settlements can be approved.');
      if (p_status === 'paid') {
        if (s.status !== 'approved') fail('Approve the settlement before marking it paid.');
        if (!String(p_bank_reference || '').trim()) fail('Enter the bank transfer reference.');
      }
      Object.assign(s, { status: p_status, approved_by: p_status === 'approved' ? me()?.id : s.approved_by, bank_reference: p_bank_reference || s.bank_reference, settlement_date: p_status === 'paid' ? (p_settlement_date || today()) : s.settlement_date });
      audit('update_settlement_status', 'teacher_settlements', s.id, { status: p_status });
      return s;
    },

    // ---------------- Admin ----------------
    get_dashboard_stats() {
      assertStaff();
      const month = today().slice(0, 7);
      const charges = T.fee_ledger.reduce((s, l) => s + Number(l.amount), 0);
      const paid = T.payments.filter((p) => p.status === 'verified').reduce((s, p) => s + Number(p.amount), 0);
      return {
        students: T.students.filter((s) => s.status === 'active').length,
        teachers: T.teachers.filter((t) => t.status === 'active').length,
        active_enrollments: T.enrollments.filter((e) => e.status === 'approved').length,
        trial_enrollments: T.enrollments.filter((e) => ['trial', 'trial_completed'].includes(e.status)).length,
        admission_requests: T.enrollments.filter((e) => e.status === 'admission_requested').length,
        new_enquiries: T.student_enquiries.filter((q) => q.status === 'new').length,
        new_applications: T.teacher_applications.filter((a) => a.status === 'new').length,
        payments_to_verify: T.payments.filter((p) => ['pending', 'receipt_sent'].includes(p.status)).length,
        collected_this_month: round2(T.payments.filter((p) => p.status === 'verified' && p.paid_on.startsWith(month)).reduce((s, p) => s + Number(p.amount), 0)),
        outstanding_total: round2(charges - paid)
      };
    },

    link_user_profile() { fail('Linking logins is available after Supabase is connected (see BACKEND_SETUP_TODO.md).'); }
  };
}
