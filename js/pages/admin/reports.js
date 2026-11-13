import { initAdminPage } from '../../components/admin-shell.js';
import { lookups, tabs, downloadCsv, studentLabel, kpiCard, confirmTwice } from './admin-common.js';
import { barChart, donutChart, lineChart } from '../../components/charts.js';
import { listReconciliations, saveReconciliation, listAudit } from '../../services/report.service.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { money, fmtDate, fmtDateTime, humanize, monthLabel, addMonths, monthStart, todayISO } from '../../utils/format.js';
import { validateForm } from '../../utils/validate.js';
import { showToast, toastError } from '../../components/toast.js';

const { content, isAdmin } = await initAdminPage({ page: 'reports', title: 'Reports' });
content.innerHTML = '<div id="tabs"></div><div id="panel"></div>';
const panel = () => content.querySelector('#panel');
const bars = (rows, fmt = (v) => v) => { const max = Math.max(1, ...rows.map((r) => r[1])); return `<div class="bar-chart">${rows.map(([l, v]) => `<div class="bar-row"><span class="text-truncate">${esc(l)}</span><span class="bar"><span style="width:${(v / max) * 100}%"></span></span><span class="text-end">${esc(fmt(v))}</span></div>`).join('')}</div>`; };

async function overview() {
  const [payments, L, enquiries] = await Promise.all([api.select('payments', { eq: { status: 'verified' } }), lookups('enrollments', 'students'), api.select('student_enquiries')]);
  const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(monthStart(), n));
  const byMonth = months.map((m) => [monthLabel(m), payments.filter((p) => p.paid_on.startsWith(m.slice(0, 7))).reduce((s, p) => s + Number(p.amount), 0)]);
  const thisMonth = payments.filter((p) => p.paid_on.startsWith(monthStart().slice(0, 7)));
  const byMethod = ['bank_transfer', 'cash', 'representative_cash'].map((m) => [humanize(m), thisMonth.filter((p) => p.method === m).reduce((s, p) => s + Number(p.amount), 0)]);
  const statuses = ['trial', 'trial_completed', 'admission_requested', 'approved', 'suspended', 'withdrawn', 'completed'];
  const byStatus = statuses.map((s) => [humanize(s), L.enrollments.filter((e) => e.status === s).length]);
  const refs = ['social_media', 'google', 'whatsapp', 'friends', 'other'];
  const all = [...enquiries.flatMap((q) => q.referral_sources || []), ...L.students.flatMap((s) => s.referral_sources || [])];
  const byRef = refs.map((r) => [humanize(r), all.filter((x) => x === r).length]);
  const conv = enquiries.length ? Math.round((enquiries.filter((q) => q.student_id).length / enquiries.length) * 100) : 0;
  const total6 = byMonth.reduce((a, r) => a + r[1], 0);
  const active = L.enrollments.filter((e) => e.status === 'approved').length;
  panel().innerHTML = `<div class="kpi-grid kpi-row-4 mb-4">${[
    kpiCard('bi-cash-stack', 'Collected · 6 months', money(total6), `Avg ${money(total6 / 6)}/month`, 'accent'),
    kpiCard('bi-calendar-check', 'This month', money(byMonth[5][1]), `${thisMonth.length} payment(s)`, 't-green'),
    kpiCard('bi-people', 'Paid enrolments', String(active), `${L.enrollments.length} total`, 't-teal'),
    kpiCard('bi-funnel', 'Enquiry conversion', `${conv}%`, `${enquiries.length} enquiries`, 't-gold')].join('')}</div>
    <div class="row g-4">
    <div class="col-lg-7"><div class="m-card h-100"><div class="card-head"><h2>Verified collections · last 6 months</h2></div><div id="rc1"></div></div></div>
    <div class="col-lg-5"><div class="m-card h-100"><div class="card-head"><h2>This month by method</h2></div><div id="rc2"></div></div></div>
    <div class="col-lg-6"><div class="m-card h-100"><div class="card-head"><h2>Enrolments by status</h2></div><div id="rc3"></div></div></div>
    <div class="col-lg-6"><div class="m-card h-100"><div class="card-head"><h2>How students found us</h2></div><div id="rc4"></div></div></div></div>
    <div class="mt-3"><button class="btn btn-ghost" id="exp"><i class="bi bi-download me-1" aria-hidden="true"></i>Export verified payments (CSV)</button></div>`;
  const $p = (id) => panel().querySelector(id);
  lineChart($p('#rc1'), { labels: byMonth.map((r) => r[0].split(' ')[0].slice(0, 3)), series: [{ name: 'Collected', data: byMonth.map((r) => r[1]), color: '#2563EB' }], format: money });
  donutChart($p('#rc2'), { items: byMethod.map(([label, value], i) => ({ label, value, color: ['#2563EB', '#10B981', '#F97316'][i] })), center: money(byMonth[5][1]).replace('LKR', '').trim(), centerSub: 'LKR', format: money });
  barChart($p('#rc3'), { labels: byStatus.map((r) => r[0].replace('Admission requested', 'Pending').replace('Trial completed', 'Trial done')), series: [{ name: 'Enrolments', data: byStatus.map((r) => r[1]), color: '#06B6D4' }] });
  donutChart($p('#rc4'), { items: byRef.map(([label, value]) => ({ label, value })), centerSub: 'answers' });
  panel().querySelector('#exp').addEventListener('click', () => downloadCsv('mentora-verified-payments.csv', payments.map((p) => ({ ref: p.payment_ref, student: studentLabel(L.studentsById.get(p.student_id)), method: p.method, amount: p.amount, paid_on: p.paid_on, bank_reference: p.bank_reference }))));
}

async function cash() {
  const list = await listReconciliations();
  panel().innerHTML = `<div class="row g-4"><div class="col-lg-5"><form class="m-card" id="rf" novalidate><h2 class="h6 mb-3">Daily cash count</h2>
    <p class="small text-muted">The system adds up all verified cash payments for the day. Count the cash in hand and record it here — any difference is saved for audit.</p>
    <label class="form-label" for="rf-d">Date</label><input type="date" class="form-control mb-3" id="rf-d" name="date" required max="${todayISO()}" value="${todayISO()}">
    <label class="form-label" for="rf-c">Cash counted (LKR)</label><input type="number" class="form-control mb-3" id="rf-c" name="counted" min="0" step="0.01" required>
    <label class="form-label" for="rf-n">Notes</label><input class="form-control mb-3" id="rf-n" name="notes" maxlength="200">
    <button class="btn btn-primary" type="submit">Save count</button></form></div>
    <div class="col-lg-7"><div class="m-table-wrap"><div class="table-responsive"><table class="table m-table"><thead><tr><th>Date</th><th>By</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Difference</th>${isAdmin ? '<th class="actions"><span class="visually-hidden">Actions</span></th>' : ''}</tr></thead><tbody>
    ${list.map((r) => `<tr><td>${fmtDate(r.reconciliation_date)}</td><td class="small">${esc(r.collector_name || '—')}</td><td class="num">${money(r.expected_amount)}</td><td class="num">${money(r.counted_amount)}</td><td class="num ${Number(r.difference) ? 'text-danger fw-semibold' : 'text-success'}">${Number(r.difference) ? money(r.difference) : '<i class="bi bi-check-circle-fill" aria-hidden="true"></i> Match'}</td>${isAdmin ? `<td class="actions"><button type="button" class="btn btn-sm btn-ghost text-danger" data-delrec="${esc(r.id)}" aria-label="Delete count for ${esc(fmtDate(r.reconciliation_date))}"><i class="bi bi-trash" aria-hidden="true"></i></button></td>` : ''}</tr>`).join('') || '<tr><td colspan="6"><div class="empty-state"><p>No counts recorded.</p></div></td></tr>'}
    </tbody></table></div></div></div></div>`;
  panel().querySelectorAll('[data-delrec]').forEach((b) => b.addEventListener('click', async () => {
    const r = list.find((x) => x.id === b.dataset.delrec);
    const reason = await confirmTwice({ title: 'Delete cash count', message: `Delete the cash count for ${fmtDate(r.reconciliation_date)} (counted ${money(r.counted_amount)})? Use this only if it was added by mistake. Payments are not affected.`, finalMessage: 'Delete this cash count permanently? A copy stays in the audit log.' });
    if (reason == null) return;
    try { await api.rpc('delete_cash_reconciliation', { p_id: r.id, p_reason: reason }); showToast('Cash count deleted', 'success'); cash(); } catch (err) { toastError(err); }
  }));
  const f = panel().querySelector('#rf');
  f.addEventListener('submit', async (e) => { e.preventDefault(); if (!validateForm(f)) return; try { const r = await saveReconciliation(f.date.value, Number(f.counted.value), f.notes.value.trim() || null); showToast(Number(r.difference) ? `Saved — difference ${money(r.difference)}` : 'Saved — cash matches', Number(r.difference) ? 'warning' : 'success'); cash(); } catch (err) { toastError(err); } });
}

async function audit() {
  const rows = await listAudit();
  panel().innerHTML = `<p class="page-intro">Every money and status change is written to the audit log by the database. It cannot be edited or deleted from the app.</p>
    <div class="m-table-wrap"><div class="table-responsive"><table class="table m-table"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="small">${fmtDateTime(r.created_at)}</td><td>${esc(humanize(r.action))}</td><td class="small">${esc(r.table_name)}</td><td class="small text-muted"><code>${esc(JSON.stringify(r.details || {})).slice(0, 160)}</code></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state"><p>No entries.</p></div></td></tr>'}
    </tbody></table></div></div>`;
}

const views = { overview, cash, audit };
tabs(content.querySelector('#tabs'), [{ id: 'overview', label: 'Overview' }, { id: 'cash', label: 'Cash reconciliation' }, ...(isAdmin ? [{ id: 'audit', label: 'Audit log' }] : [])], (id) => views[id]().catch(toastError));
