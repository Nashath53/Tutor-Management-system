import { api } from './api.js';
import { APP } from '../config/app.config.js';
import { uuid } from '../utils/ids.js';

export const listPublicTeachers = () => api.rpc('get_public_teachers');
export const listTeachers = () => api.select('teachers', { order: ['full_name', 'asc'] });
export const saveTeacher = (row) => (row.id ? api.update('teachers', row.id, row) : api.insert('teachers', row));

export const listQualifications = (teacherId) => api.select('teacher_qualifications', teacherId ? { eq: { teacher_id: teacherId } } : {});
export const addQualification = (row) => api.insert('teacher_qualifications', row);
export const updateQualification = (id, patch) => api.update('teacher_qualifications', id, patch);
export const removeQualification = (id) => api.remove('teacher_qualifications', id);

export const listTeacherSubjects = (teacherId) => api.select('teacher_subjects', teacherId ? { eq: { teacher_id: teacherId } } : {});
export const addTeacherSubject = (row) => api.insert('teacher_subjects', row);
export const removeTeacherSubject = (id) => api.remove('teacher_subjects', id);

export const listApplications = () => api.select('teacher_applications', { order: ['created_at', 'desc'] });
export const updateApplication = (id, patch) => api.update('teacher_applications', id, patch);
export const approveApplication = (id) => api.rpc('approve_teacher_application', { p_application_id: id });
export const submitApplication = (payload) => api.rpc('submit_teacher_application', { p: payload });

/** Uploads a CV/certificate into the PRIVATE bucket. Only admins can read it back (signed URL). */
export async function uploadApplicationFile(file) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `applications/${uuid()}/${safe}`;
  await api.upload(APP.buckets.teacherDocuments, path, file);
  return path;
}
export const documentUrl = (path) => api.signedUrl(APP.buckets.teacherDocuments, path);
