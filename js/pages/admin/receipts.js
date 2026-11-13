import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud } from '../../components/crud.js';
import { listReceipts, getReceiptBundle } from '../../services/receipt.service.js';
import { getSettings } from '../../services/settings.service.js';
import { lookups, studentLabel } from './admin-common.js';
import { receiptHtml, printHtml } from '../../components/receipt.js';
import { openModal } from '../../components/modal.js';
import { esc } from '../../utils/dom.js';
import { money, fmtDateTime } from '../../utils/format.js';
import { toastError } from '../../components/toast.js';

const { content } = await initAdminPage({ page: 'receipts', title: 'Receipts' });
const settings = await getSettings();
let L = await lookups('students');
const view = async (r) => {
  try {
    const html = receiptHtml(await getReceiptBundle(r.id), settings);
    const m = openModal({ title: r.receipt_no, size: 'modal-lg', body: html, footer: '<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Close</button><button type="button" class="btn btn-primary" data-print><i class="bi bi-printer me-1" aria-hidden="true"></i>Print</button>' });
    m.el.querySelector('[data-print]').addEventListener('click', () => printHtml(html));
  } catch (e) { toastError(e); }
};
createCrud(content, {
  intro: 'Receipts are numbered by the database (MR-YEAR-000001) only after a payment is confirmed. They are never deleted; reversed payments show a VOID receipt.',
  load: listReceipts, searchKeys: ['receipt_no', (r) => L.studentsById.get(r.student_id)?.full_name, (r) => L.studentsById.get(r.student_id)?.student_code],
  filters: [{ name: 'is_void', label: 'Void', options: [{ value: 'true', label: 'Void only' }], test: (r) => r.is_void }],
  columns: [
    { label: 'Receipt no.', render: (r) => `<span class="code">${esc(r.receipt_no)}</span>` },
    { label: 'Student', render: (r) => esc(studentLabel(L.studentsById.get(r.student_id))) },
    { label: 'Issued', render: (r) => `<span class="small">${fmtDateTime(r.issued_at)}</span>` },
    { label: 'Amount', class: 'num', render: (r) => money(r.amount) },
    { label: 'Status', render: (r) => (r.is_void ? '<span class="badge-status s-rejected">Void</span>' : '<span class="badge-status s-verified">Valid</span>') }
  ],
  primaryAction: (r) => ({ label: 'View', onClick: () => view(r) })
});
