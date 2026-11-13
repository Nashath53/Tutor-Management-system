/**
 * Student profile.
 * - Name + photo: the student changes these directly (RPC update_my_profile).
 * - Email, phone, WhatsApp, guardian details, school, address: sent as a change REQUEST that an admin approves
 *   (RPC request_profile_change) because these are used for identity, receipts and parent contact.
 * - Student ID, grade, medium and consent are managed by the office only.
 */
import { initPortalPage } from '../../components/portal-shell.js';
import { api } from '../../services/api.js';
import { t, onLanguageChange, opt } from '../../i18n/language.js';
import { esc, setBusy } from '../../utils/dom.js';
import { fmtDate, fmtDateTime, initials, badge } from '../../utils/format.js';
import { showToast, toastError } from '../../components/toast.js';
import { validateForm, normalizePhone } from '../../utils/validate.js';
import { bindPasswordToggles, resizeImage, blobToDataUrl } from '../../components/ui.js';
import { openModal } from '../../components/modal.js';
import { photoUrl, uploadPhoto } from './photo.js';
import { mountPolls } from './poll-card.js';
import { loadMyData, classTitle } from './portal-data.js';

const { profile, student, content } = await initPortalPage('profile');
const fmtPhone = (p) => (p ? '+' + p : '—');
const FIELDS = [
  ['email', 'form.emailOptional', 'email'], ['phone', 'form.phone', 'tel'], ['whatsapp', 'profile.whatsapp', 'tel'],
  ['guardian_name', 'form.guardianName', 'text'], ['guardian_phone', 'profile.guardianPhone', 'tel'],
  ['school', 'profile.school', 'text'], ['address', 'profile.address', 'text']
];
let me = { ...student, email: student.email || profile.email }, photo = '', requests = [], data = null;

const val = (k) => (k === 'email' ? me.email : me[k]);
const show = (k, v) => (['phone', 'whatsapp', 'guardian_phone'].includes(k) ? fmtPhone(v) : (v || '—'));

function render() {
  const pending = requests.filter((r) => r.status === 'pending');
  const pendingKeys = new Set(pending.flatMap((r) => Object.keys(r.changes || {})));
  const live = (data?.enrollments || []).filter((e) => ['trial', 'trial_completed', 'admission_requested', 'approved'].includes(e.status));
  const filled = FIELDS.filter(([k]) => val(k)).length + (photo ? 1 : 0) + 1;
  const pct = Math.round((filled / (FIELDS.length + 2)) * 100);

  content.innerHTML = `<div class="profile-hero mb-4"><div class="ph-cover"></div><div class="ph-body">
      <div class="ph-photo">${photo ? `<img class="avatar" src="${esc(photo)}" alt="${esc(me.full_name)}" width="104" height="104">` : `<span class="avatar">${esc(initials(me.full_name))}</span>`}
        <label for="photoIn" title="${esc(t('profile.changePhoto'))}"><i class="bi bi-camera-fill" aria-hidden="true"></i><span class="visually-hidden">${esc(t('profile.changePhoto'))}</span></label>
        <input type="file" id="photoIn" accept="image/jpeg,image/png,image/webp" hidden></div>
      <div class="flex-grow-1 min-w-0 pt-3"><div class="d-flex flex-wrap align-items-center gap-2"><h1 class="h4 m-0 text-break" id="nameView">${esc(me.full_name)}</h1>
          <button type="button" class="btn btn-sm btn-ghost" id="editName"><i class="bi bi-pencil" aria-hidden="true"></i>${esc(t('profile.editName'))}</button></div>
        <div class="d-flex flex-wrap gap-2 mt-2"><span class="chip chip-primary code">${esc(me.student_code)}</span>${me.grade ? `<span class="chip chip-teal">${esc(t('common.grade'))} ${esc(me.grade)}</span>` : ''}${me.medium ? `<span class="chip">${esc(opt('medium', me.medium))}</span>` : ''}
          ${live.slice(0, 3).map((e) => `<span class="chip chip-gold">${esc(classTitle(data.classById.get(e.class_id)))}</span>`).join('')}</div></div>
      <div class="text-center" style="min-width:120px"><div class="small text-muted mb-1">${esc(t('profile.complete'))}</div><div class="m-progress"><span style="width:${pct}%"></span></div><b class="small">${pct}%</b></div>
    </div></div>
    <div id="pollMount" class="mb-4" hidden></div>
    <div class="row g-4"><div class="col-lg-7"><div class="m-card">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 class="h6 m-0">${esc(t('profile.contact'))}</h2>
        <button type="button" class="btn btn-sm btn-primary" id="reqBtn"><i class="bi bi-pencil-square" aria-hidden="true"></i>${esc(t('profile.requestChange'))}</button></div>
      <dl class="kv">${FIELDS.map(([k, label]) => `<dt>${esc(t(label))}</dt><dd class="text-break">${esc(show(k, val(k)))} ${pendingKeys.has(k) ? `<span class="chip chip-gold ms-1"><i class="bi bi-hourglass-split" aria-hidden="true"></i>${esc(t('profile.pending'))}</span>` : ''}</dd>`).join('')}
        <dt>${esc(t('profile.consent'))}</dt><dd>${me.guardian_consent ? `${esc(t('common.yes'))} · ${fmtDate(me.guardian_consent_at)}` : esc(t('common.no'))}</dd></dl>
      <p class="lock-note mt-3 mb-0"><i class="bi bi-shield-lock" aria-hidden="true"></i>${esc(t('profile.lockNote'))}</p>
      ${requests.length ? `<h3 class="h6 mt-4 mb-2">${esc(t('profile.myRequests'))}</h3><div class="d-grid gap-2">${requests.slice(0, 5).map((r) => `<div class="preq"><div class="min-w-0"><b class="small">${Object.keys(r.changes || {}).map((k) => esc(t((FIELDS.find((f) => f[0] === k) || [k, k])[1]))).join(', ')}</b><div class="small text-muted">${fmtDateTime(r.created_at)}${r.review_note ? ` · ${esc(r.review_note)}` : ''}</div></div>${badge(r.status)}</div>`).join('')}</div>` : ''}
    </div></div>
    <div class="col-lg-5"><form class="m-card" id="pwForm" novalidate><h2 class="h6 mb-1">${esc(t('profile.changePw'))}</h2><p class="small text-muted">${esc(t('profile.pwHelp'))}</p>
      <label class="form-label" for="pw1">${esc(t('profile.newPw'))}</label><input class="form-control" id="pw1" name="pw1" type="password" minlength="8" required autocomplete="new-password"><div class="invalid-feedback">${esc(t('validation.password'))}</div>
      <div class="pw-meter my-2" aria-hidden="true"><span id="pwBar"></span></div>
      <label class="form-label" for="pw2">${esc(t('profile.confirmPw'))}</label><input class="form-control" id="pw2" name="pw2" type="password" minlength="8" required autocomplete="new-password"><div class="invalid-feedback">${esc(t('validation.passwordMatch'))}</div>
      <button class="btn btn-primary mt-3" type="submit"><i class="bi bi-key" aria-hidden="true"></i>${esc(t('profile.updatePw'))}</button></form></div></div>`;

  bindPasswordToggles(content);
  mountPolls(content.querySelector('#pollMount'));
  const f = content.querySelector('#pwForm');
  f.pw1.addEventListener('input', () => {
    const v = f.pw1.value; const sc = [v.length >= 8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v), v.length >= 12].filter(Boolean).length;
    const bar = content.querySelector('#pwBar'); bar.style.width = `${sc * 20}%`; bar.style.background = sc < 3 ? '#F97316' : sc < 4 ? '#FBBF24' : '#10B981';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.pw2.setCustomValidity(f.pw1.value === f.pw2.value ? '' : 'x');
    if (!validateForm(f)) return;
    const b = f.querySelector('button[type=submit]'); setBusy(b, true);
    try { await api.auth.updatePassword(f.pw1.value); showToast(t('profile.pwUpdated'), 'success'); f.reset(); f.classList.remove('was-validated'); } catch (err) { toastError(err); } finally { setBusy(b, false); }
  });
}

async function save(args) { const s = await api.rpc('update_my_profile', args); if (s) me = { ...me, ...s, email: me.email }; }

content.addEventListener('change', async (e) => {
  if (e.target.id !== 'photoIn') return;
  const file = e.target.files?.[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { showToast(t('profile.photoTooBig'), 'warning'); return; }
  try {
    const blob = await resizeImage(file, 320, 0.85);
    const dataUrl = await blobToDataUrl(blob);
    const path = await uploadPhoto(me, blob, dataUrl);
    await save({ p_photo_path: path });
    photo = dataUrl; showToast(t('profile.photoSaved'), 'success'); render();
  } catch (err) { toastError(err); }
});

content.addEventListener('click', (e) => {
  if (e.target.closest('#editName')) {
    const m = openModal({ title: t('profile.editName'), size: 'sm',
      body: `<form id="nmForm" novalidate><label class="form-label" for="nm">${esc(t('form.studentName'))}</label><input class="form-control" id="nm" name="nm" required minlength="2" maxlength="120" value="${esc(me.full_name)}" autocomplete="name"><div class="invalid-feedback">${esc(t('validation.required'))}</div></form>`,
      footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.cancel'))}</button><button type="submit" form="nmForm" class="btn btn-primary">${esc(t('common.save'))}</button>` });
    m.el.querySelector('#nmForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const fm = ev.target; if (!validateForm(fm)) return;
      try { await save({ p_full_name: fm.nm.value.trim() }); showToast(t('profile.nameSaved'), 'success'); m.close(); render(); } catch (err) { toastError(err); }
    });
  }
  if (e.target.closest('#reqBtn')) {
    const m = openModal({ title: t('profile.requestChange'),
      body: `<p class="small text-muted">${esc(t('profile.requestHelp'))}</p><form id="rqForm" novalidate class="row g-3">${FIELDS.map(([k, label, type]) => `<div class="col-sm-6"><label class="form-label" for="rq-${k}">${esc(t(label))}</label>
        <input class="form-control" id="rq-${k}" name="${k}" type="${type}" value="${esc(['phone', 'whatsapp', 'guardian_phone'].includes(k) && val(k) ? '0' + String(val(k)).slice(2) : (val(k) || ''))}" ${type === 'tel' ? 'inputmode="tel" placeholder="07XXXXXXXX"' : ''}></div>`).join('')}
</form>`,
      footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.cancel'))}</button><button type="submit" form="rqForm" class="btn btn-primary">${esc(t('profile.sendRequest'))}</button>` });
    m.el.querySelector('#rqForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const fm = ev.target; const changes = {};
      for (const [k, , type] of FIELDS) {
        let v = fm[k].value.trim() || null;
        if (v && type === 'tel') { v = normalizePhone(v); if (!v) { fm[k].classList.add('is-invalid'); showToast(t('validation.phone'), 'warning'); return; } }
        if ((v ?? null) !== (val(k) ?? null)) changes[k] = v;
      }
      if (!Object.keys(changes).length) { showToast(t('profile.noChanges'), 'info'); return; }
      try { await api.rpc('request_profile_change', { p_changes: changes }); showToast(t('profile.requestSent'), 'success'); m.close(); await loadRequests(); render(); } catch (err) { toastError(err); }
    });
  }
});

async function loadRequests() { requests = await api.select('profile_change_requests', { eq: { student_id: me.id }, order: ['created_at', 'desc'] }).catch(() => []); }
render();
try { [photo, data] = await Promise.all([photoUrl(me).catch(() => ''), loadMyData(me.id).catch(() => null), loadRequests()]); render(); } catch (e) { toastError(e); }
onLanguageChange(render);
