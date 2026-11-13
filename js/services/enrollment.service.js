import { api } from './api.js';

export const listEnrollments = (filters = {}) => api.select('enrollments', { eq: filters, order: ['created_at', 'desc'] });
export const createEnrollment = (studentId, classId, asTrial) => api.rpc('create_enrollment', { p_student_id: studentId, p_class_id: classId, p_as_trial: asTrial });
export const requestAdmission = (id) => api.rpc('request_paid_admission', { p_enrollment_id: id });
export const waiveAdmissionFee = (id, reason) => api.rpc('waive_admission_fee', { p_enrollment_id: id, p_reason: reason });
export const paymentStatus = (id) => api.rpc('enrollment_payment_status', { p_enrollment_id: id });
export const approveEnrollment = (id, { paidFrom, override = false, reason = null } = {}) =>
  api.rpc('approve_enrollment', { p_enrollment_id: id, p_paid_from: paidFrom || null, p_override: override, p_reason: reason });
export const setEnrollmentStatus = (id, status, reason) => api.rpc('set_enrollment_status', { p_enrollment_id: id, p_status: status, p_reason: reason || null });
