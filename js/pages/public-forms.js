/**
 * Public v2 forms: review / testimonial modal, audience survey, complaint form.
 * Every form saves to Supabase through a SECURITY DEFINER RPC (rate-limited on the server).
 * Nothing appears publicly until the admin approves it.
 */
import { api } from '../services/api.js';
import { t, getLanguage } from '../i18n/language.js';
import { esc, formData } from '../utils/dom.js';
import { validateForm, normalizePhone } from '../utils/validate.js';
import { openModal } from '../components/modal.js';
import { showToast, toastError } from '../components/toast.js';
import { starInputHtml, copyText } from '../components/ui.js';
import { OPTIONS } from '../config/app.config.js';

const roleOpts = () => ['student', 'parent', 'other'].map((r) => `<option value="${r}">${esc(t(`review.role.${r}`))}</option>`).join('');
const gradeOpts = () => `<option value="">${esc(t('form.choose'))}</option>` + OPTIONS.grades.map((g) => `<option value="${esc(g)}">${esc(t('common.grade'))} ${esc(g)}</option>`).join('');

/** Review a teacher (teacherId) or the centre (testimonial, teacherId = null). */
export function openReviewModal({ teacherId = null, teacherName = '' } = {}) {
  const m = openModal({
    title: teacherId ? t('review.titleTeacher', { name: teacherName }) : t('review.titleCentre'),
    body: `<form id="reviewForm" novalidate class="row g-3">
      <div class="col-12"><span class="form-label d-block">${esc(t('review.rating'))}<span class="req">*</span></span>${starInputHtml('rating')}<div class="invalid-feedback d-block" data-star-err hidden>${esc(t('review.pickStars'))}</div></div>
      <div class="col-sm-6"><label class="form-label" for="rv-name">${esc(t('review.name'))}<span class="req">*</span></label><input class="form-control" id="rv-name" name="reviewer_name" required minlength="2" maxlength="80"><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
      <div class="col-sm-6"><label class="form-label" for="rv-role">${esc(t('review.iam'))}</label><select class="form-select" id="rv-role" name="reviewer_role">${roleOpts()}</select></div>
      <div class="col-sm-6"><label class="form-label" for="rv-grade">${esc(t('form.grade'))}</label><select class="form-select" id="rv-grade" name="grade">${gradeOpts()}</select></div>
      <div class="col-sm-6"><label class="form-label" for="rv-phone">${esc(t('review.phone'))}</label><input class="form-control" id="rv-phone" name="phone" type="tel" inputmode="tel" data-phone placeholder="07X XXX XXXX"><div class="form-text">${esc(t('review.phoneHelp'))}</div><div class="invalid-feedback">${esc(t('validation.phone'))}</div></div>
      <div class="col-12"><label class="form-label" for="rv-comment">${esc(t('review.comment'))}<span class="req">*</span></label><textarea class="form-control" id="rv-comment" name="comment" rows="4" required minlength="5" maxlength="1000"></textarea><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
      <div class="col-12"><div class="notice-box"><i class="bi bi-shield-check" aria-hidden="true"></i><span>${esc(t('review.moderated'))}</span></div></div>
    </form><div id="reviewDone" hidden></div>`,
    footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.cancel'))}</button><button type="submit" form="reviewForm" class="btn btn-primary">${esc(t('review.submit'))}</button>`
  });
  const form = m.el.querySelector('#reviewForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const starOk = !!form.querySelector('input[name=rating]:checked');
    m.el.querySelector('[data-star-err]').hidden = starOk;
    if (!validateForm(form) || !starOk) return;
    const d = formData(form);
    const btn = m.el.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api.rpc('submit_review', { p: { teacher_id: teacherId, reviewer_name: d.reviewer_name.trim(), reviewer_role: d.reviewer_role, grade: d.grade || null, rating: Number(d.rating), comment: d.comment.trim(), phone: d.phone ? normalizePhone(d.phone) : null } });
      form.hidden = true; btn.hidden = true;
      const done = m.el.querySelector('#reviewDone');
      done.hidden = false;
      done.innerHTML = `<div class="success-panel py-3"><div class="s-icon"><i class="bi bi-check2" aria-hidden="true"></i></div><h3 class="h5">${esc(t('review.thanks'))}</h3><p class="text-muted small mb-0">${esc(t('review.thanksText'))}</p></div>`;
    } catch (err) { toastError(err); btn.disabled = false; }
  });
}

/** 3-step survey card (who you are → what you need → ideas). */
export function renderSurvey(mount) {
  const NEEDS = ['past_papers', 'model_papers', 'revision', 'recordings', 'online', 'new_subjects', 'exam_tips', 'career'];
  let step = 1;
  mount.innerHTML = `<form id="surveyForm" novalidate>
    <div class="d-flex justify-content-between align-items-center mb-3 gap-2"><b>${esc(t('survey.title'))}</b><div class="step-dots" aria-hidden="true"><span class="on"></span><span></span><span></span></div></div>
    <div data-step="1" class="row g-3">
      <div class="col-sm-6"><label class="form-label" for="sv-role">${esc(t('review.iam'))}</label><select class="form-select" id="sv-role" name="role">${roleOpts()}<option value="teacher">${esc(t('review.role.teacher'))}</option></select></div>
      <div class="col-sm-6"><label class="form-label" for="sv-grade">${esc(t('form.grade'))}</label><select class="form-select" id="sv-grade" name="grade">${gradeOpts()}</select></div>
      <div class="col-12"><span class="form-label d-block">${esc(t('survey.rating'))}</span>${starInputHtml('rating', false)}</div>
    </div>
    <div data-step="2" hidden><span class="form-label d-block mb-2">${esc(t('survey.needs'))}</span>
      <div class="check-pills">${NEEDS.map((n) => `<input type="checkbox" id="sv-n-${n}" name="needs" value="${n}"><label for="sv-n-${n}">${esc(t(`survey.need.${n}`))}</label>`).join('')}</div>
      <div class="mt-3"><label class="form-label" for="sv-improve">${esc(t('survey.improve'))}</label><textarea class="form-control" id="sv-improve" name="improve" rows="3" maxlength="1000"></textarea></div>
    </div>
    <div data-step="3" class="row g-3" hidden>
      <div class="col-12"><label class="form-label" for="sv-ideas">${esc(t('survey.ideas'))}</label><textarea class="form-control" id="sv-ideas" name="ideas" rows="3" maxlength="1000" placeholder="${esc(t('survey.ideasPh'))}"></textarea></div>
      <div class="col-sm-6"><label class="form-label" for="sv-name">${esc(t('survey.name'))}</label><input class="form-control" id="sv-name" name="name" maxlength="80"></div>
      <div class="col-sm-6"><label class="form-label" for="sv-contact">${esc(t('survey.contact'))}</label><input class="form-control" id="sv-contact" name="contact" maxlength="80" placeholder="07X XXX XXXX"></div>
    </div>
    <div class="d-flex justify-content-between gap-2 mt-4">
      <button type="button" class="btn btn-ghost" data-prev hidden><i class="bi bi-arrow-left" aria-hidden="true"></i>${esc(t('common.back'))}</button>
      <span></span>
      <button type="button" class="btn btn-primary" data-next>${esc(t('common.next'))}<i class="bi bi-arrow-right" aria-hidden="true"></i></button>
      <button type="submit" class="btn btn-accent" data-send hidden><i class="bi bi-send" aria-hidden="true"></i>${esc(t('survey.send'))}</button>
    </div>
  </form>`;
  const form = mount.querySelector('form');
  const show = () => {
    form.querySelectorAll('[data-step]').forEach((s) => { s.hidden = Number(s.dataset.step) !== step; });
    form.querySelectorAll('.step-dots span').forEach((d, i) => d.classList.toggle('on', i < step));
    form.querySelector('[data-prev]').hidden = step === 1;
    form.querySelector('[data-next]').hidden = step === 3;
    form.querySelector('[data-send]').hidden = step !== 3;
  };
  form.querySelector('[data-next]').addEventListener('click', () => { step = Math.min(3, step + 1); show(); });
  form.querySelector('[data-prev]').addEventListener('click', () => { step = Math.max(1, step - 1); show(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const needs = [...form.querySelectorAll('input[name=needs]:checked')].map((x) => x.value);
    if (!needs.length && !String(d.improve || '').trim() && !String(d.ideas || '').trim()) { showToast(t('survey.needOne'), 'warning'); step = 2; show(); return; }
    const btn = form.querySelector('[data-send]');
    btn.disabled = true;
    try {
      await api.rpc('submit_feedback', { p: { role: d.role, grade: d.grade || null, rating: d.rating ? Number(d.rating) : null, needs, improve: d.improve || null, ideas: d.ideas || null, name: d.name || null, contact: d.contact || null, language: getLanguage() } });
      mount.innerHTML = `<div class="success-panel py-4"><div class="s-icon"><i class="bi bi-heart" aria-hidden="true"></i></div><h3 class="h5">${esc(t('survey.thanks'))}</h3><p class="text-muted small mb-0">${esc(t('survey.thanksText'))}</p></div>`;
    } catch (err) { toastError(err); btn.disabled = false; }
  });
  show();
}

/** Complaint form — returns a reference number the visitor can quote later. */
export function renderComplaint(mount) {
  const CATS = ['teaching', 'fees', 'facility', 'staff', 'online', 'other'];
  mount.innerHTML = `<form id="complaintForm" novalidate class="row g-3">
    <div class="col-sm-6"><label class="form-label" for="cp-name">${esc(t('form.fullName'))}<span class="req">*</span></label><input class="form-control" id="cp-name" name="name" required minlength="2" maxlength="120"><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
    <div class="col-sm-6"><label class="form-label" for="cp-phone">${esc(t('form.phone'))}<span class="req">*</span></label><input class="form-control" id="cp-phone" name="phone" type="tel" inputmode="tel" required data-phone placeholder="07X XXX XXXX"><div class="invalid-feedback">${esc(t('validation.phone'))}</div></div>
    <div class="col-sm-6"><label class="form-label" for="cp-email">${esc(t('form.emailOptional'))}</label><input class="form-control" id="cp-email" name="email" type="email" maxlength="160"><div class="invalid-feedback">${esc(t('validation.email'))}</div></div>
    <div class="col-sm-6"><label class="form-label" for="cp-cat">${esc(t('complaint.category'))}<span class="req">*</span></label><select class="form-select" id="cp-cat" name="category" required>${CATS.map((c) => `<option value="${c}">${esc(t(`complaint.cat.${c}`))}</option>`).join('')}</select></div>
    <div class="col-12"><label class="form-label" for="cp-subject">${esc(t('complaint.subject'))}<span class="req">*</span></label><input class="form-control" id="cp-subject" name="subject" required maxlength="140"><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
    <div class="col-12"><label class="form-label" for="cp-details">${esc(t('complaint.details'))}<span class="req">*</span></label><textarea class="form-control" id="cp-details" name="details" rows="4" required minlength="10" maxlength="2000"></textarea><div class="invalid-feedback">${esc(t('complaint.detailsErr'))}</div></div>
    <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="cp-consent" required><label class="form-check-label small" for="cp-consent">${esc(t('complaint.consent'))}</label><div class="invalid-feedback">${esc(t('validation.consent'))}</div></div></div>
    <div class="col-12 d-flex justify-content-end"><button type="submit" class="btn btn-primary"><i class="bi bi-send" aria-hidden="true"></i>${esc(t('complaint.submit'))}</button></div>
  </form>`;
  const form = mount.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const d = formData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await api.rpc('submit_complaint', { p: { name: d.name.trim(), phone: normalizePhone(d.phone), email: d.email || null, category: d.category, subject: d.subject.trim(), details: d.details.trim() } });
      mount.innerHTML = `<div class="success-panel py-4"><div class="s-icon"><i class="bi bi-check2" aria-hidden="true"></i></div><h3 class="h5">${esc(t('complaint.saved'))}</h3>
        <p class="text-muted small">${esc(t('complaint.savedText'))}</p>
        <div class="ref-box"><span>${esc(t('complaint.ref'))}</span><b>${esc(res.reference_no)}</b><button type="button" class="btn btn-sm btn-ghost" data-copy><i class="bi bi-clipboard" aria-hidden="true"></i>${esc(t('common.copy'))}</button></div></div>`;
      mount.querySelector('[data-copy]').addEventListener('click', async () => { await copyText(res.reference_no); showToast(t('common.copied'), 'success'); });
    } catch (err) { toastError(err); btn.disabled = false; }
  });
}
