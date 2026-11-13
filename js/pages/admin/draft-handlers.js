/**
 * How each offline draft type is sent to the server when the device is back online.
 * Each draft carries a client UUID so the database can ignore duplicates if the same
 * draft is sent twice (for example after a flaky connection).
 */
import { registerHandler } from '../../pwa/offline-queue.service.js';
import { markAttendance } from '../../services/attendance.service.js';
import { api } from '../../services/api.js';
import { recordCashPayment } from '../../services/payment.service.js';
import { submitEnquiry } from '../../services/enquiry.service.js';

export function registerDraftHandlers() {
  registerHandler('attendance', async (p, draftId) => {
    const session = await api.rpc('start_session', { p_class_id: p.class_id, p_session_date: p.session_date, p_topic: p.topic || null, p_off_schedule_reason: p.off_schedule_reason || null });
    await markAttendance(session.id, p.rows, p.client_uuid || draftId);
  });
  registerHandler('cash_payment', (p, draftId) => recordCashPayment({ ...p, clientUuid: p.clientUuid || draftId }));
  registerHandler('enquiry', (p) => submitEnquiry(p));
}
