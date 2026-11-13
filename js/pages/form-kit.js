/** Small helpers that build translated Bootstrap form fields for the public forms. */
import { t } from '../i18n/language.js';
import { esc } from '../utils/dom.js';

let n = 0;
const req = (r) => (r ? '<span class="req" aria-hidden="true">*</span>' : '');

export function input({ name, label, type = 'text', required = false, col = 'col-md-6', attrs = '', help = '', err }) {
  const id = `f-${name}-${++n}`;
  return `<div class="${col}"><label class="form-label" for="${id}">${esc(t(label))}${req(required)}</label>
    <input class="form-control" id="${id}" name="${name}" type="${type}" ${required ? 'required' : ''} ${attrs}>
    ${help ? `<div class="form-text">${esc(t(help))}</div>` : ''}
    <div class="invalid-feedback">${esc(t(err || (type === 'tel' ? 'validation.phone' : type === 'email' ? 'validation.email' : 'validation.required')))}</div></div>`;
}

export function textarea({ name, label, required = false, col = 'col-12', rows = 3, attrs = '', help = '' }) {
  const id = `f-${name}-${++n}`;
  return `<div class="${col}"><label class="form-label" for="${id}">${esc(t(label))}${req(required)}</label>
    <textarea class="form-control" id="${id}" name="${name}" rows="${rows}" ${required ? 'required' : ''} ${attrs}></textarea>
    ${help ? `<div class="form-text">${esc(t(help))}</div>` : ''}<div class="invalid-feedback">${esc(t('validation.required'))}</div></div>`;
}

export function select({ name, label, options, required = false, col = 'col-md-6', value = '' }) {
  const id = `f-${name}-${++n}`;
  return `<div class="${col}"><label class="form-label" for="${id}">${esc(t(label))}${req(required)}</label>
    <select class="form-select" id="${id}" name="${name}" ${required ? 'required' : ''}><option value="">${esc(t('form.choose'))}</option>
    ${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <div class="invalid-feedback">${esc(t('validation.select'))}</div></div>`;
}

/** Multi-select "pill" checkboxes. Value always arrives as an array (see formData data-multi). */
export function pills({ name, label, options, required = false, col = 'col-12', type = 'checkbox' }) {
  const base = `p-${name}-${++n}`;
  return `<div class="${col}"><fieldset class="check-group" ${required ? 'data-required-group' : ''} ${type === 'checkbox' ? `data-multi="${name}"` : ''}>
    <legend class="form-label">${esc(t(label))}${req(required)}</legend>
    <div class="check-pills">${options.map(([v, l], i) => `<input type="${type}" id="${base}-${i}" name="${name}" value="${esc(v)}"><label for="${base}-${i}">${esc(l)}</label>`).join('')}</div>
    <div class="invalid-feedback">${esc(t('validation.chooseOne'))}</div></fieldset></div>`;
}

export function consent(name = 'consent') {
  const id = `c-${++n}`;
  return `<div class="col-12"><div class="notice-box"><div class="form-check m-0">
    <input class="form-check-input" type="checkbox" id="${id}" name="${name}" value="true" required>
    <label class="form-check-label small" for="${id}">${esc(t('form.consent'))} <a href="privacy.html" target="_blank" rel="noopener">${esc(t('footer.privacy'))}</a></label>
    <div class="invalid-feedback">${esc(t('validation.consent'))}</div></div></div></div>`;
}

export const section = (titleKey, inner, num) => `<div class="form-section"><h2 class="form-section-title"><span class="n">${num}</span>${esc(t(titleKey))}</h2><div class="row g-3">${inner}</div></div>`;

export function successPanel({ title, body, waLabel = 'form.openWhatsApp', extra = '' }) {
  return `<div class="m-card success-panel" tabindex="-1">
    <div class="s-icon"><i class="bi bi-check2" aria-hidden="true"></i></div>
    <h2 class="h3">${esc(t(title))}</h2><p class="text-muted mx-auto" style="max-width:52ch">${esc(t(body))}</p>
    <div class="d-flex flex-wrap justify-content-center gap-2 mt-3">
      <button type="button" class="btn btn-whatsapp btn-lg" data-wa><i class="bi bi-whatsapp me-2" aria-hidden="true"></i>${esc(t(waLabel))}</button>${extra}</div>
    <div class="notice-box mt-4 text-start mx-auto" style="max-width:52ch"><i class="bi bi-exclamation-circle" aria-hidden="true"></i><span>${esc(t('form.pressSend'))}</span></div>
  </div>`;
}
