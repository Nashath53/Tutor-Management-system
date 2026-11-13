import { api } from './api.js';
import { groupBy, sum } from '../utils/dom.js';

export const listLedger = (filters = {}) => api.select('fee_ledger', { eq: filters, order: ['entry_date', 'desc'] });
export const addAdjustment = (studentId, amount, description, enrollmentId) =>
  api.rpc('add_ledger_adjustment', { p_student_id: studentId, p_amount: amount, p_description: description, p_enrollment_id: enrollmentId || null });
export const getStatement = (studentId, month) => api.rpc('get_student_statement', { p_student_id: studentId, p_month: month });

/** Balance = all ledger entries (charges − reversals ± adjustments) − verified payments. */
export function computeBalances(ledger, payments) {
  const L = groupBy(ledger, 'student_id');
  const P = groupBy(payments.filter((p) => p.status === 'verified'), 'student_id');
  const ids = new Set([...L.keys(), ...P.keys()]);
  const out = new Map();
  ids.forEach((id) => {
    const charges = sum(L.get(id), (l) => l.amount);
    const paid = sum(P.get(id), (p) => p.amount);
    out.set(id, { charges, paid, balance: Math.round((charges - paid) * 100) / 100 });
  });
  return out;
}
