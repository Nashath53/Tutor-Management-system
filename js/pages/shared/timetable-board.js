/**
 * Weekly timetable (admin, cashier, teacher).
 *  - Admin: add / edit / remove slots directly, and approve teachers' change requests.
 *  - Cashier: view only.
 *  - Teacher: views ALL grades; can only REQUEST changes to their own classes (admin approves).
 */
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { fmtDateTime, badge, humanize } from '../../utils/format.js';
import { openModal, confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { dayLabel, hhmm } from '../shared-cards.js';
import { validateForm } from '../../utils/validate.js';

export async function mountTimetable(content, { role, classes, teachers = [], myClassIds = [], initialClass = '', canRequest = true }) {
  const isAdmin = role === 'admin', isTeacher = role === 'teacher';
  const classById = new Map(classes.map((c) => [c.id, c]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const subjects = [...new Set(classes.map((c) => c.subject_id))];
  const state = { grade: '', classId: initialClass, mine: isTeacher };
  let slots = [], reqs = [];
  const label = (c) => (c ? `${c.title_en}` : 'Class');
  const colour = (c) => `c${subjects.indexOf(c?.subject_id) % 5}`;
  const grades = [...new Set(classes.map((c) => String(c.grade)))].sort((a, b) => Number(a) - Number(b));

  async function load() {
    [slots, reqs] = await Promise.all([
      api.select('timetable_slots').then((x) => x.filter((s) => s.is_active !== false)),
      role === 'cashier' ? [] : api.select('timetable_change_requests', { order: ['created_at', 'desc'] }).catch(() => [])
    ]);
    draw();
  }

  function draw() {
    const list = slots.filter((s) => { const c = classById.get(s.class_id); return (!state.grade || String(c?.grade) === state.grade) && (!state.classId || s.class_id === state.classId) && (!state.mine || myClassIds.includes(s.class_id)); });
    const today = ((new Date().getDay() + 6) % 7) + 1;
    const pending = reqs.filter((r) => r.status === 'pending');
    const totalH = list.reduce((a, s) => a + (toMin(s.end_time) - toMin(s.start_time)) / 60, 0);
    content.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div class="seg seg-scroll" role="group" aria-label="Grade"><button type="button" data-grade="" aria-pressed="${!state.grade}">All grades</button>${grades.map((g) => `<button type="button" data-grade="${esc(g)}" aria-pressed="${state.grade === g}">Grade ${esc(g)}</button>`).join('')}</div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          ${isTeacher ? `<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" id="mineOnly" ${state.mine ? 'checked' : ''}><label class="form-check-label small" for="mineOnly">My classes only</label></div>` : ''}
          <select class="form-select form-select-sm w-auto" id="ttClass" aria-label="Class"><option value="">All classes</option>${classes.map((c) => `<option value="${esc(c.id)}" ${state.classId === c.id ? 'selected' : ''}>${esc(label(c))} · G${esc(c.grade)}</option>`).join('')}</select>
          ${isAdmin ? '<button type="button" class="btn btn-primary btn-sm" id="addSlot"><i class="bi bi-plus-lg" aria-hidden="true"></i>Add slot</button>' : ''}
          ${isTeacher && canRequest && myClassIds.length ? '<button type="button" class="btn btn-primary btn-sm" id="reqSlot"><i class="bi bi-send" aria-hidden="true"></i>Request new slot</button>' : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="printTt"><i class="bi bi-printer" aria-hidden="true"></i>Print</button>
        </div></div>
      <div class="small text-muted mb-3">${list.length} weekly slot(s) · ${totalH.toFixed(1)} teaching hours per week${isTeacher ? ' · <span class="chip chip-primary">Outlined = your class</span>' : ''}</div>
      ${pending.length && !isTeacher ? `<div class="notice-box warn mb-3"><i class="bi bi-hourglass-split" aria-hidden="true"></i><span><b>${pending.length}</b> timetable change request(s) from teachers are waiting.${isAdmin ? ' Review them below.' : ''}</span></div>` : ''}
      <div class="tt-week" id="ttWeek">${[1, 2, 3, 4, 5, 6, 7].map((d) => { const ds = list.filter((s) => s.weekday === d).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
        return `<div class="tt-day ${d === today ? 'today' : ''} ${ds.length ? '' : 'empty-day'}"><h4><span>${dayLabel(d)}</span><span>${ds.length || ''}</span></h4><div class="slots">${ds.map((s) => { const c = classById.get(s.class_id); const mine = myClassIds.includes(s.class_id); const editable = isAdmin || (isTeacher && canRequest && mine); const tch = teacherById.get(s.teacher_id);
          return `<button type="button" class="tt-slot ${colour(c)} ${mine && isTeacher ? 'mine' : ''} ${editable ? 'editable' : ''}" ${editable ? `data-slot="${esc(s.id)}"` : 'tabindex="-1"'}><span class="t">${hhmm(s.start_time)}–${hhmm(s.end_time)}</span><b>${esc(label(c))}</b><span class="d-block text-muted">G${esc(c?.grade || '?')}${s.room ? ` · ${esc(s.room)}` : ''}${tch ? ` · ${esc(tch.display_name || tch.full_name)}` : ''}</span>${pending.some((r) => r.slot_id === s.id) ? '<span class="chip chip-gold mt-1">Change requested</span>' : ''}</button>`; }).join('') || '<span class="small text-muted p-2">—</span>'}</div></div>`; }).join('')}</div>
      ${!isTeacher && role !== 'cashier' ? requestsHtml(pending, true) : ''}
      ${isTeacher ? requestsHtml(reqs.slice(0, 10), false) : ''}`;
  }

  function requestsHtml(list, actionable) {
    if (!list.length) return '';
    return `<div class="m-card mt-4"><div class="card-head"><h2>${actionable ? 'Change requests waiting' : 'My change requests'}</h2></div>${list.map((r) => { const c = classById.get(r.class_id); const s = slots.find((x) => x.id === r.slot_id); const p = r.proposed || {};
      return `<div class="req-item"><span class="ri-ico"><i class="bi ${r.action === 'delete' ? 'bi-calendar-x' : r.action === 'create' ? 'bi-calendar-plus' : 'bi-calendar2-week'}" aria-hidden="true"></i></span>
        <div class="min-w-0"><b>${esc(humanize(r.action))} · ${esc(label(c))} G${esc(c?.grade || '')}</b>
          <div class="diff">${s ? `<span class="from">${dayLabel(s.weekday)} ${hhmm(s.start_time)}–${hhmm(s.end_time)}${s.room ? ` · ${esc(s.room)}` : ''}</span>` : ''}${r.action !== 'delete' ? `<span class="to">${dayLabel(p.weekday)} ${hhmm(p.start_time)}–${hhmm(p.end_time)}${p.room ? ` · ${esc(p.room)}` : ''}</span>` : ''}</div>
          <div class="small text-muted mt-1">"${esc(r.reason)}" · ${fmtDateTime(r.created_at)}${r.review_note ? ` · Admin: ${esc(r.review_note)}` : ''}</div></div>
        <div class="ri-actions">${actionable && isAdmin ? `<button type="button" class="btn btn-sm btn-primary" data-rv="${esc(r.id)}" data-ok="1"><i class="bi bi-check-lg" aria-hidden="true"></i>Approve</button><button type="button" class="btn btn-sm btn-ghost text-danger" data-rv="${esc(r.id)}" data-ok="0">Reject</button>` : badge(r.status)}</div></div>`; }).join('')}</div>`;
  }

  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  function slotForm(s = {}, { classChoices, title, submit, onSubmit, onDelete, reason = false }) {
    const m = openModal({ title, body: `<form id="slotForm" novalidate class="row g-3">
      <div class="col-12"><label class="form-label" for="sf-class">Class<span class="req">*</span></label><select class="form-select" id="sf-class" name="class_id" required ${s.id ? 'disabled' : ''}>${classChoices.map((c) => `<option value="${esc(c.id)}" ${c.id === s.class_id ? 'selected' : ''}>${esc(label(c))} · G${esc(c.grade)}</option>`).join('')}</select></div>
      <div class="col-sm-4"><label class="form-label" for="sf-day">Day</label><select class="form-select" id="sf-day" name="weekday">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}" ${Number(s.weekday) === d ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></div>
      <div class="col-sm-4"><label class="form-label" for="sf-start">Start</label><input type="time" class="form-control" id="sf-start" name="start_time" required value="${esc(hhmm(s.start_time || '08:00'))}"></div>
      <div class="col-sm-4"><label class="form-label" for="sf-end">End</label><input type="time" class="form-control" id="sf-end" name="end_time" required value="${esc(hhmm(s.end_time || '10:00'))}"><div class="invalid-feedback">End must be after start.</div></div>
      <div class="col-sm-6"><label class="form-label" for="sf-room">Room / platform</label><input class="form-control" id="sf-room" name="room" maxlength="60" value="${esc(s.room || '')}" placeholder="Hall A / Zoom"></div>
      ${isAdmin ? `<div class="col-sm-6"><label class="form-label" for="sf-teacher">Teacher</label><select class="form-select" id="sf-teacher" name="teacher_id"><option value="">—</option>${teachers.filter((t) => t.status === 'active').map((t) => `<option value="${esc(t.id)}" ${t.id === s.teacher_id ? 'selected' : ''}>${esc(t.display_name || t.full_name)}</option>`).join('')}</select></div>` : ''}
      <div class="col-12"><label class="form-label" for="sf-notes">Notes</label><input class="form-control" id="sf-notes" name="notes" maxlength="200" value="${esc(s.notes || '')}"></div>
      ${reason ? '<div class="col-12"><label class="form-label" for="sf-reason">Why is this change needed?<span class="req">*</span></label><textarea class="form-control" id="sf-reason" name="reason" rows="2" minlength="5" required></textarea><div class="invalid-feedback">Please give a reason (at least 5 characters).</div><div class="form-text">The admin approves or rejects your request. Students see the new time only after approval.</div></div>' : ''}
      <div class="col-12" id="sf-clash"></div></form>`,
    footer: `${onDelete ? '<button type="button" class="btn btn-outline-danger me-auto" id="sf-del"><i class="bi bi-trash" aria-hidden="true"></i>' + (reason ? 'Request removal' : 'Remove slot') + '</button>' : ''}<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Cancel</button><button type="submit" form="slotForm" class="btn btn-primary">${esc(submit)}</button>` });
    const f = m.el.querySelector('#slotForm');
    const clash = () => { const cid = f.class_id.value; const c = classById.get(cid); const d = Number(f.weekday.value); const a = toMin(f.start_time.value), b = toMin(f.end_time.value);
      const hits = slots.filter((x) => x.id !== s.id && x.weekday === d && toMin(x.start_time) < b && a < toMin(x.end_time) && ((f.room.value && x.room === f.room.value) || String(classById.get(x.class_id)?.grade) === String(c?.grade)));
      m.el.querySelector('#sf-clash').innerHTML = hits.length ? `<div class="notice-box warn small"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><span>Possible clash: ${hits.map((x) => `${esc(label(classById.get(x.class_id)))} ${hhmm(x.start_time)}–${hhmm(x.end_time)}${x.room ? ` (${esc(x.room)})` : ''}`).join(', ')}</span></div>` : ''; };
    f.addEventListener('input', clash); clash();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      f.end_time.setCustomValidity(f.end_time.value > f.start_time.value ? '' : 'x');
      if (!validateForm(f)) return;
      const v = { class_id: s.class_id || f.class_id.value, weekday: Number(f.weekday.value), start_time: f.start_time.value, end_time: f.end_time.value, room: f.room.value.trim() || null, notes: f.notes.value.trim() || null };
      if (isAdmin) v.teacher_id = f.teacher_id.value || null;
      try { await onSubmit(v, f.reason?.value.trim()); m.close(); await load(); } catch (err) { toastError(err); }
    });
    m.el.querySelector('#sf-del')?.addEventListener('click', async () => { try { if (await onDelete(f.reason?.value.trim())) { m.close(); await load(); } } catch (err) { toastError(err); } });
  }

  content.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-grade]'); if (g) { state.grade = g.dataset.grade; draw(); return; }
    if (e.target.closest('#printTt')) { window.print(); return; }
    if (e.target.closest('#addSlot')) return slotForm({ class_id: state.classId }, { classChoices: classes, title: 'Add weekly slot', submit: 'Save slot', onSubmit: async (v) => { await api.insert('timetable_slots', { ...v, is_active: true }); showToast('Slot added', 'success'); } });
    if (e.target.closest('#reqSlot')) return slotForm({ class_id: state.classId && myClassIds.includes(state.classId) ? state.classId : myClassIds[0] }, { classChoices: classes.filter((c) => myClassIds.includes(c.id)), title: 'Request a new slot', submit: 'Send request', reason: true,
      onSubmit: async (v, reason) => { await api.rpc('request_timetable_change', { p_action: 'create', p_class_id: v.class_id, p_slot_id: null, p_proposed: v, p_reason: reason }); showToast('Request sent to admin', 'success'); } });
    const sl = e.target.closest('[data-slot]');
    if (sl) {
      const s = slots.find((x) => x.id === sl.dataset.slot);
      if (isAdmin) return slotForm(s, { classChoices: classes, title: 'Edit slot', submit: 'Save changes',
        onSubmit: async (v) => { const { class_id: _c, ...rest } = v; await api.update('timetable_slots', s.id, rest); showToast('Slot updated', 'success'); },
        onDelete: async () => { if (!(await confirmDialog({ title: 'Remove slot', message: 'Remove this weekly slot? Past sessions and attendance are not affected.', danger: true, confirmLabel: 'Remove' }))) return false; await api.update('timetable_slots', s.id, { is_active: false }); showToast('Slot removed', 'success'); return true; } });
      return slotForm(s, { classChoices: classes, title: 'Request a change', submit: 'Send request', reason: true,
        onSubmit: async (v, reason) => { await api.rpc('request_timetable_change', { p_action: 'update', p_class_id: s.class_id, p_slot_id: s.id, p_proposed: v, p_reason: reason }); showToast('Request sent to admin', 'success'); },
        onDelete: async (reason) => { if (!reason || reason.length < 5) { showToast('Enter a reason first.', 'warning'); return false; } await api.rpc('request_timetable_change', { p_action: 'delete', p_class_id: s.class_id, p_slot_id: s.id, p_proposed: {}, p_reason: reason }); showToast('Removal request sent', 'success'); return true; } });
    }
    const rv = e.target.closest('[data-rv]');
    if (rv) {
      const ok = rv.dataset.ok === '1';
      const note = await confirmDialog({ title: ok ? 'Approve change' : 'Reject change', message: ok ? 'The timetable updates immediately for students and teachers.' : 'The teacher sees your note.', reason: true, reasonRequired: !ok, reasonLabel: 'Note to teacher', confirmLabel: ok ? 'Approve' : 'Reject', danger: !ok });
      if (note == null) return;
      try { await api.rpc('review_timetable_change', { p_id: rv.dataset.rv, p_approve: ok, p_note: note || null }); showToast(ok ? 'Change applied' : 'Request rejected', 'success'); await load(); } catch (err) { toastError(err); }
    }
  });
  content.addEventListener('change', (e) => {
    if (e.target.id === 'ttClass') { state.classId = e.target.value; draw(); }
    if (e.target.id === 'mineOnly') { state.mine = e.target.checked; draw(); }
  });
  await load().catch(toastError);
}
