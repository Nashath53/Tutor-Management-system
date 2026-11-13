import { initPublicPage } from '../components/layout.js';
import { listSubjects } from '../services/subject.service.js';
import { submitApplication, uploadApplicationFile } from '../services/teacher.service.js';
import { markWhatsAppOpened } from '../services/enquiry.service.js';
import { t, loc, opt, onLanguageChange } from '../i18n/language.js';
import { formData, setBusy, esc } from '../utils/dom.js';
import { validateForm, normalizePhone, validateFile } from '../utils/validate.js';
import { protectForm } from '../utils/form-guard.js';
import { waLink, teacherApplicationMessage, openWhatsApp } from '../utils/whatsapp.js';
import { OPTIONS, APP } from '../config/app.config.js';
import { toastError } from '../components/toast.js';
import { input, textarea, pills, consent, section, successPanel } from './form-kit.js';

const settings = await initPublicPage('teach');
const mount = document.getElementById('formMount');
let subjects = [];
try { subjects = await listSubjects(); } catch (e) { console.warn(e); }

function fileField(name, label, multiple) {
  return `<div class="col-md-6"><label class="form-label" for="f-${name}">${esc(t(label))}</label>
    <input class="form-control" type="file" id="f-${name}" name="${name}" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" ${multiple ? 'multiple' : ''}>
    <div class="form-text">${esc(t('teach.fileHelp', { mb: APP.maxUploadMb }))}</div><div class="invalid-feedback" data-file-error></div></div>`;
}

function render() {
  mount.innerHTML = `<form id="teacherForm" class="m-card" novalidate>
    ${section('teach.sPersonal', `
      ${input({ name: 'full_name', label: 'form.fullName', required: true, attrs: 'minlength="2" maxlength="120" autocomplete="name"' })}
      ${input({ name: 'living_place', label: 'form.livingPlace', required: true, attrs: 'maxlength="120"' })}
      ${input({ name: 'phone', label: 'form.phone', type: 'tel', required: true, attrs: 'data-phone inputmode="tel" placeholder="07X XXX XXXX"' })}
      ${input({ name: 'whatsapp', label: 'form.whatsapp', type: 'tel', attrs: 'data-phone inputmode="tel" placeholder="07X XXX XXXX"' })}
      ${input({ name: 'email', label: 'form.emailOptional', type: 'email', col: 'col-12', attrs: 'maxlength="160"' })}`, 1)}
    ${section('teach.sTeaching', `
      ${pills({ name: 'subject_ids', label: 'teach.subjects', required: true, options: subjects.map((s) => [s.id, loc(s, 'name')]) })}
      ${pills({ name: 'grades', label: 'teach.grades', required: true, options: OPTIONS.grades.map((g) => [g, g]) })}
      ${pills({ name: 'mediums', label: 'teach.mediums', required: true, options: OPTIONS.mediums.map((m) => [m, opt('medium', m)]) })}
      ${pills({ name: 'class_types', label: 'teach.classTypes', required: true, options: OPTIONS.classTypes.map((m) => [m, opt('classType', m)]) })}
      ${pills({ name: 'class_modes', label: 'teach.modes', required: true, options: OPTIONS.modes.map((m) => [m, opt('mode', m)]) })}`, 2)}
    ${section('teach.sQualifications', `
      ${textarea({ name: 'qualifications', label: 'teach.qualifications', required: true, attrs: 'maxlength="1500"', help: 'teach.qualificationsHelp' })}
      ${input({ name: 'experience_years', label: 'teach.experienceYears', type: 'number', required: true, col: 'col-md-4', attrs: 'min="0" max="60" step="1"' })}
      ${textarea({ name: 'experience_details', label: 'teach.experienceDetails', col: 'col-md-8', rows: 2, attrs: 'maxlength="1500"' })}`, 3)}
    ${section('teach.sAvailability', `
      ${pills({ name: 'available_days', label: 'teach.days', required: true, options: OPTIONS.days.map((d) => [d, opt('day', d)]) })}
      ${pills({ name: 'preferred_times', label: 'teach.times', options: OPTIONS.times.map((d) => [d, opt('time', d)]) })}
      ${textarea({ name: 'additional_info', label: 'teach.additional', attrs: 'maxlength="1500"' })}`, 4)}
    ${section('teach.sDocuments', `
      <div class="col-12"><div class="notice-box"><i class="bi bi-shield-lock" aria-hidden="true"></i><span>${esc(t('teach.docsPrivate'))}</span></div></div>
      ${fileField('cv', 'teach.cv', false)}${fileField('certificates', 'teach.certificates', true)}
      ${consent()}`, 5)}
    <div class="d-flex flex-column flex-sm-row gap-2 align-items-sm-center justify-content-between">
      <small class="text-muted">${esc(t('form.savedFirst'))}</small>
      <button class="btn btn-primary btn-lg" type="submit"><i class="bi bi-send me-2" aria-hidden="true"></i>${esc(t('teach.submit'))}</button>
    </div></form>`;
  const form = mount.querySelector('form');
  const guard = protectForm(form, 'teach-with-us');
  form.addEventListener('submit', (e) => onSubmit(e, form, guard));
}

function checkFiles(form) {
  let ok = true;
  form.querySelectorAll('input[type=file]').forEach((el) => {
    const errors = [...el.files].map((f) => validateFile(f, { maxMb: APP.maxUploadMb })).filter(Boolean);
    const max = el.multiple && el.files.length > 5 ? t('teach.maxFiles') : null;
    const msg = max || errors[0] || '';
    el.setCustomValidity(msg);
    el.parentElement.querySelector('[data-file-error]').textContent = msg;
    if (msg) ok = false;
  });
  return ok;
}

async function onSubmit(e, form, guard) {
  e.preventDefault();
  const filesOk = checkFiles(form);
  if (!validateForm(form) || !filesOk) return;
  if (!navigator.onLine) return toastError(new Error(t('teach.needOnline')));
  const d = formData(form);
  const btn = form.querySelector('[type=submit]');
  setBusy(btn, true, t('form.saving'));
  try {
    const cvFile = form.querySelector('[name=cv]').files[0];
    const certFiles = [...form.querySelector('[name=certificates]').files];
    const cv_path = cvFile ? await uploadApplicationFile(cvFile) : null;
    const certificate_paths = [];
    for (const f of certFiles) certificate_paths.push(await uploadApplicationFile(f));
    const payload = {
      full_name: d.full_name.trim(), phone: normalizePhone(d.phone), whatsapp: normalizePhone(d.whatsapp) || null, email: d.email?.trim() || null,
      living_place: d.living_place.trim(), subject_ids: d.subject_ids, grades: d.grades, mediums: d.mediums, class_types: d.class_types,
      class_modes: d.class_modes, qualifications: d.qualifications.trim(), experience_years: Number(d.experience_years || 0),
      experience_details: d.experience_details?.trim() || null, available_days: d.available_days, preferred_times: d.preferred_times,
      additional_info: d.additional_info?.trim() || null, cv_path, certificate_paths, consent: true
    };
    const { id } = await submitApplication(payload);
    const msg = teacherApplicationMessage({
      ...payload, phone: d.phone, whatsapp: d.whatsapp,
      subject_labels: d.subject_ids.map((x) => subjects.find((s) => s.id === x)?.name_en).filter(Boolean),
      medium_labels: d.mediums.map((m) => opt('medium', m, 'en')), type_labels: d.class_types.map((m) => opt('classType', m, 'en')),
      mode_labels: d.class_modes.map((m) => opt('mode', m, 'en')), day_labels: d.available_days.map((m) => opt('day', m, 'en')),
      time_labels: d.preferred_times.map((m) => opt('time', m, 'en'))
    });
    guard.clear();
    mount.innerHTML = successPanel({ title: 'teach.savedTitle', body: 'teach.saved' });
    mount.querySelector('[data-wa]').addEventListener('click', () => { markWhatsAppOpened('teacher', id); openWhatsApp(waLink(settings.contact.whatsapp, msg)); });
    mount.querySelector('.success-panel').focus();
  } catch (err) { toastError(err); setBusy(btn, false); }
}

render();
onLanguageChange(() => { if (mount.querySelector('form')) render(); });

/* ---------- Earnings calculator (illustration only; real figures come from settlements) ---------- */
const calc = { students: 15, fee: 2500, sessions: 4 };
function renderCalc() {
  const el = document.getElementById('calcMount');
  if (!el) return;
  const range = (k, min, max, step, label, fmt) => `<div><div class="d-flex justify-content-between small"><label class="fw-semibold" for="calc-${k}">${esc(t(label))}</label><b data-out="${k}">${fmt(calc[k])}</b></div>
    <input type="range" class="form-range" id="calc-${k}" data-calc="${k}" min="${min}" max="${max}" step="${step}" value="${calc[k]}"></div>`;
  el.innerHTML = `${range('students', 1, 60, 1, 'teach.calcStudents', (v) => v)}
    ${range('fee', 500, 6000, 100, 'teach.calcFee', (v) => `LKR ${Number(v).toLocaleString()}`)}
    ${range('sessions', 1, 12, 1, 'teach.calcSessions', (v) => v)}
    <div class="calc-out" aria-live="polite"><div><span>${esc(t('teach.calcFirst'))}</span><b data-r="first"></b></div><div><span>${esc(t('teach.calcLater'))}</span><b data-r="later"></b></div><div class="take"><span>${esc(t('teach.calcYear'))}</span><b data-r="year"></b></div></div>
    <p class="small text-muted mb-0">${esc(t('teach.calcNote'))}</p>`;
  const update = () => {
    const gross = calc.students * calc.fee * calc.sessions;
    const freeStudents = Math.min(calc.students, 20);
    const first = gross - (calc.students - freeStudents) * calc.fee * calc.sessions * 0.05;
    const later = gross * 0.95;
    const fmt = (v) => `LKR ${Math.round(v).toLocaleString()}`;
    el.querySelector('[data-r=first]').textContent = fmt(first);
    el.querySelector('[data-r=later]').textContent = fmt(later);
    el.querySelector('[data-r=year]').textContent = fmt(first + later * 11);
    el.querySelector('[data-out=students]').textContent = calc.students;
    el.querySelector('[data-out=fee]').textContent = `LKR ${Number(calc.fee).toLocaleString()}`;
    el.querySelector('[data-out=sessions]').textContent = calc.sessions;
  };
  el.querySelectorAll('[data-calc]').forEach((r) => r.addEventListener('input', () => { calc[r.dataset.calc] = Number(r.value); update(); }));
  update();
}
renderCalc();
onLanguageChange(renderCalc);
