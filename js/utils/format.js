import { esc } from './dom.js';
import { getLanguage, t } from '../i18n/language.js';

export function money(n) {
  const v = Number(n || 0);
  return 'LKR ' + v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const locale = () => (getLanguage() === 'ta' ? 'ta-LK' : 'en-GB');

export function fmtDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.slice(0, 7).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
}

/** Local (Sri Lanka) date as YYYY-MM-DD */
export function todayISO(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}
export function monthStart(date = new Date()) {
  return todayISO(date).slice(0, 7) + '-01';
}
export function addMonths(ym01, n) {
  const [y, m] = ym01.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function humanize(s) {
  return String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Status pill. Uses translation key status.<value> when available. */
export function badge(status, label) {
  const key = `status.${status}`;
  const tr = t(key);
  const text = label || (tr !== key ? tr : humanize(status));
  return `<span class="badge-status s-${esc(status)}">${esc(text)}</span>`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
