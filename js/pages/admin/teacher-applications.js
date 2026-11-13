import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud } from '../../components/crud.js';
import { listApplications, updateApplication, approveApplication, documentUrl } from '../../services/teacher.service.js';
import { opts, phoneLink } from './admin-common.js';
import { esc } from '../../utils/dom.js';
import { fmtDateTime, badge, humanize } from '../../utils/format.js';
import { openModal, confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { isDemo } from '../../services/api.js';

const { content } = await initAdminPage({ page: 'teacher-applications', title: 'Teacher applications' });
const STATUSES = ['new', 'shortlisted', 'interviewed', 'approved', 'rejected'];

const crud = createCrud(content, {
  intro: 'Applications from "Teach with us". CVs and certificates are stored in a <b>private</b> bucket and open through short-lived links. Approving creates a private teacher record — publish it only after verifying qualifications.',
  load: listApplications, singular: 'application', canCreate: false, searchKeys: ['full_name', 'phone', 'subject_names', 'living_place'],
  tabs: { items: [{ value: 'open', label: 'Open', icon: 'bi-inbox', test: (r) => !['approved', 'rejected'].includes(r.status) }, ...STATUSES.map((st) => ({ value: st, label: humanize(st), test: (r) => r.status === st })), { value: 'all', label: 'All' }] },
  onRowClick: (r) => view(r),
  columns: [
    { label: 'Received', render: (r) => `<span class="small">${fmtDateTime(r.created_at)}</span>` },
    { label: 'Applicant', render: (r) => `<b>${esc(r.full_name)}</b><div class="small text-muted">${esc(r.living_place || '')}</div>` },
    { label: 'Phone', render: (r) => phoneLink(r.phone) },
    { label: 'Subjects', render: (r) => esc(r.subject_names || '—') },
    { label: 'Experience', render: (r) => `${esc(r.experience_years ?? 0)} yrs` },
    { label: 'Status', render: (r) => (r.status === 'approved' ? badge('approved') : `<select class="form-select form-select-sm status-select s-${esc(r.status)}" data-app-status="${esc(r.id)}" aria-label="Change status of ${esc(r.full_name)}">${STATUSES.map((st) => `<option value="${st}" ${st === r.status ? 'selected' : ''}>${humanize(st)}</option>`).join('')}</select>`) }
  ],
  fields: [
    { name: 'status', label: 'Status', type: 'select', options: opts(STATUSES), placeholder: false, help: 'Choosing "Approved" creates the private teacher record.' },
    { name: 'admin_notes', label: 'Admin notes', type: 'textarea', col: 'col-12' }
  ],
  canEdit: true,
  save: async (v, row) => {
    if (row.status === 'approved') throw new Error('Approved applications cannot be edited.');
    if (v.status === 'approved') { await updateApplication(row.id, { admin_notes: v.admin_notes }); return approveApplication(row.id); }
    return updateApplication(row.id, v);
  },
  primaryAction: (r) => (['approved', 'rejected'].includes(r.status) ? null : { label: 'Approve', class: 'btn-primary', onClick: async ({ reload }) => {
    if (!(await confirmDialog({ title: 'Approve application', message: `Create a private teacher record for ${r.full_name}? You can verify qualifications and publish the profile from the Teachers page.`, confirmLabel: 'Approve' }))) return;
    try { await approveApplication(r.id); showToast('Teacher created. Verify qualifications before publishing.', 'success'); reload(); } catch (e) { toastError(e); }
  } }),
  rowActions: (r) => [
    { label: 'View application', icon: 'bi-eye', onClick: () => view(r) },
    r.status !== 'approved' && r.status !== 'rejected' && { label: 'Reject', icon: 'bi-x-circle', danger: true, onClick: async ({ reload }) => {
      const reason = await confirmDialog({ title: 'Reject application', message: 'Add a short reason (kept internally).', reason: true, danger: true, confirmLabel: 'Reject' });
      if (reason == null) return;
      try { await updateApplication(r.id, { status: 'rejected', admin_notes: [r.admin_notes, `Rejected: ${reason}`].filter(Boolean).join('\n') }); reload(); } catch (e) { toastError(e); }
    } }
  ]
});

function view(r) {
  const docs = [r.cv_path && ['CV', r.cv_path], ...(r.certificate_paths || []).map((p, i) => [`Certificate ${i + 1}`, p])].filter(Boolean);
  const m = openModal({ title: r.full_name, size: 'modal-lg', body: `<dl class="kv">
    <dt>Phone</dt><dd>${phoneLink(r.phone)}</dd><dt>WhatsApp</dt><dd>${phoneLink(r.whatsapp)}</dd><dt>Email</dt><dd>${esc(r.email || '—')}</dd><dt>Living place</dt><dd>${esc(r.living_place || '—')}</dd>
    <dt>Subjects</dt><dd>${esc(r.subject_names || '—')}</dd><dt>Grades</dt><dd>${esc((r.grades || []).join(', '))}</dd>
    <dt>Mediums</dt><dd>${esc((r.mediums || []).map(humanize).join(', '))}</dd><dt>Class types</dt><dd>${esc((r.class_types || []).map(humanize).join(', '))}</dd>
    <dt>Modes</dt><dd>${esc((r.class_modes || []).map(humanize).join(', '))}</dd><dt>Qualifications</dt><dd style="white-space:pre-line">${esc(r.qualifications)}</dd>
    <dt>Experience</dt><dd>${esc(r.experience_years)} years. ${esc(r.experience_details || '')}</dd>
    <dt>Availability</dt><dd>${esc((r.available_days || []).map(humanize).join(', '))} · ${esc((r.preferred_times || []).map(humanize).join(', '))}</dd>
    <dt>Additional</dt><dd style="white-space:pre-line">${esc(r.additional_info || '—')}</dd>
    <dt>WhatsApp opened</dt><dd>${r.whatsapp_opened_at ? fmtDateTime(r.whatsapp_opened_at) + ' (not proof of sending)' : '—'}</dd></dl>
    <h3 class="h6 mt-4">Private documents</h3>${docs.length ? `<div class="d-flex flex-wrap gap-2">${docs.map(([l, p]) => `<button class="btn btn-sm btn-outline-primary" data-doc="${esc(p)}"><i class="bi bi-file-earmark-lock me-1" aria-hidden="true"></i>${esc(l)}</button>`).join('')}</div>` : '<p class="small text-muted">No files uploaded.</p>'}` });
  m.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-doc]');
    if (!b) return;
    if (isDemo()) return showToast('Demo mode: files are not stored. In live mode this opens a 5-minute private link.', 'info');
    try { window.open(await documentUrl(b.dataset.doc), '_blank', 'noopener'); } catch (err) { toastError(err); }
  });
}

// Inline status change (Approved → creates the teacher record via the approve RPC)
content.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-app-status]'); if (!sel) return;
  const row = crud.getRows().find((r) => r.id === sel.dataset.appStatus);
  const to = sel.value;
  try {
    if (to === 'approved') {
      if (!(await confirmDialog({ title: 'Approve application', message: `Create a private teacher record for ${row.full_name}? Verify qualifications before publishing the profile.`, confirmLabel: 'Approve' }))) { sel.value = row.status; return; }
      await approveApplication(row.id); showToast('Approved · teacher record created', 'success');
    } else if (to === 'rejected') {
      const reason = await confirmDialog({ title: 'Reject application', message: 'Add a short reason (kept internally).', reason: true, reasonRequired: false, danger: true, confirmLabel: 'Reject' });
      if (reason == null) { sel.value = row.status; return; }
      await updateApplication(row.id, { status: 'rejected', admin_notes: [row.admin_notes, reason && `Rejected: ${reason}`].filter(Boolean).join('\n') });
      showToast('Application rejected', 'success');
    } else { await updateApplication(row.id, { status: to }); showToast(`Status: ${humanize(to)}`, 'success'); }
    crud.reload();
  } catch (err) { sel.value = row.status; toastError(err); }
});
