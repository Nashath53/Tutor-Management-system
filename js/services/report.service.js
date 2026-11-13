import { api } from './api.js';

export const dashboardStats = () => api.rpc('get_dashboard_stats');
export const listReconciliations = () => api.select('cash_reconciliations', { order: ['reconciliation_date', 'desc'] });
export const saveReconciliation = (date, counted, notes, collectorId) =>
  api.rpc('save_cash_reconciliation', { p_date: date, p_collector_id: collectorId || null, p_counted: counted, p_notes: notes || null });
export const listAudit = () => api.select('audit_log', { order: ['created_at', 'desc'], limit: 200 });
