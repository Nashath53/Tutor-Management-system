/** Printable official receipt + statement printing helper. */
import { esc } from '../utils/dom.js';
import { money, fmtDate, fmtDateTime, humanize } from '../utils/format.js';
import { APP } from '../config/app.config.js';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n) {
  n = Math.floor(n);
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim();
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred ${words(n % 100)}`.trim();
  if (n < 100000) return `${words(n / 1000)} Thousand ${words(n % 1000)}`.trim();
  if (n < 10000000) return `${words(n / 100000)} Lakh ${words(n % 100000)}`.trim();
  return `${words(n / 10000000)} Crore ${words(n % 10000000)}`.trim();
}
/** "Two Thousand Five Hundred Rupees Only" — common on Sri Lankan receipts. */
export function amountInWords(amount) {
  const a = Math.abs(Number(amount) || 0); const r = Math.floor(a); const c = Math.round((a - r) * 100);
  return `${words(r) || 'Zero'} Rupees${c ? ` and ${words(c)} Cents` : ''} Only`;
}

/** Professional, printable receipt with the Mentora logo. Generated only after the server confirmed the payment. */
export function receiptHtml({ receipt, payment, student, ledger = [], allocations = [] }, settings) {
  const c = settings?.contact || {};
  const base = document.documentElement.dataset.base || '';
  const ledgerById = new Map(ledger.map((l) => [l.id, l]));
  const live = allocations.filter((a) => !a.reversed_at);
  const rows = live.map((a) => {
    const l = ledgerById.get(a.ledger_id);
    return `<tr><td>${esc(l?.description || humanize(l?.entry_type))}${l?.entry_date ? `<div style="font-size:11px;color:#64748B">${fmtDate(l.entry_date)}</div>` : ''}</td><td style="text-align:right">${money(a.amount)}</td></tr>`;
  }).join('');
  const allocated = live.reduce((s, a) => s + Number(a.amount), 0);
  const credit = Number(payment.amount) - allocated;
  return `<div class="receipt-pro" style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <div class="rp-band">
      <div class="rp-logo"><img src="${base}assets/icons/icon-192.png" alt="Mentora logo" width="46" height="46" style="border-radius:12px;background:#fff">
        <div><div class="rp-name">${esc(APP.name)}</div><div class="rp-tag">${esc(c.address || APP.address)}</div><div class="rp-tag">${esc(c.phone || APP.phoneDisplay)} · ${esc(c.email || APP.email)}</div></div></div>
      <div class="rp-title"><b>RECEIPT</b><span class="rp-tag">பற்றுச்சீட்டு</span></div>
    </div>
    <div class="rp-strip"></div>
    <div class="rp-body">
      <div class="rp-water" aria-hidden="true">M</div>
      ${receipt.is_void ? '<div class="void-stamp">VOID</div>' : '<div class="paid-stamp">PAID</div>'}
      <dl class="rp-grid">
        <div><dt>Receipt no.</dt><dd style="font-family:monospace;font-size:14px">${esc(receipt.receipt_no)}</dd></div>
        <div><dt>Issued</dt><dd>${fmtDateTime(receipt.issued_at)}</dd></div>
        <div><dt>Received from</dt><dd>${esc(student?.full_name || '')}<div style="font-family:monospace;font-size:11px;color:#64748B">${esc(student?.student_code || '')}</div></dd></div>
        <div><dt>Payment ref.</dt><dd style="font-family:monospace">${esc(payment.payment_ref)}</dd></div>
        <div><dt>Method</dt><dd>${esc(humanize(payment.method))}${payment.collector_name ? `<div style="font-size:11px;color:#64748B">Collected by ${esc(payment.collector_name)}</div>` : ''}</dd></div>
        <div><dt>Paid on</dt><dd>${fmtDate(payment.paid_on)}${payment.bank_reference ? `<div style="font-size:11px;color:#64748B">Bank ref. ${esc(payment.bank_reference)}</div>` : ''}</dd></div>
      </dl>
      ${rows || credit > 0.009 ? `<table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}
        ${credit > 0.009 ? `<tr><td>Advance / credit carried forward</td><td style="text-align:right">${money(credit)}</td></tr>` : ''}</tbody></table>` : ''}
      <div class="tot"><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748B;font-weight:700">Amount received</div><div style="font-size:11px;color:#475569">${esc(amountInWords(payment.amount))}</div></div><b>${money(payment.amount)}</b></div>
      ${receipt.is_void ? `<p style="color:#DC2626;font-size:12px;margin:12px 0 0">This receipt was voided: ${esc(receipt.void_reason || '')}</p>` : ''}
    </div>
    <div class="rp-foot"><div>Computer-generated after the payment was verified on Mentora's server.<br>Please keep this receipt for your records. Fees once paid are adjusted only by official reversal.</div><div class="sig"><span>Authorised signature</span></div></div>
  </div>`;
}

/** Prints only the given HTML. (Some embedded previews block printing; it works on the deployed site.) */
export function printHtml(html) {
  let root = document.querySelector('.print-root');
  if (!root) { root = document.createElement('div'); root.className = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch { /* ignore */ }
  setTimeout(done, 1500);
}
