import { initPortalPage } from '../../components/portal-shell.js';
import { loadMyData } from './portal-data.js';
import { getStatement } from '../../services/fee.service.js';
import { createBankPayment, markReceiptSent } from '../../services/payment.service.js';
import { getReceiptBundle } from '../../services/receipt.service.js';
import { getSettings } from '../../services/settings.service.js';
import { receiptHtml, printHtml } from '../../components/receipt.js';
import { openModal } from '../../components/modal.js';
import { t, onLanguageChange } from '../../i18n/language.js';
import { esc, qs, setBusy } from '../../utils/dom.js';
import { money, fmtDate, badge, monthStart, addMonths, monthLabel, todayISO } from '../../utils/format.js';
import { waLink, bankReceiptMessage, openWhatsApp } from '../../utils/whatsapp.js';
import { validateForm } from '../../utils/validate.js';
import { showToast, toastError } from '../../components/toast.js';

const { student, content } = await initPortalPage('fees');
const settings = await getSettings();
let data, month = monthStart(), statement = null;

const entryLabel = (l) => t(`ledger.${l.entry_type}`) + (l.enrollment_code ? ` · ${l.enrollment_code}` : '');

function render() {
  const pending = data.payments.filter((p) => ['pending', 'receipt_sent'].includes(p.status));
  content.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div><h1 class="portal-title">${esc(t('portal.nav.fees'))}</h1><p class="portal-sub m-0">${esc(t('fees.sub'))}</p></div>
      <button type="button" class="btn btn-primary" id="payBtn"><i class="bi bi-bank me-1" aria-hidden="true"></i>${esc(t('fees.payBank'))}</button>
    </div>
    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="m-card m-card-sm"><div class="small text-muted">${esc(t('fees.balanceDue'))}</div><div class="fs-3 fw-bold ${data.balance > 0 ? 'text-danger' : 'text-success'}">${money(Math.max(data.balance, 0))}</div>${data.balance < 0 ? `<div class="small text-success">${esc(t('fees.creditAmount', { amount: money(-data.balance) }))}</div>` : ''}</div></div>
      <div class="col-md-4"><div class="m-card m-card-sm"><div class="small text-muted">${esc(t('fees.awaiting'))}</div><div class="fs-3 fw-bold">${pending.length}</div><div class="small text-muted">${money(pending.reduce((s, p) => s + Number(p.amount), 0))}</div></div></div>
      <div class="col-md-4"><div class="m-card m-card-sm"><div class="small text-muted">${esc(t('fees.receiptsIssued'))}</div><div class="fs-3 fw-bold">${data.receipts.filter((r) => !r.is_void).length}</div></div></div>
    </div>
    ${pending.length ? `<div class="m-card mb-4"><h2 class="h6 mb-3">${esc(t('fees.pendingTitle'))}</h2>
      <div class="d-grid gap-3">${pending.map((p) => `<div class="d-flex flex-wrap justify-content-between gap-2 align-items-center border-bottom pb-3">
        <div><div class="code">${esc(p.payment_ref)}</div><div class="small text-muted">${money(p.amount)} · ${fmtDate(p.paid_on)}</div></div>
        <div class="d-flex gap-2 align-items-center">${badge(p.status)}
          ${p.status === 'pending' ? `<button class="btn btn-sm btn-whatsapp" type="button" data-wa="${esc(p.id)}"><i class="bi bi-whatsapp me-1" aria-hidden="true"></i>${esc(t('fees.sendReceipt'))}</button>
          <button class="btn btn-sm btn-outline-primary" type="button" data-sent="${esc(p.id)}">${esc(t('fees.iSent'))}</button>` : ''}</div></div>`).join('')}</div>
      <p class="small text-muted mt-3 mb-0">${esc(t('fees.verifyNote'))}</p></div>` : ''}
    <div class="m-card mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="h6 m-0">${esc(t('fees.statement'))}</h2>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-ghost" type="button" data-month="-1" aria-label="${esc(t('fees.prevMonth'))}"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
          <span class="fw-semibold" style="min-width:9rem;text-align:center">${esc(monthLabel(month))}</span>
          <button class="btn btn-sm btn-ghost" type="button" data-month="1" aria-label="${esc(t('fees.nextMonth'))}" ${month >= monthStart() ? 'disabled' : ''}><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
        </div></div>
      <div id="statement">${statementHtml()}</div>
    </div>
    <div class="m-card"><h2 class="h6 mb-3">${esc(t('fees.receipts'))}</h2>
      ${data.receipts.length ? `<div class="table-responsive"><table class="table m-table"><thead><tr><th>${esc(t('fees.receiptNo'))}</th><th>${esc(t('fees.date'))}</th><th class="num">${esc(t('fees.amount'))}</th><th></th></tr></thead><tbody>
      ${data.receipts.map((r) => `<tr><td class="code">${esc(r.receipt_no)} ${r.is_void ? badge('void') : ''}</td><td>${fmtDate(r.issued_at)}</td><td class="num">${money(r.amount)}</td><td class="text-end"><button class="btn btn-sm btn-ghost" type="button" data-receipt="${esc(r.id)}"><i class="bi bi-eye me-1" aria-hidden="true"></i>${esc(t('fees.view'))}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<p class="text-muted small m-0">${esc(t('fees.noReceipts'))}</p>`}</div>`;
}

function statementHtml() {
  if (!statement) return '<div class="skeleton skeleton-line w-75"></div>';
  const s = statement;
  const rows = [
    ...s.charges.map((l) => ({ date: l.entry_date, label: l.description || entryLabel(l), type: entryLabel(l), debit: Number(l.amount) })),
    ...s.payments.map((p) => ({ date: p.paid_on, label: `${t('fees.paymentRow')} ${p.payment_ref}${p.receipt_no ? ` · ${p.receipt_no}` : ''}`, type: t(`method.${p.method}`), credit: Number(p.amount) }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  return `<dl class="kv mb-3"><dt>${esc(t('fees.opening'))}</dt><dd>${money(s.opening_balance)}</dd></dl>
    ${rows.length ? `<div class="table-responsive"><table class="table m-table"><thead><tr><th>${esc(t('fees.date'))}</th><th>${esc(t('fees.description'))}</th><th class="num">${esc(t('fees.charge'))}</th><th class="num">${esc(t('fees.paid'))}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.label)}<div class="small text-muted">${esc(r.type)}</div></td><td class="num">${r.debit != null ? money(r.debit) : ''}</td><td class="num">${r.credit != null ? money(r.credit) : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="text-muted small">${esc(t('fees.noActivity'))}</p>`}
    <dl class="kv mt-3"><dt>${esc(t('fees.totalCharges'))}</dt><dd>${money(s.total_charges)}</dd><dt>${esc(t('fees.totalPaid'))}</dt><dd>${money(s.total_paid)}</dd>
    <dt class="fw-bold text-body">${esc(t('fees.closing'))}</dt><dd class="fw-bold">${money(s.closing_balance)}</dd></dl>`;
}

async function loadStatement() {
  statement = null;
  const el = document.getElementById('statement');
  if (el) el.innerHTML = statementHtml();
  try { statement = await getStatement(student.id, month); } catch (e) { toastError(e); }
  const el2 = document.getElementById('statement');
  if (el2) el2.innerHTML = statementHtml();
}

function sendOnWhatsApp(p) {
  const msg = bankReceiptMessage({ student_code: student.student_code, student_name: student.full_name, payment_ref: p.payment_ref, amount: money(p.amount), paid_on: p.paid_on });
  openWhatsApp(waLink(settings.contact.whatsapp, msg));
}

function payFlow() {
  const b = settings.bank;
  const suggested = Math.max(data.balance, 0);
  const m = openModal({
    title: t('fees.payBank'),
    body: `<ol class="process-list mb-4">
        <li><span class="n">1</span><div><b>${esc(t('fees.step1'))}</b>
          <dl class="kv mt-2"><dt>${esc(t('fees.bank'))}</dt><dd>${esc(b.bank_name)}${b.branch ? ` · ${esc(b.branch)}` : ''}</dd><dt>${esc(t('fees.accName'))}</dt><dd>${esc(b.account_name)}</dd><dt>${esc(t('fees.accNo'))}</dt><dd class="code">${esc(b.account_number)}</dd></dl></div></li>
        <li><span class="n">2</span><div><b>${esc(t('fees.step2'))}</b>${esc(t('fees.step2Help'))}</div></li>
        <li><span class="n">3</span><div><b>${esc(t('fees.step3'))}</b>${esc(t('fees.step3Help'))}</div></li></ol>
      <form id="payForm" novalidate class="row g-3">
        <div class="col-sm-6"><label class="form-label" for="pay-amount">${esc(t('fees.amountTransferred'))}<span class="req">*</span></label>
          <input class="form-control" id="pay-amount" name="amount" type="number" min="1" max="999999" step="0.01" required value="${suggested || ''}"><div class="invalid-feedback">${esc(t('validation.amount'))}</div></div>
        <div class="col-sm-6"><label class="form-label" for="pay-date">${esc(t('fees.transferDate'))}<span class="req">*</span></label>
          <input class="form-control" id="pay-date" name="paid_on" type="date" required max="${todayISO()}" value="${todayISO()}"><div class="invalid-feedback">${esc(t('validation.required'))}</div></div>
        <div class="col-12"><label class="form-label" for="pay-note">${esc(t('fees.note'))}</label><input class="form-control" id="pay-note" name="note" maxlength="200"></div>
      </form><div id="payDone" hidden></div>`,
    footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.close'))}</button><button type="submit" form="payForm" class="btn btn-primary" id="payGo">${esc(t('fees.createRef'))}</button>`
  });
  const form = m.el.querySelector('#payForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const btn = m.el.querySelector('#payGo');
    setBusy(btn, true, t('form.saving'));
    try {
      const p = await createBankPayment({ amount: Number(form.amount.value), paidOn: form.paid_on.value, note: form.note.value.trim() || null });
      form.hidden = true; btn.hidden = true;
      const done = m.el.querySelector('#payDone');
      done.hidden = false;
      done.innerHTML = `<div class="text-center"><div class="small text-muted">${esc(t('fees.yourRef'))}</div><div class="code fs-4 my-2">${esc(p.payment_ref)}</div>
        <p class="small text-muted">${esc(t('fees.refHelp'))}</p>
        <div class="d-grid gap-2"><button type="button" class="btn btn-whatsapp btn-lg" data-open><i class="bi bi-whatsapp me-1" aria-hidden="true"></i>${esc(t('fees.sendReceipt'))}</button>
        <button type="button" class="btn btn-outline-primary" data-confirm>${esc(t('fees.iSent'))}</button></div>
        <div class="notice-box mt-3 text-start"><i class="bi bi-exclamation-circle" aria-hidden="true"></i><span>${esc(t('fees.attachNote'))}</span></div></div>`;
      done.querySelector('[data-open]').addEventListener('click', () => sendOnWhatsApp(p));
      // Safety step: "I sent the receipt" must be confirmed with a checkbox (prevents accidental taps).
      done.querySelector('[data-confirm]').addEventListener('click', () => {
        const box = document.createElement('div');
        box.innerHTML = sentConfirmHtml(p);
        done.replaceChildren(box);
        bindSentConfirm(box, p, () => m.close());
      });
      m.el.addEventListener('hidden.bs.modal', reload, { once: true });
    } catch (err) { toastError(err); setBusy(btn, false); }
  });
}

/* ---------- "I sent the receipt" double check ---------- */
function sentConfirmHtml(p) {
  return `<div class="text-start"><div class="d-flex gap-3 align-items-start mb-3"><span class="feature-icon"><i class="bi bi-shield-check" aria-hidden="true"></i></span>
      <div><b class="d-block">${esc(t('fees.sentQ'))}</b><span class="small text-muted">${esc(t('fees.sentQHelp'))}</span></div></div>
    <dl class="kv mb-3"><dt>${esc(t('fees.yourRef'))}</dt><dd class="code">${esc(p.payment_ref)}</dd><dt>${esc(t('fees.amount'))}</dt><dd>${money(p.amount)}</dd></dl>
    <div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="sent-ok-${esc(p.id)}" data-sent-ok><label class="form-check-label small" for="sent-ok-${esc(p.id)}">${esc(t('fees.sentCheck'))}</label></div>
    <div class="d-flex gap-2 justify-content-end flex-wrap"><button type="button" class="btn btn-ghost" data-sent-cancel>${esc(t('fees.notYet'))}</button>
      <button type="button" class="btn btn-primary" data-sent-go disabled><i class="bi bi-check2" aria-hidden="true"></i>${esc(t('fees.yesSent'))}</button></div></div>`;
}
function bindSentConfirm(root, p, close) {
  const ok = root.querySelector('[data-sent-ok]'); const go = root.querySelector('[data-sent-go]');
  ok.addEventListener('change', () => { go.disabled = !ok.checked; });
  root.querySelector('[data-sent-cancel]').addEventListener('click', close);
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { await markReceiptSent(p.id); showToast(t('fees.markedSent'), 'success'); close(); reload(); } catch (err) { toastError(err); go.disabled = false; }
  });
}
function confirmSentModal(p) {
  if (!p) return;
  const m = openModal({ title: t('fees.iSent'), body: sentConfirmHtml(p), footer: false });
  bindSentConfirm(m.body, p, () => m.close());
}

async function showReceipt(id) {
  try {
    const bundle = await getReceiptBundle(id);
    const html = receiptHtml(bundle, settings);
    const m = openModal({ title: bundle.receipt.receipt_no, body: html, size: 'modal-lg',
      footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.close'))}</button><button type="button" class="btn btn-primary" data-print><i class="bi bi-printer me-1" aria-hidden="true"></i>${esc(t('fees.print'))}</button>` });
    m.el.querySelector('[data-print]').addEventListener('click', () => printHtml(html));
  } catch (e) { toastError(e); }
}

content.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (el.id === 'payBtn') return payFlow();
  if (el.dataset.month) { month = addMonths(month, Number(el.dataset.month)); render(); return loadStatement(); }
  if (el.dataset.wa) return sendOnWhatsApp(data.payments.find((p) => p.id === el.dataset.wa));
  if (el.dataset.sent) return confirmSentModal(data.payments.find((p) => p.id === el.dataset.sent));
  if (el.dataset.receipt) return showReceipt(el.dataset.receipt);
});

async function reload() { data = await loadMyData(student.id); render(); loadStatement(); }
try { await reload(); if (qs('pay')) payFlow(); } catch (e) { toastError(e); }
onLanguageChange(() => data && (render(), loadStatement()));
