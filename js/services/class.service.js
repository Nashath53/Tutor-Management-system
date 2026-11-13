import { api } from './api.js';

export const listPublicClasses = () => api.rpc('get_public_classes');
export const listClasses = () => api.select('classes', { order: ['title_en', 'asc'] });
export const saveClass = (row) => (row.id ? api.update('classes', row.id, row) : api.insert('classes', row));

export const getClassPrivate = (classId) => api.get('class_private', classId, 'class_id');
export const listClassPrivate = (classIds) => api.select('class_private', classIds ? { in: { class_id: classIds } } : {});
export const saveClassPrivate = (row) => api.upsert('class_private', row, 'class_id');

export const listClassTeachers = (classId) => api.select('class_teachers', classId ? { eq: { class_id: classId } } : {});
export const addClassTeacher = (row) => api.insert('class_teachers', row);
export const updateClassTeacher = (id, patch) => api.update('class_teachers', id, patch);
export const removeClassTeacher = (id) => api.remove('class_teachers', id);
