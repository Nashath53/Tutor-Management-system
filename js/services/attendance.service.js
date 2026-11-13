import { api } from './api.js';

export const upsertSession = (classId, date, topic) => api.rpc('upsert_session', { p_class_id: classId, p_session_date: date, p_topic: topic || null });
export const listSessions = (classId) => api.select('class_sessions', { ...(classId ? { eq: { class_id: classId } } : {}), order: ['session_date', 'desc'] });
export const markAttendance = (sessionId, rows, clientUuid) => api.rpc('mark_attendance', { p_session_id: sessionId, p_rows: rows, p_client_uuid: clientUuid || null });
export const cancelSession = (sessionId, reason) => api.rpc('cancel_session', { p_session_id: sessionId, p_reason: reason || null });
export const listAttendance = (filters = {}) => api.select('attendance', { eq: filters, order: ['marked_at', 'desc'] });
