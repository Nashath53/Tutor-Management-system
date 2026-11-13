/**
 * Attendance board (used by admin/cashier AND teacher panel).
 * Calendar colours:  yellow = scheduled by timetable (not yet marked) · green = held · red = cancelled
 *                    orange dot = session held on a day that is NOT on the timetable (a reason is required).
 * Roster comes from the teacher_roster RPC, so teachers only ever see their own students.
 */
import { listSessions, markAttendance, cancelSession } from '../../services/attendance.service.js';
import { api } from '../../services/api.js';
import { addDraft, listDrafts } from '../../pwa/offline-queue.service.js';
import { getSettings } from '../../services/settings.service.js';
import { esc, setBusy } from '../../utils/dom.js';
import { uuid } from '../../utils/ids.js';
import { fmtDate, badge, todayISO } from '../../utils/format.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { store } from '../../utils/storage.js';
import { dayLabel, hhmm } from '../shared-cards.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dowOf = (s) => ((new Date(s + 'T12:00:00').getDay() + 6) % 7) + 1;

export async function mountAttendance(content, { classes, classLabel, initialClass, initialDate, canCancel = true, intro = '' }) {
  const settings = await getSettings();
  const state = { classId: initialClass || store.get('mentora-att-class') || '', date: initialDate || todayISO(), month: (initialDate || todayISO()).slice(0, 7) };
  if (!classes.some((c) => c.id === state.classId)) state.classId = classes[0]?.id || '';
  let sessions = [], slots = [];

  content.innerHTML = `${intro ? `<p class="page-intro">${intro}</p>` : ''}
    <div class="att-layout">
      <aside class="d-grid gap-4 align-content-start">
        <div class="m-card"><label class="form-label" for="a-class">Class</label><select class="form-select" id="a-class">${classes.length ? '' : '<option value="">No classes</option>'}${classes.map((c) => `<option value="${esc(c.id)}">${esc(classLabel(c))}</option>`).join('')}</select>
          <div class="small text-muted mt-2" id="ttInfo"></div></div>
        <div class="m-card"><div class="d-flex align-items-center justify-content-between mb-2"><button type="button" class="btn btn-sm btn-ghost" data-mon="-1" aria-label="Previous month"><i class="bi bi-chevron-left" aria-hidden="true"></i></button><b id="calTitle"></b><button type="button" class="btn btn-sm btn-ghost" data-mon="1" aria-label="Next month"><i class="bi bi-chevron-right" aria-hidden="true"></i></button></div>
          <div class="cal" id="cal"></div>
          <div class="cal-legend"><span><i style="background:#FEF3C7;border-color:#FBBF24"></i>Scheduled</span><span><i style="background:#D1FAE5;border-color:#10B981"></i>Held</span><span><i style="background:#FEE2E2;border-color:#EF4444"></i>Cancelled</span><span><i style="background:var(--brand-orange);border-color:var(--brand-orange);border-radius:50%;width:8px;height:8px"></i>Off timetable</span></div></div>
        <div class="m-card"><h2 class="h6 mb-2">Recent sessions</h2><div id="sessions"></div></div>
      </aside>
      <section id="roster" class="min-w-0"></section>
    </div>`;
  const $ = (s) => content.querySelector(s);
  $('#a-class').value = state.classId;

  const statusOn = (d) => {
    const s = sessions.find((x) => x.session_date === d);
    if (s) return { cls: s.status === 'cancelled' ? 'cancelled' : s.status === 'held' ? 'held' : 'scheduled', s, off: !!s.off_schedule_reason };
    if (slots.some((x) => x.weekday === dowOf(d))) return { cls: 'scheduled', s: null };
    return { cls: '', s: null };
  };

  function drawCal() {
    const [y, m] = state.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    $('#calTitle').textContent = first.toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });
    const today = todayISO();
    let html = [1, 2, 3, 4, 5, 6, 7].map((d) => `<span class="dow">${dayLabel(d).slice(0, 2)}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = iso(d); const st = statusOn(ds);
      const out = d.getMonth() !== m - 1;
      if (i >= 35 && out) break;
      html += `<button type="button" data-day="${ds}" class="${st.cls} ${st.off ? 'offsched' : ''} ${out ? 'out' : ''} ${ds === today ? 'today' : ''} ${ds === state.date ? 'sel' : ''}" ${ds > today ? 'disabled' : ''} aria-label="${fmtDate(ds)}${st.cls ? ` · ${st.cls}` : ''}" aria-pressed="${ds === state.date}">${d.getDate()}</button>`;
    }
    $('#cal').innerHTML = html;
  }

  async function drawRoster() {
    const el = $('#roster');
    if (!state.classId) { el.innerHTML = '<div class="m-card empty-state"><i class="bi bi-easel" aria-hidden="true"></i><p>Choose a class to load the roster.</p></div>'; return; }
    el.innerHTML = '<div class="m-card"><div class="skeleton skeleton-line w-75"></div><div class="skeleton skeleton-line w-50"></div></div>';
    const roster = await api.rpc('teacher_roster', { p_class_id: state.classId });
    const ses = sessions.find((s) => s.session_date === state.date);
    const marks = ses ? await api.select('attendance', { eq: { session_id: ses.id } }) : [];
    const markBy = new Map(marks.map((m) => [m.enrollment_id, m.status]));
    const onTt = !slots.length || slots.some((x) => x.weekday === dowOf(state.date));
    const live = roster.filter((r) => r.status !== 'suspended');
    const head = `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 border-bottom">
      <div><div class="eyebrow mb-1">${dayLabel(dowOf(state.date))}</div><b class="fs-6">${fmtDate(state.date)}</b> ${ses ? badge(ses.status) : onTt ? '<span class="chip chip-gold">Scheduled</span>' : '<span class="chip chip-accent">Not on timetable</span>'}</div>
      <div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-ghost" type="button" id="allPresent"><i class="bi bi-check2-all" aria-hidden="true"></i>All present</button>
      ${ses && ses.status !== 'cancelled' && canCancel ? '<button class="btn btn-sm btn-outline-danger" type="button" id="cancelSes"><i class="bi bi-x-circle" aria-hidden="true"></i>Cancel session</button>' : ''}</div></div>`;
    if (!live.length) { el.innerHTML = `<div class="m-card p-0">${head}<div class="empty-state"><p>No students are enrolled in this class yet.</p></div></div>`; bindHead(ses); return; }
    const seg = (e) => {
      const trial = e.status === 'trial';
      const cur = markBy.get(e.enrollment_id) || '';
      const list = trial ? [['trial', 'Trial'], ['absent', 'Absent'], ['excused', 'Excused']] : [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['excused', 'Excused']];
      return `<div class="status-seg" role="radiogroup" aria-label="Attendance for ${esc(e.full_name)}">${list.map(([v, l]) => `<input type="radio" name="st-${esc(e.enrollment_id)}" id="st-${esc(e.enrollment_id)}-${v}" value="${v}" ${cur === v || (cur === 'present' && v === 'trial' && trial) ? 'checked' : ''}><label for="st-${esc(e.enrollment_id)}-${v}" data-s="${v}">${l}</label>`).join('')}</div>`;
    };
    el.innerHTML = `<div class="m-card p-0">${head}
      ${!ses && !onTt ? `<div class="p-3 border-bottom"><div class="notice-box warn mb-2"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><span>This date is not on the class timetable. Explain why the class was held (extra class, rescheduled, make-up…). It is saved in the audit log.</span></div>
        <label class="form-label" for="a-off">Reason for off-timetable session<span class="req">*</span></label><input class="form-control" id="a-off" maxlength="300" required placeholder="e.g. Make-up class for cancelled Saturday session"></div>` : ''}
      ${ses?.off_schedule_reason ? `<div class="px-3 pt-3"><div class="notice-box small"><i class="bi bi-info-circle" aria-hidden="true"></i><span>Off-timetable: ${esc(ses.off_schedule_reason)}</span></div></div>` : ''}
      <div class="p-3 border-bottom"><label class="form-label" for="a-topic">Topic covered (optional)</label><input class="form-control" id="a-topic" maxlength="200" value="${esc(ses?.topic || '')}"></div>
      <div class="d-flex gap-3 flex-wrap px-3 pt-3 small text-muted" id="tally"></div>
      ${live.map((e) => `<div class="roster-row"><div class="min-w-0"><b>${esc(e.full_name)}</b> <span class="code small text-muted">${esc(e.student_code)}</span>
        <div class="small">${badge(e.status)} ${e.status === 'trial' ? `<span class="text-muted">trial ${e.trial_sessions_used || 0}/${settings.trial.sessions}</span>` : ''}${e.phone ? ` <a class="small" href="tel:+${esc(e.phone)}">+${esc(e.phone)}</a>` : ''}</div></div>${seg(e)}</div>`).join('')}
      <div class="p-3 border-top d-flex justify-content-between align-items-center gap-2 flex-wrap"><span class="small text-muted">Trial students are never charged. Billable: ${esc(settings.billing.billable_statuses.join(', '))}.</span><button class="btn btn-primary" type="button" id="saveAtt" ${ses?.status === 'cancelled' ? 'disabled' : ''}><i class="bi bi-check2-circle" aria-hidden="true"></i>Save attendance</button></div></div>`;
    const tally = () => { const c = {}; el.querySelectorAll('.status-seg input:checked').forEach((i) => { c[i.value] = (c[i.value] || 0) + 1; }); $('#tally').innerHTML = ['present', 'late', 'trial', 'absent', 'excused'].filter((k) => c[k]).map((k) => `<span>${badge(k)} ${c[k]}</span>`).join('') + `<span class="ms-auto">${Object.values(c).reduce((a, b) => a + b, 0)}/${live.length} marked</span>`; };
    el.addEventListener('change', tally); tally();
    bindHead(ses, live);
    $('#saveAtt').addEventListener('click', async (ev) => {
      const rows = live.map((e) => ({ enrollment_id: e.enrollment_id, status: el.querySelector(`input[name="st-${CSS.escape(e.enrollment_id)}"]:checked`)?.value })).filter((r) => r.status);
      if (!rows.length) return showToast('Select a status for at least one student.', 'warning');
      const off = $('#a-off');
      if (off && off.value.trim().length < 5) { off.classList.add('is-invalid'); off.focus(); return showToast('Please enter a reason for the off-timetable session.', 'warning'); }
      const payload = { class_id: state.classId, session_date: state.date, topic: $('#a-topic').value.trim() || null, off_schedule_reason: off?.value.trim() || null, rows, client_uuid: uuid() };
      const btn = ev.currentTarget; setBusy(btn, true, 'Saving…');
      try {
        if (!navigator.onLine) throw new Error('offline');
        const sesNew = await api.rpc('start_session', { p_class_id: payload.class_id, p_session_date: payload.session_date, p_topic: payload.topic, p_off_schedule_reason: payload.off_schedule_reason });
        const r = await markAttendance(sesNew.id, rows, payload.client_uuid);
        showToast(`Saved ${r.saved} · ${r.charged} charged · ${r.reversed} reversed · ${r.trial} trial`, 'success');
        await refresh();
      } catch (err) {
        if (!navigator.onLine || /fetch|network|offline/i.test(err.message)) {
          await addDraft('attendance', payload, `${classLabel(classes.find((c) => c.id === state.classId))} · ${state.date}`);
          showToast('You are offline. Attendance saved as a draft on this device and will sync automatically.', 'warning');
        } else toastError(err);
      } finally { setBusy(btn, false); }
    });
  }
  function bindHead(ses, live = []) {
    $('#allPresent')?.addEventListener('click', () => { live.forEach((e) => { const r = content.querySelector(`#st-${CSS.escape(e.enrollment_id)}-${e.status === 'trial' ? 'trial' : 'present'}`); if (r) r.checked = true; }); content.querySelector('#roster').dispatchEvent(new Event('change')); });
    $('#cancelSes')?.addEventListener('click', async () => {
      const reason = await confirmDialog({ title: 'Cancel session', message: 'All charges for this session will be reversed and attendance set to Cancelled. The day turns red on the calendar.', reason: true, danger: true, confirmLabel: 'Cancel session' });
      if (reason == null) return;
      try { const r = await cancelSession(ses.id, reason); showToast(`Session cancelled. ${r.reversed} charge(s) reversed.`, 'success'); await refresh(); } catch (err) { toastError(err); }
    });
  }

  async function drawSessions() {
    const el = $('#sessions');
    const drafts = (await listDrafts('attendance')).filter((d) => d.payload.class_id === state.classId);
    const list = sessions.slice(0, 8);
    el.innerHTML = (drafts.length ? `<div class="notice-box mb-3"><i class="bi bi-cloud-arrow-up" aria-hidden="true"></i><span>${drafts.length} offline draft(s) waiting to sync.</span></div>` : '') +
      (list.length ? `<ul class="dash-list">${list.map((s) => `<li><button type="button" class="btn btn-link p-0 text-start text-decoration-none" data-day="${s.session_date}"><b>${fmtDate(s.session_date)}</b>${s.off_schedule_reason ? ' <i class="bi bi-dot text-warning" title="Off timetable"></i>' : ''}<span class="d-block small text-muted text-truncate" style="max-width:180px">${esc(s.topic || '')}</span></button>${badge(s.status)}</li>`).join('')}</ul>` : '<p class="small text-muted m-0">No sessions yet.</p>');
  }

  async function refresh() {
    if (!state.classId) { drawCal(); await drawRoster(); return; }
    [sessions, slots] = await Promise.all([listSessions(state.classId), api.select('timetable_slots', { eq: { class_id: state.classId } }).then((x) => x.filter((s) => s.is_active !== false))]);
    $('#ttInfo').innerHTML = slots.length ? `<i class="bi bi-calendar-week me-1" aria-hidden="true"></i>${slots.map((x) => `${dayLabel(x.weekday)} ${hhmm(x.start_time)}–${hhmm(x.end_time)}`).join(' · ')}` : 'No weekly timetable yet — any date can be marked.';
    drawCal(); await drawRoster(); await drawSessions();
  }
  content.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]'); if (d && !d.disabled) { state.date = d.dataset.day; state.month = state.date.slice(0, 7); drawCal(); drawRoster().catch(toastError); return; }
    const mo = e.target.closest('[data-mon]'); if (mo) { const [y, m] = state.month.split('-').map(Number); const n = new Date(y, m - 1 + Number(mo.dataset.mon), 1); state.month = iso(n).slice(0, 7); drawCal(); }
  });
  $('#a-class').addEventListener('change', (e) => { state.classId = e.target.value; store.set('mentora-att-class', state.classId); refresh().catch(toastError); });
  window.addEventListener('mentora:synced', () => refresh().catch(toastError));
  await refresh().catch(toastError);
}
