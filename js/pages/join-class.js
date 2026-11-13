import { initPublicPage } from '../components/layout.js';
import { listSubjects } from '../services/subject.service.js';
import { listPublicClasses } from '../services/class.service.js';
import { submitEnquiry, markWhatsAppOpened } from '../services/enquiry.service.js';
import { t, loc, opt, getLanguage, onLanguageChange } from '../i18n/language.js';
import { formData, setBusy, qs, esc } from '../utils/dom.js';
import { validateForm, normalizePhone } from '../utils/validate.js';
import { protectForm } from '../utils/form-guard.js';
import { waLink, studentEnquiryMessage, openWhatsApp } from '../utils/whatsapp.js';
import { OPTIONS } from '../config/app.config.js';
import { toastError } from '../components/toast.js';
import { addDraft } from '../pwa/offline-queue.service.js';
import { input, textarea, select, pills, consent, section, successPanel } from './form-kit.js';

const settings = await initPublicPage('join');
const mount = document.getElementById('formMount');
let subjects = [], classes = [];
try { [subjects, classes] = await Promise.all([listSubjects(), listPublicClasses()]); } catch (e) { console.warn(e); }
const preClass = classes.find((c) => c.id === qs('class'));

function render() {
  const keep = mount.querySelector('form') ? formData(mount.querySelector('form')) : null;
  mount.innerHTML = `<form id="enquiryForm" class="m-card" novalidate>
    ${section('join.sStudent', `
      ${input({ name: 'student_name', label: 'form.studentName', required: true, attrs: 'minlength="2" maxlength="120" autocomplete="name"' })}
      ${input({ name: 'guardian_name', label: 'form.guardianName', required: true, attrs: 'maxlength="120"' })}
      ${input({ name: 'phone', label: 'form.phone', type: 'tel', required: true, attrs: 'data-phone inputmode="tel" placeholder="07X XXX XXXX" autocomplete="tel"' })}
      ${input({ name: 'whatsapp', label: 'form.whatsapp', type: 'tel', attrs: 'data-phone inputmode="tel" placeholder="07X XXX XXXX"', help: 'form.whatsappHelp' })}
      ${input({ name: 'email', label: 'form.emailOptional', type: 'email', col: 'col-12', attrs: 'autocomplete="email" maxlength="160"' })}`, 1)}
    ${section('join.sClass', `
      ${select({ name: 'subject_id', label: 'form.subject', required: true, options: subjects.map((s) => [s.id, loc(s, 'name')]), value: preClass?.subject_id })}
      ${select({ name: 'grade', label: 'form.grade', required: true, options: OPTIONS.grades.map((g) => [g, `${t('common.grade')} ${g}`]), value: preClass?.grade })}
      ${select({ name: 'medium', label: 'form.medium', required: true, options: OPTIONS.mediums.map((m) => [m, opt('medium', m)]), value: preClass?.medium })}
      ${select({ name: 'class_mode', label: 'form.mode', required: true, options: OPTIONS.modes.map((m) => [m, opt('mode', m)]), value: preClass?.class_mode })}
      ${select({ name: 'class_type', label: 'form.classType', required: true, options: OPTIONS.enquiryClassTypes.map((m) => [m, opt('classType', m)]), value: preClass ? 'free_trial' : '' })}
      ${input({ name: 'preferred_join_date', label: 'form.joinDate', type: 'date' })}`, 2)}
    ${section('join.sMore', `
      ${textarea({ name: 'requirements', label: 'form.requirements', attrs: 'maxlength="1000"' })}
      ${pills({ name: 'referral_sources', label: 'form.referral', options: OPTIONS.referral.map((r) => [r, opt('referral', r)]) })}
      ${input({ name: 'referral_note', label: 'form.referralNote', col: 'col-12', attrs: 'maxlength="200"' })}
      ${consent()}`, 3)}
    <div class="d-flex flex-column flex-sm-row gap-2 align-items-sm-center justify-content-between">
      <small class="text-muted">${esc(t('form.savedFirst'))}</small>
      <button class="btn btn-primary btn-lg" type="submit"><i class="bi bi-send me-2" aria-hidden="true"></i>${esc(t('join.submit'))}</button>
    </div></form>`;
  const form = mount.querySelector('form');
  if (keep) restoreValues(form, keep);
  const guard = protectForm(form, 'join-class');
  form.addEventListener('submit', (e) => onSubmit(e, form, guard));
}

function restoreValues(form, d) {
  form.querySelectorAll('input,select,textarea').forEach((el) => {
    if (!(el.name in d)) return;
    const v = d[el.name];
    if (el.type === 'checkbox') el.checked = Array.isArray(v) ? v.includes(el.value) : v === el.value;
    else el.value = v;
  });
}

async function onSubmit(e, form, guard) {
  e.preventDefault();
  if (!validateForm(form)) return;
  const d = formData(form);
  const subject = subjects.find((s) => s.id === d.subject_id);
  const payload = {
    student_name: d.student_name.trim(), guardian_name: d.guardian_name.trim(), phone: normalizePhone(d.phone),
    whatsapp: normalizePhone(d.whatsapp) || null, email: d.email?.trim() || null, subject_id: d.subject_id, class_id: preClass?.id || null,
    grade: d.grade, medium: d.medium, class_mode: d.class_mode, class_type: d.class_type, preferred_join_date: d.preferred_join_date || null,
    requirements: d.requirements?.trim() || null, referral_sources: d.referral_sources, referral_note: d.referral_note?.trim() || null,
    consent: true, language: getLanguage()
  };
  const msg = studentEnquiryMessage({
    ...payload, phone: d.phone, subject_label: subject?.name_en, medium_label: opt('medium', d.medium, 'en'), mode_label: opt('mode', d.class_mode, 'en'),
    type_label: opt('classType', d.class_type, 'en'), referral_labels: d.referral_sources.map((r) => opt('referral', r, 'en'))
  });
  const btn = form.querySelector('[type=submit]');
  setBusy(btn, true, t('form.saving'));
  try {
    let id = null;
    if (!navigator.onLine) {
      await addDraft('enquiry', payload, t('join.offlineDraft'));
    } else {
      id = (await submitEnquiry(payload)).id;
    }
    guard.clear();
    mount.innerHTML = successPanel({ title: navigator.onLine ? 'join.savedTitle' : 'join.queuedTitle', body: navigator.onLine ? 'join.saved' : 'join.queued' });
    mount.querySelector('[data-wa]').addEventListener('click', () => { if (id) markWhatsAppOpened('student', id); openWhatsApp(waLink(settings.contact.whatsapp, msg)); });
    mount.querySelector('.success-panel').focus();
    window.scrollTo({ top: mount.offsetTop - 100, behavior: 'smooth' });
  } catch (err) { toastError(err); setBusy(btn, false); }
}

render();
onLanguageChange(() => { if (mount.querySelector('form')) render(); });
