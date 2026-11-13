import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud } from '../../components/crud.js';
import { listSubjects, saveSubject } from '../../services/subject.service.js';
import { gradeOpts } from './admin-common.js';
import { esc } from '../../utils/dom.js';
import { lookups } from './admin-common.js';
let L = { classes: [], enrollments: [] };
const live = ['trial', 'trial_completed', 'admission_requested', 'approved'];

const { content } = await initAdminPage({ page: 'subjects', title: 'Subjects' });
createCrud(content, {
  intro: 'Subjects appear on the public website in English and Tamil. The one-letter <b>code</b> is used in enrolment codes (e.g. M → MMPE-001) and cannot be reused.',
  load: async () => { L = await lookups('classes', 'enrollments'); return listSubjects(false); }, singular: 'subject', newLabel: 'New subject', searchKeys: ['name_en', 'name_ta', 'code'],
  tabs: { items: [{ value: 'all', label: 'All' }, { value: 'on', label: 'On website', test: (r) => r.is_active }, { value: 'off', label: 'Hidden', test: (r) => !r.is_active }] },
  card: (r, i, ui) => { const cls = L.classes.filter((c) => c.subject_id === r.id); const ids = cls.map((c) => c.id); const n = L.enrollments.filter((e) => ids.includes(e.class_id) && live.includes(e.status)).length;
    return `<article class="ent-card ${r.is_active ? '' : 'is-muted'}"><div class="ec-head"><span class="ec-ico"><i class="bi ${esc(r.icon || 'bi-journal-bookmark')}" aria-hidden="true"></i></span><div><h3 class="ec-title">${esc(r.name_en)}</h3><div class="ec-sub" lang="ta">${esc(r.name_ta || '')}</div></div><span class="code chip">${esc(r.code)}</span></div>
      ${r.description_en ? `<p class="small text-muted m-0 line-clamp-2">${esc(r.description_en)}</p>` : ''}
      <div class="ec-tags">${(r.grades || []).map((g) => `<span class="chip chip-teal">G${esc(g)}</span>`).join('') || '<span class="small text-muted">No grades set</span>'}</div>
      <div class="ec-meta"><div><b>${cls.length}</b><span>Classes</span></div><div><b>${n}</b><span>Students</span></div><div><b>${esc(r.sort_order ?? '—')}</b><span>Order</span></div></div>
      <div class="ec-foot">${r.is_active ? '<span class="badge-status s-approved">On website</span>' : '<span class="badge-status s-withdrawn">Hidden</span>'}<span class="ms-auto">${ui.edit}</span></div></article>`; },
  columns: [
    { label: 'Code', render: (r) => `<span class="code">${esc(r.code)}</span>` },
    { label: 'Name', render: (r) => `<b>${esc(r.name_en)}</b><div class="small text-muted" lang="ta">${esc(r.name_ta || '')}</div>` },
    { label: 'Grades', render: (r) => esc((r.grades || []).join(', ') || '—') },
    { label: 'Order', key: 'sort_order', sort: (r) => Number(r.sort_order) || 0 },
    { label: 'Status', render: (r) => (r.is_active ? '<span class="badge-status s-approved">Active</span>' : '<span class="badge-status s-withdrawn">Hidden</span>') }
  ],
  fields: [
    { name: 'code', label: 'Code (one letter A–Z)', required: true, pattern: '[A-Za-z]', maxlength: 1, col: 'col-md-3', invalid: 'One letter only.' },
    { name: 'name_en', label: 'Name (English)', required: true, col: 'col-md-5' },
    { name: 'name_ta', label: 'Name (Tamil)', required: true, col: 'col-md-4' },
    { name: 'description_en', label: 'Short description (English)', type: 'textarea', rows: 2 },
    { name: 'description_ta', label: 'Short description (Tamil)', type: 'textarea', rows: 2 },
    { name: 'icon', label: 'Bootstrap icon name', placeholder: 'bi-calculator', help: 'From icons.getbootstrap.com', col: 'col-md-4' },
    { name: 'sort_order', label: 'Display order', type: 'number', min: 0, step: 1, col: 'col-md-4', default: 10 },
    { name: 'is_active', label: 'Show on website', type: 'checkbox', col: 'col-md-4', default: true },
    { name: 'grades', label: 'Grades offered', type: 'multi', options: gradeOpts, col: 'col-12' }
  ],
  save: (v, row) => saveSubject({ ...v, id: row.id })
});
