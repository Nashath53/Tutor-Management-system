import { api } from './api.js';

export const listNotices = () => api.select('notices', { order: ['published_at', 'desc'] });
export const saveNotice = (row) => (row.id ? api.update('notices', row.id, row) : api.insert('notices', { ...row, published_at: new Date().toISOString() }));
export const removeNotice = (id) => api.remove('notices', id);
export const listRecordings = () => api.select('recordings', { order: ['recorded_on', 'desc'] });
export const saveRecording = (row) => (row.id ? api.update('recordings', row.id, row) : api.insert('recordings', row));
export const removeRecording = (id) => api.remove('recordings', id);
