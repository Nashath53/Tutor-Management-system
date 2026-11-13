import { api } from './api.js';

export const listSubjects = (activeOnly = true) =>
  api.select('subjects', { ...(activeOnly ? { eq: { is_active: true } } : {}), order: ['sort_order', 'asc'] });

export function saveSubject(row) {
  const data = { ...row, code: String(row.code || '').toUpperCase().trim() };
  return row.id ? api.update('subjects', row.id, data) : api.insert('subjects', data);
}
