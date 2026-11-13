/**
 * Teacher profile. Public details (name, headline, bio, specialties, social links) are changed
 * through a request that the admin approves — so nothing goes live on the website unchecked.
 * Private details (phone, bank) are managed by the admin only.
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { fmtDateTime, initials, badge } from '../../utils/format.js';
import { fieldHtml, readFields } from '../../components/crud.js';
import { validateForm } from '../../utils/validate.js';
import { showToast, toastError } from '../../components/toast.js';
import { teacherBadges, socialRow, bindPasswordToggles } from '../../components/ui.js';
import { loadTeacherCtx, notLinkedHtml } from './teacher-common.js';

const { content, profile } = await initAdminPage({ page: 'profile', title: 'My profile', area: 'teacher' });
const T = await loadTeacherCtx(profile);
const FIELDS = [
  { name: 'display_name', label: 'Display name (public)', required: true, col: 'col-md-6' },
  { name: 'headline_en', label: 'Headline (English)', col: 'col-md-6', placeholder: 'e.g. A/L Physics · 12 years' },
  { name: 'headline_ta', label: 'Headline (Tamil)', col: 'col-md-6' },
  { name: 'specialties_text', label: 'Specialties (comma separated)', col: 'col-md-6', placeholder: 'Mechanics, Past papers' },
  { name: 'bio_en', label: 'Bio (English)', type: 'textarea', rows: 3, col: 'col-12' },
  { name: 'bio_ta', label: 'Bio (Tamil)', type: 'textarea', rows: 3, col: 'col-12' },
  { type: 'section', label: 'Public links (https only)' },
  { name: 'linkedin_url', label: 'LinkedIn', type: 'url', placeholder: 'https://' }, { name: 'youtube_url', label: 'YouTube channel', type: 'url', placeholder: 'https://' },
  { name: 'facebook_url', label: 'Facebook page', type: 'url', placeholder: 'https://' }, { name: 'website_url', label: 'Website', type: 'url', placeholder: 'https://' }
];

async function draw() {
  const t = T.teacher;
  const reqs = await api.select('profile_change_requests', { eq: { teacher_id: t.id }, order: ['created_at', 'desc'] }).catch(() => []);
  const pending = reqs.find((r) => r.status === 'pending');
  const row = { ...t, specialties_text: (t.specialties || []).join(', ') };
  content.innerHTML = `<div class="row g-4"><div class="col-lg-4">
    <div class="m-card text-center"><span class="avatar avatar-xl mx-auto mb-3" style="width:88px;height:88px;font-size:1.8rem">${esc(initials(t.display_name || t.full_name))}</span>
      <h2 class="h5 mb-1">${esc(t.display_name || t.full_name)}</h2><div class="small text-muted mb-2">${esc(t.headline_en || '')}</div>
      <div class="d-flex flex-wrap justify-content-center gap-1 mb-3">${teacherBadges(t)}</div>
      <div class="d-flex justify-content-center">${socialRow(t)}</div>
      <dl class="kv text-start mt-3"><dt>Teacher ID</dt><dd class="code">${esc(t.teacher_code || '—')}</dd><dt>Website profile</dt><dd>${t.is_public ? '<span class="badge-status s-approved">Published</span>' : '<span class="badge-status s-withdrawn">Hidden</span>'}</dd><dt>Classes</dt><dd>${T.classes.length}</dd></dl>
      ${t.is_public ? `<a class="btn btn-outline-primary btn-sm" href="${href(`teacher-profile.html?id=${encodeURIComponent(t.id)}`)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>View public profile</a>` : ''}
      <p class="small text-muted mt-3 mb-0"><i class="bi bi-lock" aria-hidden="true"></i> Your phone number, address and bank details are private and managed by the admin.</p></div>
    <form class="m-card mt-4" id="pwForm" novalidate><h2 class="h6">Change password</h2>
      <label class="form-label" for="pw1">New password</label><div class="pw-wrap"><input class="form-control" id="pw1" type="password" minlength="8" required autocomplete="new-password"><div class="invalid-feedback">At least 8 characters.</div></div>
      <label class="form-label mt-2" for="pw2">Confirm</label><div class="pw-wrap"><input class="form-control" id="pw2" type="password" minlength="8" required autocomplete="new-password"><div class="invalid-feedback">Passwords must match.</div></div>
      <button class="btn btn-primary mt-3 w-100" type="submit">Update password</button></form></div>
    <div class="col-lg-8"><form class="m-card" id="pf" novalidate><div class="card-head"><h2>Public profile</h2>${pending ? '<span class="chip chip-gold"><i class="bi bi-hourglass-split" aria-hidden="true"></i>Change waiting for approval</span>' : ''}</div>
      <p class="small text-muted">Changes are sent to the admin for approval before they appear on the website. Never share personal phone numbers or home addresses here.</p>
      <fieldset ${pending ? 'disabled' : ''}><div class="row g-3">${FIELDS.map((f) => fieldHtml(f, row[f.name])).join('')}</div>
      <button class="btn btn-primary mt-3" type="submit"><i class="bi bi-send" aria-hidden="true"></i>Send for approval</button></fieldset></form>
      ${reqs.length ? `<div class="m-card mt-4"><div class="card-head"><h2>My change requests</h2></div>${reqs.slice(0, 6).map((r) => `<div class="req-item"><span class="ri-ico"><i class="bi bi-person-gear" aria-hidden="true"></i></span><div class="min-w-0"><b class="small">${Object.keys(r.changes || {}).map((k) => k.replace(/_/g, ' ')).join(', ')}</b><div class="small text-muted">${fmtDateTime(r.created_at)}${r.review_note ? ` · Admin: ${esc(r.review_note)}` : ''}</div></div><div class="ri-actions">${badge(r.status)}</div></div>`).join('')}</div>` : ''}</div></div>`;
  bindPasswordToggles(content);
  const f = content.querySelector('#pf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!validateForm(f)) return;
    const v = readFields(f, FIELDS);
    v.specialties = String(v.specialties_text || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8); delete v.specialties_text;
    const changes = {}; Object.entries(v).forEach(([k, val]) => { if (JSON.stringify(t[k] ?? null) !== JSON.stringify(val ?? null) && !(Array.isArray(val) && !val.length && !(t[k] || []).length)) changes[k] = val; });
    if (!Object.keys(changes).length) return showToast('Nothing changed.', 'info');
    try { await api.rpc('request_profile_change', { p_changes: changes }); showToast('Sent to the admin for approval', 'success'); draw(); } catch (err) { toastError(err); }
  });
  const pw = content.querySelector('#pwForm');
  pw.addEventListener('submit', async (e) => {
    e.preventDefault(); pw.pw2.setCustomValidity(pw.pw1.value === pw.pw2.value ? '' : 'x');
    if (!validateForm(pw)) return;
    try { await api.auth.updatePassword(pw.pw1.value); showToast('Password updated', 'success'); pw.reset(); pw.classList.remove('was-validated'); } catch (err) { toastError(err); }
  });
}
if (!T.teacher) content.innerHTML = notLinkedHtml(); else draw().catch(toastError);
