/**
 * Settings — grouped in side tabs. Each group saves on its own; a sticky bar appears when
 * a group has unsaved changes. "Access & roles" controls what cashiers and teachers may do
 * (the database checks the same permissions, so hiding a button is never the only protection).
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { getSettings, saveSetting } from '../../services/settings.service.js';
import { api, isDemo } from '../../services/api.js';
import { fieldHtml, readFields } from '../../components/crud.js';
import { confirmDialog } from '../../components/modal.js';
import { esc, qs } from '../../utils/dom.js';
import { validateForm } from '../../utils/validate.js';
import { showToast, toastError } from '../../components/toast.js';

const { content } = await initAdminPage({ page: 'settings', title: 'Settings' });
const s = await getSettings(true);
const statusOpts = ['present', 'late', 'absent', 'excused'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

const PERMS = {
  cashier: [
    ['students_edit', 'Add and edit students', 'Create student records and fix details.'],
    ['enrollments_manage', 'Manage enrolments', 'Start trials and record admission requests (approval stays admin-only).'],
    ['attendance_mark', 'Mark attendance', 'Open sessions and mark students.'],
    ['payments_record', 'Record cash payments', 'Record cash and issue receipts.'],
    ['timetable_view', 'View timetable', 'See the weekly timetable.'],
    ['reports_view', 'View reports', 'Collections, cash reconciliation and charts.']],
  teacher: [
    ['roster_view', 'See class roster', 'Names and Student IDs of students in their own classes.'],
    ['student_contacts_view', 'See student phone numbers', 'Off by default — protects students\' privacy.'],
    ['attendance_mark', 'Mark attendance', 'Open sessions and mark students in their own classes.'],
    ['earnings_view', 'See own earnings', 'Collected share and settlement statements.'],
    ['content_submit', 'Submit recordings & resources', 'Uploads wait for admin approval.'],
    ['timetable_request', 'Request timetable changes', 'Changes apply only after admin approval.'],
    ['poll_view', 'See "joining tomorrow" poll counts', 'Totals only, never individual answers.'],
    ['reviews_view', 'See own reviews', 'Approved reviews and ratings.']]
};

const groups = [
  { key: 'admission_fee', icon: 'bi-ticket-perforated', title: 'Admission fee', help: 'Charged once per student per class enrolment when paid admission is requested. Admins can waive it per enrolment.', fields: [
    { name: 'enabled', label: 'Charge an admission fee', type: 'checkbox', col: 'col-12' },
    { name: 'amount', label: 'Amount (LKR)', type: 'number', min: 0, step: '0.01', required: true }] },
  { key: 'trial', icon: 'bi-stars', title: 'Free trial', help: 'Trial sessions are recorded as "Trial" and never charged.', fields: [
    { name: 'sessions', label: 'Free trial sessions per class', type: 'number', min: 0, max: 10, step: 1, required: true }] },
  { key: 'billing', icon: 'bi-receipt', title: 'Billing & approval', help: 'Which attendance statuses create a session charge, and the minimum verified payment before an admin can approve paid admission.', fields: [
    { name: 'billable_statuses', label: 'Billable attendance statuses', type: 'multi', options: statusOpts, required: true, col: 'col-12' },
    { name: 'min_payment_percent', label: 'Minimum verified payment for approval (%)', type: 'number', min: 0, max: 100, step: 1, required: true },
    { name: 'allow_partial', label: 'Allow partial payments', type: 'checkbox' }] },
  { key: 'commission', icon: 'bi-percent', title: 'Teacher commission', help: 'Mentora commission on eligible collected class revenue (not admission fees or refunds).', fields: [
    { name: 'intro_rate', label: 'First eligible month rate (%)', type: 'number', min: 0, max: 100, step: '0.01', required: true },
    { name: 'intro_student_cap', label: 'Intro rate applies to first N students', type: 'number', min: 0, step: 1, required: true },
    { name: 'standard_rate', label: 'Standard rate (%)', type: 'number', min: 0, max: 100, step: '0.01', required: true }] },
  { key: 'tax', icon: 'bi-building', title: 'Withholding tax (WHT)', help: 'Separate from commission. Sri Lanka IRD guidance (2025): 5% WHT on teaching payments above LKR 100,000 per month. Confirm with your accountant before enabling.', fields: [
    { name: 'wht_enabled', label: 'Deduct WHT in settlements', type: 'checkbox', col: 'col-12' },
    { name: 'wht_rate', label: 'WHT rate (%)', type: 'number', min: 0, max: 100, step: '0.01', required: true },
    { name: 'wht_threshold', label: 'Monthly threshold (LKR)', type: 'number', min: 0, step: '0.01', required: true }] },
  { key: 'bank', icon: 'bi-bank', title: 'Bank details', help: 'Shown to students on the fees page and statements.', fields: [
    { name: 'bank_name', label: 'Bank', required: true }, { name: 'branch', label: 'Branch' },
    { name: 'account_name', label: 'Account name', required: true }, { name: 'account_number', label: 'Account number', required: true }] },
  { key: 'contact', icon: 'bi-telephone', title: 'Contact details', help: 'Public — shown on the website and receipts.', fields: [
    { name: 'whatsapp', label: 'WhatsApp number (94XXXXXXXXX)', required: true, pattern: '94\\d{9}', invalid: 'Use 94 followed by 9 digits.' }, { name: 'phone', label: 'Phone (display)', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'hours', label: 'Opening hours' },
    { name: 'address', label: 'Address', col: 'col-12' }] },
  { key: 'social', icon: 'bi-share', title: 'Social media', help: 'Official Mentora pages (public). Leave empty to hide an icon.', fields: ['facebook', 'instagram', 'youtube', 'tiktok', 'telegram'].map((k) => ({ name: k, label: k[0].toUpperCase() + k.slice(1), type: 'url', placeholder: 'https://' })) },
  { key: 'map', icon: 'bi-geo-alt', title: 'Map location', help: 'Used for the interactive map on the Contact page. Tip: in Google Maps, right-click your building → click the numbers to copy them.', preview: true, fields: [
    { name: 'lat', label: 'Latitude', type: 'number', step: 'any', required: true, min: -90, max: 90 }, { name: 'lng', label: 'Longitude', type: 'number', step: 'any', required: true, min: -180, max: 180 },
    { name: 'zoom', label: 'Zoom (10–19)', type: 'number', step: 1, min: 10, max: 19 }, { name: 'label', label: 'Pin label' }] },
  { key: 'poll', icon: 'bi-hand-thumbs-up', title: '"Joining tomorrow?" poll', help: 'Students see a Yes/No card before each class. Answers are deleted automatically when the class starts; teachers see totals only.', fields: [
    { name: 'enabled', label: 'Show the poll to students', type: 'checkbox', col: 'col-12' },
    { name: 'hours_before', label: 'Open the poll this many hours before class', type: 'number', min: 1, max: 72, step: 1, required: true }] },
  { key: 'permissions', icon: 'bi-shield-lock', title: 'Access & roles', custom: true }
];

const current = qs('tab') && groups.some((g) => g.key === qs('tab')) ? qs('tab') : groups[0].key;
content.innerHTML = `<p class="page-intro">Changes apply immediately after you press Save. Every change is recorded in the audit log.</p>
  <div class="settings-layout">
    <nav class="settings-nav" aria-label="Settings sections">${groups.map((g) => `<button type="button" data-go="${g.key}" aria-current="${g.key === current}"><i class="bi ${g.icon}" aria-hidden="true"></i><span>${esc(g.title)}</span><span class="dirty-dot" hidden aria-label="unsaved"></span></button>`).join('')}
      ${isDemo() ? '<button type="button" data-go="demo"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i><span>Demo data</span></button>' : ''}</nav>
    <div class="settings-panels">${groups.map((g) => `<form class="m-card settings-panel" data-key="${g.key}" novalidate ${g.key === current ? '' : 'hidden'}>
      <div class="card-head"><h2><i class="bi ${g.icon} me-2 text-primary" aria-hidden="true"></i>${esc(g.title)}</h2></div>${g.help ? `<p class="small text-muted">${esc(g.help)}</p>` : ''}
      ${g.custom ? permsHtml() : `<div class="row g-3">${g.fields.map((f) => fieldHtml(f, s[g.key]?.[f.name])).join('')}</div>`}
      ${g.preview ? '<div class="mt-3" id="mapPrev"></div>' : ''}
      <div class="save-bar" hidden><span><i class="bi bi-pencil-fill" aria-hidden="true"></i>Unsaved changes</span><button type="button" class="btn btn-ghost btn-sm" data-discard>Discard</button><button class="btn btn-primary btn-sm" type="submit">Save ${esc(g.title.toLowerCase())}</button></div>
      <div class="mt-3 text-end saved-hint small text-muted"><i class="bi bi-check2-circle text-success" aria-hidden="true"></i> All changes saved</div></form>`).join('')}
      ${isDemo() ? `<div class="m-card settings-panel" data-key="demo" hidden><div class="card-head"><h2>Demo data</h2></div><p class="small text-muted">Reset all sample data stored in this browser.</p><button class="btn btn-outline-danger" id="reset">Reset demo data</button></div>` : ''}
    </div></div>`;

function permsHtml() {
  const p = s.permissions || {};
  const row = (role, [k, label, hint]) => `<tr><td><b class="small">${esc(label)}</b><div class="small text-muted">${esc(hint)}</div></td><td class="text-center"><i class="bi bi-check-circle-fill text-success" title="Admins can always do this" aria-label="Admin: allowed"></i></td>
    <td class="text-center"><div class="form-check form-switch d-inline-block m-0"><input class="form-check-input" type="checkbox" role="switch" name="${role}.${k}" ${p[role]?.[k] ? 'checked' : ''} aria-label="${role}: ${esc(label)}"></div></td></tr>`;
  return `<div class="notice-box mb-3"><i class="bi bi-info-circle" aria-hidden="true"></i><span>Admins always have full access. Approving paid admission, verifying bank payments, settlements and deletions are <b>admin-only</b> and cannot be delegated.</span></div>
    ${['cashier', 'teacher'].map((role) => `<h3 class="h6 mt-3">${role === 'cashier' ? 'Cashier / front desk' : 'Teachers'}</h3><div class="table-responsive"><table class="table m-table perm-table"><thead><tr><th>Permission</th><th class="text-center">Admin</th><th class="text-center">${role === 'cashier' ? 'Cashier' : 'Teacher'}</th></tr></thead><tbody>${PERMS[role].map((x) => row(role, x)).join('')}</tbody></table></div>`).join('')}`;
}
function readPerms(f) {
  const out = { cashier: { ...(s.permissions?.cashier || {}) }, teacher: { ...(s.permissions?.teacher || {}) } };
  f.querySelectorAll('input[type=checkbox][name*="."]').forEach((i) => { const [r, k] = i.name.split('.'); out[r][k] = i.checked; });
  return out;
}
function mapPreview() {
  const el = content.querySelector('#mapPrev'); if (!el) return;
  const f = content.querySelector('form[data-key=map]'); const lat = Number(f.lat.value), lng = Number(f.lng.value);
  el.innerHTML = Number.isFinite(lat) && Number.isFinite(lng) && f.lat.value && f.lng.value ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}"><i class="bi bi-map" aria-hidden="true"></i>Check this pin on OpenStreetMap</a>` : '';
}
mapPreview();

const snapshot = new Map();
const serial = (f) => JSON.stringify([...f.querySelectorAll('input,select,textarea')].map((i) => (i.type === 'checkbox' ? i.checked : i.value)));
content.querySelectorAll('form[data-key]').forEach((f) => snapshot.set(f, serial(f)));
const isDirty = (f) => snapshot.get(f) !== serial(f);
function markDirty(f) {
  const d = isDirty(f);
  f.querySelector('.save-bar').hidden = !d; f.querySelector('.saved-hint').hidden = d;
  content.querySelector(`[data-go="${f.dataset.key}"] .dirty-dot`).hidden = !d;
}
content.addEventListener('input', (e) => { const f = e.target.closest('form[data-key]'); if (f) { markDirty(f); if (f.dataset.key === 'map') mapPreview(); } });
content.addEventListener('change', (e) => { const f = e.target.closest('form[data-key]'); if (f) markDirty(f); });
window.addEventListener('beforeunload', (e) => { if ([...snapshot.keys()].some(isDirty)) { e.preventDefault(); e.returnValue = ''; } });

content.querySelector('.settings-nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  content.querySelectorAll('[data-go]').forEach((x) => x.setAttribute('aria-current', String(x === b)));
  content.querySelectorAll('.settings-panel').forEach((p) => { p.hidden = p.dataset.key !== b.dataset.go; });
  history.replaceState(null, '', `?tab=${b.dataset.go}`);
});
content.addEventListener('click', (e) => {
  const d = e.target.closest('[data-discard]'); if (!d) return;
  // Simplest reliable discard: reload this tab from the saved settings.
  location.replace(`?tab=${d.closest('form').dataset.key}`);
});
content.querySelectorAll('form[data-key]').forEach((f) => f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = groups.find((x) => x.key === f.dataset.key);
  if (!g.custom && !validateForm(f)) return;
  const v = g.custom ? readPerms(f) : { ...s[g.key], ...readFields(f, g.fields) };
  if (g.key === 'permissions' && v.teacher.student_contacts_view && !s.permissions?.teacher?.student_contacts_view) {
    if (await confirmDialog({ title: 'Share phone numbers with teachers?', message: 'Teachers will be able to see students\' and guardians\' phone numbers for their own classes. Make sure your privacy notice allows this.', confirmLabel: 'Allow' }) == null) return;
  }
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try { await saveSetting(g.key, v); s[g.key] = v; snapshot.set(f, serial(f)); markDirty(f); showToast(`${g.title} saved`, 'success'); } catch (err) { toastError(err); } finally { btn.disabled = false; }
}));
content.querySelector('#reset')?.addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Reset demo data', message: 'All demo records in this browser will be replaced with fresh sample data.', danger: true, confirmLabel: 'Reset' }))) return;
  api.reset(); location.href = '../login.html';
});
