import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { lookups, studentLabel, downloadCsv, kpiCard } from './admin-common.js';
import { computeBalances, getStatement, addAdjustment } from '../../services/fee.service.js';
import { getSettings } from '../../services/settings.service.js';
import { api } from '../../services/api.js';
import { openFormModal } from '../../components/crud.js';
import { printHtml } from '../../components/receipt.js';
import { APP } from '../../config/app.config.js';
import { esc, qs } from '../../utils/dom.js';
import { money, fmtDate, monthStart, monthLabel, humanize } from '../../utils/format.js';
import { showToast, toastError } from '../../components/toast.js';

const { content, isAdmin } = await initAdminPage({ page: 'fees', title: 'Fees & balances' });
const settings = await getSettings();
let L, balances, selected = qs('student') || '', month = monthStart(), q = '', fstate = qs('f') || 'all';
const FILTERS = [
  { v: 'all', label: 'All', test: () => true },
  { v: 'due', label: 'Due', icon: 'bi-exclamation-circle', test: (b) => b.balance > 0.009 },
  { v: 'completed', label: 'Completed', icon: 'bi-check2-circle', test: (b) => Math.abs(b.balance) <= 0.009 && b.charges > 0 },
  { v: 'over', label: 'Overpayment', icon: 'bi-arrow-up-circle', test: (b) => b.balance < -0.009 },
  { v: 'none', label: 'No charges', icon: 'bi-dash-circle', test: (b) => !b.charges && !b.paid }
];

content.innerHTML = `<p class="page-intro">Balances = all ledger charges (session charges, admission fees, adjustments, reversals) minus <b>verified</b> payments. Pending bank transfers are not counted. Ledger entries are never deleted — mistakes are corrected with reversals or adjustments.</p>
  <div id="feeKpis" class="kpi-grid kpi-row-4 mb-4"></div>
  <div class="row g-4"><div class="col-xl-5"><div class="m-card p-0"><div class="p-3 border-bottom"><div class="seg seg-scroll mb-3" id="fseg" role="group" aria-label="Balance filter"></div><div class="d-flex gap-2"><div class="toolbar m-0 flex-grow-1"><div class="search flex-grow-1"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" id="q" placeholder="Search name, ID or phone…" aria-label="Search"></div></div><button class="btn btn-ghost btn-sm" id="csv" title="Export CSV"><i class="bi bi-download" aria-hidden="true"></i></button></div></div><div id="list" style="max-height:70vh;overflow:auto"></div></div></div>
  <div class="col-xl-7"><div id="detail"></div></div></div>`;
const $ = (s) => content.querySelector(s);

const B0 = { charges: 0, paid: 0, balance: 0 };
function drawList() {
  const all = L.students.map((s) => ({ s, b: balances.get(s.id) || B0 }));
  const f = FILTERS.find((x) => x.v === fstate) || FILTERS[0];
  $('#fseg').innerHTML = FILTERS.map((x) => `<button type="button" data-f="${x.v}" aria-pressed="${x.v === fstate}">${x.icon ? `<i class="bi ${x.icon}" aria-hidden="true"></i>` : ''}${x.label}<span class="n">${all.filter((r) => x.test(r.b)).length}</span></button>`).join('');
  const due = all.filter((r) => r.b.balance > 0.009), over = all.filter((r) => r.b.balance < -0.009);
  $('#feeKpis').innerHTML = [
    kpiCard('bi-hourglass-split', 'Outstanding', money(due.reduce((a, r) => a + r.b.balance, 0)), `${due.length} student(s) owe`, 't-red'),
    kpiCard('bi-cash-stack', 'Collected (verified)', money(all.reduce((a, r) => a + r.b.paid, 0)), 'All time', 't-green'),
    kpiCard('bi-receipt', 'Total charged', money(all.reduce((a, r) => a + r.b.charges, 0)), 'Sessions, admission & adjustments'),
    kpiCard('bi-piggy-bank', 'Advance credit', money(-over.reduce((a, r) => a + r.b.balance, 0)), `${over.length} overpaid`, 't-teal')
  ].join('');
  const rows = all.filter((r) => f.test(r.b) && (!q || `${r.s.student_code} ${r.s.full_name} ${r.s.phone || ''}`.toLowerCase().includes(q))).sort((a, b) => b.b.balance - a.b.balance);
  $('#list').innerHTML = rows.length ? `<ul class="fee-list">${rows.map(({ s, b }) => { const st = b.balance > 0.009 ? ['due', 'Due'] : b.balance < -0.009 ? ['over', 'Credit'] : b.charges ? ['ok', 'Settled'] : ['none', '—'];
    return `<li><button type="button" class="fee-row ${s.id === selected ? 'active' : ''}" data-s="${esc(s.id)}"><span class="avatar-sm">${esc((s.full_name || '?').slice(0, 1))}</span><span class="min-w-0 flex-grow-1"><b class="d-block text-truncate">${esc(s.full_name)}</b><span class="code small text-muted">${esc(s.student_code)}</span></span><span class="text-end"><span class="d-block fw-bold ${st[0] === 'due' ? 'text-danger' : st[0] === 'over' ? 'text-success' : ''}">${money(Math.abs(b.balance))}</span><span class="fee-tag ft-${st[0]}">${st[1]}</span></span></button></li>`; }).join('')}</ul>` : '<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>No students match this filter.</p></div>';
}

function statementHtml(st, s) {
  return `<div class="statement"><div class="d-flex justify-content-between mb-3"><div><h2 class="h5 m-0">${esc(APP.name)}</h2><div class="small text-muted">Monthly fee statement · ${esc(monthLabel(month))}</div></div>
    <div class="text-end"><div class="fw-bold">${esc(s.full_name)}</div><div class="code small">${esc(s.student_code)}</div></div></div>
    <dl class="kv mb-3"><dt>Opening balance</dt><dd>${money(st.opening_balance)}</dd></dl>
    <table class="table table-sm m-table"><thead><tr><th>Date</th><th>Description</th><th class="num">Charge</th><th class="num">Payment</th></tr></thead><tbody>
    ${[...st.charges.map((l) => ({ d: l.entry_date, t: `${l.description || humanize(l.entry_type)}`, c: l.amount })), ...st.payments.map((p) => ({ d: p.paid_on, t: `${humanize(p.method)} ${p.payment_ref}${p.receipt_no ? ' · ' + p.receipt_no : ''}`, p: p.amount }))]
      .sort((a, b) => a.d.localeCompare(b.d)).map((r) => `<tr><td>${fmtDate(r.d)}</td><td>${esc(r.t)}</td><td class="num">${r.c != null ? money(r.c) : ''}</td><td class="num">${r.p != null ? money(r.p) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">No activity this month.</td></tr>'}
    </tbody></table><dl class="kv"><dt>Charges this month</dt><dd>${money(st.total_charges)}</dd><dt>Of which admission fees</dt><dd>${money(st.admission_fees)}</dd><dt>Payments this month</dt><dd>${money(st.total_paid)}</dd><dt><b>Closing balance</b></dt><dd><b>${money(st.closing_balance)}</b></dd></dl>
    <p class="small text-muted mt-3 mb-0">Bank: ${esc(settings.bank.bank_name)} · ${esc(settings.bank.account_name)} · ${esc(settings.bank.account_number)}. Use your Student ID as the transfer reference.</p></div>`;
}

async function drawDetail() {
  const el = $('#detail');
  const s = L.studentsById.get(selected);
  if (!s) { el.innerHTML = '<div class="m-card empty-state"><i class="bi bi-person" aria-hidden="true"></i><p>Select a student to see the statement.</p></div>'; return; }
  el.innerHTML = '<div class="m-card"><div class="skeleton skeleton-line w-75"></div></div>';
  try {
    const st = await getStatement(s.id, month);
    const html = statementHtml(st, s);
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><input type="month" class="form-control" style="max-width:180px" id="month" value="${month.slice(0, 7)}" aria-label="Month">
      <button class="btn btn-outline-primary" id="print"><i class="bi bi-printer me-1" aria-hidden="true"></i>Print</button>
      <a class="btn btn-outline-primary" href="${href(`admin/payments.html?tab=cash&student=${s.id}`)}"><i class="bi bi-cash-coin me-1" aria-hidden="true"></i>Record cash</a>
      ${isAdmin ? '<button class="btn btn-ghost" id="adj"><i class="bi bi-sliders me-1" aria-hidden="true"></i>Adjustment</button>' : ''}</div>${html}`;
    $('#month').addEventListener('change', (e) => { if (e.target.value) { month = e.target.value + '-01'; drawDetail(); } });
    $('#print').addEventListener('click', () => printHtml(html));
    $('#adj')?.addEventListener('click', () => openFormModal({ title: 'Ledger adjustment', size: '', fields: [
      { name: 'amount', label: 'Amount (LKR) — positive = charge, negative = discount/credit', type: 'number', required: true, step: '0.01', col: 'col-12' },
      { name: 'description', label: 'Description (required, shown on statement)', required: true, col: 'col-12' }
    ], onSave: async (v) => { await addAdjustment(s.id, v.amount, v.description); showToast('Adjustment added', 'success'); await load(); } }));
  } catch (e) { toastError(e); }
}

async function load() {
  const [lk, ledger, payments] = await Promise.all([lookups('students'), api.select('fee_ledger'), api.select('payments')]);
  L = lk; balances = computeBalances(ledger, payments);
  drawList(); drawDetail();
}
$('#q').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); drawList(); });
$('#fseg').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { fstate = b.dataset.f; drawList(); } });
$('#list').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { selected = b.dataset.s; drawList(); drawDetail(); } });
$('#csv').addEventListener('click', () => downloadCsv('mentora-balances.csv', L.students.map((s) => ({ student_id: s.student_code, name: s.full_name, phone: s.phone, ...(balances.get(s.id) || { charges: 0, paid: 0, balance: 0 }) }))));
load().catch(toastError);
