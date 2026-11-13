/** Teacher earnings — own settlement statements (read-only). Figures are calculated by the database. */
import { initAdminPage } from '../../components/admin-shell.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { money, fmtDate, monthLabel, badge } from '../../utils/format.js';
import { barChart } from '../../components/charts.js';
import { openModal } from '../../components/modal.js';
import { printHtml } from '../../components/receipt.js';
import { kpiCard } from '../admin/admin-common.js';
import { loadTeacherCtx, notLinkedHtml } from './teacher-common.js';
import { APP } from '../../config/app.config.js';

const { content, profile } = await initAdminPage({ page: 'earnings', title: 'Earnings', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) content.innerHTML = notLinkedHtml();
else {
  const rows = (await api.select('teacher_settlements', { eq: { teacher_id: T.teacher.id }, order: ['period_month', 'desc'] }).catch(() => [])).filter((r) => r.status !== 'draft');
  const paid = rows.filter((r) => r.status === 'paid');
  const last6 = [...rows].slice(0, 6).reverse();
  content.innerHTML = `<p class="page-intro">Your monthly settlements after the admin approves them. Mentora's commission is ${'<b>separate</b>'} from statutory withholding tax (WHT). Questions about a figure? Contact the admin with the month and reference.</p>
    <div class="kpi-grid kpi-row-4 mb-4">${[
      kpiCard('bi-wallet2', 'Total paid to you', money(paid.reduce((a, r) => a + Number(r.net_payable), 0)), `${paid.length} settlement(s)`, 'accent'),
      kpiCard('bi-hourglass-split', 'Approved, not yet paid', money(rows.filter((r) => r.status === 'approved').reduce((a, r) => a + Number(r.net_payable), 0)), 'Bank transfer pending', 't-gold'),
      kpiCard('bi-cash-coin', 'Class revenue (share)', money(rows.reduce((a, r) => a + Number(r.gross_revenue), 0)), 'All statements', 't-teal'),
      kpiCard('bi-building', 'WHT deducted', money(rows.reduce((a, r) => a + Number(r.statutory_deductions), 0)), 'Paid to IRD for you', 't-green')].join('')}</div>
    ${rows.length ? `<div class="m-card mb-4"><div class="card-head"><h2>Net payable by month</h2></div><div id="eChart"></div></div>
    <div class="ent-grid">${rows.map((r) => `<article class="ent-card"><div class="ec-head"><span class="ec-ico"><i class="bi bi-calendar3" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(monthLabel(r.period_month))}</h3><div class="ec-sub">${r.bank_reference ? `Ref ${esc(r.bank_reference)}` : 'Not paid yet'}</div></div>${badge(r.status)}</div>
      <div class="ec-meta"><div><b>${money(r.gross_revenue)}</b><span>Revenue</span></div><div><b>${money(r.commission_amount)}</b><span>Commission</span></div><div><b>${money(r.statutory_deductions)}</b><span>WHT</span></div></div>
      <div class="d-flex justify-content-between align-items-center"><span class="small text-muted">Net payable</span><b class="fs-5">${money(r.net_payable)}</b></div>
      <div class="ec-foot"><span class="small text-muted">${r.settlement_date ? `Paid ${fmtDate(r.settlement_date)}` : ''}</span><button type="button" class="btn btn-sm btn-outline-primary ms-auto" data-view="${esc(r.id)}">Statement</button></div></article>`).join('')}</div>`
    : '<div class="m-card"><div class="empty-state"><i class="bi bi-wallet2" aria-hidden="true"></i><h3>No statements yet</h3><p>Statements appear here after the admin approves your first monthly settlement.</p></div></div>'}`;
  if (rows.length) barChart(content.querySelector('#eChart'), { labels: last6.map((r) => monthLabel(r.period_month).slice(0, 3)), series: [{ name: 'Net', data: last6.map((r) => Number(r.net_payable)), color: '#10B981' }], format: money });
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    const s = rows.find((r) => r.id === b.dataset.view); const d = s.details || {};
    const html = `<div class="statement"><div class="d-flex justify-content-between mb-3"><div><h2 class="h5 m-0">${esc(APP.name)}</h2><div class="small text-muted">Settlement statement · ${esc(monthLabel(s.period_month))}</div></div><div class="text-end"><b>${esc(T.teacher.full_name)}</b><div class="code small">${esc(T.teacher.teacher_code || '')}</div></div></div>
      <div class="table-responsive"><table class="table table-sm m-table"><thead><tr><th>Class</th><th>Student</th><th class="num">Revenue</th><th class="num">Rate</th><th class="num">Commission</th></tr></thead><tbody>${(d.lines || []).map((l) => `<tr><td>${esc(l.class_code || '')}</td><td class="code">${esc(l.student_code || '')}</td><td class="num">${money(l.revenue)}</td><td class="num">${esc(l.rate)}%</td><td class="num">${money(l.commission)}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">No lines.</td></tr>'}</tbody></table></div>
      <dl class="kv"><dt>Revenue</dt><dd>${money(s.gross_revenue)}</dd><dt>Adjustments</dt><dd>${money(s.adjustments)}</dd><dt>Commission</dt><dd>− ${money(s.commission_amount)}</dd><dt>WHT</dt><dd>− ${money(s.statutory_deductions)}</dd><dt><b>Net payable</b></dt><dd><b>${money(s.net_payable)}</b></dd></dl></div>`;
    const m = openModal({ title: 'Settlement statement', size: 'modal-lg', body: html, footer: '<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Close</button><button type="button" class="btn btn-primary" data-print><i class="bi bi-printer" aria-hidden="true"></i>Print</button>' });
    m.el.querySelector('[data-print]').addEventListener('click', () => printHtml(html));
  });
}
