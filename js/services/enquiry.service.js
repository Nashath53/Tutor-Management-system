import { api } from './api.js';

export const submitEnquiry = (payload) => api.rpc('submit_student_enquiry', { p: payload });
export const markWhatsAppOpened = (kind, id) => api.rpc('mark_whatsapp_opened', { p_kind: kind, p_id: id }).catch(() => null);
export const listEnquiries = () => api.select('student_enquiries', { order: ['created_at', 'desc'] });
export const updateEnquiry = (id, patch) => api.update('student_enquiries', id, patch);
export const convertEnquiry = (id, classId, asTrial) => api.rpc('convert_enquiry', { p_enquiry_id: id, p_class_id: classId, p_as_trial: asTrial });
