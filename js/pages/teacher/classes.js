/** My classes — roster, timetable and student counts for the teacher's own classes. */
import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { humanize, badge, money } from '../../utils/format.js';
import { openDrawer } from '../../components/ui.js';
import { toastError } from '../../components/toast.js';
import { dayLabel, hhmm } from '../shared-cards.js';
import { loadTeacherCtx, notLinkedHtml } from './teacher-common.js';

const { content, profile, can } = await initAdminPage({ page: 'classes', title: 'My classes', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) content.innerHTML = notLinkedHtml();
else {
  const ids = T.myClassIds;
  const [slots, enrol] = await Promise.all([
    api.select('timetable_slots', { in: { class_id: ids.length ? ids : ['-'] } }).catch(() => []),
    can('roster_view') && ids.length ? api.select('enrollments', { in: { class_id: ids } }).catch(() => []) : []
  ]);
  const cnt = (cid, st) => enrol.filter((e) => e.class_id === cid && st.includes(e.status)).length;
  content.innerHTML = `<p class="page-intro">Your classes. Student contact numbers are shown only if the admin has allowed it in Settings. To change class details or fees, contact the admin.</p>
    ${T.classes.length ? `<div class="ent-grid">${T.classes.map((c) => { const link = T.links.find((l) => l.class_id === c.id); const ss = slots.filter((s) => s.class_id === c.id && s.is_active !== false);
      return `<article class="ent-card class-card-pro"><div class="ec-head"><span class="ec-ico"><i class="bi ${esc(T.subjectsById.get(c.subject_id)?.icon || 'bi-easel')}" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(c.title_en)}</h3><div class="ec-sub">${esc(T.subjectsById.get(c.subject_id)?.name_en || '')} · Grade ${esc(c.grade)} · ${esc(humanize(c.medium))}</div></div><span class="code chip">${esc(c.class_code || '')}</span></div>
        <div class="ec-tags">${ss.map((s) => `<span class="chip chip-teal"><i class="bi bi-clock" aria-hidden="true"></i>${dayLabel(s.weekday)} ${hhmm(s.start_time)}</span>`).join('') || '<span class="small text-muted">No timetable yet</span>'}</div>
        <div class="ec-meta"><div><b>${can('roster_view') ? cnt(c.id, ['approved']) : '—'}</b><span>Paid</span></div><div><b>${can('roster_view') ? cnt(c.id, ['trial', 'trial_completed']) : '—'}</b><span>Trial</span></div><div><b>${link ? `${Number(link.allocation_percent)}%` : '—'}</b><span>Your share</span></div></div>
        <div class="ec-foot">${c.is_active ? '<span class="badge-status s-approved">Running</span>' : '<span class="badge-status s-withdrawn">Paused</span>'}<span class="ms-auto d-flex gap-1">${can('roster_view') ? `<button type="button" class="btn btn-sm btn-outline-primary" data-roster="${esc(c.id)}"><i class="bi bi-people" aria-hidden="true"></i>Roster</button>` : ''}${can('attendance_mark') ? `<a class="btn btn-sm btn-primary" href="${href(`teacher/attendance.html?class=${c.id}`)}"><i class="bi bi-check2-square" aria-hidden="true"></i>Mark</a>` : ''}</span></div></article>`; }).join('')}</div>`
    : '<div class="m-card"><div class="empty-state"><i class="bi bi-easel" aria-hidden="true"></i><h3>No classes assigned yet</h3><p>The admin assigns classes to you from Classes → Teachers.</p></div></div>'}`;
  content.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-roster]'); if (!b) return;
    const c = T.classesById.get(b.dataset.roster);
    try {
      const rows = await api.rpc('teacher_roster', { p_class_id: c.id });
      openDrawer({ title: `${esc(c.title_en)} · G${esc(c.grade)}`, html: `<p class="small text-muted">${rows.length} student(s)</p><ul class="roster-list">${rows.map((r) => `<li><span class="avatar-sm">${esc((r.full_name || '?')[0])}</span><span class="min-w-0 flex-grow-1"><b class="d-block text-truncate">${esc(r.full_name)}</b><span class="code small text-muted">${esc(r.student_code)}</span>${r.phone ? ` · <a class="small" href="tel:+${esc(r.phone)}">+${esc(r.phone)}</a>` : ''}</span>${badge(r.status)}</li>`).join('') || '<li class="text-muted">No students yet.</li>'}</ul>` });
    } catch (err) { toastError(err); }
  });
}
