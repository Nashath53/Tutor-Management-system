/** Shared helpers for admin pages: lookups, labels, tabs. */
import { api } from '../../services/api.js';
import { indexBy, esc } from '../../utils/dom.js';
import { OPTIONS } from '../../config/app.config.js';
import { humanize } from '../../utils/format.js';

export async function lookups(...names) {
  const out = {};
  await Promise.all(names.map(async (n) => {
    const rows = await api.select(n);
    out[n] = rows;
    out[n + 'ById'] = indexBy(rows);
  }));
  return out;
}

export const classLabel = (c) => (c ? `${c.title_en} · G${c.grade} · ${humanize(c.medium)}` : '—');
export const studentLabel = (s) => (s ? `${s.student_code} · ${s.full_name}` : '—');
export const teacherLabel = (t) => (t ? t.display_name || t.full_name : '—');
export const opts = (list) => list.map((v) => ({ value: v, label: humanize(v) }));
export const gradeOpts = () => OPTIONS.grades.map((g) => ({ value: g, label: `Grade ${g}` }));
export const phoneLink = (p) => (p ? `<a href="tel:+${esc(p)}">+${esc(p)}</a>` : '—');

/** Simple tab strip. tabs: [{ id, label, count }]. onChange(id) */
export function tabs(mount, list, onChange, initial) {
  let current = initial || list[0].id;
  const draw = () => {
    mount.innerHTML = `<div class="m-tabs" role="tablist">${list.map((t) => `<button type="button" role="tab" aria-selected="${t.id === current}" data-tab="${t.id}">${esc(t.label)}${t.count ? `<span class="count">${t.count}</span>` : ''}</button>`).join('')}</div>`;
  };
  draw();
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === current) return;
    current = b.dataset.tab; draw(); onChange(current);
  });
  onChange(current);
  return { set(list2) { list = list2; draw(); } };
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // prevent spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** KPI tile (same look as the dashboard). tone: '' | 't-teal' | 't-gold' | 't-green' | 't-red' | 'accent' */
export const kpiCard = (icon, label, value, foot = '', tone = '', spark = '') => `<div class="kpi ${tone}">
  <div class="k-label"><span class="k-ico"><i class="bi ${icon}" aria-hidden="true"></i></span>${esc(label)}</div><div class="k-value">${esc(value)}</div><div class="k-foot">${foot}</div>${spark ? `<div class="k-spark" aria-hidden="true">${spark}</div>` : ''}</div>`;

/**
 * Two-step confirmation for deletions that could hide a mistake.
 * Step 1 asks for a reason (saved in the audit log); step 2 asks "are you sure?".
 * Resolves to the reason string, or null if cancelled at either step.
 */
export async function confirmTwice({ title, message, finalMessage, confirmLabel = 'Delete' }) {
  const { confirmDialog } = await import('../../components/modal.js');
  const reason = await confirmDialog({ title, message, reason: true, reasonRequired: true, reasonLabel: 'Reason (saved in the audit log)', danger: true, confirmLabel: 'Continue' });
  if (reason == null) return null;
  const ok = await confirmDialog({ title: 'Please confirm again', message: finalMessage || 'This cannot be undone from the app. Are you absolutely sure?', danger: true, confirmLabel });
  return ok == null ? null : reason;
}
