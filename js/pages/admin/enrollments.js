import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import * as E from '../../services/enrollment.service.js';
import { getSettings } from '../../services/settings.service.js';
import { lookups, classLabel, studentLabel, opts } from './admin-common.js';
import { esc, qs } from '../../utils/dom.js';
import { money, fmtDate, badge, todayISO, humanize } from '../../utils/format.js';
import { openModal, confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';

const { content, isAdmin } = await initAdminPage({ page: 'enrollments', title: 'Enrolments' });
const settings = await getSettings();
let L = await lookups('students', 'classes');
const STATUSES = ['trial', 'trial_completed', 'admission_requested', 'approved', 'suspended', 'completed', 'withdrawn', 'rejected'];
const STAGES = [['trial', 'bi-stars'], ['trial_completed', 'bi-flag'], ['admission_requested', 'bi-hourglass-split'], ['approved', 'bi-patch-check']];

const crud = createCrud(content, {
  intro: `Flow: <b>trial</b> (${settings.trial.sessions} free sessions, never charged) → <b>trial completed</b> → <b>admission requested</b> (admission fee ${settings.admission_fee.enabled ? money(settings.admission_fee.amount) : 'disabled'} charged once) → admin <b>approves</b> after verified payment of at least ${settings.billing.min_payment_percent}% of charges. Paid sessions are charged only from the approved "paid from" date. A receipt sent by a student never grants access by itself.`,
  load: async () => { L = await lookups('students', 'classes'); return E.listEnrollments(); },
  canCreate: false, searchKeys: ['enrollment_code', (r) => L.studentsById.get(r.student_id)?.full_name, (r) => L.studentsById.get(r.student_id)?.student_code],
  header: (rows) => `<div class="pipeline-strip">${STAGES.map(([st, ic], i) => `<button type="button" class="ps-step" data-goto="${st}"><span class="ps-ico"><i class="bi ${ic}" aria-hidden="true"></i></span><span class="min-w-0"><b>${rows.filter((r) => r.status === st).length}</b><span>${esc(humanize(st))}</span></span>${i < STAGES.length - 1 ? '<i class="bi bi-chevron-right ps-arrow" aria-hidden="true"></i>' : ''}</button>`).join('')}</div>`,
  tabs: { items: [{ value: 'live', label: 'Live', icon: 'bi-activity', test: (r) => ['trial', 'trial_completed', 'admission_requested', 'approved', 'suspended'].includes(r.status) }, ...STATUSES.map((st) => ({ value: st, label: humanize(st), test: (r) => r.status === st })), { value: 'all', label: 'All' }], initial: qs('tab') || 'live' },
  filters: [
    { name: 'student_id', label: 'Student', options: L.students.map((s) => ({ value: s.id, label: studentLabel(s) })) },
    { name: 'class_id', label: 'Class', options: L.classes.map((c) => ({ value: c.id, label: classLabel(c) })) }
  ],
  toolbarButtons: [{ label: 'New enrolment', icon: 'bi-plus-lg', class: 'btn-primary', onClick: ({ reload }) => newEnrollment(reload) }],
  columns: [
    { label: 'Code', sort: (r) => r.enrollment_code, render: (r) => `<span class="code">${esc(r.enrollment_code)}</span>` },
    { label: 'Student', sort: (r) => L.studentsById.get(r.student_id)?.full_name || '', render: (r) => { const s = L.studentsById.get(r.student_id); return `<b class="d-block">${esc(s?.full_name || '—')}</b><span class="small text-muted code">${esc(s?.student_code || '')}</span>`; } },
    { label: 'Class', render: (r) => `<span class="small">${esc(classLabel(L.classesById.get(r.class_id)))}</span>` },
    { label: 'Trial', render: (r) => { if (!['trial', 'trial_completed'].includes(r.status)) return '—'; const u = r.trial_sessions_used || 0; const n = settings.trial.sessions; return `<div class="d-flex align-items-center gap-2"><div class="m-progress" style="width:60px"><span style="width:${Math.min(100, (u / n) * 100)}%"></span></div><span class="small">${u}/${n}</span></div>`; } },
    { label: 'Admission fee', render: (r) => (r.admission_fee_waived ? '<span class="small">Waived</span>' : r.admission_fee_charged ? `<span class="small">${money(r.admission_fee_amount)}</span>` : '—') },
    { label: 'Paid from', sort: (r) => r.paid_from_date || '', render: (r) => (r.paid_from_date ? fmtDate(r.paid_from_date) : '—') },
    { label: 'Status', render: (r) => badge(r.status) }
  ],
  primaryAction: (r) => {
    if (r.status === 'admission_requested' && isAdmin) return { label: 'Review', class: 'btn-primary', onClick: ({ reload }) => review(r, reload) };
    if (['trial', 'trial_completed'].includes(r.status)) return { label: 'Request admission', onClick: async ({ reload }) => { try { await E.requestAdmission(r.id); showToast('Admission requested. Admission fee charged if enabled.', 'success'); reload(); } catch (e) { toastError(e); } } };
    return null;
  },
  rowActions: (r) => isAdmin ? [
    r.admission_fee_charged && !r.admission_fee_waived && { label: 'Waive admission fee', icon: 'bi-gift', onClick: ({ reload }) => withReason('Waive admission fee', 'The fee charge will be reversed (never deleted).', (reason) => E.waiveAdmissionFee(r.id, reason), reload) },
    r.status === 'approved' && { label: 'Suspend', icon: 'bi-pause-circle', onClick: ({ reload }) => withReason('Suspend enrolment', 'Suspended students are not charged and lose access to private links.', (reason) => E.setEnrollmentStatus(r.id, 'suspended', reason), reload) },
    r.status === 'approved' && { label: 'Mark course completed', icon: 'bi-mortarboard', onClick: ({ reload }) => withReason('Mark as completed', 'Use when the student has finished the full course. No new charges are made after this.', (reason) => E.setEnrollmentStatus(r.id, 'completed', reason), reload, false) },
    r.status === 'suspended' && { label: 'Re-activate', icon: 'bi-play-circle', onClick: ({ reload }) => withReason('Re-activate enrolment', 'Optional note.', (reason) => E.setEnrollmentStatus(r.id, 'approved', reason), reload, false) },
    ['admission_requested', 'trial', 'trial_completed'].includes(r.status) && { label: 'Reject', icon: 'bi-x-circle', danger: true, onClick: ({ reload }) => withReason('Reject enrolment', 'Reason (internal).', (reason) => E.setEnrollmentStatus(r.id, 'rejected', reason), reload) },
    !['withdrawn', 'rejected'].includes(r.status) && { label: 'Withdraw', icon: 'bi-box-arrow-left', danger: true, onClick: ({ reload }) => withReason('Withdraw student', 'Charges already made stay on the ledger.', (reason) => E.setEnrollmentStatus(r.id, 'withdrawn', reason), reload) }
  ] : []
});

async function withReason(title, message, fn, reload, required = true) {
  const reason = await confirmDialog({ title, message, reason: true, reasonRequired: required, confirmLabel: 'Confirm' });
  if (reason == null) return;
  try { await fn(reason); showToast('Done', 'success'); reload(); } catch (e) { toastError(e); }
}

async function review(r, reload) {
  let ps;
  try { ps = await E.paymentStatus(r.id); } catch (e) { return toastError(e); }
  const s = L.studentsById.get(r.student_id);
  const m = openModal({
    title: `Approve ${r.enrollment_code}`,
    body: `<dl class="kv mb-3"><dt>Student</dt><dd>${esc(studentLabel(s))}</dd><dt>Class</dt><dd>${esc(classLabel(L.classesById.get(r.class_id)))}</dd>
      <dt>Charges on this enrolment</dt><dd>${money(ps.charges)}</dd><dt>Verified payments applied</dt><dd>${money(ps.paid)}</dd>
      <dt>Minimum required (${ps.min_payment_percent}%)</dt><dd>${money(ps.required)}</dd></dl>
      <div class="notice-box mb-3 ${ps.satisfied ? '' : 'text-danger'}"><i class="bi ${ps.satisfied ? 'bi-check-circle' : 'bi-exclamation-triangle'}" aria-hidden="true"></i><span>${ps.satisfied ? 'Minimum payment is met.' : 'Minimum payment is NOT met. Verify pending bank transfers first, or approve with a documented override.'}</span></div>
      <form id="apForm" class="row g-3" novalidate>
        <div class="col-md-6"><label class="form-label" for="ap-from">Paid sessions start from<span class="req">*</span></label><input type="date" class="form-control" id="ap-from" name="paid_from" required value="${todayISO()}">
          <div class="form-text">The first eligible session on/after this date is the first paid session.</div></div>
        ${ps.satisfied ? '' : `<div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="ap-ov" name="override"><label class="form-check-label" for="ap-ov">Approve without minimum payment (admin override)</label></div>
        <label class="form-label mt-2" for="ap-reason">Override reason</label><textarea class="form-control" id="ap-reason" name="reason" rows="2"></textarea></div>`}
      </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Cancel</button><button type="submit" form="apForm" class="btn btn-primary">Approve enrolment</button>`
  });
  m.el.querySelector('#apForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await E.approveEnrollment(r.id, { paidFrom: f.paid_from.value, override: !!f.override?.checked, reason: f.reason?.value || null });
      showToast(`${r.enrollment_code} approved.`, 'success'); m.close(); reload();
    } catch (err) { toastError(err); }
  });
}

function newEnrollment(reload) {
  openFormModal({
    title: 'New enrolment', size: '', submitLabel: 'Create',
    fields: [
      { name: 'student_id', label: 'Student', type: 'select', required: true, col: 'col-12', options: L.students.filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: studentLabel(s) })) },
      { name: 'class_id', label: 'Class', type: 'select', required: true, col: 'col-12', options: L.classes.filter((c) => c.is_active).map((c) => ({ value: c.id, label: classLabel(c) })) },
      { name: 'as_trial', label: 'Start as free trial', type: 'checkbox', default: true, col: 'col-12' }
    ],
    onSave: async (v) => { const e = await E.createEnrollment(v.student_id, v.class_id, v.as_trial); showToast(`Created ${e.enrollment_code}`, 'success'); reload(); }
  });
}

if (qs('new')) newEnrollment(crud.reload);
content.addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) crud.setTab(b.dataset.goto); });
if (qs('student')) { const sel = content.querySelector('[data-filter="student_id"]'); if (sel) { sel.value = qs('student'); sel.dispatchEvent(new Event('change')); } crud.setTab('all'); }
