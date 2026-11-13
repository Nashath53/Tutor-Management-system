import { api } from './api.js';

export const listReceipts = (filters = {}) => api.select('receipts', { eq: filters, order: ['issued_at', 'desc'] });

/** Loads everything needed to print one receipt. */
export async function getReceiptBundle(receiptId) {
  const receipt = await api.get('receipts', receiptId);
  if (!receipt) throw new Error('Receipt not found');
  const [payment, student, allocations] = await Promise.all([
    api.get('payments', receipt.payment_id),
    api.get('students', receipt.student_id),
    api.select('payment_allocations', { eq: { payment_id: receipt.payment_id } })
  ]);
  const ledgerIds = allocations.map((a) => a.ledger_id);
  const ledger = ledgerIds.length ? await api.select('fee_ledger', { in: { id: ledgerIds } }) : [];
  return { receipt, payment, student, allocations, ledger };
}
