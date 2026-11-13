/**
 * Approvals inbox — everything that needs an admin decision, in one place:
 * profile changes, attendance corrections, timetable changes and teacher uploads.
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { api } from '../../services/api.js';
import { lookups, classLabel, studentLabel, teacherLabel } from './admin-common.js';
import { esc, qs } from '../../utils/dom.js';
import { fmtDate, fmtDateTime, humanize, badge } from '../../utils/format.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { dayLabel, hhmm } from '../shared-cards.js';
import { safeUrl } from '../../components/ui.js';

const { content } = await initAdminPage({ page: 'requests', title: 'Approvals inbox' });
const state = { tab: qs('tab') || 'profile', history: false };
let D;

const FIELD = { email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp', guardian_phone: 'Guardian phone', guardian_name: 'Guardian name', address: 'Address', school: 'School', display_name: 'Display name', bio_en: 'Bio (English)', bio_ta: 'Bio (Tamil)', headline_en: 'Headline (English)', headline_ta: 'Headline (Tamil)', specialties: 'Specialties', linkedin_url: 'LinkedIn', facebook_url: 'Facebook', youtube_url: 'YouTube', website_url: 'Website', photo_url: 'Photo' };
const show = (v) => (Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '—' : String(v));

async function load() {
  const [L, profile, disputes, tt, rec, res, media, sessions, slots] = await Promise.all([
    lookups('students', 'teachers', 'classes'),
    api.select('profile_change_requests', { order: ['created_at', 'desc'] }),
    api.select('attendance_disputes', { order: ['created_at', 'desc'] }),
    api.select('timetable_change_requests', { order: ['created_at', 'desc'] }),
    api.select('recordings'), api.select('resources'), api.select('teacher_media'),
    api.select('class_sessions'), api.select('timetable_slots')
  ]);
  const content_ = [...rec.map((r) => ({ ...r, _t: 'recordings', _url: r.drive_url })), ...res.map((r) => ({ ...r, _t: 'resources', _url: r.url })), ...media.map((r) => ({ ...r, _t: 'teacher_media', _url: r.url, title_en: r.title }))].filter((r) => r.teacher_id || r.status === 'pending');
  D = { L, profile, disputes, tt, content: content_, sessionsById: new Map(sessions.map((s) => [s.id, s])), slotsById: new Map(slots.map((s) => [s.id, s])) };
  draw();
}

const open = (r) => (r._t ? r.status === 'pending' || r.delete_requested : r.status === 'pending');
function draw() {
  const lists = { profile: D.profile, attendance: D.disputes, timetable: D.tt, content: D.content };
  const TABS = [['profile', 'Profile changes', 'bi-person-gear'], ['attendance', 'Attendance corrections', 'bi-calendar2-check'], ['timetable', 'Timetable changes', 'bi-calendar-week'], ['content', 'Teacher uploads', 'bi-cloud-arrow-up']];
  const list = lists[state.tab].filter((r) => (state.history ? !open(r) : open(r)));
  const total = TABS.reduce((a, [k]) => a + lists[k].filter(open).length, 0);
  content.innerHTML = `<p class="page-intro">Students and teachers can't change sensitive details themselves — their requests wait here. Approving applies the change immediately and records who approved it.</p>
    <div class="inbox-hero mb-4"><div><span class="eyebrow">Waiting for you</span><b>${total}</b><span>request(s)</span></div>${TABS.map(([k, l, ic]) => `<button type="button" class="ih-chip ${state.tab === k ? 'active' : ''}" data-tab="${k}"><i class="bi ${ic}" aria-hidden="true"></i><span>${l}</span><b>${lists[k].filter(open).length}</b></button>`).join('')}</div>
    <div class="d-flex justify-content-between align-items-center mb-3"><div class="seg"><button type="button" data-h="0" aria-pressed="${!state.history}">Waiting</button><button type="button" data-h="1" aria-pressed="${state.history}">History</button></div><span class="small text-muted">${list.length} item(s)</span></div>
    <div>${list.length ? list.map(item).join('') : `<div class="m-card"><div class="empty-state"><i class="bi bi-check2-all" aria-hidden="true"></i><h3>${state.history ? 'No history yet' : 'All caught up'}</h3><p>${state.history ? 'Handled requests appear here.' : 'Nothing is waiting in this section.'}</p></div></div>`}</div>`;
}
const actions = (kind, id, pending, extra = '') => (pending ? `<div class="ri-actions">${extra}<button type="button" class="btn btn-sm btn-primary" data-do="${kind}" data-id="${esc(id)}" data-ok="1"><i class="bi bi-check-lg" aria-hidden="true"></i>Approve</button><button type="button" class="btn btn-sm btn-ghost text-danger" data-do="${kind}" data-id="${esc(id)}" data-ok="0">Reject</button></div>` : '');
function item(r) {
  const L = D.L;
  if (state.tab === 'profile') {
    const who = r.subject_type === 'student' ? studentLabel(L.studentsById.get(r.student_id)) : `Teacher · ${teacherLabel(L.teachersById.get(r.teacher_id))}`;
    return `<div class="req-item"><span class="ri-ico"><i class="bi ${r.subject_type === 'student' ? 'bi-mortarboard' : 'bi-person-badge'}" aria-hidden="true"></i></span><div class="min-w-0"><b>${esc(who)}</b> <span class="small text-muted">· ${fmtDateTime(r.created_at)}</span>
      ${Object.entries(r.changes || {}).map(([k, v]) => `<div class="diff"><span class="small fw-semibold">${esc(FIELD[k] || humanize(k))}</span><span class="from">${esc(show(v?.from))}</span><span class="to">${esc(show(v?.to))}</span></div>`).join('')}
      ${r.review_note ? `<div class="small text-muted mt-1">Note: ${esc(r.review_note)}</div>` : ''}</div>${r.status === 'pending' ? actions('profile', r.id, true) : `<div class="ri-actions">${badge(r.status)}</div>`}</div>`;
  }
  if (state.tab === 'attendance') {
    const s = D.sessionsById.get(r.session_id);
    return `<div class="req-item"><span class="ri-ico"><i class="bi bi-calendar2-check" aria-hidden="true"></i></span><div class="min-w-0"><b>${esc(studentLabel(L.studentsById.get(r.student_id)))}</b>
      <div class="small text-muted">${esc(classLabel(L.classesById.get(r.class_id)))} · session ${fmtDate(s?.session_date)}</div>
      <div class="diff"><span class="from">Marked: ${esc(humanize(r.current_status))}</span><span class="to">Should be: ${esc(humanize(r.requested_status))}</span></div>
      <div class="small mt-1">"${esc(r.reason)}" <span class="text-muted">· ${fmtDateTime(r.created_at)}</span></div>${r.resolution_note ? `<div class="small text-muted">Note: ${esc(r.resolution_note)}</div>` : ''}
      ${['present', 'late'].includes(r.requested_status) !== ['present', 'late'].includes(r.current_status) ? '<div class="small text-warning-emphasis mt-1"><i class="bi bi-info-circle" aria-hidden="true"></i> Approving changes this session\'s charge for the student (the ledger is adjusted automatically).</div>' : ''}</div>
      ${r.status === 'pending' ? actions('attendance', r.id, true, `<a class="btn btn-sm btn-ghost" href="${href(`admin/attendance.html?class=${r.class_id}&date=${s?.session_date || ''}`)}">Open sheet</a>`) : `<div class="ri-actions">${badge(r.status)}</div>`}</div>`;
  }
  if (state.tab === 'timetable') {
    const s = D.slotsById.get(r.slot_id); const p = r.proposed || {};
    return `<div class="req-item"><span class="ri-ico"><i class="bi ${r.action === 'delete' ? 'bi-calendar-x' : r.action === 'create' ? 'bi-calendar-plus' : 'bi-calendar2-week'}" aria-hidden="true"></i></span><div class="min-w-0"><b>${esc(humanize(r.action))} slot · ${esc(classLabel(L.classesById.get(r.class_id)))}</b>
      <div class="small text-muted">Requested by ${esc(teacherLabel(L.teachersById.get(r.teacher_id)))} · ${fmtDateTime(r.created_at)}</div>
      <div class="diff">${s ? `<span class="from">${dayLabel(s.weekday)} ${hhmm(s.start_time)}–${hhmm(s.end_time)}${s.room ? ` · ${esc(s.room)}` : ''}</span>` : ''}${r.action !== 'delete' ? `<span class="to">${dayLabel(p.weekday)} ${hhmm(p.start_time)}–${hhmm(p.end_time)}${p.room ? ` · ${esc(p.room)}` : ''}</span>` : ''}</div>
      <div class="small mt-1">"${esc(r.reason)}"</div>${r.review_note ? `<div class="small text-muted">Note: ${esc(r.review_note)}</div>` : ''}</div>
      ${r.status === 'pending' ? actions('timetable', r.id, true) : `<div class="ri-actions">${badge(r.status)}</div>`}</div>`;
  }
  const u = safeUrl(r._url);
  const label = { recordings: 'Recording', resources: humanize(r.kind || 'resource'), teacher_media: r.kind === 'free_session' ? 'Free Zoom session' : 'YouTube video' }[r._t];
  return `<div class="req-item"><span class="ri-ico"><i class="bi ${r._t === 'recordings' ? 'bi-camera-reels' : r._t === 'teacher_media' ? 'bi-youtube' : 'bi-file-earmark-text'}" aria-hidden="true"></i></span><div class="min-w-0"><b>${esc(r.title_en)}</b> <span class="chip">${esc(label)}</span>${r.delete_requested ? ' <span class="chip chip-gold">Teacher asks to remove</span>' : ''}
    <div class="small text-muted">${esc(teacherLabel(L.teachersById.get(r.teacher_id)))}${r.class_id ? ` · ${esc(classLabel(L.classesById.get(r.class_id)))}` : r._t === 'recordings' ? ' · All classes' : ''}${r.topic ? ` · ${esc(r.topic)}` : ''}</div>
    ${u ? `<a class="small" href="${esc(u)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Open link to check (${esc(new URL(u).hostname)})</a>` : '<span class="small text-danger">Link is not a safe https URL</span>'}</div>
    ${open(r) ? `<div class="ri-actions">${r.delete_requested ? `<button type="button" class="btn btn-sm btn-danger" data-do="content" data-id="${esc(r.id)}" data-t="${r._t}" data-ok="del">Delete</button><button type="button" class="btn btn-sm btn-ghost" data-do="content" data-id="${esc(r.id)}" data-t="${r._t}" data-ok="1">Keep</button>` : `<button type="button" class="btn btn-sm btn-primary" data-do="content" data-id="${esc(r.id)}" data-t="${r._t}" data-ok="1"><i class="bi bi-check-lg" aria-hidden="true"></i>Approve</button><button type="button" class="btn btn-sm btn-ghost text-danger" data-do="content" data-id="${esc(r.id)}" data-t="${r._t}" data-ok="0">Reject</button>`}</div>` : `<div class="ri-actions">${badge(r.status)}</div>`}</div>`;
}

content.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab]'); if (t) { state.tab = t.dataset.tab; history.replaceState(null, '', `?tab=${state.tab}`); draw(); return; }
  const h = e.target.closest('[data-h]'); if (h) { state.history = h.dataset.h === '1'; draw(); return; }
  const b = e.target.closest('[data-do]'); if (!b) return;
  const ok = b.dataset.ok === '1', del = b.dataset.ok === 'del';
  const note = await confirmDialog({ title: del ? 'Delete item' : ok ? 'Approve request' : 'Reject request', message: del ? 'Remove this item for all students?' : ok ? 'The change is applied immediately.' : 'The person who asked will see your note.', reason: true, reasonRequired: !ok && !del, reasonLabel: 'Note (optional when approving)', danger: !ok, confirmLabel: del ? 'Delete' : ok ? 'Approve' : 'Reject' });
  if (note == null) return;
  const id = b.dataset.id;
  try {
    if (b.dataset.do === 'profile') await api.rpc('review_profile_change', { p_id: id, p_approve: ok, p_note: note || null });
    else if (b.dataset.do === 'attendance') await api.rpc('resolve_attendance_correction', { p_id: id, p_approve: ok, p_note: note || null });
    else if (b.dataset.do === 'timetable') await api.rpc('review_timetable_change', { p_id: id, p_approve: ok, p_note: note || null });
    else await api.rpc('review_content', { p_table: b.dataset.t, p_id: id, p_action: del ? 'delete' : ok ? 'approve' : 'reject', p_note: note || null });
    showToast('Done', 'success'); await load();
  } catch (err) { toastError(err); }
});
load().catch(toastError);
