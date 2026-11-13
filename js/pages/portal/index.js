import { initPortalPage } from '../../components/portal-shell.js';
import { href } from '../../components/common.js';
import { loadMyData, classTitle, loadMyAttendance, attendanceRate, loadMySlots, upcomingFromSlots } from './portal-data.js';
import { listNotices } from '../../services/content.service.js';
import { t, loc, onLanguageChange } from '../../i18n/language.js';
import { esc } from '../../utils/dom.js';
import { money, fmtDate, badge, monthStart, addMonths, monthLabel } from '../../utils/format.js';
import { toastError } from '../../components/toast.js';
import { ringHtml, barChart, PALETTE } from '../../components/charts.js';
import { mountPolls } from './poll-card.js';
import { avatarHtml } from '../shared-cards.js';
import { photoUrl } from './photo.js';

const { student, content } = await initPortalPage('index');
let data, notices = [], att = [], slots = [], photo = '';

const LIVE = ['trial', 'trial_completed', 'admission_requested', 'approved'];

function render() {
  const active = data.enrollments.filter((e) => e.status === 'approved');
  const trials = data.enrollments.filter((e) => ['trial', 'trial_completed'].includes(e.status));
  const pending = data.payments.filter((p) => ['pending', 'receipt_sent'].includes(p.status));
  const myClassIds = data.enrollments.map((e) => e.class_id);
  const myNotices = notices.filter((n) => n.is_published && (!n.class_id || myClassIds.includes(n.class_id))).slice(0, 3);
  const ms = monthStart();
  const thisMonth = att.filter((r) => r.date >= ms);
  const rate = attendanceRate(thisMonth);
  const presentN = thisMonth.filter((r) => ['present', 'late'].includes(r.status)).length;
  const counted = thisMonth.filter((r) => ['present', 'late', 'absent'].includes(r.status)).length;
  const upcoming = upcomingFromSlots(slots, 7).slice(0, 4);

  content.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
      <div><h1 class="portal-title">${esc(t('portal.hello', { name: student.full_name.split(' ')[0] }))}</h1><p class="portal-sub m-0">${esc(t('portal.welcomeSub'))}</p></div>
    </div>
    <div id="pollMount" class="mb-4" hidden></div>
    <div class="row g-4">
      <div class="col-lg-5"><div class="id-card h-100">
        <div class="d-flex gap-3 align-items-center">${avatarHtml(student.full_name, photo)}<div class="min-w-0">
          <div class="eyebrow text-white-50">${esc(t('portal.studentId'))}</div><div class="id-code">${esc(student.student_code)}</div></div></div>
        <div class="id-name">${esc(student.full_name)}</div>
        <div class="small">${student.grade ? `${esc(t('common.grade'))} ${esc(student.grade)}` : ''}</div>
      </div></div>
      <div class="col-lg-7"><div class="row g-3">
        ${[['bi-wallet2', 'portal.balance', money(Math.max(data.balance, 0)), data.balance > 0 ? 'text-danger' : 'text-success', 'fees', ''],
          ['bi-easel', 'portal.activeClasses', active.length, '', 'classes', 'teal'],
          ['bi-stars', 'portal.trialClasses', trials.length, '', 'classes', 'gold'],
          ['bi-hourglass-split', 'portal.pendingPayments', pending.length, '', 'fees', 'green']]
          .map(([i, k, v, cls, p, tone]) => `<div class="col-6"><a class="mini-stat ${tone} text-decoration-none" href="${href(`portal/${p}.html`)}">
            <span class="ms-ico"><i class="bi ${i}" aria-hidden="true"></i></span><div class="min-w-0"><div class="small text-muted">${esc(t(k))}</div><div class="stat-num fw-bold ${cls}">${esc(v)}</div></div></a></div>`).join('')}
      </div></div>
    </div>
    ${data.balance < 0 ? `<div class="notice-box mt-4"><i class="bi bi-info-circle" aria-hidden="true"></i><span>${esc(t('portal.credit', { amount: money(-data.balance) }))}</span></div>` : ''}
    <div class="row g-4 mt-1">
      <div class="col-md-5 col-lg-4"><div class="m-card h-100 text-center">
        <div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h6 m-0">${esc(t('portal.attRate'))}</h2><span class="chip">${esc(monthLabel(ms))}</span></div>
        <div class="d-flex justify-content-center">${rate == null ? `<div class="empty-state p-3"><i class="bi bi-calendar" aria-hidden="true"></i><p class="small">${esc(t('portal.attNoData'))}</p></div>` : ringHtml(rate, t('portal.thisMonth'), rate >= 80 ? '#10B981' : rate >= 60 ? '#FBBF24' : '#F97316', 140)}</div>
        ${rate != null ? `<p class="small text-muted mt-3 mb-0">${esc(t('portal.attRateText', { n: presentN, total: counted }))}</p>` : ''}
        <a class="btn btn-ghost btn-sm mt-3" href="${href('portal/attendance.html')}">${esc(t('common.viewAll'))}</a></div></div>
      <div class="col-md-7 col-lg-8"><div class="m-card h-100"><div class="d-flex justify-content-between align-items-center mb-2"><h2 class="h6 m-0">${esc(t('portal.attTrend'))}</h2><span class="small text-muted">${esc(t('portal.last6'))}</span></div>
        <div class="chart" id="attChart"></div></div></div>
    </div>
    <div class="row g-4 mt-1">
      <div class="col-lg-7"><div class="m-card h-100"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h6 m-0">${esc(t('portal.upcoming'))}</h2><a href="${href('portal/classes.html')}" class="small">${esc(t('common.viewAll'))}</a></div>
        ${upcoming.length ? `<div class="d-grid gap-2">${upcoming.map((u) => { const c = data.classById.get(u.class_id); return `<div class="media-item">
          <span class="mi-ico"><i class="bi bi-calendar-event" aria-hidden="true"></i></span>
          <div class="flex-grow-1 min-w-0"><b>${esc(classTitle(c))}</b><span class="sub">${esc(u.at.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }))} · ${esc(u.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}–${esc(u.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}${u.room ? ` · ${esc(u.room)}` : ''}</span></div>
          ${u.at - Date.now() < 864e5 ? `<span class="chip chip-accent">${esc(t('portal.soon'))}</span>` : ''}</div>`; }).join('')}</div>` : `<p class="small text-muted m-0">${esc(t('portal.noUpcoming'))}</p>`}
      </div></div>
      <div class="col-lg-5"><div class="m-card h-100"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h6 m-0">${esc(t('portal.nav.notices'))}</h2><a href="${href('portal/notices.html')}" class="small">${esc(t('common.viewAll'))}</a></div>
        ${myNotices.length ? myNotices.map((n) => `<div class="mb-3 pb-3 border-bottom"><div class="fw-semibold">${esc(loc(n, 'title'))}</div><div class="small text-muted">${fmtDate(n.published_at)}</div></div>`).join('') : `<p class="text-muted small m-0">${esc(t('portal.noNotices'))}</p>`}
        <a class="btn btn-ghost btn-sm" href="${href('portal/recordings.html')}"><i class="bi bi-play-btn" aria-hidden="true"></i>${esc(t('portal.nav.recordings'))}</a>
      </div></div>
    </div>
    <div class="m-card mt-4"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h6 m-0">${esc(t('portal.myClasses'))}</h2><a href="${href('portal/classes.html')}" class="small">${esc(t('common.viewAll'))}</a></div>
      ${data.enrollments.length ? `<div class="row g-3">${data.enrollments.slice(0, 4).map((e) => `<div class="col-md-6"><div class="d-flex justify-content-between gap-3 align-items-center p-3 rounded-3 border h-100">
        <div class="min-w-0"><div class="fw-semibold">${esc(classTitle(data.classById.get(e.class_id)))}</div><div class="small text-muted code">${esc(e.enrollment_code)}</div></div>${badge(e.status)}</div></div>`).join('')}</div>`
        : `<div class="empty-state p-3"><p>${esc(t('portal.noClasses'))}</p><a class="btn btn-primary btn-sm mt-2" href="${href('courses.html')}">${esc(t('nav.courses'))}</a></div>`}
    </div>`;

  // Attendance trend: present/late vs absent for the last 6 months
  const months = Array.from({ length: 6 }, (_, i) => addMonths(ms, i - 5));
  const inMonth = (m, r) => r.date >= m && r.date < addMonths(m, 1);
  barChart(document.getElementById('attChart'), {
    labels: months.map((m) => monthLabel(m).split(' ')[0].slice(0, 3)),
    series: [
      { name: t('status.present'), color: PALETTE[3], data: months.map((m) => att.filter((r) => inMonth(m, r) && ['present', 'late'].includes(r.status)).length) },
      { name: t('status.absent'), color: PALETTE[2], data: months.map((m) => att.filter((r) => inMonth(m, r) && r.status === 'absent').length) }
    ],
    stacked: true, height: 200
  });
  mountPolls(document.getElementById('pollMount'));
}

try {
  [data, notices, att] = await Promise.all([loadMyData(student.id), listNotices(), loadMyAttendance(student.id)]);
  slots = await loadMySlots(data.enrollments.filter((e) => LIVE.includes(e.status)).map((e) => e.class_id)).catch(() => []);
  photo = await photoUrl(student).catch(() => '');
  render();
} catch (e) { toastError(e); }
onLanguageChange(() => data && render());
