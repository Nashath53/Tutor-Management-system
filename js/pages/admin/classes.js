import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import * as C from '../../services/class.service.js';
import { lookups, opts, gradeOpts, teacherLabel } from './admin-common.js';
import { OPTIONS } from '../../config/app.config.js';
import { esc } from '../../utils/dom.js';
import { money, humanize } from '../../utils/format.js';
import { openModal } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { href } from '../../components/common.js';
import { dayLabel, hhmm } from '../shared-cards.js';
const LIVE = ['trial', 'trial_completed', 'admission_requested', 'approved'];
const MODE_ICON = { physical: 'bi-building', online: 'bi-camera-video', hybrid: 'bi-intersect' };

const { content } = await initAdminPage({ page: 'classes', title: 'Classes' });
let L, privates = new Map();
const reloadLookups = async () => { L = await lookups('subjects', 'teachers', 'class_teachers', 'enrollments', 'timetable_slots'); privates = new Map((await C.listClassPrivate()).map((p) => [p.class_id, p])); };

await reloadLookups();
createCrud(content, {
  intro: 'The <b>trial group link</b> is shown to trial students. The <b>paid group link</b> and online meeting link are private — only approved (paid) students can see them.',
  load: async () => { await reloadLookups(); return C.listClasses(); },
  singular: 'class', newLabel: 'New class', searchKeys: ['title_en', 'title_ta', 'location'],
  filters: [
    { name: 'subject_id', label: 'Subject', options: () => (L?.subjects || []).map((s) => ({ value: s.id, label: s.name_en })) },
    { name: 'class_mode', label: 'Mode', options: opts(OPTIONS.modes) }
  ],
  tabs: { items: [{ value: 'running', label: 'Running', icon: 'bi-play-circle', test: (r) => r.is_active }, { value: 'public', label: 'On website', icon: 'bi-globe', test: (r) => r.is_active && r.is_public }, { value: 'closed', label: 'Closed', icon: 'bi-archive', test: (r) => !r.is_active }, { value: 'all', label: 'All' }] },
  card: (r, i, ui) => classCard(r, i, ui),
  columns: [
    { label: 'Class', render: (r) => `<b>${esc(r.title_en)}</b><div class="small text-muted">${esc(L.subjectsById.get(r.subject_id)?.name_en)} · G${esc(r.grade)} · ${esc(humanize(r.medium))}</div>` },
    { label: 'Mode', render: (r) => `${esc(humanize(r.class_mode))}<div class="small text-muted">${esc(humanize(r.class_type))}</div>` },
    { label: 'Schedule', render: (r) => `<span class="small">${esc(r.schedule_en || '—')}</span>` },
    { label: 'Rate', class: 'num', render: (r) => money(r.rate_per_session) },
    { label: 'Teachers', render: (r) => L.class_teachers.filter((x) => x.class_id === r.id).map((x) => `<span class="small d-block">${esc(teacherLabel(L.teachersById.get(x.teacher_id)))} · ${esc(x.allocation_percent)}%</span>`).join('') || '<span class="text-danger small">None</span>' },
    { label: 'Students', render: (r) => L.enrollments.filter((e) => e.class_id === r.id && ['trial', 'trial_completed', 'admission_requested', 'approved'].includes(e.status)).length },
    { label: 'Visible', render: (r) => (r.is_active && r.is_public ? '<span class="badge-status s-approved">Public</span>' : r.is_active ? '<span class="badge-status s-pending">Hidden</span>' : '<span class="badge-status s-withdrawn">Closed</span>') }
  ],
  fields: (row) => [
    { type: 'section', label: 'Class details' },
    { name: 'subject_id', label: 'Subject', type: 'select', required: true, options: L.subjects.map((s) => ({ value: s.id, label: `${s.code} · ${s.name_en}` })), col: 'col-md-6' },
    { name: 'grade', label: 'Grade', type: 'select', required: true, options: gradeOpts, col: 'col-md-3' },
    { name: 'medium', label: 'Medium', type: 'select', required: true, options: opts(OPTIONS.mediums), col: 'col-md-3' },
    { name: 'class_mode', label: 'Mode', type: 'select', required: true, options: opts(OPTIONS.modes), col: 'col-md-4' },
    { name: 'class_type', label: 'Class type', type: 'select', required: true, options: opts(OPTIONS.classTypes), default: 'group', col: 'col-md-4' },
    { name: 'rate_per_session', label: 'Fee per session (LKR)', type: 'number', required: true, min: 0, step: '0.01', col: 'col-md-4' },
    { name: 'title_en', label: 'Title (English)', required: true },
    { name: 'title_ta', label: 'Title (Tamil)' },
    { name: 'schedule_en', label: 'Schedule (English)', placeholder: 'Saturday · 8:00 – 10:00 AM' },
    { name: 'schedule_ta', label: 'Schedule (Tamil)' },
    { name: 'location', label: 'Location / platform', col: 'col-12' },
    { type: 'section', label: 'Trial & visibility' },
    { name: 'trial_enabled', label: 'Free trial available', type: 'checkbox', default: true, col: 'col-md-4' },
    { name: 'is_public', label: 'Show on website', type: 'checkbox', default: true, col: 'col-md-4' },
    { name: 'is_active', label: 'Class is running', type: 'checkbox', default: true, col: 'col-md-4' },
    { name: 'trial_group_link', label: 'Trial WhatsApp group link', type: 'url', col: 'col-12' },
    { type: 'section', label: 'Private links (approved students only)' },
    { name: 'paid_group_link', label: 'Paid class WhatsApp group link', type: 'url', default: privates.get(row.id)?.paid_group_link },
    { name: 'online_meeting_link', label: 'Online meeting link', type: 'url', default: privates.get(row.id)?.online_meeting_link }
  ],
  save: async (v, row) => {
    const { paid_group_link, online_meeting_link, ...cls } = v;
    const saved = await C.saveClass({ ...cls, id: row.id });
    const id = row.id || (Array.isArray(saved) ? saved[0] : saved).id;
    await C.saveClassPrivate({ class_id: id, paid_group_link, online_meeting_link });
  },
  rowActions: (r) => [
    { label: 'Teachers & revenue share', icon: 'bi-person-badge', onClick: ({ reload }) => manageTeachers(r, reload) },
    { label: 'Weekly timetable', icon: 'bi-calendar-week', onClick: () => { location.href = href(`admin/timetable.html?class=${r.id}`); } },
    { label: 'Mark attendance', icon: 'bi-calendar-check', onClick: () => { location.href = href(`admin/attendance.html?class=${r.id}`); } }
  ]
});

function classCard(r, i, ui) {
  const tch = L.class_teachers.filter((x) => x.class_id === r.id);
  const n = L.enrollments.filter((e) => e.class_id === r.id && LIVE.includes(e.status));
  const paid = n.filter((e) => e.status === 'approved').length;
  const slots = L.timetable_slots.filter((x) => x.class_id === r.id && x.is_active !== false).sort((a, b) => a.weekday - b.weekday);
  const cap = Number(r.capacity) || 0;
  return `<article class="ent-card ${r.is_active ? '' : 'is-muted'}">
    <div class="ec-head"><span class="ec-ico ${r.class_mode === 'online' ? 'teal' : r.class_mode === 'hybrid' ? 'gold' : ''}"><i class="bi ${MODE_ICON[r.class_mode] || 'bi-easel'}" aria-hidden="true"></i></span>
      <div><h3 class="ec-title">${esc(r.title_en)}</h3><div class="ec-sub">${esc(L.subjectsById.get(r.subject_id)?.name_en || '')} · Grade ${esc(r.grade)} · ${esc(humanize(r.medium))}</div></div><div class="ec-menu">${ui.menu}</div></div>
    <div class="ec-tags"><span class="chip chip-primary">${esc(humanize(r.class_mode))}</span><span class="chip">${esc(humanize(r.class_type))}</span>${r.trial_enabled ? '<span class="chip chip-teal"><i class="bi bi-stars"></i>Free trial</span>' : ''}${r.is_active && r.is_public ? '' : `<span class="chip chip-accent">${r.is_active ? 'Hidden' : 'Closed'}</span>`}</div>
    <div class="small">${slots.length ? slots.map((x) => `<span class="d-inline-flex align-items-center gap-1 me-2"><i class="bi bi-clock text-muted" aria-hidden="true"></i>${dayLabel(x.weekday)} ${hhmm(x.start_time)}–${hhmm(x.end_time)}</span>`).join('') : `<span class="text-muted"><i class="bi bi-clock me-1" aria-hidden="true"></i>${esc(r.schedule_en || 'No timetable yet')}</span>`}</div>
    <div class="ec-meta"><div><b>${money(r.rate_per_session).replace('LKR', '').trim()}</b><span>LKR / session</span></div><div><b>${n.length}${cap ? `/${cap}` : ''}</b><span>Students</span></div><div><b>${paid}</b><span>Paid</span></div></div>
    <div class="small"><span class="fw-bold">Teachers:</span> ${tch.length ? tch.map((x) => `${esc(teacherLabel(L.teachersById.get(x.teacher_id)))} <span class="text-muted">${esc(x.allocation_percent)}%</span>`).join(', ') : '<span class="text-danger">None assigned</span>'}</div>
    <div class="ec-foot">${ui.edit}<button type="button" class="btn btn-sm btn-ghost" data-act="${i}:0"><i class="bi bi-person-badge" aria-hidden="true"></i>Teachers</button><button type="button" class="btn btn-sm btn-ghost" data-act="${i}:1"><i class="bi bi-calendar-week" aria-hidden="true"></i>Timetable</button></div>
  </article>`;
}

function manageTeachers(cls, reload) {
  const m = openModal({ title: `Teachers · ${cls.title_en}`, size: 'modal-lg' });
  const draw = () => {
    const rows = L.class_teachers.filter((x) => x.class_id === cls.id);
    const total = rows.reduce((s, x) => s + Number(x.allocation_percent), 0);
    m.body.innerHTML = `<p class="small text-muted">Allocation % decides how collected class revenue is shared between teachers for settlements. The total must not exceed 100%.</p>
      <ul class="dash-list mb-3">${rows.map((x) => `<li><span><b>${esc(teacherLabel(L.teachersById.get(x.teacher_id)))}</b>${x.is_primary ? ' <span class="chip chip-primary">Primary</span>' : ''}</span>
        <span class="d-flex gap-2 align-items-center"><input type="number" class="form-control form-control-sm" style="width:90px" min="0" max="100" step="0.01" value="${esc(x.allocation_percent)}" data-pct="${esc(x.id)}" aria-label="Allocation percent">%
        <button class="btn btn-sm btn-ghost text-danger" data-del="${esc(x.id)}" aria-label="Remove"><i class="bi bi-trash" aria-hidden="true"></i></button></span></li>`).join('') || '<li class="text-muted">No teachers assigned.</li>'}</ul>
      <div class="d-flex justify-content-between align-items-center"><span class="small ${total > 100 ? 'text-danger' : 'text-muted'}">Total: ${total}%</span>
      <button class="btn btn-sm btn-outline-primary" data-add><i class="bi bi-plus" aria-hidden="true"></i> Assign teacher</button></div>`;
  };
  const refresh = async () => { await reloadLookups(); draw(); reload(); };
  draw();
  m.body.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-pct]');
    if (!inp) return;
    const others = L.class_teachers.filter((x) => x.class_id === cls.id && x.id !== inp.dataset.pct).reduce((s, x) => s + Number(x.allocation_percent), 0);
    if (others + Number(inp.value) > 100) { toastError(new Error('Total allocation cannot exceed 100%.')); return draw(); }
    try { await C.updateClassTeacher(inp.dataset.pct, { allocation_percent: Number(inp.value) }); await refresh(); showToast('Allocation updated', 'success'); } catch (err) { toastError(err); }
  });
  m.body.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { try { await C.removeClassTeacher(d.dataset.del); await refresh(); } catch (err) { toastError(err); } }
    if (e.target.closest('[data-add]')) {
      const used = L.class_teachers.filter((x) => x.class_id === cls.id);
      const remaining = 100 - used.reduce((s, x) => s + Number(x.allocation_percent), 0);
      m.close();
      openFormModal({ title: 'Assign teacher', size: '', fields: [
        { name: 'teacher_id', label: 'Teacher', type: 'select', required: true, col: 'col-12', options: L.teachers.filter((t) => t.status === 'active' && !used.some((u) => u.teacher_id === t.id)).map((t) => ({ value: t.id, label: teacherLabel(t) })) },
        { name: 'allocation_percent', label: 'Revenue share %', type: 'number', required: true, min: 0, max: remaining, step: '0.01', default: remaining, col: 'col-md-6' },
        { name: 'is_primary', label: 'Primary teacher', type: 'checkbox', col: 'col-md-6', default: !used.length }
      ], onSave: async (v) => { await C.addClassTeacher({ class_id: cls.id, ...v }); showToast('Teacher assigned', 'success'); reload(); } });
    }
  });
}
