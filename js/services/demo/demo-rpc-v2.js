/**
 * DEMO versions of the functions in supabase/migrations/005c_functions_v2.sql.
 * Same names, same arguments, same rules — so every new screen works offline.
 */
import { uuid } from '../../utils/ids.js';

const fail = (msg) => { throw new Error(msg); };
const now = () => new Date().toISOString();
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const PHONE = /^94\d{9}$/;
const LINK = /^https:\/\/([a-z0-9-]+\.)*(drive\.google\.com|docs\.google\.com|youtube\.com|youtu\.be|zoom\.us|meet\.google\.com|t\.me|telegram\.me|dropbox\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|mentora\.lk)(\/|$)/i;
const LIVE = ['trial', 'trial_completed', 'admission_requested', 'approved'];
export const isoDow = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Monday … 7 = Sunday

export const DEFAULT_PERMISSIONS = {
  cashier: { students_edit: true, enrollments_manage: true, attendance_mark: true, payments_record: true, timetable_view: true, reports_view: true },
  teacher: { attendance_mark: false, roster_view: true, student_contacts_view: false, earnings_view: true, content_submit: true, timetable_request: true, poll_view: true, reviews_view: true }
};

export function createDemoRpcV2(db, ctx, base) {
  const T = db.t;
  const setting = (k) => (T.app_settings.find((r) => r.key === k) || {}).value || {};
  const me = () => ctx.profile();
  const role = () => me()?.role;
  const isAdmin = () => role() === 'admin';
  const isStaff = () => ['admin', 'cashier'].includes(role());
  const assertAdmin = () => { if (!isAdmin()) fail('Only administrators can do this.'); };
  const myStudentId = () => (role() === 'student' ? me()?.student_id : null);
  const myTeacherId = () => { const id = role() === 'teacher' ? me()?.teacher_id : null; return id && db.find('teachers', id)?.status === 'active' ? id : null; };
  const myTeacherClassIds = () => T.class_teachers.filter((c) => c.teacher_id === myTeacherId()).map((c) => c.class_id);
  const myClassIds = (approvedOnly) => T.enrollments.filter((e) => e.student_id === myStudentId() && (approvedOnly ? e.status === 'approved' : LIVE.includes(e.status))).map((e) => e.class_id);
  const perms = () => ({ ...DEFAULT_PERMISSIONS, ...setting('permissions') });
  const hasPerm = (k) => isAdmin() || (['cashier', 'teacher'].includes(role()) && !!perms()[role()]?.[k]);
  const audit = (action, table, id, details = {}) => db.insert('audit_log', { id: uuid(), actor_id: me()?.id || null, action, table_name: table, record_id: id, details });
  const rateLimit = (bucket, key, max, minutes) => {
    const since = Date.now() - minutes * 60000;
    if (T.rate_limits.filter((r) => r.bucket === bucket && r.key === key && Date.parse(r.created_at) > since).length >= max) fail('Too many submissions. Please try again later.');
    db.insert('rate_limits', { bucket, key });
  };
  const nz = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

  const teacherStats = (tid) => {
    const classIds = T.class_teachers.filter((c) => c.teacher_id === tid).map((c) => c.class_id);
    const students = new Set(T.enrollments.filter((e) => classIds.includes(e.class_id) && [...LIVE, 'completed'].includes(e.status)).map((e) => e.student_id));
    const rv = T.reviews.filter((r) => r.teacher_id === tid && r.status === 'approved');
    return { student_count: students.size, rating_avg: rv.length ? Math.round((rv.reduce((s, r) => s + r.rating, 0) / rv.length) * 10) / 10 : null, rating_count: rv.length };
  };

  /** Next class start (Date) from the timetable, skipping cancelled sessions. */
  const nextClassStart = (classId) => {
    const slots = T.timetable_slots.filter((s) => s.class_id === classId && s.is_active !== false);
    const n = new Date();
    let best = null;
    for (let d = 0; d <= 7; d++) {
      const day = new Date(n.getFullYear(), n.getMonth(), n.getDate() + d);
      const ds = new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (T.class_sessions.some((cs) => cs.class_id === classId && cs.session_date === ds && cs.status === 'cancelled')) continue;
      slots.filter((s) => s.weekday === isoDow(day)).forEach((s) => {
        const [h, m] = s.start_time.split(':').map(Number);
        const st = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
        if (st > n && (!best || st < best)) best = st;
      });
    }
    return best;
  };
  const purgePolls = () => { const n = Date.now(); db.t.class_poll_responses = T.class_poll_responses.filter((r) => Date.parse(r.starts_at) > n); };
  const pollHours = () => Number(setting('poll').hours_before ?? 24);
  const assertCanMark = (classId) => {
    if (isAdmin()) return;
    if (role() === 'cashier' && hasPerm('attendance_mark')) return;
    if (myTeacherId() && hasPerm('attendance_mark') && myTeacherClassIds().includes(classId)) return;
    fail('You do not have permission to mark attendance for this class.');
  };
  // base.mark_attendance checks "staff"; wrap it so teachers with permission can use it too.
  const runAsStaff = (fn) => { const p = me(); if (isStaff()) return fn(); ctx.setProfile({ ...p, role: 'cashier' }); try { return fn(); } finally { ctx.setProfile(p); } };

  const publicTeacher = (t) => ({
    id: t.id, display_name: t.display_name || t.full_name, photo_url: t.photo_url, bio_en: t.bio_en, bio_ta: t.bio_ta,
    headline_en: t.headline_en, headline_ta: t.headline_ta, specialties: t.specialties || [],
    experience_years: t.experience_years, mediums: t.mediums || [], class_modes: t.class_modes || [],
    linkedin_url: t.linkedin_url, facebook_url: t.facebook_url, youtube_url: t.youtube_url, website_url: t.website_url,
    subjects: T.teacher_subjects.filter((x) => x.teacher_id === t.id).map((x) => { const s = db.find('subjects', x.subject_id); return s && { id: s.id, name_en: s.name_en, name_ta: s.name_ta, grades: x.grades }; }).filter(Boolean),
    qualifications: T.teacher_qualifications.filter((q) => q.teacher_id === t.id && q.is_verified && q.is_public !== false).map((q) => ({ title: q.title, institution: q.institution, year: q.year })),
    ...teacherStats(t.id)
  });
  const reviewPublic = (r) => ({ reviewer_name: r.reviewer_name, reviewer_role: r.reviewer_role, grade: r.grade, rating: r.rating, comment: r.comment, created_at: r.created_at,
    teacher_name: r.teacher_id ? (db.find('teachers', r.teacher_id)?.display_name || null) : null });

  const rpc = {
    // ---------------- Public ----------------
    get_public_teachers() {
      return T.teachers.filter((t) => t.is_public && t.status === 'active').map(publicTeacher)
        .sort((a, b) => b.student_count - a.student_count || a.display_name.localeCompare(b.display_name));
    },
    get_public_teacher({ p_teacher_id }) {
      const t = db.find('teachers', p_teacher_id);
      if (!t || !t.is_public || t.status !== 'active') return null;
      const rv = T.reviews.filter((r) => r.teacher_id === t.id && r.status === 'approved').sort((a, b) => b.created_at.localeCompare(a.created_at));
      const breakdown = {}; rv.forEach((r) => { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; });
      const cutoff = Date.now() - 3 * 3600e3;
      return {
        ...publicTeacher(t),
        reviews: rv.slice(0, 30).map(reviewPublic), rating_breakdown: breakdown,
        media: T.teacher_media.filter((m) => m.teacher_id === t.id && m.status === 'approved' && (m.kind === 'youtube' || !m.starts_at || Date.parse(m.starts_at) > cutoff))
          .map((m) => ({ id: m.id, kind: m.kind, title: m.title, url: m.url, starts_at: m.starts_at })),
        classes: T.class_teachers.filter((ct) => ct.teacher_id === t.id).map((ct) => db.find('classes', ct.class_id)).filter((c) => c && c.is_public && c.is_active)
          .map((c) => ({ id: c.id, title_en: c.title_en, title_ta: c.title_ta, grade: c.grade, medium: c.medium, class_mode: c.class_mode, schedule_en: c.schedule_en, schedule_ta: c.schedule_ta, rate_per_session: c.rate_per_session }))
      };
    },
    get_public_classes() {
      return base.get_public_classes().map((c) => ({
        ...c,
        teacher_list: T.class_teachers.filter((ct) => ct.class_id === c.id).map((ct) => db.find('teachers', ct.teacher_id)).filter((t) => t && t.is_public && t.status === 'active').map((t) => ({ id: t.id, name: t.display_name || t.full_name })),
        slots: T.timetable_slots.filter((s) => s.class_id === c.id && s.is_active !== false).sort((a, b) => a.weekday - b.weekday).map((s) => ({ weekday: s.weekday, start_time: s.start_time, end_time: s.end_time })),
        student_count: T.enrollments.filter((e) => e.class_id === c.id && LIVE.includes(e.status)).length
      }));
    },
    get_public_stats() {
      const rv = T.reviews.filter((r) => r.status === 'approved');
      return {
        students: T.students.filter((s) => s.status === 'active').length,
        teachers: T.teachers.filter((t) => t.is_public && t.status === 'active').length,
        classes: T.classes.filter((c) => c.is_public && c.is_active).length,
        subjects: T.subjects.filter((s) => s.is_active).length,
        rating_avg: rv.length ? Math.round((rv.reduce((s, r) => s + r.rating, 0) / rv.length) * 10) / 10 : null, rating_count: rv.length
      };
    },
    get_public_testimonials() {
      return T.reviews.filter((r) => r.status === 'approved' && (!r.teacher_id || r.is_featured))
        .sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) || b.created_at.localeCompare(a.created_at)).slice(0, 12).map(reviewPublic);
    },
    submit_review({ p }) {
      const phone = nz(p.phone);
      if (phone && !PHONE.test(phone)) fail('Enter a valid Sri Lankan mobile number.');
      if (p.teacher_id && !T.teachers.some((t) => t.id === p.teacher_id && t.is_public && t.status === 'active')) fail('Teacher not found.');
      const name = String(p.reviewer_name || '').trim(); const comment = String(p.comment || '').trim(); const rating = Number(p.rating);
      if (name.length < 2) fail('Please enter your name.');
      if (comment.length < 5 || comment.length > 1000) fail('Please write a short comment (5–1000 characters).');
      if (!(rating >= 1 && rating <= 5)) fail('Choose a star rating.');
      rateLimit('review', phone || 'anon', phone ? 3 : 20, 60);
      const r = db.insert('reviews', { teacher_id: p.teacher_id || null, reviewer_name: name, reviewer_role: p.reviewer_role || 'student', grade: nz(p.grade), rating, comment, phone, status: 'pending', is_featured: false });
      return { id: r.id, status: 'pending' };
    },
    submit_feedback({ p }) {
      const needs = Array.isArray(p.needs) ? p.needs : [];
      if (!nz(p.improve) && !nz(p.ideas) && !needs.length) fail('Please tell us at least one need or idea.');
      rateLimit('feedback', nz(p.contact) || 'anon', 30, 60);
      const r = db.insert('audience_feedback', { name: nz(p.name), role: nz(p.role), grade: nz(p.grade), needs, rating: p.rating ? Number(p.rating) : null, improve: nz(p.improve), ideas: nz(p.ideas), contact: nz(p.contact), status: 'new' });
      return { id: r.id };
    },
    submit_complaint({ p }) {
      if (String(p.name || '').trim().length < 2) fail('Name is required.');
      if (!PHONE.test(p.phone || '')) fail('A valid Sri Lankan mobile number is required.');
      if (String(p.details || '').trim().length < 10) fail('Please describe the problem.');
      rateLimit('complaint', p.phone, 3, 60);
      const d = new Date(); const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
      const ref = `MC-${yymm}-${String(db.nextSerial('COMPLAINT-' + yymm)).padStart(4, '0')}`;
      const c = db.insert('complaints', { reference_no: ref, name: p.name.trim(), phone: p.phone, email: nz(p.email), category: p.category || 'other', subject: nz(p.subject) || 'Complaint', details: p.details.trim(), status: 'new' });
      return { id: c.id, reference_no: c.reference_no };
    },

    // ---------------- Permissions ----------------
    get_my_permissions() { return isAdmin() ? { all: true } : (perms()[role()] || {}); },

    // ---------------- Teachers ----------------
    remove_teacher({ p_teacher_id, p_reason }) {
      assertAdmin();
      if (!nz(p_reason)) fail('A reason is required.');
      const t = db.find('teachers', p_teacher_id) || fail('Teacher not found.');
      Object.assign(t, { status: 'removed', is_public: false, removed_at: now(), removed_reason: p_reason.trim() });
      T.timetable_slots.filter((s) => s.teacher_id === t.id).forEach((s) => { s.teacher_id = null; });
      audit('remove_teacher', 'teachers', t.id, { reason: p_reason });
      return t;
    },
    restore_teacher({ p_teacher_id }) {
      assertAdmin();
      const t = db.find('teachers', p_teacher_id);
      if (!t || t.status !== 'removed') fail('Teacher is not removed.');
      Object.assign(t, { status: 'active', removed_at: null, removed_reason: null });
      audit('restore_teacher', 'teachers', t.id);
      return t;
    },
    link_teacher_login() { fail('Linking logins is available after Supabase is connected. In the demo, use teacher@mentora.demo.'); },
    teacher_roster({ p_class_id }) {
      if (!(isStaff() || (myTeacherClassIds().includes(p_class_id) && hasPerm('roster_view')))) fail('You can only view rosters of your own classes.');
      const showPhone = isStaff() || hasPerm('student_contacts_view');
      return T.enrollments.filter((e) => e.class_id === p_class_id && [...LIVE, 'suspended'].includes(e.status)).map((e) => {
        const s = db.find('students', e.student_id) || {};
        return { enrollment_id: e.id, enrollment_code: e.enrollment_code, status: e.status, trial_sessions_used: e.trial_sessions_used, student_id: s.id, student_code: s.student_code, full_name: s.full_name, grade: s.grade, phone: showPhone ? s.phone : null };
      }).sort((a, b) => String(a.full_name).localeCompare(b.full_name));
    },
    get_my_reviews() {
      if (!myTeacherId() || !hasPerm('reviews_view')) fail('Not allowed.');
      return T.reviews.filter((r) => r.teacher_id === myTeacherId() && r.status === 'approved').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(reviewPublic);
    },

    // ---------------- Enrolment status ----------------
    set_enrollment_status(args) {
      if (args.p_status !== 'completed') return base.set_enrollment_status(args);
      assertAdmin();
      const e = db.find('enrollments', args.p_enrollment_id) || fail('Enrolment not found.');
      if (!['approved', 'suspended'].includes(e.status)) fail(`Cannot change status from ${e.status} to completed.`);
      Object.assign(e, { status: 'completed', completed_at: now(), notes: [e.notes, `${today()}: completed${args.p_reason ? ' — ' + args.p_reason : ''}`].filter(Boolean).join('\n') });
      audit('set_enrollment_status', 'enrollments', e.id, { status: 'completed', reason: args.p_reason });
      return e;
    },

    // ---------------- Attendance ----------------
    start_session({ p_class_id, p_session_date, p_topic, p_off_schedule_reason }) {
      assertCanMark(p_class_id);
      let s = T.class_sessions.find((x) => x.class_id === p_class_id && x.session_date === p_session_date);
      if (!s) {
        const slots = T.timetable_slots.filter((x) => x.class_id === p_class_id && x.is_active !== false);
        const onTt = slots.some((x) => x.weekday === isoDow(new Date(p_session_date + 'T12:00:00')));
        if (slots.length && !onTt && !nz(p_off_schedule_reason)) fail('This date is not on the class timetable. Please enter a reason for the extra/rescheduled session.');
        s = db.insert('class_sessions', { class_id: p_class_id, session_date: p_session_date, topic: nz(p_topic), status: 'scheduled', created_by: me()?.id, off_schedule_reason: slots.length && !onTt ? p_off_schedule_reason.trim() : null });
        if (s.off_schedule_reason) audit('off_schedule_session', 'class_sessions', s.id, { reason: s.off_schedule_reason });
      } else if (nz(p_topic) && !s.topic) s.topic = nz(p_topic);
      return s;
    },
    upsert_session({ p_class_id, p_session_date, p_topic }) { return rpc.start_session({ p_class_id, p_session_date, p_topic, p_off_schedule_reason: null }); },
    mark_attendance(args) {
      const ses = db.find('class_sessions', args.p_session_id) || fail('Session not found.');
      assertCanMark(ses.class_id);
      return runAsStaff(() => base.mark_attendance(args));
    },
    request_attendance_correction({ p_attendance_id, p_requested_status, p_reason }) {
      const a = db.find('attendance', p_attendance_id);
      if (!a || a.student_id !== myStudentId()) fail('Attendance record not found.');
      if (a.status === 'cancelled') fail('This session was cancelled.');
      if (!['present', 'late', 'absent', 'excused'].includes(p_requested_status)) fail('Invalid status.');
      if (p_requested_status === a.status || (a.status === 'trial' && p_requested_status === 'present')) fail('That is already the recorded status.');
      if (String(p_reason || '').trim().length < 5) fail('Please explain what happened.');
      if (T.attendance_disputes.some((d) => d.attendance_id === a.id && d.status === 'pending')) fail('A request for this session is already waiting for review.');
      rateLimit('att_dispute', a.student_id, 10, 1440);
      return db.insert('attendance_disputes', { attendance_id: a.id, student_id: a.student_id, class_id: a.class_id, session_id: a.session_id, current_status: a.status, requested_status: p_requested_status, reason: p_reason.trim(), status: 'pending' });
    },
    resolve_attendance_correction({ p_id, p_approve, p_note }) {
      assertAdmin();
      const d = db.find('attendance_disputes', p_id);
      if (!d || d.status !== 'pending') fail('Request not found or already handled.');
      if (p_approve) {
        const a = db.find('attendance', d.attendance_id);
        base.mark_attendance({ p_session_id: a.session_id, p_rows: [{ enrollment_id: a.enrollment_id, status: d.requested_status }] });
      } else if (!nz(p_note)) fail('Give a short reason for rejecting.');
      Object.assign(d, { status: p_approve ? 'approved' : 'rejected', resolved_by: me()?.id, resolution_note: nz(p_note), resolved_at: now() });
      audit('resolve_attendance_correction', 'attendance_disputes', d.id, { approve: !!p_approve, note: p_note });
      return d;
    },

    // ---------------- Timetable ----------------
    request_timetable_change({ p_action, p_class_id, p_slot_id, p_proposed, p_reason }) {
      if (!myTeacherId() || !hasPerm('timetable_request')) fail('Not allowed.');
      if (!myTeacherClassIds().includes(p_class_id)) fail('You can only request changes for your own classes.');
      if (!['create', 'update', 'delete'].includes(p_action)) fail('Invalid action.');
      if (p_action !== 'create' && !T.timetable_slots.some((s) => s.id === p_slot_id && s.class_id === p_class_id)) fail('Timetable slot not found.');
      const p = p_proposed || {};
      if (p_action !== 'delete' && (!(p.weekday >= 1 && p.weekday <= 7) || !(p.end_time > p.start_time))) fail('Check the day and times.');
      if (String(p_reason || '').trim().length < 5) fail('Please give a reason for the change.');
      return db.insert('timetable_change_requests', { action: p_action, slot_id: p_slot_id || null, class_id: p_class_id, proposed: p, reason: p_reason.trim(), status: 'pending', teacher_id: myTeacherId(), requested_by: me()?.id });
    },
    review_timetable_change({ p_id, p_approve, p_note }) {
      assertAdmin();
      const r = db.find('timetable_change_requests', p_id);
      if (!r || r.status !== 'pending') fail('Request not found or already handled.');
      const p = r.proposed || {};
      if (p_approve) {
        if (r.action === 'create') db.insert('timetable_slots', { class_id: r.class_id, weekday: Number(p.weekday), start_time: p.start_time, end_time: p.end_time, room: nz(p.room), teacher_id: r.teacher_id, notes: nz(p.notes), is_active: true });
        else if (r.action === 'update') Object.assign(db.find('timetable_slots', r.slot_id) || {}, { weekday: Number(p.weekday), start_time: p.start_time, end_time: p.end_time, room: nz(p.room), notes: nz(p.notes) });
        else Object.assign(db.find('timetable_slots', r.slot_id) || {}, { is_active: false });
      }
      Object.assign(r, { status: p_approve ? 'approved' : 'rejected', reviewed_by: me()?.id, review_note: nz(p_note), reviewed_at: now() });
      audit('review_timetable_change', 'timetable_change_requests', r.id, { approve: !!p_approve });
      return r;
    },

    // ---------------- Poll ----------------
    get_my_polls() {
      purgePolls();
      if (!myStudentId() || setting('poll').enabled === false) return [];
      const limit = Date.now() + pollHours() * 3600e3;
      return [...new Set(myClassIds(false))].map((cid) => {
        const c = db.find('classes', cid); const st = nextClassStart(cid);
        if (!c || !st || st.getTime() > limit) return null;
        const mine = T.class_poll_responses.find((r) => r.class_id === cid && r.student_id === myStudentId() && r.starts_at === st.toISOString());
        return { class_id: cid, title_en: c.title_en, title_ta: c.title_ta, starts_at: st.toISOString(), my_answer: mine ? mine.answer : null };
      }).filter(Boolean);
    },
    answer_class_poll({ p_class_id, p_answer }) {
      purgePolls();
      if (!myStudentId() || !myClassIds(false).includes(p_class_id)) fail('You are not enrolled in this class.');
      const st = nextClassStart(p_class_id);
      if (!st || st.getTime() > Date.now() + pollHours() * 3600e3) fail('This poll is not open yet.');
      const key = st.toISOString();
      const ex = T.class_poll_responses.find((r) => r.class_id === p_class_id && r.student_id === myStudentId() && r.starts_at === key);
      if (ex) Object.assign(ex, { answer: !!p_answer, created_at: now() });
      else db.insert('class_poll_responses', { class_id: p_class_id, session_date: key.slice(0, 10), starts_at: key, student_id: myStudentId(), answer: !!p_answer });
      return { ok: true, starts_at: key };
    },
    get_poll_counts() {
      purgePolls();
      if (!(isStaff() || (myTeacherId() && hasPerm('poll_view')))) fail('Not allowed.');
      const limit = Date.now() + pollHours() * 3600e3;
      const ids = isStaff() ? T.classes.filter((c) => c.is_active).map((c) => c.id) : myTeacherClassIds();
      return ids.map((cid) => {
        const c = db.find('classes', cid); const st = nextClassStart(cid);
        if (!c || !st || st.getTime() > limit) return null;
        const rs = T.class_poll_responses.filter((r) => r.class_id === cid && r.starts_at === st.toISOString());
        return { class_id: cid, title_en: c.title_en, grade: c.grade, starts_at: st.toISOString(), yes: rs.filter((r) => r.answer).length, no: rs.filter((r) => !r.answer).length,
          enrolled: T.enrollments.filter((e) => e.class_id === cid && LIVE.includes(e.status)).length };
      }).filter(Boolean).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },

    // ---------------- Teacher content ----------------
    submit_recording({ p }) {
      if (!myTeacherId() || !hasPerm('content_submit')) fail('Not allowed.');
      if (!p.class_id || !myTeacherClassIds().includes(p.class_id)) fail('Choose one of your own classes.');
      if (!LINK.test(p.drive_url || '')) fail('Use a Google Drive, YouTube, Zoom, OneDrive or Dropbox https link.');
      return db.insert('recordings', { class_id: p.class_id, title_en: String(p.title_en || '').trim(), title_ta: nz(p.title_ta), drive_url: p.drive_url.trim(), recorded_on: p.recorded_on || today(), topic: nz(p.topic), expires_at: nz(p.expires_at), is_published: true, status: 'pending', teacher_id: myTeacherId(), submitted_by: me()?.id, delete_requested: false });
    },
    submit_resource({ p }) {
      if (!myTeacherId() || !hasPerm('content_submit')) fail('Not allowed.');
      if (p.class_id && !myTeacherClassIds().includes(p.class_id)) fail('Choose one of your own classes.');
      if (!LINK.test(p.url || '')) fail('Use a Google Drive, YouTube, Telegram, OneDrive or Dropbox https link.');
      return db.insert('resources', { title_en: String(p.title_en || '').trim(), title_ta: nz(p.title_ta), description: nz(p.description), kind: p.kind || 'link', url: p.url.trim(), topic: nz(p.topic), grade: nz(p.grade), subject_id: p.subject_id || null, class_id: p.class_id || null, access: p.access || 'free', expires_at: nz(p.expires_at), status: 'pending', teacher_id: myTeacherId(), submitted_by: me()?.id, delete_requested: false, sort_order: 100 });
    },
    submit_teacher_media({ p }) {
      if (!myTeacherId()) fail('Not allowed.');
      if (!LINK.test(p.url || '')) fail('Use a YouTube, Zoom or Google Meet https link.');
      return db.insert('teacher_media', { teacher_id: myTeacherId(), kind: p.kind || 'youtube', title: String(p.title || '').trim(), url: p.url.trim(), starts_at: nz(p.starts_at), status: 'pending', submitted_by: me()?.id });
    },
    teacher_delete_content({ p_table, p_id }) {
      if (!myTeacherId()) fail('Not allowed.');
      if (!['recordings', 'resources', 'teacher_media'].includes(p_table)) fail('Invalid item.');
      const r = db.find(p_table, p_id);
      if (!r || r.teacher_id !== myTeacherId()) fail('You can only remove your own items.');
      if (['pending', 'rejected'].includes(r.status)) { db.t[p_table] = T[p_table].filter((x) => x.id !== p_id); return 'deleted'; }
      if (p_table === 'teacher_media') fail('Ask the admin to remove approved videos.');
      r.delete_requested = true; return 'delete_requested';
    },
    review_content({ p_table, p_id, p_action, p_note }) {
      assertAdmin();
      if (!['recordings', 'resources', 'teacher_media', 'reviews'].includes(p_table)) fail('Invalid item.');
      if (p_action === 'delete') db.t[p_table] = T[p_table].filter((x) => x.id !== p_id);
      else if (['approve', 'reject'].includes(p_action)) {
        const r = db.find(p_table, p_id) || fail('Item not found.');
        Object.assign(r, { status: p_action === 'approve' ? 'approved' : 'rejected', reviewed_by: me()?.id });
        if (['recordings', 'resources'].includes(p_table)) Object.assign(r, { review_note: nz(p_note), delete_requested: false });
        if (p_table === 'reviews') r.reviewed_at = now();
      } else fail('Invalid action.');
      audit('review_content', p_table, p_id, { action: p_action, note: p_note });
      return p_action;
    },

    // ---------------- Profile ----------------
    update_my_profile({ p_full_name, p_photo_path }) {
      const sid = myStudentId() || fail('Only students can use this.');
      const s = db.find('students', sid);
      if (p_full_name != null && (String(p_full_name).trim().length < 2 || String(p_full_name).trim().length > 120)) fail('Enter your full name.');
      if (nz(p_full_name)) s.full_name = p_full_name.trim();
      if (p_photo_path != null) s.photo_path = p_photo_path || null;
      const p = me(); ctx.setProfile({ ...p, full_name: s.full_name });
      audit('update_my_profile', 'students', s.id, { name: p_full_name, photo: p_photo_path != null });
      return s;
    },
    request_profile_change({ p_changes }) {
      const sid = myStudentId(); const tid = myTeacherId();
      let allowed; let cur;
      if (sid) { allowed = ['email', 'phone', 'whatsapp', 'guardian_phone', 'guardian_name', 'address', 'school']; cur = db.find('students', sid); }
      else if (tid) { allowed = ['display_name', 'bio_en', 'bio_ta', 'headline_en', 'headline_ta', 'specialties', 'linkedin_url', 'facebook_url', 'youtube_url', 'website_url', 'photo_url']; cur = db.find('teachers', tid); }
      else fail('Not allowed.');
      const diff = {};
      Object.entries(p_changes || {}).forEach(([k, v]) => {
        if (!allowed.includes(k)) fail(`The field ${k} cannot be changed here.`);
        if (['phone', 'whatsapp', 'guardian_phone'].includes(k) && v && !PHONE.test(v)) fail('Enter a valid Sri Lankan mobile number (94XXXXXXXXX).');
        if (k === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) fail('Enter a valid email address.');
        if (k.endsWith('_url') && v && !/^https:\/\//i.test(v)) fail('Links must start with https://');
        if (JSON.stringify(cur[k] ?? null) !== JSON.stringify(v ?? null)) diff[k] = { from: cur[k] ?? null, to: v ?? null };
      });
      if (!Object.keys(diff).length) fail('Nothing changed.');
      if (T.profile_change_requests.some((r) => r.status === 'pending' && ((sid && r.student_id === sid) || (tid && r.teacher_id === tid)))) fail('You already have a change request waiting for approval.');
      return db.insert('profile_change_requests', { subject_type: sid ? 'student' : 'teacher', student_id: sid || null, teacher_id: tid || null, changes: diff, status: 'pending', requested_by: me()?.id });
    },
    review_profile_change({ p_id, p_approve, p_note }) {
      assertAdmin();
      const r = db.find('profile_change_requests', p_id);
      if (!r || r.status !== 'pending') fail('Request not found or already handled.');
      if (p_approve) {
        const target = db.find(r.subject_type === 'student' ? 'students' : 'teachers', r.student_id || r.teacher_id);
        Object.entries(r.changes).forEach(([k, v]) => { target[k] = v.to === '' ? null : v.to; });
      }
      Object.assign(r, { status: p_approve ? 'approved' : 'rejected', reviewed_by: me()?.id, review_note: nz(p_note), reviewed_at: now() });
      audit('review_profile_change', 'profile_change_requests', r.id, { approve: !!p_approve, changes: r.changes });
      return r;
    },

    // ---------------- Safety-net deletes ----------------
    delete_settlement({ p_id, p_reason }) {
      assertAdmin();
      if (!nz(p_reason)) fail('A reason is required.');
      const s = db.find('teacher_settlements', p_id) || fail('Settlement not found.');
      if (s.status === 'paid') fail('A PAID settlement cannot be deleted — money has already left the bank.');
      audit('delete_settlement', 'teacher_settlements', s.id, { reason: p_reason, snapshot: { ...s } });
      db.t.teacher_settlements = T.teacher_settlements.filter((x) => x.id !== p_id);
      return true;
    },
    delete_cash_reconciliation({ p_id, p_reason }) {
      assertAdmin();
      if (!nz(p_reason)) fail('A reason is required.');
      const c = db.find('cash_reconciliations', p_id) || fail('Reconciliation not found.');
      audit('delete_cash_reconciliation', 'cash_reconciliations', c.id, { reason: p_reason, snapshot: { ...c } });
      db.t.cash_reconciliations = T.cash_reconciliations.filter((x) => x.id !== p_id);
      return true;
    },

    get_dashboard_stats() {
      const s = base.get_dashboard_stats();
      return {
        ...s,
        pending_reviews: T.reviews.filter((r) => r.status === 'pending').length,
        open_complaints: T.complaints.filter((c) => ['new', 'in_progress'].includes(c.status)).length,
        new_feedback: T.audience_feedback.filter((f) => f.status === 'new').length,
        pending_requests: T.profile_change_requests.filter((r) => r.status === 'pending').length
          + T.attendance_disputes.filter((r) => r.status === 'pending').length
          + T.timetable_change_requests.filter((r) => r.status === 'pending').length
          + T.recordings.filter((r) => r.status === 'pending' || r.delete_requested).length
          + T.resources.filter((r) => r.status === 'pending' || r.delete_requested).length
          + T.teacher_media.filter((r) => r.status === 'pending').length
      };
    }
  };
  return rpc;
}
