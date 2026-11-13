/** Teacher dashboard: today's classes, "joining tomorrow" poll, attendance trend, quick links. */
import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { fmtDate, fmtDateTime, money, monthStart, addMonths, monthLabel, todayISO, badge, humanize } from '../../utils/format.js';
import { lineChart, ringHtml } from '../../components/charts.js';
import { starsHtml } from '../../components/ui.js';
import { dayLabel, hhmm } from '../shared-cards.js';
import { kpiCard } from '../admin/admin-common.js';
import { loadTeacherCtx, notLinkedHtml, classLabel } from './teacher-common.js';
import { toastError } from '../../components/toast.js';

const { content, profile, can } = await initAdminPage({ page: 'index', title: 'Dashboard', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) { content.innerHTML = notLinkedHtml(); } else {
  const ids = T.myClassIds;
  const safe = (p, d = []) => p.catch(() => d);
  const [enrol, sessions, attendance, slots, polls, reviews, settlements, reqs] = await Promise.all([
    can('roster_view') && ids.length ? safe(api.select('enrollments', { in: { class_id: ids } })) : [],
    ids.length ? safe(api.select('class_sessions', { in: { class_id: ids } })) : [],
    can('roster_view') && ids.length ? safe(api.select('attendance', { in: { class_id: ids } })) : [],
    safe(api.select('timetable_slots', { in: { class_id: ids.length ? ids : ['-'] } })),
    can('poll_view') ? safe(api.rpc('get_poll_counts')) : [],
    can('reviews_view') ? safe(api.rpc('get_my_reviews')) : [],
    can('earnings_view') ? safe(api.select('teacher_settlements', { eq: { teacher_id: T.teacher.id }, order: ['period_month', 'desc'] })) : [],
    safe(api.select('timetable_change_requests', { eq: { teacher_id: T.teacher.id } }))
  ]);
  const LIVE = ['trial', 'trial_completed', 'admission_requested', 'approved'];
  const active = enrol.filter((e) => LIVE.includes(e.status));
  const m0 = monthStart().slice(0, 7);
  const held = sessions.filter((s) => s.status === 'held');
  const heldThisMonth = held.filter((s) => s.session_date.startsWith(m0));
  const rate = (list) => { const c = list.filter((a) => a.status !== 'cancelled'); return c.length ? Math.round((c.filter((a) => ['present', 'late'].includes(a.status)).length / c.length) * 100) : null; };
  const attThis = rate(attendance.filter((a) => (a.marked_at || a.created_at || '').startsWith(m0) || sessions.find((s) => s.id === a.session_id)?.session_date?.startsWith(m0)));
  const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(monthStart(), n));
  const sesById = new Map(sessions.map((s) => [s.id, s]));
  const trend = months.map((m) => rate(attendance.filter((a) => sesById.get(a.session_id)?.session_date?.startsWith(m.slice(0, 7)))) ?? 0);
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  const today = slots.filter((s) => s.is_active !== false && s.weekday === dow).sort((a, b) => String(a.start_time).localeCompare(b.start_time));
  const nextDays = [1, 2, 3, 4, 5, 6].map((k) => ((dow - 1 + k) % 7) + 1);
  const upcoming = nextDays.flatMap((d) => slots.filter((s) => s.is_active !== false && s.weekday === d).sort((a, b) => String(a.start_time).localeCompare(b.start_time)).map((s) => ({ ...s, d }))).slice(0, 5);
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = T.teacher.display_name || T.teacher.full_name;

  content.innerHTML = `
    <section class="dash-hero mb-4"><div><span class="eyebrow">${esc(fmtDate(todayISO()))}</span><h2>${hi}, ${esc(name)}</h2><p>You teach ${T.classes.length} class(es)${today.length ? ` · <b>${today.length}</b> today` : ' · no classes today'}.</p></div>
      <div class="d-flex flex-wrap gap-2">${can('attendance_mark') ? `<a class="btn btn-light" href="${href('teacher/attendance.html')}"><i class="bi bi-calendar-check" aria-hidden="true"></i>Mark attendance</a>` : ''}${can('content_submit') ? `<a class="btn btn-outline-light" href="${href('teacher/content.html')}"><i class="bi bi-cloud-arrow-up" aria-hidden="true"></i>Add recording</a>` : ''}</div></section>
    <div class="kpi-grid kpi-row-4 mb-4">${[
      kpiCard('bi-easel', 'My classes', String(T.classes.length), `${slots.filter((s) => s.is_active !== false).length} weekly slot(s)`, 'accent'),
      kpiCard('bi-people', 'Active students', can('roster_view') ? String(new Set(active.map((e) => e.student_id)).size) : '—', can('roster_view') ? `${active.filter((e) => e.status.startsWith('trial')).length} on trial` : 'Roster access is off', 't-teal'),
      kpiCard('bi-calendar2-check', 'Sessions held', String(heldThisMonth.length), esc(monthLabel(monthStart())), 't-green'),
      kpiCard('bi-star', 'Rating', avg ? avg.toFixed(1) : '—', reviews.length ? `${reviews.length} approved review(s)` : 'No reviews yet', 't-gold')].join('')}</div>
    <div class="dash-grid">
      <div class="m-card span-7"><div class="card-head"><h2><i class="bi bi-clock me-2 text-primary" aria-hidden="true"></i>Today</h2><a class="small fw-semibold" href="${href('teacher/timetable.html')}">Full timetable <i class="bi bi-arrow-right" aria-hidden="true"></i></a></div>
        ${today.length ? `<div class="tt-today">${today.map((s) => `<div class="tt-slot c1"><span class="t">${hhmm(s.start_time)}–${hhmm(s.end_time)}</span><b>${esc(classLabel(T.classesById.get(s.class_id)))}</b>${s.room ? `<span class="d-block text-muted">${esc(s.room)}</span>` : ''}</div>`).join('')}</div>` : '<div class="empty-state py-3"><i class="bi bi-cup-hot" aria-hidden="true"></i><p class="small m-0">No classes today.</p></div>'}
        ${upcoming.length ? `<h3 class="h6 mt-4 mb-2">Coming up</h3><ul class="dash-list">${upcoming.map((s) => `<li><span><b>${dayLabel(s.d)}</b> · ${hhmm(s.start_time)} · ${esc(T.classesById.get(s.class_id)?.title_en || '')}</span><span class="small text-muted">${esc(s.room || '')}</span></li>`).join('')}</ul>` : ''}</div>
      <div class="m-card span-5"><div class="card-head"><h2><i class="bi bi-hand-thumbs-up me-2 text-primary" aria-hidden="true"></i>Joining the next class?</h2></div>
        ${!can('poll_view') ? '<p class="small text-muted">Poll counts are turned off for teachers.</p>' : polls.length ? polls.map((p) => { const tot = p.yes + p.no; return `<div class="poll-count"><div class="d-flex justify-content-between"><b class="small">${esc(p.title_en)} · G${esc(p.grade)}</b><span class="small text-muted">${fmtDateTime(p.starts_at)}</span></div>
          <div class="pc-bar" role="img" aria-label="${p.yes} yes, ${p.no} no of ${p.enrolled} students"><span class="y" style="width:${p.enrolled ? (p.yes / p.enrolled) * 100 : 0}%"></span><span class="n" style="width:${p.enrolled ? (p.no / p.enrolled) * 100 : 0}%"></span></div>
          <div class="small"><b class="text-success">${p.yes} yes</b> · <span class="text-danger">${p.no} no</span> · <span class="text-muted">${Math.max(0, p.enrolled - tot)} not answered</span></div></div>`; }).join('') : '<div class="empty-state py-3"><i class="bi bi-hourglass" aria-hidden="true"></i><p class="small m-0">The poll opens 24 hours before each class. Answers are deleted when the class starts.</p></div>'}</div>
      <div class="m-card span-7"><div class="card-head"><h2><i class="bi bi-graph-up me-2 text-primary" aria-hidden="true"></i>Attendance rate · 6 months</h2></div>${can('roster_view') ? '<div id="attTrend"></div>' : '<p class="small text-muted">Roster access is turned off.</p>'}</div>
      <div class="m-card span-5"><div class="card-head"><h2>This month</h2></div><div class="d-flex align-items-center gap-4 flex-wrap">${ringHtml(attThis ?? 0, attThis == null ? 'No data' : 'attendance', '#10B981', 120)}
        <ul class="dash-list flex-grow-1"><li><span>Sessions held</span><b>${heldThisMonth.length}</b></li><li><span>Cancelled</span><b>${sessions.filter((s) => s.status === 'cancelled' && s.session_date.startsWith(m0)).length}</b></li><li><span>Off-timetable</span><b>${heldThisMonth.filter((s) => s.off_schedule_reason).length}</b></li>
        ${settlements[0] ? `<li><span>Last settlement</span><b>${money(settlements[0].net_payable)}</b></li>` : ''}</ul></div></div>
      ${reviews.length ? `<div class="m-card span-12"><div class="card-head"><h2>Latest reviews</h2><a class="small fw-semibold" href="${href('teacher/reviews.html')}">All reviews <i class="bi bi-arrow-right" aria-hidden="true"></i></a></div><div class="row g-3">${reviews.slice(0, 3).map((r) => `<div class="col-md-4"><div class="review-mini">${starsHtml(r.rating)}<p class="small my-2">"${esc(r.comment)}"</p><span class="small text-muted">— ${esc(r.reviewer_name)}</span></div></div>`).join('')}</div></div>` : ''}
      ${reqs.filter((r) => r.status === 'pending').length ? `<div class="m-card span-12"><div class="notice-box warn m-0"><i class="bi bi-hourglass-split" aria-hidden="true"></i><span>You have ${reqs.filter((r) => r.status === 'pending').length} timetable change request(s) waiting for admin approval.</span></div></div>` : ''}
    </div>`;
  if (can('roster_view')) lineChart(content.querySelector('#attTrend'), { labels: months.map((m) => monthLabel(m).slice(0, 3)), series: [{ name: 'Attendance %', data: trend, color: '#10B981' }], format: (v) => `${Math.round(v)}%`, max: 100 });
}
