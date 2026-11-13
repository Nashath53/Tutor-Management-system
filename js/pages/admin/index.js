/**
 * Admin / cashier dashboard.
 * KPIs on top, then charts (all drawn with tiny SVG helpers — no chart library download),
 * then "needs attention" lists. Every number comes from data the signed-in role may read (RLS).
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { dashboardStats } from '../../services/report.service.js';
import { lookups, studentLabel, classLabel } from './admin-common.js';
import { api } from '../../services/api.js';
import { esc, sum } from '../../utils/dom.js';
import { money, fmtDate, badge, humanize, monthStart, addMonths, monthLabel, todayISO } from '../../utils/format.js';
import { toastError } from '../../components/toast.js';
import { barChart, lineChart, donutChart, sparkline, PALETTE } from '../../components/charts.js';
import { dayLabel, hhmm } from '../shared-cards.js';

const { content, profile, isAdmin } = await initAdminPage({ page: 'index', title: 'Dashboard' });
const safe = (p) => p.catch(() => []);
const ms = monthStart();
const months = Array.from({ length: 6 }, (_, i) => addMonths(ms, i - 5));
const mShort = (m) => monthLabel(m).split(' ')[0].slice(0, 3);
const inMonth = (iso, m) => iso && iso.slice(0, 10) >= m && iso.slice(0, 10) < addMonths(m, 1);
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

try {
  const [s, L, payments, enquiries, sessions, attendance, slots, polls] = await Promise.all([
    dashboardStats(), lookups('students', 'classes', 'enrollments', 'subjects', 'teachers'),
    safe(api.select('payments', { order: ['created_at', 'desc'] })),
    safe(api.select('student_enquiries', { eq: { status: 'new' }, order: ['created_at', 'desc'], limit: 6 })),
    safe(api.select('class_sessions', { gte: { session_date: months[0] } })),
    safe(api.select('attendance')),
    safe(api.select('timetable_slots')),
    safe(api.rpc('get_poll_counts'))
  ]);
  const verified = payments.filter((p) => p.status === 'verified');
  const toVerify = payments.filter((p) => ['pending', 'receipt_sent'].includes(p.status));
  const requests = L.enrollments.filter((e) => e.status === 'admission_requested');
  const revenue = months.map((m) => sum(verified.filter((p) => inMonth(p.verified_at || p.paid_on || p.created_at, m)), (p) => p.amount));
  const newStudents = months.map((m) => L.students.filter((x) => inMonth(x.created_at, m)).length);
  const prev = revenue[4] || 0; const cur = revenue[5] || 0;
  const delta = prev ? Math.round(((cur - prev) / prev) * 100) : null;

  // attendance by month (present+late vs absent) from sessions in range
  const sesById = new Map(sessions.map((x) => [x.id, x]));
  const attRows = attendance.filter((a) => sesById.has(a.session_id));
  const attBy = (st) => months.map((m) => attRows.filter((a) => a.status === st && inMonth(sesById.get(a.session_id).session_date, m)).length);
  const present = attBy('present'), late = attBy('late'), absent = attBy('absent');
  const rateNow = (() => { const p = present[5] + late[5]; const t = p + absent[5]; return t ? Math.round((p / t) * 100) : null; })();

  // enrolment status mix
  const ST = [['approved', 'Paid', '#2563EB'], ['trial', 'Trial', '#06B6D4'], ['trial_completed', 'Trial done', '#10B981'], ['admission_requested', 'Pending approval', '#FBBF24'], ['suspended', 'Suspended', '#F97316'], ['withdrawn', 'Withdrawn', '#94A3B8'], ['completed', 'Completed', '#6366F1']];
  const mix = ST.map(([k, label, color]) => ({ label, color, value: L.enrollments.filter((e) => e.status === k).length })).filter((x) => x.value);

  // students by subject
  const live = L.enrollments.filter((e) => ['trial', 'trial_completed', 'admission_requested', 'approved'].includes(e.status));
  const bySubj = L.subjects.map((sb) => ({ name: sb.name_en, n: live.filter((e) => L.classesById.get(e.class_id)?.subject_id === sb.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 6);

  // payment methods (this month)
  const methods = ['bank_transfer', 'cash', 'representative_cash'].map((k, i) => ({ label: humanize(k), color: [PALETTE[0], PALETTE[3], PALETTE[2]][i], value: sum(verified.filter((p) => p.method === k && inMonth(p.verified_at || p.created_at, ms)), (p) => p.amount) })).filter((x) => x.value);

  // today's timetable
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  const today = slots.filter((x) => x.is_active !== false && x.weekday === dow).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const heldToday = new Set(sessions.filter((x) => x.session_date === todayISO()).map((x) => x.class_id));
  const nowHM = new Date().toTimeString().slice(0, 5);

  const kpi = (icon, label, value, foot, link, tone = '', spark = '') => `<a class="kpi ${tone}" href="${href('admin/' + link)}">
    <div class="k-label"><span class="k-ico"><i class="bi ${icon}" aria-hidden="true"></i></span>${esc(label)}</div><div class="k-value">${esc(value)}</div><div class="k-foot">${foot}</div>${spark ? `<div class="k-spark" aria-hidden="true">${spark}</div>` : ''}</a>`;
  const list = (title, link, rows, empty, icon) => `<div class="m-card h-100"><div class="card-head"><h2><i class="bi ${icon} me-2 text-primary" aria-hidden="true"></i>${esc(title)}</h2><a class="small fw-semibold" href="${href('admin/' + link)}">Open <i class="bi bi-arrow-right" aria-hidden="true"></i></a></div>
    ${rows.length ? `<ul class="dash-list">${rows.join('')}</ul>` : `<div class="empty-state py-3"><i class="bi bi-check2-circle" aria-hidden="true"></i><p class="small m-0">${esc(empty)}</p></div>`}</div>`;
  const pendingTotal = (s.pending_requests || 0) + toVerify.length + requests.length + (s.pending_reviews || 0);

  content.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div><p class="eyebrow mb-1">${new Date().toLocaleDateString('en-LK', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h2 class="h4 m-0">${hello()}, ${esc((profile.full_name || 'admin').split(' ')[0])}</h2>
        <p class="small text-muted m-0 mt-1">${pendingTotal ? `<b class="text-body">${pendingTotal}</b> item(s) are waiting for you.` : 'Everything is up to date.'}</p></div>
      <div class="d-flex flex-wrap gap-2">
        <a class="btn btn-primary" href="${href('admin/attendance.html')}"><i class="bi bi-calendar-check" aria-hidden="true"></i>Mark attendance</a>
        <a class="btn btn-outline-primary" href="${href('admin/payments.html?tab=cash')}"><i class="bi bi-cash-coin" aria-hidden="true"></i>Cash payment</a>
        <a class="btn btn-ghost" href="${href('admin/enrollments.html?new=1')}"><i class="bi bi-person-plus" aria-hidden="true"></i>Enrol</a></div>
    </div>
    <div class="kpi-grid kpi-row-4">
      ${kpi('bi-cash-stack', 'Collected this month', money(s.collected_this_month), delta == null ? 'Verified payments only' : `<span class="${delta >= 0 ? 'trend-up' : 'text-danger'}"><i class="bi bi-arrow-${delta >= 0 ? 'up' : 'down'}-right"></i>${Math.abs(delta)}%</span> vs last month`, 'payments.html', 'accent', sparkline(revenue, '#FBBF24'))}
      ${kpi('bi-exclamation-diamond', 'Outstanding fees', money(s.outstanding_total), 'Charges minus verified payments', 'fees.html?f=due', 't-gold')}
      ${kpi('bi-people', 'Active students', s.students, `${s.active_enrollments} paid · ${s.trial_enrollments} on trial`, 'students.html', 't-teal', sparkline(newStudents, '#06B6D4'))}
      ${kpi('bi-calendar2-check', 'Attendance this month', rateNow == null ? '—' : `${rateNow}%`, `${present[5] + late[5]} present · ${absent[5]} absent`, 'attendance.html', 't-green')}
    </div>
    <div class="dash-grid mb-4">
      <div class="m-card span-8"><div class="card-head"><div><h2>Revenue collected</h2><span class="sub">Verified payments, last 6 months</span></div><span class="chip chip-primary">${money(sum(revenue, (x) => x))}</span></div><div class="chart" id="revChart"></div></div>
      <div class="m-card span-4"><div class="card-head"><div><h2>Enrolment mix</h2><span class="sub">All enrolments by status</span></div></div><div class="chart" id="mixChart"></div></div>
      <div class="m-card span-7"><div class="card-head"><div><h2>Attendance trend</h2><span class="sub">Marked sessions per month</span></div></div><div class="chart" id="attChart"></div></div>
      <div class="m-card span-5"><div class="card-head"><div><h2>Students by subject</h2><span class="sub">Live enrolments (trial + paid)</span></div></div><div class="chart" id="subjChart"></div></div>
      <div class="m-card span-4"><div class="card-head"><div><h2>Today's timetable</h2><span class="sub">${dayLabel(dow)}</span></div><a class="small fw-semibold" href="${href('admin/timetable.html')}">Week <i class="bi bi-arrow-right" aria-hidden="true"></i></a></div>
        ${today.length ? `<ul class="dash-list">${today.map((x) => { const c = L.classesById.get(x.class_id); const st = heldToday.has(x.class_id) ? ['Held', 'chip-teal'] : String(x.end_time).slice(0, 5) < nowHM ? ['Not marked', 'chip-accent'] : String(x.start_time).slice(0, 5) <= nowHM ? ['Live now', 'chip-gold'] : ['Scheduled', 'chip-gold']; return `<li><div class="min-w-0"><b class="d-block text-truncate">${esc(classLabel(c))}</b><span class="small text-muted">${hhmm(x.start_time)}–${hhmm(x.end_time)}${x.room ? ` · ${esc(x.room)}` : ''}</span></div><span class="chip ${st[1]}">${st[0]}</span></li>`; }).join('')}</ul>` : '<div class="empty-state py-3"><i class="bi bi-cup-hot" aria-hidden="true"></i><p class="small m-0">No classes scheduled today.</p></div>'}</div>
      <div class="m-card span-4"><div class="card-head"><div><h2>Who's joining next class</h2><span class="sub">Student poll · disappears when class starts</span></div></div>
        ${polls.length ? `<ul class="dash-list">${polls.map((p) => { const tot = (p.yes || 0) + (p.no || 0); const pct = p.enrolled ? Math.round(((p.yes || 0) / p.enrolled) * 100) : 0; return `<li class="d-block"><div class="d-flex justify-content-between gap-2"><b class="text-truncate">${esc(p.title_en)}</b><span class="small text-muted text-nowrap">${new Date(p.starts_at).toLocaleString('en-LK', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>
          <div class="m-progress my-2"><span style="width:${pct}%"></span></div><div class="small text-muted"><b class="text-success">${p.yes || 0} yes</b> · ${p.no || 0} no · ${Math.max(0, (p.enrolled || 0) - tot)} not answered</div></li>`; }).join('')}</ul>` : '<div class="empty-state py-3"><i class="bi bi-hand-thumbs-up" aria-hidden="true"></i><p class="small m-0">Polls open 24 hours before each class.</p></div>'}</div>
      <div class="m-card span-4"><div class="card-head"><div><h2>Payment methods</h2><span class="sub">This month</span></div></div><div class="chart" id="payChart"></div></div>
    </div>
    <div class="dash-grid">
      <div class="span-4">${list(`Payments to verify (${toVerify.length})`, 'payments.html', toVerify.slice(0, 5).map((p) => `<li><div class="min-w-0"><div class="code small">${esc(p.payment_ref)}</div><div class="text-muted small text-truncate">${esc(studentLabel(L.studentsById.get(p.student_id)))}</div></div><div class="text-end"><div class="fw-semibold">${money(p.amount)}</div>${badge(p.status)}</div></li>`), 'No bank transfers waiting.', 'bi-bank')}</div>
      <div class="span-4">${list(`Admission requests (${requests.length})`, 'enrollments.html', requests.slice(0, 5).map((e) => `<li><div class="min-w-0"><div class="fw-semibold text-truncate">${esc(L.studentsById.get(e.student_id)?.full_name)}</div><div class="text-muted small text-truncate">${esc(classLabel(L.classesById.get(e.class_id)))}</div></div><span class="code small">${esc(e.enrollment_code)}</span></li>`), 'No admission requests.', 'bi-person-check')}</div>
      <div class="span-4">${list(`New enquiries (${s.new_enquiries || 0})`, 'enquiries.html', enquiries.map((q) => `<li><div class="min-w-0"><div class="fw-semibold text-truncate">${esc(q.student_name)}</div><div class="text-muted small text-truncate">${esc(q.subject_name || '—')} · G${esc(q.grade || '?')} · ${esc(humanize(q.class_type))}</div></div><span class="small text-muted text-nowrap">${fmtDate(q.created_at)}</span></li>`), 'No new enquiries.', 'bi-chat-left-text')}</div>
    </div>
    ${isAdmin && ((s.pending_requests || 0) + (s.pending_reviews || 0) + (s.open_complaints || 0) + (s.new_feedback || 0)) ? `<div class="m-card mt-4"><div class="card-head"><h2>Inbox</h2></div><div class="d-flex flex-wrap gap-2">
      ${s.pending_requests ? `<a class="btn btn-ghost" href="${href('admin/requests.html')}"><i class="bi bi-inboxes" aria-hidden="true"></i>${s.pending_requests} approval(s)</a>` : ''}
      ${s.pending_reviews ? `<a class="btn btn-ghost" href="${href('admin/feedback.html')}"><i class="bi bi-star" aria-hidden="true"></i>${s.pending_reviews} review(s) to moderate</a>` : ''}
      ${s.open_complaints ? `<a class="btn btn-ghost" href="${href('admin/feedback.html?tab=complaints')}"><i class="bi bi-flag" aria-hidden="true"></i>${s.open_complaints} open complaint(s)</a>` : ''}
      ${s.new_feedback ? `<a class="btn btn-ghost" href="${href('admin/feedback.html?tab=survey')}"><i class="bi bi-clipboard-data" aria-hidden="true"></i>${s.new_feedback} survey response(s)</a>` : ''}</div></div>` : ''}`;

  barChart(document.getElementById('revChart'), { labels: months.map(mShort), series: [{ name: 'Revenue', data: revenue, color: '#2563EB' }], format: (v) => money(v), height: 230 });
  donutChart(document.getElementById('mixChart'), { items: mix, center: String(L.enrollments.length), centerSub: 'enrolments' });
  barChart(document.getElementById('attChart'), { labels: months.map(mShort), stacked: true, series: [{ name: 'Present', data: present, color: '#10B981' }, { name: 'Late', data: late, color: '#06B6D4' }, { name: 'Absent', data: absent, color: '#F97316' }], height: 220 });
  const sc = document.getElementById('subjChart');
  if (bySubj.length) { const mx = Math.max(...bySubj.map((x) => x.n)); sc.innerHTML = `<div class="bar-chart">${bySubj.map((x, i) => `<div class="bar-row"><span title="${esc(x.name)}">${esc(x.name)}</span><div class="bar"><span style="width:${(x.n / mx) * 100}%;background:${PALETTE[i % PALETTE.length]}"></span></div><span class="text-end">${x.n}</span></div>`).join('')}</div>`; } else sc.innerHTML = '<p class="small text-muted">No live enrolments yet.</p>';
  const pc = document.getElementById('payChart');
  if (methods.length) donutChart(pc, { items: methods, center: money(sum(methods, (x) => x.value)).replace('LKR', '').trim(), centerSub: 'LKR', format: (v) => money(v) }); else pc.innerHTML = '<div class="empty-state py-3"><i class="bi bi-wallet2" aria-hidden="true"></i><p class="small m-0">No verified payments this month yet.</p></div>';
} catch (e) { toastError(e); }
