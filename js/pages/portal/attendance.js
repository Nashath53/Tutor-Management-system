import { initPortalPage } from '../../components/portal-shell.js';
import { loadMyData, classTitle, loadMyAttendance, attendanceRate } from './portal-data.js';
import { api } from '../../services/api.js';
import { t, onLanguageChange } from '../../i18n/language.js';
import { esc } from '../../utils/dom.js';
import { fmtDate, badge, monthStart, addMonths, monthLabel } from '../../utils/format.js';
import { toastError, showToast } from '../../components/toast.js';
import { openModal } from '../../components/modal.js';
import { ringHtml, lineChart } from '../../components/charts.js';

const { student, content } = await initPortalPage('attendance');
let data, rows = [], disputes = [], filter = 'all', classFilter = '';

function render() {
  const ms = monthStart();
  const scope = rows.filter((r) => !classFilter || r.class_id === classFilter);
  const month = scope.filter((r) => r.date >= ms);
  const rate = attendanceRate(month);
  const overall = attendanceRate(scope);
  const count = (s) => scope.filter((r) => r.status === s).length;
  const list = scope.filter((r) => filter === 'all' || r.status === filter);
  const openDispute = (id) => disputes.find((d) => d.attendance_id === id && d.status === 'pending');
  const classes = [...new Set(rows.map((r) => r.class_id))];

  content.innerHTML = `<h1 class="portal-title">${esc(t('portal.nav.attendance'))}</h1><p class="portal-sub">${esc(t('att.sub'))}</p>
    ${classes.length > 1 ? `<div class="seg seg-scroll mb-3" id="classSeg"><button type="button" data-cls="" aria-pressed="${!classFilter}">${esc(t('common.all'))}</button>${classes.map((c) => `<button type="button" data-cls="${esc(c)}" aria-pressed="${classFilter === c}">${esc(classTitle(data.classById.get(c)))}</button>`).join('')}</div>` : ''}
    <div class="row g-4 mb-4">
      <div class="col-md-4"><div class="m-card h-100 d-flex flex-column align-items-center justify-content-center text-center">
        ${rate == null ? `<div class="empty-state p-2"><p class="small m-0">${esc(t('portal.attNoData'))}</p></div>` : ringHtml(rate, t('portal.thisMonth'), rate >= 80 ? '#10B981' : rate >= 60 ? '#FBBF24' : '#F97316', 130)}
        <div class="small text-muted mt-2">${esc(t('att.overall'))}: <b class="text-body">${overall == null ? '—' : `${overall}%`}</b></div></div></div>
      <div class="col-md-8"><div class="m-card h-100"><div class="d-flex justify-content-between mb-2"><h2 class="h6 m-0">${esc(t('att.trend'))}</h2><span class="small text-muted">${esc(t('portal.last6'))}</span></div><div class="chart" id="attLine"></div></div></div>
    </div>
    <div class="row g-3 mb-4">${[['present', 'bi-check-circle', 'green'], ['late', 'bi-clock-history', 'gold'], ['absent', 'bi-x-circle', ''], ['trial', 'bi-stars', 'teal']].map(([s, i, tone]) => `<div class="col-6 col-md-3"><button type="button" class="mini-stat ${tone} w-100 text-start ${filter === s ? 'border-primary' : ''}" data-filter="${s}" aria-pressed="${filter === s}">
      <span class="ms-ico"><i class="bi ${i}" aria-hidden="true"></i></span><div><div class="lbl">${esc(t('status.' + s))}</div><div class="fs-4 fw-bold">${count(s)}</div></div></button></div>`).join('')}</div>
    <div class="m-card"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 class="h6 m-0">${esc(t('att.history'))}</h2>
      ${filter !== 'all' ? `<button type="button" class="btn btn-sm btn-ghost" data-filter="all"><i class="bi bi-x" aria-hidden="true"></i>${esc(t('att.clearFilter'))}</button>` : ''}</div>
      ${list.length ? `<div class="d-grid gap-2">${list.map((r) => { const d = openDispute(r.id); const canAsk = !d && ['present', 'late', 'absent', 'excused'].includes(r.status); return `<div class="media-item align-items-center">
        <span class="mi-ico ${r.status === 'absent' ? 'k-paper' : r.status === 'trial' ? 'k-note' : 'k-whatsapp'}"><i class="bi ${r.status === 'absent' ? 'bi-x-lg' : r.status === 'late' ? 'bi-clock' : 'bi-check-lg'}" aria-hidden="true"></i></span>
        <div class="flex-grow-1 min-w-0"><b>${esc(classTitle(data.classById.get(r.class_id)))}</b><span class="sub">${fmtDate(r.date)}${r.session?.topic ? ` · ${esc(r.session.topic)}` : ''}</span></div>
        <div class="d-flex flex-wrap gap-2 align-items-center justify-content-end">${badge(r.status)}
          ${d ? `<span class="chip chip-gold"><i class="bi bi-hourglass-split" aria-hidden="true"></i>${esc(t('att.requested'))}</span>` : canAsk ? `<button type="button" class="btn btn-sm btn-ghost" data-dispute="${esc(r.id)}"><i class="bi bi-flag" aria-hidden="true"></i>${esc(t('att.requestFix'))}</button>` : ''}</div></div>`; }).join('')}</div>`
        : `<div class="empty-state"><i class="bi bi-calendar" aria-hidden="true"></i><p>${esc(t('att.none'))}</p></div>`}
      <p class="small text-muted mt-3 mb-0"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>${esc(t('att.fixHelp'))}</p></div>`;

  const months = Array.from({ length: 6 }, (_, i) => addMonths(ms, i - 5));
  lineChart(document.getElementById('attLine'), {
    labels: months.map((m) => monthLabel(m).split(' ')[0].slice(0, 3)),
    series: [{ name: '%', data: months.map((m) => attendanceRate(scope.filter((r) => r.date >= m && r.date < addMonths(m, 1))) ?? 0) }],
    format: (v) => `${v}%`, max: 100, height: 190
  });
}

function openDisputeModal(r) {
  const opts = ['present', 'late', 'absent', 'excused'].filter((s) => s !== r.status);
  const m = openModal({
    title: t('att.requestFix'),
    body: `<div class="m-card m-card-sm mb-3"><b class="d-block">${esc(classTitle(data.classById.get(r.class_id)))}</b><span class="small text-muted">${fmtDate(r.date)} · ${esc(t('att.recordedAs'))} ${badge(r.status)}</span></div>
      <form id="dpForm" novalidate class="d-grid gap-3">
        <div><label class="form-label" for="dp-status">${esc(t('att.shouldBe'))}</label><select class="form-select" id="dp-status" name="status">${opts.map((s) => `<option value="${s}">${esc(t('status.' + s))}</option>`).join('')}</select></div>
        <div><label class="form-label" for="dp-reason">${esc(t('att.whatHappened'))}<span class="req">*</span></label><textarea class="form-control" id="dp-reason" name="reason" rows="3" minlength="5" maxlength="500" required></textarea><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
        <div class="notice-box"><i class="bi bi-shield-check" aria-hidden="true"></i><span>${esc(t('att.reviewNote'))}</span></div>
      </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.cancel'))}</button><button type="submit" form="dpForm" class="btn btn-primary">${esc(t('att.sendRequest'))}</button>`
  });
  const f = m.el.querySelector('#dpForm');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.classList.add('was-validated');
    if (!f.checkValidity()) return;
    try {
      await api.rpc('request_attendance_correction', { p_attendance_id: r.id, p_requested_status: f.status.value, p_reason: f.reason.value.trim() });
      showToast(t('att.requestSent'), 'success'); m.close(); await load();
    } catch (err) { toastError(err); }
  });
}

content.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]'); if (f) { filter = filter === f.dataset.filter ? 'all' : f.dataset.filter; render(); return; }
  const c = e.target.closest('[data-cls]'); if (c) { classFilter = c.dataset.cls; render(); return; }
  const d = e.target.closest('[data-dispute]'); if (d) openDisputeModal(rows.find((r) => r.id === d.dataset.dispute));
});

async function load() {
  [rows, disputes] = await Promise.all([loadMyAttendance(student.id), api.select('attendance_disputes', { eq: { student_id: student.id } }).catch(() => [])]);
  render();
}
try { data = await loadMyData(student.id); await load(); } catch (e) { toastError(e); }
onLanguageChange(() => data && render());
