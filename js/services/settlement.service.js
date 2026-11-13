import { api } from './api.js';

export const listSettlements = (filters = {}) => api.select('teacher_settlements', { eq: filters, order: ['period_month', 'desc'] });
export const generateSettlement = (teacherId, month, adjustments = 0, notes = null) =>
  api.rpc('generate_settlement', { p_teacher_id: teacherId, p_month: month, p_adjustments: adjustments, p_notes: notes });
export const updateSettlementStatus = (id, status, bankReference, date) =>
  api.rpc('update_settlement_status', { p_settlement_id: id, p_status: status, p_bank_reference: bankReference || null, p_settlement_date: date || null });
