/** Data the student portal pages share. Every query filters by the student's own id; RLS enforces the same rule on the server. */
import { api } from '../../services/api.js';
import { listPublicClasses } from '../../services/class.service.js';
import { indexBy, sum } from '../../utils/dom.js';
import { t, loc } from '../../i18n/language.js';

export async function loadMyData(studentId) {
  const [enrollments, classes, ledger, payments, receipts] = await Promise.all([
    api.select('enrollments', { eq: { student_id: studentId }, order: ['created_at', 'desc'] }),
    listPublicClasses(),
    api.select('fee_ledger', { eq: { student_id: studentId }, order: ['entry_date', 'desc'] }),
    api.select('payments', { eq: { student_id: studentId }, order: ['created_at', 'desc'] }),
    api.select('receipts', { eq: { student_id: studentId }, order: ['issued_at', 'desc'] })
  ]);
  const charges = sum(ledger, (l) => l.amount);
  const paid = sum(payments.filter((p) => p.status === 'verified'), (p) => p.amount);
  return { enrollments, classes, classById: indexBy(classes), ledger, payments, receipts, balance: Math.round((charges - paid) * 100) / 100 };
}

export function classTitle(c) {
  if (!c) return '—';
  return loc(c, 'title') || `${loc({ name_en: c.subject_name_en, name_ta: c.subject_name_ta }, 'name')} · ${t('common.grade')} ${c.grade}`;
}

/** My attendance rows joined with their session (date, topic, status). */
export async function loadMyAttendance(studentId) {
  const rows = await api.select('attendance', { eq: { student_id: studentId } });
  const ids = [...new Set(rows.map((r) => r.session_id))];
  const sessions = indexBy(ids.length ? await api.select('class_sessions', { in: { id: ids } }) : []);
  return rows.map((r) => ({ ...r, session: sessions.get(r.session_id) || null, date: sessions.get(r.session_id)?.session_date || '' }))
    .filter((r) => r.session?.status !== 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Attendance rate = (present + late) / (present + late + absent). Trial and excused rows are not counted against you. */
export function attendanceRate(rows) {
  const counted = rows.filter((r) => ['present', 'late', 'absent'].includes(r.status));
  if (!counted.length) return null;
  return Math.round((counted.filter((r) => r.status !== 'absent').length / counted.length) * 100);
}

/** Weekly timetable slots for my live classes. */
export async function loadMySlots(classIds) {
  if (!classIds.length) return [];
  const slots = await api.select('timetable_slots', { in: { class_id: classIds } });
  return slots.filter((s) => s.is_active !== false).sort((a, b) => a.weekday - b.weekday || String(a.start_time).localeCompare(String(b.start_time)));
}

/** Next N occurrences of the weekly slots from now. */
export function upcomingFromSlots(slots, days = 7) {
  const out = []; const now = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(now); day.setDate(now.getDate() + d);
    const dow = ((day.getDay() + 6) % 7) + 1;
    slots.filter((s) => s.weekday === dow).forEach((s) => {
      const [h, m] = String(s.start_time).split(':').map(Number);
      const at = new Date(day); at.setHours(h, m || 0, 0, 0);
      const [eh, em] = String(s.end_time).split(':').map(Number);
      const end = new Date(day); end.setHours(eh, em || 0, 0, 0);
      if (end > now) out.push({ ...s, at, end });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
