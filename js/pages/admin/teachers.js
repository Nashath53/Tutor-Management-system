import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import * as T from '../../services/teacher.service.js';
import { lookups, opts, phoneLink, gradeOpts } from './admin-common.js';
import { OPTIONS } from '../../config/app.config.js';
import { esc } from '../../utils/dom.js';
import { badge, humanize } from '../../utils/format.js';
import { chipsCell } from '../../components/ui.js';
import { openModal, confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { api } from '../../services/api.js';
import { teacherBadges, socialRow, starsHtml } from '../../components/ui.js';
import { initials } from '../../utils/format.js';
import { href } from '../../components/common.js';

const { content } = await initAdminPage({ page: 'teachers', title: 'Teachers' });
let L;

createCrud(content, {
  intro: 'Only <b>display name, photo, bio, subjects, mediums and verified qualifications</b> are ever shown publicly — and only when "Publish profile" is on. Phone numbers, addresses and bank details stay private.',
  load: async () => { await refreshL(); return T.listTeachers(); },
  singular: 'teacher', newLabel: 'New teacher', searchKeys: ['full_name', 'display_name', 'phone', 'teacher_code', (r) => (r.specialties || []).join(' ')],
  tabs: { items: [
    { value: 'active', label: 'Active', icon: 'bi-person-check', test: (r) => r.status === 'active' },
    { value: 'inactive', label: 'Inactive', icon: 'bi-pause-circle', test: (r) => r.status === 'inactive' },
    { value: 'removed', label: 'Removed', icon: 'bi-person-x', test: (r) => r.status === 'removed' },
    { value: 'all', label: 'All', icon: 'bi-people' }] },
  filters: [{ name: 'is_public', label: 'Website', options: [{ value: 'true', label: 'Published' }, { value: 'false', label: 'Private' }], test: (r, v) => String(!!r.is_public) === v }],
  card: (r, i, ui) => teacherCard(r, i, ui),
  columns: [
    { label: 'Code', sort: (r) => r.teacher_code || '', render: (r) => `<span class="code">${esc(r.teacher_code || '—')}</span>` },
    { label: 'Teacher', render: (r) => `<b>${esc(r.display_name || r.full_name)}</b><div class="small text-muted">${esc(r.full_name)}</div>` },
    { label: 'Contact', render: (r) => phoneLink(r.phone) },
    { label: 'Subjects', render: (r) => chipsCell(subjNames(r), { max: 2 }) },
    { label: 'Qualifications', render: (r) => { const q = L.teacher_qualifications.filter((x) => x.teacher_id === r.id); return `${q.filter((x) => x.is_verified).length}/${q.length} verified`; } },
    { label: 'Public', render: (r) => (r.is_public ? '<span class="badge-status s-approved">Published</span>' : '<span class="badge-status s-withdrawn">Private</span>') },
    { label: 'Status', render: (r) => badge(r.status === 'active' ? 'approved' : r.status === 'removed' ? 'rejected' : 'withdrawn', humanize(r.status)) }
  ],
  fields: (row = {}) => [
    { type: 'section', label: 'Profile' },
    { name: 'full_name', label: 'Full legal name (private)', required: true },
    { name: 'display_name', label: 'Public display name', required: true, placeholder: 'Mr. S. Rajendran' },
    { name: 'phone', label: 'Mobile (private)', type: 'tel', required: true },
    { name: 'whatsapp', label: 'WhatsApp (private)', type: 'tel' },
    { name: 'email', label: 'Email (private)', type: 'email' },
    { name: 'living_place', label: 'Living place (private)' },
    { name: 'experience_years', label: 'Years of experience', type: 'number', min: 0, step: 1, col: 'col-md-3' },
    { name: 'status', label: 'Status', type: 'select', options: opts(['active', 'inactive']), default: 'active', placeholder: false, col: 'col-md-3' },
    { name: 'photo_url', label: 'Public photo URL', type: 'url', col: 'col-12', help: 'Upload to the public "teacher-photos" bucket in Supabase Storage and paste the link.' },
    { name: 'headline_en', label: 'Public headline (English)', placeholder: 'O/L & A/L Mathematics specialist', maxlength: 120 },
    { name: 'headline_ta', label: 'Public headline (Tamil)', maxlength: 120 },
    { name: 'specialties_text', default: (row.specialties || []).join(', '), label: 'Expertise tags (comma separated)', col: 'col-12', placeholder: 'Algebra, Past papers, Exam technique', help: 'Shown as tags on the public profile. Keep them short.' },
    { name: 'bio_en', label: 'Public bio (English)', type: 'textarea', rows: 2 },
    { name: 'bio_ta', label: 'Public bio (Tamil)', type: 'textarea', rows: 2 },
    { name: 'mediums', label: 'Teaching mediums', type: 'multi', options: opts(OPTIONS.mediums) },
    { name: 'class_modes', label: 'Class modes', type: 'multi', options: opts(OPTIONS.modes) },
    { name: 'is_public', label: 'Publish profile on website (only after admin verification)', type: 'checkbox', col: 'col-12' },
    { type: 'section', label: 'Public links (optional — only public profiles, never personal numbers)' },
    { name: 'linkedin_url', label: 'LinkedIn', type: 'url', placeholder: 'https://linkedin.com/in/…' },
    { name: 'youtube_url', label: 'YouTube channel', type: 'url', placeholder: 'https://youtube.com/@…' },
    { name: 'facebook_url', label: 'Facebook page', type: 'url' },
    { name: 'website_url', label: 'Website', type: 'url' },
    { type: 'section', label: 'Payment details (private — used for settlements)' },
    { name: 'bank_name', label: 'Bank', col: 'col-md-4' },
    { name: 'bank_account_name', label: 'Account name', col: 'col-md-4' },
    { name: 'bank_account_number', label: 'Account number', col: 'col-md-4' },
    { name: 'first_eligible_month', label: 'First eligible commission month', type: 'date', col: 'col-md-6', help: 'Leave empty — it is set automatically by the first settlement with revenue.' },
    { name: 'notes', label: 'Internal notes', type: 'textarea', rows: 2 }
  ],
  save: (v, row) => { const { specialties_text: sp, ...rest } = v; return T.saveTeacher({ ...rest, specialties: String(sp || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), id: row.id }); },
  rowActions: (r) => [
    { label: 'Subjects & grades', icon: 'bi-journal-bookmark', onClick: ({ reload }) => manageSubjects(r, reload) },
    { label: 'Qualifications', icon: 'bi-patch-check', onClick: ({ reload }) => manageQuals(r, reload) },
    r.is_public && r.status === 'active' ? { label: 'View public profile', icon: 'bi-box-arrow-up-right', onClick: () => window.open(href(`teacher-profile.html?id=${r.id}`), '_blank', 'noopener') } : null,
    { label: 'Link teacher login', icon: 'bi-key', onClick: ({ reload }) => linkLogin(r, reload) },
    { divider: true },
    r.status === 'removed'
      ? { label: 'Restore teacher', icon: 'bi-arrow-counterclockwise', onClick: ({ reload }) => restore(r, reload) }
      : { label: 'Remove teacher', icon: 'bi-person-x', danger: true, onClick: ({ reload }) => removeTeacher(r, reload) }
  ]
});

async function refreshL() { L = await lookups('subjects', 'teacher_subjects', 'teacher_qualifications', 'class_teachers', 'enrollments', 'classes', 'reviews'); }
const subjNames = (r) => L.teacher_subjects.filter((x) => x.teacher_id === r.id).map((x) => L.subjectsById.get(x.subject_id)?.name_en).filter(Boolean);
function statsOf(r) {
  const cls = L.class_teachers.filter((x) => x.teacher_id === r.id).map((x) => x.class_id);
  const students = new Set(L.enrollments.filter((e) => cls.includes(e.class_id) && ['trial', 'trial_completed', 'admission_requested', 'approved'].includes(e.status)).map((e) => e.student_id)).size;
  const rv = L.reviews.filter((x) => x.teacher_id === r.id && x.status === 'approved');
  const avg = rv.length ? rv.reduce((a, x) => a + Number(x.rating), 0) / rv.length : 0;
  return { classes: cls.length, students, avg, nrev: rv.length, pending: L.reviews.filter((x) => x.teacher_id === r.id && x.status === 'pending').length };
}
function teacherCard(r, i, ui) {
  const st = statsOf(r);
  const quals = L.teacher_qualifications.filter((x) => x.teacher_id === r.id);
  const subs = subjNames(r);
  const tags = [...subs.map((x) => `<span class="chip chip-primary" title="${esc(x)}">${esc(x)}</span>`), ...(r.specialties || []).map((x) => `<span class="chip" title="${esc(x)}">${esc(x)}</span>`)];
  return `<article class="ent-card ${r.status !== 'active' ? 'is-muted' : ''}">
    <div class="ec-head">${r.photo_url ? `<img class="avatar" src="${esc(r.photo_url)}" alt="" width="52" height="52" loading="lazy" style="width:52px;height:52px">` : `<span class="avatar" style="width:52px;height:52px">${esc(initials(r.display_name || r.full_name))}</span>`}
      <div><h3 class="ec-title">${esc(r.display_name || r.full_name)}</h3><div class="ec-sub"><span class="code">${esc(r.teacher_code || '—')}</span> · ${Number(r.experience_years) || 0} yrs${r.is_public ? ' · <span class="text-success fw-semibold">Published</span>' : ' · Private'}</div></div>
      <div class="ec-menu">${ui.menu}</div></div>
    ${teacherBadges({ ...r, qualifications: quals, rating_avg: st.avg, rating_count: st.nrev, student_count: st.students }, { limit: 3 })}
    ${r.headline_en ? `<p class="small m-0 line-clamp-2">${esc(r.headline_en)}</p>` : ''}
    <div class="ec-tags">${tags.slice(0, 4).join('')}${tags.length > 4 ? `<span class="chip chip-more" title="${esc([...subs, ...(r.specialties || [])].join(', '))}">+${tags.length - 4}</span>` : ''}${!tags.length ? '<span class="small text-muted">No subjects yet</span>' : ''}</div>
    <div class="ec-meta"><div><b>${st.classes}</b><span>Classes</span></div><div><b>${st.students}</b><span>Students</span></div><div><b>${st.nrev ? st.avg.toFixed(1) : '—'}</b><span>${st.nrev} review${st.nrev === 1 ? '' : 's'}</span></div></div>
    <div><div class="small fw-bold mb-1">Qualifications <span class="text-muted fw-normal">· ${quals.filter((q) => q.is_verified).length}/${quals.length} verified</span></div>
      ${quals.length ? `<ul class="quals">${quals.slice(0, 2).map((q) => `<li><i class="bi ${q.is_verified ? 'bi-patch-check-fill' : 'bi-hourglass text-muted'}" aria-hidden="true"></i><span class="min-w-0 text-truncate">${esc(q.title)}</span></li>`).join('')}${quals.length > 2 ? `<li class="text-muted">+${quals.length - 2} more</li>` : ''}</ul>` : '<span class="small text-muted">None added</span>'}</div>
    ${socialRow(r)}
    ${r.status === 'removed' ? `<div class="notice-box small"><i class="bi bi-info-circle" aria-hidden="true"></i><span>Removed${r.removed_reason ? `: ${esc(r.removed_reason)}` : ''}. History and settlements are kept.</span></div>` : ''}
    <div class="ec-foot">${ui.edit.replace('btn-ghost"', 'btn-ghost" title="Edit"')}<button type="button" class="btn btn-sm btn-ghost" data-act="${i}:0"><i class="bi bi-journal-bookmark" aria-hidden="true"></i>Subjects</button><button type="button" class="btn btn-sm btn-ghost" data-act="${i}:1"><i class="bi bi-patch-check" aria-hidden="true"></i>Qualifications</button>${st.pending ? `<a class="btn btn-sm btn-ghost ms-auto" href="${href('admin/feedback.html')}"><span class="chip chip-accent">${st.pending}</span> to review</a>` : ''}</div>
  </article>`;
}

async function removeTeacher(r, reload) {
  const name = r.display_name || r.full_name;
  const st = statsOf(r);
  const first = await confirmDialog({ title: `Remove ${name}?`, danger: true, confirmLabel: 'Continue',
    message: `This hides the teacher from the website, signs them out of the teacher panel and stops new class assignments. ${st.classes ? `They are still assigned to ${st.classes} class(es) — reassign those classes afterwards.` : ''} Payments, attendance and settlements are never deleted.` });
  if (!first) return;
  const reason = await confirmDialog({ title: 'Confirm removal', danger: true, confirmLabel: 'Remove teacher', reason: true, reasonRequired: true, reasonLabel: 'Reason (saved in the audit log)',
    message: `Type a short reason to remove ${name}. You can restore them later from the "Removed" tab.` });
  if (!reason) return;
  try { await api.rpc('remove_teacher', { p_teacher_id: r.id, p_reason: typeof reason === 'string' ? reason : 'Removed by admin' }); showToast(`${name} removed`, 'success'); reload(); } catch (e) { toastError(e); }
}
async function restore(r, reload) {
  if (!(await confirmDialog({ title: 'Restore teacher', message: `Restore ${r.display_name || r.full_name} as an inactive teacher? You can then activate and publish the profile.`, confirmLabel: 'Restore' }))) return;
  try { await api.rpc('restore_teacher', { p_teacher_id: r.id }); showToast('Teacher restored', 'success'); reload(); } catch (e) { toastError(e); }
}
function linkLogin(r, reload) {
  openFormModal({ title: `Teacher login · ${r.display_name || r.full_name}`, size: '', submitLabel: 'Link login',
    fields: [{ name: 'email', label: 'Login email', type: 'email', required: true, col: 'col-12', default: r.email, help: 'First create the user in Supabase → Authentication → Users (or send an invite). Then link it here. The teacher signs in at /login.html and lands on the teacher panel.' }],
    onSave: async (v) => { await api.rpc('link_teacher_login', { p_email: v.email, p_teacher_id: r.id }); showToast('Login linked. The teacher can now sign in.', 'success'); reload(); } });
}

function manageSubjects(t, reload) {
  const draw = (m) => {
    const rows = L.teacher_subjects.filter((x) => x.teacher_id === t.id);
    m.body.innerHTML = `<ul class="dash-list mb-3">${rows.map((x) => `<li><span><b>${esc(L.subjectsById.get(x.subject_id)?.name_en)}</b> · Grades ${esc((x.grades || []).join(', ') || 'all')}</span><button class="btn btn-sm btn-ghost text-danger" data-del="${esc(x.id)}" aria-label="Remove"><i class="bi bi-trash" aria-hidden="true"></i></button></li>`).join('') || '<li class="text-muted">No subjects yet.</li>'}</ul>
      <button class="btn btn-outline-primary btn-sm" data-add><i class="bi bi-plus" aria-hidden="true"></i> Add subject</button>`;
  };
  const m = openModal({ title: `Subjects · ${t.display_name || t.full_name}` });
  draw(m);
  m.body.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { try { await T.removeTeacherSubject(del.dataset.del); await refreshL(); draw(m); reload(); } catch (err) { toastError(err); } }
    if (e.target.closest('[data-add]')) {
      m.close();
      openFormModal({ title: 'Add subject', size: '', fields: [
        { name: 'subject_id', label: 'Subject', type: 'select', required: true, col: 'col-12', options: L.subjects.map((s) => ({ value: s.id, label: s.name_en })) },
        { name: 'grades', label: 'Grades', type: 'multi', col: 'col-12', options: gradeOpts }
      ], onSave: async (v) => { await T.addTeacherSubject({ teacher_id: t.id, ...v }); showToast('Subject added', 'success'); reload(); } });
    }
  });
}

function manageQuals(t, reload) {
  const draw = (m) => {
    const rows = L.teacher_qualifications.filter((x) => x.teacher_id === t.id);
    m.body.innerHTML = `<p class="small text-muted">Only <b>verified</b> qualifications marked public appear on the website. Verify against the original certificate first.</p>
      <ul class="dash-list mb-3">${rows.map((q) => `<li><span><b>${esc(q.title)}</b><span class="d-block small text-muted">${esc(q.institution || '')} ${esc(q.year || '')}</span></span>
      <span class="d-flex gap-1 align-items-center">${q.is_verified ? '<span class="badge-status s-verified">Verified</span>' : `<button class="btn btn-sm btn-outline-primary" data-verify="${esc(q.id)}">Verify</button>`}
      <button class="btn btn-sm btn-ghost text-danger" data-del="${esc(q.id)}" aria-label="Remove"><i class="bi bi-trash" aria-hidden="true"></i></button></span></li>`).join('') || '<li class="text-muted">No qualifications yet.</li>'}</ul>
      <button class="btn btn-outline-primary btn-sm" data-add><i class="bi bi-plus" aria-hidden="true"></i> Add qualification</button>`;
  };
  const refresh = async (m) => { await refreshL(); draw(m); reload(); };
  const m = openModal({ title: `Qualifications · ${t.display_name || t.full_name}`, size: 'modal-lg' });
  draw(m);
  m.body.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-verify]'); const d = e.target.closest('[data-del]');
    try {
      if (v) { await T.updateQualification(v.dataset.verify, { is_verified: true, verified_at: new Date().toISOString() }); await refresh(m); }
      if (d && await confirmDialog({ title: 'Remove qualification', message: 'Remove this qualification record?', danger: true, confirmLabel: 'Remove' })) { await T.removeQualification(d.dataset.del); await refresh(m); }
    } catch (err) { toastError(err); }
    if (e.target.closest('[data-add]')) {
      m.close();
      openFormModal({ title: 'Add qualification', fields: [
        { name: 'title', label: 'Qualification', required: true, col: 'col-12' },
        { name: 'institution', label: 'Institution' }, { name: 'year', label: 'Year', type: 'number', min: 1950, max: 2100, step: 1, col: 'col-md-3' },
        { name: 'is_public', label: 'Show publicly once verified', type: 'checkbox', default: true, col: 'col-md-3' },
        { name: 'is_verified', label: 'I have verified the original document', type: 'checkbox', col: 'col-12' }
      ], onSave: async (val) => { await T.addQualification({ teacher_id: t.id, ...val, verified_at: val.is_verified ? new Date().toISOString() : null }); showToast('Qualification added', 'success'); reload(); } });
    }
  });
}
