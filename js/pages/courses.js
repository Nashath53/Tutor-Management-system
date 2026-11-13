import { initPublicPage } from '../components/layout.js';
import { listSubjects } from '../services/subject.service.js';
import { listPublicClasses } from '../services/class.service.js';
import { submitEnquiry, markWhatsAppOpened } from '../services/enquiry.service.js';
import { t, loc, opt, onLanguageChange, getLanguage } from '../i18n/language.js';
import { esc, qs, formData } from '../utils/dom.js';
import { OPTIONS } from '../config/app.config.js';
import { classCard } from './shared-cards.js';
import { openModal } from '../components/modal.js';
import { validateForm, normalizePhone } from '../utils/validate.js';
import { waLink, studentEnquiryMessage, openWhatsApp } from '../utils/whatsapp.js';
import { toastError } from '../components/toast.js';
import { initReveal } from '../components/ui.js';

const settings = await initPublicPage('courses');
let subjects = [], classes = [];
const f = { subject: qs('subject') || '', grade: '', medium: '', mode: '', q: '', sort: 'popular' };

function renderFilters() {
  const sel = (name, label, options, current) => `<div class="col-6 col-md-4"><label class="form-label small" for="flt-${name}">${esc(label)}</label>
    <select class="form-select form-select-sm" id="flt-${name}" data-f="${name}"><option value="">${esc(t('common.all'))}</option>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  document.getElementById('filters').innerHTML = `<div class="row g-3 align-items-end">` +
    sel('subject', t('form.subject'), subjects.map((s) => [s.id, loc(s, 'name')]), f.subject) +
    sel('grade', t('form.grade'), OPTIONS.grades.map((g) => [g, `${t('common.grade')} ${g}`]), f.grade) +
    sel('medium', t('form.medium'), OPTIONS.mediums.map((m) => [m, opt('medium', m)]), f.medium) + `</div>`;
  document.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value; renderGrid(); }));
  document.getElementById('modeSeg').innerHTML = [['', t('common.all')], ...OPTIONS.modes.map((m) => [m, opt('mode', m)])]
    .map(([v, l]) => `<button type="button" data-mode="${v}" aria-pressed="${f.mode === v}">${esc(l)}<span class="n">${classes.filter((c) => !v || c.class_mode === v).length}</span></button>`).join('');
  document.getElementById('sortSel').innerHTML = [['popular', t('courses.sortPopular')], ['price', t('courses.sortPrice')], ['grade', t('courses.sortGrade')]]
    .map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
document.getElementById('modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  f.mode = b.dataset.mode;
  document.querySelectorAll('#modeSeg [data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderGrid();
});
document.getElementById('sortSel').addEventListener('change', (e) => { f.sort = e.target.value; renderGrid(); });
let qTimer;
document.getElementById('classSearch').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { f.q = e.target.value.trim().toLowerCase(); renderGrid(); }, 150); });

const haystack = (c) => [c.title_en, c.title_ta, c.subject_name_en, c.subject_name_ta, `grade ${c.grade}`, c.grade, ...(c.teacher_list || []).map((x) => x.name), ...(c.teachers || [])].join(' ').toLowerCase();

function renderGrid() {
  const icon = Object.fromEntries(subjects.map((s) => [s.id, s.icon]));
  let list = classes.filter((c) => (!f.subject || c.subject_id === f.subject) && (!f.grade || c.grade === f.grade) && (!f.medium || c.medium === f.medium) && (!f.mode || c.class_mode === f.mode) && (!f.q || haystack(c).includes(f.q)));
  const sorters = { popular: (a, b) => (b.student_count || 0) - (a.student_count || 0), price: (a, b) => a.rate_per_session - b.rate_per_session, grade: (a, b) => Number(a.grade) - Number(b.grade) || String(a.grade).localeCompare(String(b.grade)) };
  list = [...list].sort(sorters[f.sort]);
  document.getElementById('resultCount').textContent = t('courses.count', { n: list.length });
  document.getElementById('classGrid').innerHTML = list.length
    ? list.map((c) => `<div class="col-md-6 col-xl-4">${classCard({ ...c, subject_icon: icon[c.subject_id] })}</div>`).join('')
    : `<div class="col-12"><div class="m-card empty-state"><i class="bi bi-search" aria-hidden="true"></i><h3>${esc(t('courses.emptyTitle'))}</h3><p>${esc(t('courses.empty'))}</p><a class="btn btn-primary mt-3" href="join-class.html">${esc(t('nav.joinClass'))}</a></div></div>`;
  initReveal();
}

function render() { renderFilters(); renderGrid(); }

/** Free trial: quick form (no admission form). Saves an enquiry with class_type = free_trial. */
function openTrial(classId) {
  const c = classes.find((x) => x.id === classId);
  const m = openModal({
    title: t('trial.title'),
    body: `<p class="text-muted small">${esc(t('trial.intro'))}</p>
      <div class="m-card m-card-sm mb-3"><div class="fw-bold">${esc(loc(c, 'title'))}</div><div class="small text-muted">${esc(loc(c, 'schedule'))}</div></div>
      <form id="trialForm" novalidate class="row g-3">
        <div class="col-12"><label class="form-label" for="tr-name">${esc(t('form.studentName'))}<span class="req">*</span></label><input class="form-control" id="tr-name" name="student_name" required minlength="2" maxlength="120"><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
        <div class="col-12"><label class="form-label" for="tr-guardian">${esc(t('form.guardianName'))}</label><input class="form-control" id="tr-guardian" name="guardian_name" maxlength="120"></div>
        <div class="col-12"><label class="form-label" for="tr-phone">${esc(t('form.phone'))}<span class="req">*</span></label><input class="form-control" id="tr-phone" name="phone" type="tel" inputmode="tel" required data-phone placeholder="07X XXX XXXX"><div class="invalid-feedback">${esc(t('validation.phone'))}</div></div>
        <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="tr-consent" name="consent" value="true" required><label class="form-check-label small" for="tr-consent">${esc(t('form.consent'))} <a href="privacy.html" target="_blank">${esc(t('footer.privacy'))}</a></label><div class="invalid-feedback">${esc(t('validation.consent'))}</div></div></div>
      </form><div id="trialDone" hidden></div>`,
    footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.cancel'))}</button><button type="submit" form="trialForm" class="btn btn-accent">${esc(t('trial.submit'))}</button>`
  });
  const form = m.el.querySelector('#trialForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const d = formData(form);
    const payload = { student_name: d.student_name.trim(), guardian_name: d.guardian_name || null, phone: normalizePhone(d.phone), subject_id: c.subject_id, class_id: c.id, grade: c.grade, medium: c.medium, class_mode: c.class_mode, class_type: 'free_trial', consent: true, referral_sources: [], language: getLanguage() };
    const btn = m.el.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await submitEnquiry(payload);
      const msg = studentEnquiryMessage({ ...payload, subject_label: c.subject_name_en, medium_label: opt('medium', c.medium), mode_label: opt('mode', c.class_mode), type_label: 'Free trial', requirements: `Free trial for ${c.title_en}` });
      form.hidden = true; btn.hidden = true;
      const done = m.el.querySelector('#trialDone');
      done.hidden = false;
      done.innerHTML = `<div class="success-panel py-3"><div class="s-icon"><i class="bi bi-check2" aria-hidden="true"></i></div><h3 class="h5">${esc(t('trial.savedTitle'))}</h3><p class="text-muted small">${esc(t('trial.saved'))}</p>
        <div class="d-grid gap-2">${c.trial_group_link ? `<a class="btn btn-accent" href="${esc(c.trial_group_link)}" target="_blank" rel="noopener"><i class="bi bi-people me-1" aria-hidden="true"></i>${esc(t('trial.openGroup'))}</a>` : ''}
        <button class="btn btn-whatsapp" type="button" data-wa><i class="bi bi-whatsapp me-1" aria-hidden="true"></i>${esc(t('form.openWhatsApp'))}</button></div>
        <div class="notice-box mt-3"><i class="bi bi-exclamation-circle" aria-hidden="true"></i><span>${esc(t('form.pressSend'))}</span></div></div>`;
      done.querySelector('[data-wa]').addEventListener('click', () => { markWhatsAppOpened('student', res.id); openWhatsApp(waLink(settings.contact.whatsapp, msg)); });
    } catch (err) { toastError(err); btn.disabled = false; }
  });
}

document.getElementById('classGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-trial]');
  if (b) openTrial(b.dataset.trial);
});

try { [subjects, classes] = await Promise.all([listSubjects(), listPublicClasses()]); } catch (err) { toastError(err); }
render();
onLanguageChange(render);
