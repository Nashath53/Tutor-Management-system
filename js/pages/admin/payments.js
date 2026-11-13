import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud } from '../../components/crud.js';
import * as P from '../../services/payment.service.js';
import { getReceiptBundle, listReceipts } from '../../services/receipt.service.js';
import { getSettings } from '../../services/settings.service.js';
import { lookups, studentLabel, tabs, opts, downloadCsv } from './admin-common.js';
import { addDraft, listDrafts, removeDraft } from '../../pwa/offline-queue.service.js';
import { receiptHtml, printHtml } from '../../components/receipt.js';
import { openModal, confirmDialog } from '../../components/modal.js';
import { esc, qs, setBusy } from '../../utils/dom.js';
import { uuid } from '../../utils/ids.js';
import { money, fmtDate, fmtDateTime, badge, humanize, todayISO } from '../../utils/format.js';
import { validateForm } from '../../utils/validate.js';
import { showToast, toastError } from '../../components/toast.js';

const { content, isAdmin, profile } = await initAdminPage({ page: 'payments', title: 'Payments' });
const settings = await getSettings();
let L = await lookups('students');
content.innerHTML = '<div id="tabs"></div><div id="panel"></div>';
const panel = () => document.getElementById('panel');

async function showReceipt(receiptId) {
  const b = await getReceiptBundle(receiptId);
  const html = receiptHtml(b, settings);
  const m = openModal({ title: `Receipt ${b.receipt.receipt_no}`, size: 'modal-lg', body: html,
    footer: '<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Close</button><button type="button" class="btn btn-primary" data-print><i class="bi bi-printer me-1" aria-hidden="true"></i>Print</button>' });
  m.el.querySelector('[data-print]').addEventListener('click', () => printHtml(html));
}

function verifyModal(p, reload) {
  const s = L.studentsById.get(p.student_id);
  const m = openModal({ title: `Verify ${p.payment_ref}`, body: `
    <dl class="kv mb-3"><dt>Student</dt><dd>${esc(studentLabel(s))}</dd><dt>Amount claimed</dt><dd>${money(p.claimed_amount ?? p.amount)}</dd><dt>Transfer date</dt><dd>${fmtDate(p.paid_on)}</dd>
    <dt>Receipt sent</dt><dd>${p.receipt_sent_at ? fmtDateTime(p.receipt_sent_at) : 'Not marked yet'}</dd><dt>Student note</dt><dd>${esc(p.notes || '—')}</dd></dl>
    <div class="notice-box mb-3"><i class="bi bi-bank" aria-hidden="true"></i><span>Check your <b>bank statement</b> (not only the WhatsApp image) before verifying. Only verified payments count towards balances and admission.</span></div>
    <form id="vf" class="row g-3" novalidate>
      <div class="col-md-6"><label class="form-label" for="vf-amt">Amount actually received<span class="req">*</span></label><input class="form-control" type="number" id="vf-amt" name="amount" min="0.01" step="0.01" required value="${esc(p.amount)}"></div>
      <div class="col-md-6"><label class="form-label" for="vf-ref">Bank transaction reference<span class="req">*</span></label><input class="form-control" id="vf-ref" name="ref" required maxlength="80"><div class="invalid-feedback">Required to verify.</div></div>
    </form>`,
    footer: '<button type="button" class="btn btn-outline-danger me-auto" data-reject>Reject</button><button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Cancel</button><button type="submit" form="vf" class="btn btn-primary">Verify & issue receipt</button>' });
  const f = m.el.querySelector('#vf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(f)) return;
    const btn = m.el.querySelector('[type=submit]'); setBusy(btn, true, 'Verifying…');
    try {
      const r = await P.verifyPayment(p.id, { approve: true, amount: Number(f.amount.value), bankReference: f.ref.value.trim() });
      m.close(); showToast(`Verified. Receipt ${r.receipt.receipt_no} issued.`, 'success'); reload(); showReceipt(r.receipt.id);
    } catch (err) { toastError(err); setBusy(btn, false); }
  });
  m.el.querySelector('[data-reject]').addEventListener('click', async () => {
    m.close();
    const reason = await confirmDialog({ title: 'Reject payment', message: 'Explain why (e.g. amount not found in bank statement). The record is kept for audit.', reason: true, danger: true, confirmLabel: 'Reject' });
    if (reason == null) return;
    try { await P.verifyPayment(p.id, { approve: false, reason }); showToast('Payment rejected', 'success'); reload(); } catch (err) { toastError(err); }
  });
}

const cols = (extra = []) => [
  { label: 'Ref', render: (r) => `<span class="code">${esc(r.payment_ref)}</span>` },
  { label: 'Student', render: (r) => esc(studentLabel(L.studentsById.get(r.student_id))) },
  { label: 'Method', render: (r) => `${esc(humanize(r.method))}${r.collector_name && r.method !== 'bank_transfer' ? `<div class="small text-muted">${esc(r.collector_name)}</div>` : ''}` },
  { label: 'Paid on', render: (r) => fmtDate(r.paid_on) },
  { label: 'Amount', class: 'num', render: (r) => money(r.amount) },
  ...extra,
  { label: 'Status', render: (r) => badge(r.status) }
];

const views = {
  cash: () => cashForm(),
  all: () => createCrud(panel(), {
    load: P.listPayments, searchKeys: ['payment_ref', 'bank_reference', (r) => L.studentsById.get(r.student_id)?.full_name, (r) => L.studentsById.get(r.student_id)?.student_code],
    filters: [{ name: 'status', label: 'Status', options: opts(['pending', 'receipt_sent', 'verified', 'rejected', 'reversed']) }, { name: 'method', label: 'Method', options: opts(['bank_transfer', 'cash', 'representative_cash']) }],
    toolbarButtons: [{ label: 'Export CSV', icon: 'bi-download', class: 'btn-ghost', onClick: async () => downloadCsv('mentora-payments.csv', (await P.listPayments()).map((p) => ({ ref: p.payment_ref, student: L.studentsById.get(p.student_id)?.student_code, method: p.method, amount: p.amount, paid_on: p.paid_on, status: p.status, bank_reference: p.bank_reference, collector: p.collector_name }))) }],
    columns: cols(),
    rowActions: (r) => [
      r.status === 'verified' && { label: 'View receipt', icon: 'bi-receipt', onClick: async () => { const rc = await listReceipts({ payment_id: r.id }); if (rc[0]) showReceipt(rc[0].id); } },
      ['pending', 'receipt_sent'].includes(r.status) && isAdmin && { label: 'Verify / reject', icon: 'bi-check2-square', onClick: ({ reload }) => verifyModal(r, reload) },
      r.status === 'verified' && isAdmin && { label: 'Reverse payment', icon: 'bi-arrow-counterclockwise', danger: true, onClick: async ({ reload }) => {
        const reason = await confirmDialog({ title: `Reverse ${r.payment_ref}`, message: 'The payment is kept but marked reversed, its receipt is voided and the allocations are undone. This cannot be undone.', reason: true, danger: true, confirmLabel: 'Reverse' });
        if (reason == null) return;
        try { await P.reversePayment(r.id, reason); showToast('Payment reversed and receipt voided', 'success'); reload(); } catch (e) { toastError(e); }
      } }
    ]
  })
};

function mountVerify() {
  const c = createCrud(panel(), {
    intro: 'Bank transfers created by students. Opening WhatsApp or sending an image does <b>not</b> make a payment valid — verify against the bank statement.',
    load: async () => (await P.listPayments()).filter((p) => ['pending', 'receipt_sent'].includes(p.status)),
    searchKeys: ['payment_ref', (r) => L.studentsById.get(r.student_id)?.full_name],
    columns: cols([{ label: 'Receipt sent', render: (r) => (r.receipt_sent_at ? `<span class="small">${fmtDateTime(r.receipt_sent_at)}</span>` : '<span class="small text-muted">Not yet</span>') }]),
    primaryAction: (r) => (isAdmin ? { label: 'Verify', class: 'btn-primary', onClick: ({ reload }) => verifyModal(r, reload) } : null),
    emptyTitle: 'All caught up', emptyText: 'No bank transfers are waiting for verification.'
  });
  return c;
}
views.verify = mountVerify;

async function cashForm() {
  const pre = qs('student') || '';
  const drafts = await listDrafts('cash_payment');
  panel().innerHTML = `<div class="row g-4"><div class="col-lg-7"><form class="m-card" id="cf" novalidate>
    <h2 class="h6 mb-3">Record cash payment</h2>
    <div class="row g-3">
      <div class="col-12"><label class="form-label" for="cf-s">Student<span class="req">*</span></label><select class="form-select" id="cf-s" name="student" required><option value="">Select…</option>${L.students.map((s) => `<option value="${esc(s.id)}" ${s.id === pre ? 'selected' : ''}>${esc(studentLabel(s))}</option>`).join('')}</select><div class="invalid-feedback">Select a student.</div></div>
      <div class="col-md-6"><label class="form-label" for="cf-a">Amount (LKR)<span class="req">*</span></label><input class="form-control" id="cf-a" name="amount" type="number" min="1" max="999999" step="0.01" required><div class="invalid-feedback">Enter an amount.</div></div>
      <div class="col-md-6"><label class="form-label" for="cf-d">Date received<span class="req">*</span></label><input class="form-control" id="cf-d" name="paid_on" type="date" required max="${todayISO()}" value="${todayISO()}"></div>
      <div class="col-md-6"><label class="form-label" for="cf-m">Collected by</label><select class="form-select" id="cf-m" name="method"><option value="cash">Me (office cash)</option><option value="representative_cash">Authorised representative</option></select></div>
      <div class="col-md-6"><label class="form-label" for="cf-c">Representative name</label><input class="form-control" id="cf-c" name="collector" maxlength="120" placeholder="Required for representative"></div>
      <div class="col-12"><label class="form-label" for="cf-n">Notes</label><input class="form-control" id="cf-n" name="notes" maxlength="200"></div>
    </div>
    <div class="notice-box my-3"><i class="bi bi-info-circle" aria-hidden="true"></i><span>The official receipt number is created by the server. If you are offline, this is saved as a <b>draft</b> (not a receipt) and syncs automatically.</span></div>
    <button class="btn btn-primary" type="submit"><i class="bi bi-check2 me-1" aria-hidden="true"></i>Save payment</button></form></div>
    <div class="col-lg-5"><div class="m-card"><h2 class="h6 mb-3">Offline drafts on this device</h2>${drafts.length ? `<ul class="dash-list">${drafts.map((d) => `<li><span>${esc(d.label)}${d.error ? `<span class="d-block small text-danger">${esc(d.error)}</span>` : ''}</span><button class="btn btn-sm btn-ghost text-danger" data-deldraft="${esc(d.id)}" aria-label="Discard draft"><i class="bi bi-trash" aria-hidden="true"></i></button></li>`).join('')}</ul>` : '<p class="small text-muted m-0">No drafts.</p>'}</div></div></div>`;
  const f = panel().querySelector('#cf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.collector.required = f.method.value === 'representative_cash';
    if (!validateForm(f)) return;
    const payload = { studentId: f.student.value, amount: Number(f.amount.value), paidOn: f.paid_on.value, method: f.method.value, collectorName: f.collector.value.trim() || profile.full_name, notes: f.notes.value.trim() || null, clientUuid: uuid() };
    const btn = f.querySelector('[type=submit]'); setBusy(btn, true, 'Saving…');
    try {
      if (!navigator.onLine) throw new Error('offline');
      const r = await P.recordCashPayment(payload);
      showToast(`Saved. Receipt ${r.receipt.receipt_no}`, 'success');
      showReceipt(r.receipt.id); cashForm();
    } catch (err) {
      if (!navigator.onLine || /fetch|network|offline/i.test(err.message)) {
        await addDraft('cash_payment', payload, `${studentLabel(L.studentsById.get(payload.studentId))} · ${money(payload.amount)}`);
        showToast('Offline: saved as a draft (no receipt yet).', 'warning'); cashForm();
      } else { toastError(err); setBusy(btn, false); }
    }
  });
  panel().querySelectorAll('[data-deldraft]').forEach((b) => b.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Discard draft', message: 'Discard this unsynced cash draft?', danger: true, confirmLabel: 'Discard' })) { await removeDraft(b.dataset.deldraft); cashForm(); }
  }));
}

const pending = (await P.listPayments()).filter((p) => ['pending', 'receipt_sent'].includes(p.status)).length;
tabs(document.getElementById('tabs'), [{ id: 'verify', label: 'To verify', count: pending }, { id: 'cash', label: 'Record cash' }, { id: 'all', label: 'All payments' }], (id) => views[id](), qs('tab') || (pending ? 'verify' : 'all'));

