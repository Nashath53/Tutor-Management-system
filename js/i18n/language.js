/**
 * Tiny i18n engine.
 *  - Mark static text with data-i18n="key" (also data-i18n-placeholder, data-i18n-aria, data-i18n-title).
 *  - In JavaScript use t('key', { vars }).
 *  - Bilingual database fields use name_en / name_ta → loc(row, 'name').
 */
import en from './en.js';
import ta from './ta.js';
import { store } from '../utils/storage.js';

const dictionaries = { en, ta };
const KEY = 'mentora-lang';
let current = store.get(KEY) || ((navigator.language || '').toLowerCase().startsWith('ta') ? 'ta' : 'en');
if (!dictionaries[current]) current = 'en';

export const getLanguage = () => current;

/** Translate a key. Pass lang='en' to force English (e.g. WhatsApp messages to the office). */
export function t(key, vars = {}, lang = current) {
  let s = dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Option label, e.g. opt('medium','tamil') → "Tamil" / "தமிழ்" */
export function opt(group, value, lang = current) {
  const key = `opt.${group}.${value}`;
  const v = t(key, {}, lang);
  return v === key ? String(value ?? '') : v;
}

/** Localised DB field: loc(subject,'name') → subject.name_ta when Tamil is active (falls back to English) */
export function loc(row, field) {
  if (!row) return '';
  return (current === 'ta' && row[`${field}_ta`]) || row[`${field}_en`] || row[field] || '';
}

export function applyTranslations(root = document) {
  document.documentElement.lang = current;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === current)));
}

export function setLanguage(lang) {
  if (!dictionaries[lang] || lang === current) return;
  current = lang;
  store.set(KEY, lang);
  applyTranslations();
  window.dispatchEvent(new CustomEvent('mentora:language', { detail: lang }));
}

export function onLanguageChange(fn) {
  window.addEventListener('mentora:language', fn);
}
