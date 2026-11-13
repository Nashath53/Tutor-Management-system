import { t } from '../i18n/language.js';

/** Normalise Sri Lankan mobile numbers to 94XXXXXXXXX. Returns null if invalid. */
export function normalizePhone(value) {
  let x = String(value || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (x.startsWith('0094')) x = x.slice(2);
  if (/^0\d{9}$/.test(x)) x = '94' + x.slice(1);
  if (/^7\d{8}$/.test(x)) x = '94' + x;
  return /^94\d{9}$/.test(x) ? x : null;
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/**
 * Validate a Bootstrap form. Adds .was-validated, checks phone fields
 * (data-phone), optional emails, and required checkbox groups (data-required-group).
 * Returns true when valid; focuses the first invalid field otherwise.
 */
export function validateForm(form) {
  form.querySelectorAll('[data-phone]').forEach((el) => {
    const v = el.value.trim();
    if (!v && !el.required) return el.setCustomValidity('');
    el.setCustomValidity(normalizePhone(v) ? '' : t('validation.phone'));
  });
  form.querySelectorAll('input[type=email]').forEach((el) => {
    const v = el.value.trim();
    el.setCustomValidity(!v || isEmail(v) ? '' : t('validation.email'));
  });
  let groupsOk = true;
  form.querySelectorAll('[data-required-group]').forEach((g) => {
    const ok = g.querySelectorAll('input:checked').length > 0;
    g.classList.toggle('is-invalid', !ok);
    if (!ok) groupsOk = false;
  });
  form.classList.add('was-validated');
  const ok = form.checkValidity() && groupsOk;
  if (!ok) {
    const first = form.querySelector(':invalid, .check-group.is-invalid input');
    first?.focus({ preventScroll: false });
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return ok;
}

export function validateFile(file, { maxMb = 5, types = ['application/pdf', 'image/jpeg', 'image/png'] } = {}) {
  if (!file) return null;
  if (file.size > maxMb * 1024 * 1024) return t('validation.fileSize', { mb: maxMb });
  if (!types.includes(file.type)) return t('validation.fileType');
  return null;
}
