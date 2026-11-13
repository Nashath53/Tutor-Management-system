import { api } from './api.js';

export const listPayments = (filters = {}) => api.select('payments', { eq: filters, order: ['created_at', 'desc'] });
export const createBankPayment = ({ amount, studentId, note, paidOn }) =>
  api.rpc('create_bank_payment', { p_amount: amount, p_student_id: studentId || null, p_note: note || null, p_paid_on: paidOn || null });
export const markReceiptSent = (id) => api.rpc('mark_receipt_sent', { p_payment_id: id });
export const verifyPayment = (id, { approve, amount, bankReference, reason }) =>
  api.rpc('verify_payment', { p_payment_id: id, p_approve: approve, p_verified_amount: amount ?? null, p_bank_reference: bankReference || null, p_reason: reason || null });
export const recordCashPayment = (p) =>
  api.rpc('record_cash_payment', {
    p_student_id: p.studentId, p_amount: p.amount, p_paid_on: p.paidOn, p_method: p.method || 'cash',
    p_collector_name: p.collectorName || null, p_notes: p.notes || null, p_client_uuid: p.clientUuid || null
  });
export const reversePayment = (id, reason) => api.rpc('reverse_payment', { p_payment_id: id, p_reason: reason });
export const listAllocations = (filters = {}) => api.select('payment_allocations', { eq: filters });
