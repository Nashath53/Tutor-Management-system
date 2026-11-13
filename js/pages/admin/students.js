import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import { listStudents, saveStudent } from '../../services/student.service.js';
import { createEnrollment } from '../../services/enrollment.service.js';
import { computeBalances } from '../../services/fee.service.js';
import { lookups, classLabel, gradeOpts, opts, phoneLink } from './admin-common.js';
import { OPTIONS } from '../../config/app.config.js';
import { api, isDemo } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { money, badge, humanize } from '../../utils/format.js';
import { showToast } from '../../components/toast.js';
import { chipsCell, openDrawer } from '../../components/ui.js';
import { fmtDate, initials } from '../../utils/format.js';

const { content } = await initAdminPage({ page: 'students', title: 'Students' });
let balances = new Map(), L;
const LIVE = ['trial', 'trial_completed', 'admission_requested', 'approved', 'suspended'];
const ens = (r) => L.enrollments.filter((e) => e.student_id === r.id);
const has = (r, ...st) => ens(r).some((e) => st.includes(e.status));
const STATUS_TABS = [
  { value: 'all', label: 'All', icon: 'bi-people' },
  { value: 'trial', label: 'Trial', icon: 'bi-stars', test: (r) => has(r, 'trial', 'trial_completed') },
  { value: 'pending', label: 'Pending approval', icon: 'bi-hourglass-split', test: (r) => has(r, 'admission_requested') },
  { value: 'paid', label: 'Paid / active', icon: 'bi-patch-check', test: (r) => has(r, 'approved') },
  { value: 'suspended', label: 'Suspended', icon: 'bi-pause-circle', test: (r) => has(r, 'suspended') },
  { value: 'withdrawn', label: 'Withdrawn', icon: 'bi-box-arrow-left', test: (r) => r.status === 'inactive' || (ens(r).length && ens(r).every((e) => ['withdrawn', 'rejected'].includes(e.status))) },
  { value: 'completed', label: 'Completed', icon: 'bi-mortarboard', test: (r) => has(r, 'completed') }
];
const shortClass = (c) => (c ? `${c.title_en}` : '—');

L = await lookups('classes', 'enrollments');
const crud = createCrud(content, {
  intro: `Student IDs (MA-0001…) are created by the database. To give a student portal access, create a login in Supabase Auth with the <b>same email</b> — it links automatically. ${isDemo() ? '(Demo: student@mentora.demo is linked to MA-0001.)' : ''}`,
  load: async () => {
    const [rows, ledger, payments] = await Promise.all([listStudents(), api.select('fee_ledger'), api.select('payments')]);
    L = await lookups('classes', 'enrollments');
    balances = computeBalances(ledger, payments);
    return rows;
  },
  singular: 'student', newLabel: 'New student', searchKeys: ['student_code', 'full_name', 'phone', 'guardian_name', 'email'],
  tabs: { name: 'stage', items: STATUS_TABS, initial: new URLSearchParams(location.search).get('tab') || 'all' },
  filters: [{ name: 'grade', label: 'Grade', options: gradeOpts }, { name: 'class', label: 'Class', options: () => (L?.classes || []).map((c) => ({ value: c.id, label: classLabel(c) })), test: (r, v) => ens(r).some((e) => e.class_id === v && LIVE.includes(e.status)) }],
  searchPlaceholder: 'Search name, ID, phone, guardian…',
  onRowClick: (r, ctx) => openStudent(r, ctx),
  columns: [
    { label: 'ID', sort: (r) => r.student_code, render: (r) => `<span class="code">${esc(r.student_code)}</span>` },
    { label: 'Student', sort: (r) => r.full_name, render: (r) => `<div class="d-flex align-items-center gap-2"><span class="avatar avatar-sm">${esc(initials(r.full_name))}</span><div class="min-w-0"><b class="d-block text-truncate" style="max-width:220px">${esc(r.full_name)}</b><span class="small text-muted">${esc(r.school || '')}</span></div></div>` },
    { label: 'Grade', sort: (r) => Number(r.grade) || 0, key: 'grade' },
    { label: 'Contact', render: (r) => phoneLink(r.phone) },
    { label: 'Classes', render: (r) => chipsCell(ens(r).filter((e) => LIVE.includes(e.status) || e.status === 'completed').map((e) => shortClass(L.classesById.get(e.class_id))), { max: 2 }) },
    { label: 'Balance', class: 'num', sort: (r) => balances.get(r.id)?.balance || 0, render: (r) => { const b = balances.get(r.id)?.balance || 0; return `<span class="${b > 0 ? 'text-danger fw-semibold' : b < 0 ? 'text-success fw-semibold' : ''}">${money(b)}</span>`; } },
    { label: 'Stage', render: (r) => stageBadge(r) }
  ],
  fields: [
    { type: 'section', label: 'Student' },
    { name: 'full_name', label: 'Full name', required: true },
    { name: 'grade', label: 'Grade', type: 'select', options: gradeOpts, col: 'col-md-3' },
    { name: 'medium', label: 'Medium', type: 'select', options: opts(OPTIONS.mediums), col: 'col-md-3' },
    { name: 'school', label: 'School' },
    { name: 'date_of_birth', label: 'Date of birth', type: 'date', col: 'col-md-3' },
    { name: 'status', label: 'Status', type: 'select', options: opts(['active', 'inactive']), default: 'active', placeholder: false, col: 'col-md-3' },
    { name: 'phone', label: 'Mobile number', type: 'tel', required: true, invalid: 'Enter a valid Sri Lankan mobile number.' },
    { name: 'whatsapp', label: 'WhatsApp number', type: 'tel' },
    { name: 'email', label: 'Email (used for portal login)', type: 'email', col: 'col-12' },
    { name: 'address', label: 'Address', type: 'textarea', rows: 2 },
    { type: 'section', label: 'Parent / guardian' },
    { name: 'guardian_name', label: 'Guardian name', required: true },
    { name: 'guardian_relationship', label: 'Relationship', col: 'col-md-3' },
    { name: 'guardian_phone', label: 'Guardian mobile', type: 'tel', col: 'col-md-3' },
    { name: 'guardian_consent', label: 'Guardian consent received (required for under-18)', type: 'checkbox', col: 'col-12' },
    { name: 'notes', label: 'Internal notes', type: 'textarea', rows: 2 }
  ],
  save: (v, row) => saveStudent({ ...v, id: row.id }),
  primaryAction: (r) => ({ label: 'Enrol', onClick: ({ reload }) => enrol(r, reload) }),
  rowActions: (r) => [
    { label: 'Fees & statement', icon: 'bi-wallet2', onClick: () => { location.href = href(`admin/fees.html?student=${r.id}`); } },
    { label: 'Record cash payment', icon: 'bi-cash-coin', onClick: () => { location.href = href(`admin/payments.html?tab=cash&student=${r.id}`); } }
  ]
});

function enrol(student, reload) {
  const active = L.classes.filter((c) => c.is_active);
  openFormModal({
    title: `Enrol ${student.full_name}`, size: '', submitLabel: 'Create enrolment',
    fields: [
      { name: 'class_id', label: 'Class', type: 'select', required: true, col: 'col-12', options: active.map((c) => ({ value: c.id, label: classLabel(c) })) },
      { name: 'as_trial', label: 'Start as free trial (no charges for trial sessions)', type: 'checkbox', col: 'col-12', default: true,
        help: 'Untick to request paid admission straight away. The admission fee (if enabled) is charged once for this class.' }
    ],
    onSave: async (v) => {
      const e = await createEnrollment(student.id, v.class_id, v.as_trial);
      showToast(`Enrolment ${e.enrollment_code} created.`, 'success');
      reload();
    }
  });
}
function stageBadge(r) {
  if (r.status === 'inactive') return badge('withdrawn', 'Withdrawn');
  const order = ['admission_requested', 'suspended', 'approved', 'trial_completed', 'trial', 'completed', 'withdrawn'];
  const st = order.find((x) => has(r, x));
  return st ? badge(st) : badge('new', 'No class');
}

function openStudent(r) {
  const b = balances.get(r.id) || { charges: 0, paid: 0, balance: 0 };
  const list = ens(r);
  openDrawer({
    title: esc(r.full_name),
    html: `<div class="d-flex align-items-center gap-3 mb-4"><span class="avatar" style="width:56px;height:56px">${esc(initials(r.full_name))}</span><div class="min-w-0"><div class="code">${esc(r.student_code)}</div><div class="small text-muted">Grade ${esc(r.grade || '—')} · ${esc(humanize(r.medium || ''))}${r.school ? ` · ${esc(r.school)}` : ''}</div></div></div>
      <div class="row g-2 mb-4 text-center">${[['Charges', money(b.charges || 0)], ['Paid', money(b.paid || 0)], ['Balance', money(b.balance || 0)]].map(([k, v]) => `<div class="col-4"><div class="m-card m-card-sm p-2"><div class="small text-muted">${k}</div><b class="small">${v}</b></div></div>`).join('')}</div>
      <h3 class="h6">Enrolments (${list.length})</h3>
      ${list.length ? `<div class="d-grid gap-2 mb-4">${list.map((e) => `<div class="media-item"><span class="mi-ico"><i class="bi bi-easel" aria-hidden="true"></i></span><div class="flex-grow-1 min-w-0"><b>${esc(classLabel(L.classesById.get(e.class_id)))}</b><span class="sub code">${esc(e.enrollment_code)}${e.paid_from_date ? ` · paid from ${fmtDate(e.paid_from_date)}` : ''}</span></div>${badge(e.status)}</div>`).join('')}</div>` : '<p class="small text-muted mb-4">Not enrolled in any class.</p>'}
      <h3 class="h6">Contact</h3>
      <dl class="kv mb-4"><dt>Mobile</dt><dd>${phoneLink(r.phone)}</dd><dt>WhatsApp</dt><dd>${phoneLink(r.whatsapp)}</dd><dt>Email</dt><dd class="text-break">${esc(r.email || '—')}</dd><dt>Guardian</dt><dd>${esc(r.guardian_name || '—')}${r.guardian_relationship ? ` (${esc(r.guardian_relationship)})` : ''}</dd><dt>Guardian mobile</dt><dd>${phoneLink(r.guardian_phone)}</dd><dt>Consent</dt><dd>${r.guardian_consent ? 'Yes' : '<span class="text-danger">Not recorded</span>'}</dd></dl>
      ${r.notes ? `<h3 class="h6">Notes</h3><p class="small text-muted" style="white-space:pre-line">${esc(r.notes)}</p>` : ''}
      <div class="d-flex flex-wrap gap-2"><a class="btn btn-primary btn-sm" href="${href(`admin/fees.html?student=${r.id}`)}"><i class="bi bi-wallet2" aria-hidden="true"></i>Statement</a><a class="btn btn-outline-primary btn-sm" href="${href(`admin/payments.html?tab=cash&student=${r.id}`)}"><i class="bi bi-cash-coin" aria-hidden="true"></i>Cash payment</a><a class="btn btn-ghost btn-sm" href="${href(`admin/enrollments.html?student=${r.id}`)}"><i class="bi bi-person-check" aria-hidden="true"></i>Enrolments</a></div>`
  });
}
void crud;
