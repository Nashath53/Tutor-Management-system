import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import * as S from '../../services/settlement.service.js';
import { lookups, teacherLabel, kpiCard, confirmTwice } from './admin-common.js';
import { api } from '../../services/api.js';
import { initials } from '../../utils/format.js';
import { printHtml } from '../../components/receipt.js';
import { openModal } from '../../components/modal.js';
import { APP } from '../../config/app.config.js';
import { esc } from '../../utils/dom.js';
import { money, fmtDate, monthLabel, monthStart, addMonths, badge } from '../../utils/format.js';
import { showToast, toastError } from '../../components/toast.js';

const { content, isAdmin } = await initAdminPage({ page: 'settlements', title: 'Teacher settlements' });
let L = await lookups('teachers', 'classes', 'students');

function statementHtml(s) {
  const t = L.teachersById.get(s.teacher_id);
  const d = s.details || {};
  return `<div class="statement"><div class="d-flex justify-content-between mb-3"><div><h2 class="h5 m-0">${esc(APP.name)}</h2><div class="small text-muted">Teacher settlement statement · ${esc(monthLabel(s.period_month))}</div></div>
    <div class="text-end"><div class="fw-bold">${esc(t?.full_name)}</div><div class="code small">${esc(t?.teacher_code || '')}</div>${badge(s.status)}</div></div>
    <table class="table table-sm m-table"><thead><tr><th>Class</th><th>Student</th><th class="num">Revenue share</th><th class="num">Rate</th><th class="num">Commission</th></tr></thead><tbody>
    ${(d.lines || []).map((l) => `<tr><td>${esc(l.class_code || '')}</td><td class="code">${esc(l.student_code || '')}</td><td class="num">${money(l.revenue)}</td><td class="num">${esc(l.rate)}%</td><td class="num">${money(l.commission)}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">No eligible collected revenue this month.</td></tr>'}</tbody></table>
    <dl class="kv"><dt>Eligible collected class revenue</dt><dd>${money(s.gross_revenue)}</dd><dt>Adjustments</dt><dd>${money(s.adjustments)}</dd>
    <dt>Mentora commission${d.is_first_eligible_month ? ` (first eligible month; ${d.intro_students} intro students)` : ''}</dt><dd>− ${money(s.commission_amount)}</dd>
    <dt>Statutory deductions (WHT)</dt><dd>− ${money(s.statutory_deductions)}</dd><dt><b>Net payable</b></dt><dd><b>${money(s.net_payable)}</b></dd>
    <dt>Settlement date</dt><dd>${fmtDate(s.settlement_date)}</dd><dt>Bank reference</dt><dd>${esc(s.bank_reference || '—')}</dd>
    <dt>Pay to</dt><dd>${esc(t?.bank_name || '—')} · ${esc(t?.bank_account_name || '')} · ${esc(t?.bank_account_number || '')}</dd></dl>
    ${s.notes ? `<p class="small mt-3">Notes: ${esc(s.notes)}</p>` : ''}
    <p class="small text-muted mt-3 mb-0">Admission fees and refunds are excluded from commission. Commission is separate from statutory tax. Please confirm tax treatment with a qualified accountant.</p></div>`;
}

const view = (s) => { const html = statementHtml(s); const m = openModal({ title: 'Settlement statement', size: 'modal-lg', body: html, footer: '<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Close</button><button type="button" class="btn btn-primary" data-print><i class="bi bi-printer me-1" aria-hidden="true"></i>Print</button>' }); m.el.querySelector('[data-print]').addEventListener('click', () => printHtml(html)); };

createCrud(content, {
  intro: 'Generate a draft for a teacher and month, review it, approve it (locks the figures), then mark it paid with the bank transfer reference. Drafts can be regenerated if late payments arrive.',
  load: async () => { L = await lookups('teachers', 'classes', 'students'); return S.listSettlements(); },
  searchKeys: [(r) => L.teachersById.get(r.teacher_id)?.full_name, (r) => monthLabel(r.period_month), 'bank_reference'],
  tabs: { items: [{ value: 'all', label: 'All' }, { value: 'draft', label: 'Draft', icon: 'bi-pencil-square', test: (r) => r.status === 'draft' }, { value: 'approved', label: 'Approved', icon: 'bi-check2-circle', test: (r) => r.status === 'approved' }, { value: 'paid', label: 'Paid', icon: 'bi-bank', test: (r) => r.status === 'paid' }] },
  header: (rows) => { const cur = rows.filter((r) => r.status !== 'paid'); return `<div class="kpi-grid kpi-row-4">${[
    kpiCard('bi-hourglass-split', 'Waiting to pay', money(cur.reduce((a, r) => a + Number(r.net_payable || 0), 0)), `${cur.length} settlement(s)`, 't-gold'),
    kpiCard('bi-bank', 'Paid out', money(rows.filter((r) => r.status === 'paid').reduce((a, r) => a + Number(r.net_payable || 0), 0)), 'All time', 't-green'),
    kpiCard('bi-percent', 'Mentora commission', money(rows.reduce((a, r) => a + Number(r.commission_amount || 0), 0)), 'All settlements'),
    kpiCard('bi-building', 'WHT withheld', money(rows.reduce((a, r) => a + Number(r.statutory_deductions || 0), 0)), 'Pay to IRD separately', 't-teal')].join('')}</div>`; },
  card: (r, i, ui) => { const t = L.teachersById.get(r.teacher_id); const steps = ['draft', 'approved', 'paid']; const at = steps.indexOf(r.status);
    return `<article class="ent-card"><div class="ec-head"><span class="avatar-sm">${esc(initials(t?.display_name || t?.full_name || '?'))}</span><div class="min-w-0"><h3 class="ec-title">${esc(teacherLabel(t))}</h3><div class="ec-sub">${esc(monthLabel(r.period_month))}</div></div>${ui.menu}</div>
      <div class="settle-steps">${steps.map((s, k) => `<span class="${k <= at ? 'done' : ''}">${k < at ? '<i class="bi bi-check-lg" aria-hidden="true"></i>' : ''}${s[0].toUpperCase() + s.slice(1)}</span>`).join('')}</div>
      <div class="ec-meta"><div><b>${money(r.gross_revenue)}</b><span>Revenue</span></div><div><b>${money(r.commission_amount)}</b><span>Commission</span></div><div><b>${money(r.statutory_deductions)}</b><span>WHT</span></div></div>
      <div class="d-flex justify-content-between align-items-center"><span class="small text-muted">Net payable</span><b class="fs-5">${money(r.net_payable)}</b></div>
      <div class="ec-foot">${badge(r.status)}${r.bank_reference ? `<span class="small text-muted text-truncate">Ref ${esc(r.bank_reference)}</span>` : ''}<span class="ms-auto">${ui.primary}</span></div></article>`; },
  toolbarButtons: [{ label: 'Generate settlement', icon: 'bi-calculator', class: 'btn-primary', onClick: ({ reload }) => openFormModal({
    title: 'Generate settlement', size: '', submitLabel: 'Generate draft',
    fields: [
      { name: 'teacher_id', label: 'Teacher', type: 'select', required: true, col: 'col-12', options: L.teachers.map((t) => ({ value: t.id, label: teacherLabel(t) })) },
      { name: 'month', label: 'Month', type: 'select', required: true, col: 'col-12', placeholder: false, options: [0, -1, -2, -3, -4, -5].map((n) => { const m = addMonths(monthStart(), n); return { value: m, label: monthLabel(m) }; }), default: addMonths(monthStart(), -1) },
      { name: 'adjustments', label: 'Adjustments (LKR, + or −)', type: 'number', step: '0.01', default: 0, col: 'col-md-6' },
      { name: 'notes', label: 'Notes', col: 'col-12' }
    ],
    onSave: async (v) => { const s = await S.generateSettlement(v.teacher_id, v.month, v.adjustments || 0, v.notes); showToast('Draft settlement generated', 'success'); await reload(); view(s); }
  }) }],
  columns: [
    { label: 'Month', render: (r) => esc(monthLabel(r.period_month)) },
    { label: 'Teacher', render: (r) => esc(teacherLabel(L.teachersById.get(r.teacher_id))) },
    { label: 'Revenue', class: 'num', render: (r) => money(r.gross_revenue) },
    { label: 'Commission', class: 'num', render: (r) => money(r.commission_amount) },
    { label: 'WHT', class: 'num', render: (r) => money(r.statutory_deductions) },
    { label: 'Net', class: 'num', render: (r) => `<b>${money(r.net_payable)}</b>` },
    { label: 'Status', render: (r) => badge(r.status) }
  ],
  primaryAction: (r) => ({ label: 'View', onClick: () => view(r) }),
  rowActions: (r) => [
    r.status === 'draft' && { label: 'Regenerate', icon: 'bi-arrow-repeat', onClick: async ({ reload }) => { try { await S.generateSettlement(r.teacher_id, r.period_month, r.adjustments, r.notes); showToast('Recalculated', 'success'); reload(); } catch (e) { toastError(e); } } },
    r.status === 'draft' && { label: 'Approve', icon: 'bi-check2-circle', onClick: async ({ reload }) => { try { await S.updateSettlementStatus(r.id, 'approved'); showToast('Approved', 'success'); reload(); } catch (e) { toastError(e); } } },
    r.status === 'approved' && { label: 'Mark as paid', icon: 'bi-bank', onClick: ({ reload }) => openFormModal({ title: 'Mark settlement paid', size: '', submitLabel: 'Mark paid', fields: [
      { name: 'bank_reference', label: 'Bank transfer reference', required: true, col: 'col-12' },
      { name: 'settlement_date', label: 'Transfer date', type: 'date', required: true, col: 'col-12' }
    ], onSave: async (v) => { await S.updateSettlementStatus(r.id, 'paid', v.bank_reference, v.settlement_date); showToast('Marked paid', 'success'); reload(); } }) },
    isAdmin && r.status !== 'paid' && { divider: true },
    isAdmin && r.status !== 'paid' && { label: 'Delete settlement', icon: 'bi-trash', danger: true, onClick: async ({ reload }) => {
      const reason = await confirmTwice({ title: 'Delete settlement', message: `Delete the ${r.status} settlement for ${teacherLabel(L.teachersById.get(r.teacher_id))} · ${monthLabel(r.period_month)}? A copy is kept in the audit log. Paid settlements can never be deleted.`, finalMessage: 'Delete this settlement now? You can generate it again later.' });
      if (reason == null) return;
      try { await api.rpc('delete_settlement', { p_id: r.id, p_reason: reason }); showToast('Settlement deleted', 'success'); reload(); } catch (e) { toastError(e); }
    } }
  ]
});
