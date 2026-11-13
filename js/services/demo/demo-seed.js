/** Sample data for DEMO MODE only. Built through the same RPC functions so every record is consistent. */
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const isoDow = (d) => ((d.getDay() + 6) % 7) + 1;
/** k-th most recent past date (k=1 → last one before today) that falls on ISO weekday `dow`. */
const lastDow = (dow, k) => { const d = new Date(); d.setDate(d.getDate() - 1); while (isoDow(d) !== dow) d.setDate(d.getDate() - 1); d.setDate(d.getDate() - 7 * (k - 1)); return iso(d); };
const hoursFromNow = (h) => new Date(Date.now() + h * 3600e3).toISOString();

export function seedDemo(db, rpc) {
  const ins = (t, r) => db.insert(t, r);
  [
    ['admission_fee', { enabled: true, amount: 250 }, true],
    ['trial', { sessions: 2 }, true],
    ['billing', { billable_statuses: ['present', 'late'], min_payment_percent: 50, allow_partial: true }, false],
    ['commission', { intro_rate: 0, intro_student_cap: 20, standard_rate: 5 }, false],
    ['tax', { wht_enabled: false, wht_rate: 5, wht_threshold: 100000 }, false],
    ['bank', { bank_name: 'Commercial Bank', account_name: 'Mentora Learning Centre', account_number: '1000 2000 3000', branch: 'Negombo' }, true],
    ['contact', { whatsapp: '94770000000', phone: '+94 77 000 0000', email: 'hello@mentora.lk', address: 'Main Street, Negombo, Sri Lanka', hours: 'Mon–Sat · 8:00 AM – 8:00 PM' }, true],
    ['social', { facebook: 'https://www.facebook.com/', instagram: '', youtube: 'https://www.youtube.com/', tiktok: '', telegram: 'https://t.me/' }, true],
    ['map', { lat: 7.2083, lng: 79.8358, zoom: 15, label: 'Mentora Learning Centre, Negombo' }, true],
    ['poll', { enabled: true, hours_before: 24 }, true],
    ['permissions', { cashier: { students_edit: true, enrollments_manage: true, attendance_mark: true, payments_record: true, timetable_view: true, reports_view: true }, teacher: { attendance_mark: true, roster_view: true, student_contacts_view: false, earnings_view: true, content_submit: true, timetable_request: true, poll_view: true, reviews_view: true } }, false]
  ].forEach(([key, value, is_public]) => ins('app_settings', { key, value, is_public }));

  const subj = {};
  [
    ['M', 'Mathematics', 'கணிதம்', 'Concept-first lessons, past papers and weekly practice for Grades 6–11.', 'தரம் 6–11 க்கான அடிப்படை விளக்கம், கடந்தகால வினாத்தாள்கள் மற்றும் வாராந்திர பயிற்சி.', 'bi-calculator', ['6', '7', '8', '9', '10', '11']],
    ['C', 'Combined Mathematics', 'இணைந்த கணிதம்', 'A/L pure and applied mathematics with structured revision.', 'உயர்தர தூய மற்றும் பிரயோக கணிதம், திட்டமிட்ட மீட்டல் வகுப்புகளுடன்.', 'bi-graph-up', ['12', '13']],
    ['I', 'ICT', 'தகவல் தொடர்பாடல் தொழில்நுட்பம்', 'O/L and A/L ICT theory with hands-on practical sessions.', 'சாதாரண மற்றும் உயர்தர ICT கோட்பாடு, செய்முறை பயிற்சிகளுடன்.', 'bi-pc-display', ['9', '10', '11', '12', '13']],
    ['S', 'Science', 'விஞ்ஞானம்', 'Physics, chemistry and biology foundations for O/L success.', 'சாதாரண தர வெற்றிக்கான பௌதிகவியல், இரசாயனவியல், உயிரியல் அடிப்படைகள்.', 'bi-radioactive', ['6', '7', '8', '9', '10', '11']],
    ['E', 'English Language', 'ஆங்கில மொழி', 'Grammar, writing and spoken English for every grade.', 'அனைத்து தரங்களுக்கும் இலக்கணம், எழுத்து மற்றும் பேச்சு ஆங்கிலம்.', 'bi-translate', ['6', '7', '8', '9', '10', '11', '12', '13']],
    ['P', 'Physics', 'பௌதிகவியல்', 'A/L physics theory, problem solving and model papers.', 'உயர்தர பௌதிகவியல் கோட்பாடு, கணக்கீடுகள் மற்றும் மாதிரி வினாத்தாள்கள்.', 'bi-lightning-charge', ['12', '13']]
  ].forEach(([code, en, ta, den, dta, icon, grades], i) => {
    subj[code] = ins('subjects', { code, name_en: en, name_ta: ta, description_en: den, description_ta: dta, icon, grades, sort_order: i + 1, is_active: true });
  });

  const teacher = (o, quals, subjects) => {
    const t = ins('teachers', { status: 'active', is_public: true, ...o });
    quals.forEach(([title, institution, year, v]) => ins('teacher_qualifications', { teacher_id: t.id, title, institution, year, is_verified: v, is_public: true, verified_at: v ? new Date().toISOString() : null }));
    subjects.forEach(([code, grades]) => ins('teacher_subjects', { teacher_id: t.id, subject_id: subj[code].id, grades }));
    return t;
  };
  const t1 = teacher({ full_name: 'Sivakumar Rajendran', display_name: 'Mr. S. Rajendran', phone: '94771234567', experience_years: 12, headline_en: 'O/L & A/L Mathematics · 12 years · exam-focused', headline_ta: 'சா/த & உ/த கணிதம் · 12 ஆண்டுகள் · பரீட்சை நோக்கு', specialties: ['Algebra', 'Geometry', 'Past papers', 'Combined Maths'], linkedin_url: 'https://www.linkedin.com/', youtube_url: 'https://www.youtube.com/@khanacademy', bio_en: 'Mathematics teacher known for clear explanations and exam-focused practice.', bio_ta: 'தெளிவான விளக்கங்களும் பரீட்சை நோக்கிய பயிற்சிகளும் வழங்கும் கணித ஆசிரியர்.', mediums: ['english', 'tamil'], class_modes: ['physical', 'online'], bank_name: 'Commercial Bank', bank_account_name: 'S Rajendran', bank_account_number: '8001234567' },
    [['BSc (Hons) Mathematics', 'University of Jaffna', 2011, true], ['PGDE', 'Open University of Sri Lanka', 2014, true]], [['M', ['9', '10', '11']], ['C', ['12', '13']]]);
  const t2 = teacher({ full_name: 'Nadeesha Fernando', display_name: 'Ms. N. Fernando', phone: '94772345678', experience_years: 7, headline_en: 'ICT specialist · practical, project-based lessons', headline_ta: 'ICT நிபுணர் · செய்முறை அடிப்படையிலான பாடங்கள்', specialties: ['Programming', 'Databases', 'Networking', 'Practicals'], linkedin_url: 'https://www.linkedin.com/', website_url: 'https://www.example.com/', bio_en: 'ICT specialist who teaches through practical, project-based lessons.', bio_ta: 'செய்முறை மற்றும் திட்ட அடிப்படையிலான பாடங்கள் மூலம் கற்பிக்கும் ICT நிபுணர்.', mediums: ['english', 'sinhala'], class_modes: ['physical', 'online'] },
    [['BSc in Information Technology', 'University of Moratuwa', 2016, true]], [['I', ['10', '11', '12', '13']]]);
  const t3 = teacher({ full_name: 'Fathima Rizna', display_name: 'Ms. F. Rizna', phone: '94773456789', experience_years: 5, headline_en: 'Science & spoken English for young learners', headline_ta: 'இளம் மாணவர்களுக்கான விஞ்ஞானம் & பேச்சு ஆங்கிலம்', specialties: ['Biology', 'Spoken English', 'Confidence building'], facebook_url: 'https://www.facebook.com/', bio_en: 'Science and English teacher focused on confidence-building for young learners.', bio_ta: 'இளம் மாணவர்களின் தன்னம்பிக்கையை வளர்க்கும் விஞ்ஞானம் மற்றும் ஆங்கில ஆசிரியர்.', mediums: ['tamil', 'english'], class_modes: ['physical'] },
    [['BSc Biological Science', 'Eastern University', 2018, true], ['Diploma in English', 'British Council', 2019, false]], [['S', ['6', '7', '8', '9']], ['E', ['6', '7', '8']]]);

  const klass = (o, teachers, priv = {}) => {
    const c = ins('classes', { is_public: true, is_active: true, trial_enabled: true, class_type: 'group', ...o });
    ins('class_private', { class_id: c.id, paid_group_link: priv.paid || 'https://chat.whatsapp.com/demo-paid-group', online_meeting_link: priv.online || null });
    teachers.forEach(([t, pct, primary]) => ins('class_teachers', { class_id: c.id, teacher_id: t.id, allocation_percent: pct, is_primary: !!primary }));
    return c;
  };
  const cMath10 = klass({ subject_id: subj.M.id, title_en: 'Grade 10 Mathematics', title_ta: 'தரம் 10 கணிதம்', grade: '10', medium: 'english', class_mode: 'physical', schedule_en: 'Saturday · 8:00 – 10:00 AM', schedule_ta: 'சனி · காலை 8:00 – 10:00', location: 'Mentora Hall A, Negombo', rate_per_session: 1000, trial_group_link: 'https://chat.whatsapp.com/demo-trial-math' }, [[t1, 100, true]]);
  const cIct = klass({ subject_id: subj.I.id, title_en: 'O/L ICT (Tamil medium)', title_ta: 'சா/த ICT (தமிழ் மொழி மூலம்)', grade: '11', medium: 'tamil', class_mode: 'physical', schedule_en: 'Sunday · 2:00 – 4:00 PM', schedule_ta: 'ஞாயிறு · மதியம் 2:00 – 4:00', location: 'Mentora Lab, Negombo', rate_per_session: 800, trial_group_link: 'https://chat.whatsapp.com/demo-trial-ict' }, [[t2, 70, true], [t1, 30]]);
  const cCm = klass({ subject_id: subj.C.id, title_en: 'A/L Combined Mathematics', title_ta: 'உ/த இணைந்த கணிதம்', grade: '12', medium: 'tamil', class_mode: 'physical', schedule_en: 'Wednesday · 3:30 – 6:30 PM', schedule_ta: 'புதன் · மாலை 3:30 – 6:30', location: 'Mentora Hall B, Negombo', rate_per_session: 1500, trial_group_link: '' }, [[t1, 100, true]]);
  const cIctAl = klass({ subject_id: subj.I.id, title_en: 'A/L ICT Online', title_ta: 'உ/த ICT இணையவழி', grade: '13', medium: 'english', class_mode: 'online', schedule_en: 'Thursday · 7:00 – 9:00 PM', schedule_ta: 'வியாழன் · இரவு 7:00 – 9:00', location: 'Zoom / Google Meet', rate_per_session: 1200, trial_enabled: false }, [[t2, 100, true]], { online: 'https://meet.google.com/demo-link' });
  const cSci = klass({ subject_id: subj.S.id, title_en: 'Grade 8 Science', title_ta: 'தரம் 8 விஞ்ஞானம்', grade: '8', medium: 'tamil', class_mode: 'physical', schedule_en: 'Saturday · 10:30 AM – 12:30 PM', schedule_ta: 'சனி · காலை 10:30 – மதியம் 12:30', location: 'Mentora Hall A, Negombo', rate_per_session: 700, trial_group_link: 'https://chat.whatsapp.com/demo-trial-science' }, [[t3, 100, true]]);
  const cEng = klass({ subject_id: subj.E.id, title_en: 'Spoken English (Grades 6–8)', title_ta: 'பேச்சு ஆங்கிலம் (தரம் 6–8)', grade: '7', medium: 'english', class_mode: 'hybrid', schedule_en: 'Friday · 4:00 – 5:30 PM', schedule_ta: 'வெள்ளி · மாலை 4:00 – 5:30', location: 'Mentora Hall C / Online', rate_per_session: 600, trial_group_link: 'https://chat.whatsapp.com/demo-trial-english' }, [[t3, 100, true]]);

  // Weekly timetable (1 = Monday … 7 = Sunday). Attendance checks dates against this.
  const slot = (c, weekday, start_time, end_time, room, tch, notes = null) => ins('timetable_slots', { class_id: c.id, weekday, start_time, end_time, room, teacher_id: tch.id, is_active: true, notes });
  slot(cMath10, 6, '08:00', '10:00', 'Hall A', t1);
  slot(cIct, 7, '14:00', '16:00', 'Lab', t2);
  slot(cCm, 3, '15:30', '18:30', 'Hall B', t1);
  slot(cIctAl, 4, '19:00', '21:00', 'Online', t2);
  slot(cSci, 6, '10:30', '12:30', 'Hall A', t3);
  slot(cEng, 5, '16:00', '17:30', 'Hall C', t3);
  // A revision clinic ~20 hours from now, so the "Will you join tomorrow?" poll is visible in the demo.
  { const r = new Date(Date.now() + 20 * 3600e3); { const h = String(r.getHours()).padStart(2, '0'); slot(cMath10, isoDow(r), `${h}:00`, `${String(Math.min(23, r.getHours() + 1)).padStart(2, '0')}:30`, 'Hall A', t1, 'Revision clinic'); } }

  const student = (o) => ins('students', { status: 'active', guardian_consent: true, guardian_consent_at: new Date().toISOString(), ...o });
  const s1 = student({ full_name: 'Kavin Sivakumar', grade: '10', school: 'Maris Stella College', phone: '94761112233', email: 'student@mentora.demo', guardian_name: 'R. Sivakumar', guardian_phone: '94761112233', guardian_relationship: 'Father', referral_sources: ['friends'] });
  const s2 = student({ full_name: 'Tharushi Perera', grade: '10', school: 'Newstead Girls College', phone: '94762223344', guardian_name: 'M. Perera', guardian_phone: '94762223344', guardian_relationship: 'Mother', referral_sources: ['social_media'] });
  const s3 = student({ full_name: 'Nithya Rajkumar', grade: '11', school: 'Hindu College', phone: '94763334455', guardian_name: 'K. Rajkumar', guardian_phone: '94763334455', guardian_relationship: 'Father', referral_sources: ['whatsapp'] });
  const s4 = student({ full_name: 'Aadhil Rizwan', grade: '11', school: 'Al-Hilal Central College', phone: '94764445566', guardian_name: 'M. Rizwan', guardian_phone: '94764445566', guardian_relationship: 'Father', referral_sources: ['google'] });

  // Kavin & Tharushi: paid Grade 10 Maths
  const e1 = rpc.create_enrollment({ p_student_id: s1.id, p_class_id: cMath10.id, p_as_trial: false });
  rpc.record_cash_payment({ p_student_id: s1.id, p_amount: 250, p_paid_on: daysAgo(40), p_method: 'cash', p_notes: 'Admission fee' });
  rpc.approve_enrollment({ p_enrollment_id: e1.id, p_paid_from: daysAgo(40) });
  const e2 = rpc.create_enrollment({ p_student_id: s2.id, p_class_id: cMath10.id, p_as_trial: false });
  rpc.record_cash_payment({ p_student_id: s2.id, p_amount: 150, p_paid_on: daysAgo(38), p_method: 'representative_cash', p_collector_name: 'Mr. S. Rajendran (authorised)' });
  rpc.approve_enrollment({ p_enrollment_id: e2.id, p_paid_from: daysAgo(38) });

  // Kavin trial in ICT (completed) · Nithya trial in ICT (1 of 2) · Aadhil admission requested
  const e3 = rpc.create_enrollment({ p_student_id: s1.id, p_class_id: cIct.id, p_as_trial: true });
  const e4 = rpc.create_enrollment({ p_student_id: s3.id, p_class_id: cIct.id, p_as_trial: true });
  const e5 = rpc.create_enrollment({ p_student_id: s4.id, p_class_id: cIct.id, p_as_trial: false });

  [5, 4, 3, 2, 1].forEach((k, i) => {
    const n = k === 3 ? 21 : k === 2 ? 14 : 0;
    const ses = rpc.upsert_session({ p_class_id: cMath10.id, p_session_date: lastDow(6, k), p_topic: ['Algebraic fractions', 'Simultaneous equations', 'Geometry: circles', 'Statistics', 'Revision paper'][i] });
    rpc.mark_attendance({ p_session_id: ses.id, p_rows: [{ enrollment_id: e1.id, status: n === 21 ? 'absent' : 'present' }, { enrollment_id: e2.id, status: n === 14 ? 'late' : 'present' }] });
  });
  [2, 1].forEach((k, i) => {
    const ses = rpc.upsert_session({ p_class_id: cIct.id, p_session_date: lastDow(7, k), p_topic: ['Number systems', 'Logic gates'][i] });
    const rows = [{ enrollment_id: e3.id, status: 'present' }];
    if (i === 1) rows.push({ enrollment_id: e4.id, status: 'present' });
    rows.push({ enrollment_id: e5.id, status: 'present' });
    rpc.mark_attendance({ p_session_id: ses.id, p_rows: rows });
  });

  rpc.record_cash_payment({ p_student_id: s1.id, p_amount: 2000, p_paid_on: daysAgo(1), p_method: 'cash', p_notes: 'Monthly fees (partial)' });
  const bank = rpc.create_bank_payment({ p_student_id: s2.id, p_amount: 2000, p_paid_on: daysAgo(1) });
  rpc.mark_receipt_sent({ p_payment_id: bank.id });

  ins('student_enquiries', { student_name: 'Lakshan Jeyaraj', guardian_name: 'P. Jeyaraj', phone: '94765556677', subject_id: subj.C.id, subject_name: 'Combined Mathematics', grade: '12', medium: 'tamil', class_mode: 'physical', class_type: 'free_trial', preferred_join_date: daysAgo(-7), referral_sources: ['social_media', 'friends'], consent: true, status: 'new', whatsapp_opened_at: new Date().toISOString(), language: 'ta' });
  ins('student_enquiries', { student_name: 'Sanduni Silva', guardian_name: 'A. Silva', phone: '94766667788', subject_id: subj.E.id, subject_name: 'English Language', grade: '7', medium: 'english', class_mode: 'hybrid', class_type: 'group', referral_sources: ['google'], consent: true, status: 'contacted', admin_notes: 'Called on Monday — will visit Friday.', language: 'en' });
  ins('teacher_applications', { full_name: 'Priya Kandasamy', phone: '94767778899', whatsapp: '94767778899', email: 'priya@example.com', living_place: 'Wattala', subject_ids: [subj.P.id, subj.S.id], subject_names: 'Physics, Science', grades: ['10', '11', '12', '13'], mediums: ['tamil', 'english'], class_types: ['group', 'revision'], class_modes: ['physical', 'online'], qualifications: 'BSc Physical Science (University of Colombo)', experience_years: 4, experience_details: '4 years at a private institute in Colombo.', available_days: ['sat', 'sun'], preferred_times: ['morning', 'afternoon'], additional_info: 'Can prepare model papers.', status: 'new', certificate_paths: [] });

  ins('notices', { title_en: 'Term test revision week', title_ta: 'தவணைப் பரீட்சை மீட்டல் வாரம்', body_en: 'All Grade 10 & 11 classes will run revision papers next week. Bring your past-paper books.', body_ta: 'அடுத்த வாரம் தரம் 10 மற்றும் 11 வகுப்புகளில் மீட்டல் வினாத்தாள்கள் நடைபெறும். கடந்தகால வினாத்தாள் புத்தகங்களைக் கொண்டு வாருங்கள்.', is_published: true, published_at: new Date().toISOString() });
  ins('notices', { title_en: 'Poya day — no classes', title_ta: 'போயா தினம் — வகுப்புகள் இல்லை', body_en: 'The centre is closed on the upcoming Poya day. Sessions will be rescheduled.', body_ta: 'வரவிருக்கும் போயா தினத்தில் நிலையம் மூடப்பட்டிருக்கும். வகுப்புகள் மீள் அட்டவணைப்படுத்தப்படும்.', is_published: true, class_id: cMath10.id, published_at: new Date().toISOString() });
  ins('recordings', { class_id: cMath10.id, title_en: 'Simultaneous equations — full lesson', title_ta: 'ஒருங்கமை சமன்பாடுகள் — முழுப் பாடம்', drive_url: 'https://drive.google.com/file/d/demo-recording/view', recorded_on: daysAgo(28), is_published: true });

  // ---- v2 sample data ----
  // More students so every status tab has an example.
  const s5 = student({ full_name: 'Dilan Mendis', grade: '8', school: 'St. Peter\'s College', phone: '94768889900', guardian_name: 'K. Mendis', guardian_phone: '94768889900', guardian_relationship: 'Mother', referral_sources: ['friends'] });
  const s6 = student({ full_name: 'Keerthana Murali', grade: '12', school: 'Vivekananda College', phone: '94769990011', guardian_name: 'S. Murali', guardian_phone: '94769990011', guardian_relationship: 'Father', referral_sources: ['whatsapp'] });
  const s7 = student({ full_name: 'Ruwan Jayasuriya', grade: '7', school: 'Ave Maria Convent', phone: '94760001122', guardian_name: 'L. Jayasuriya', guardian_phone: '94760001122', guardian_relationship: 'Mother', referral_sources: ['google'] });
  const paid = (st, c, d) => { const e = rpc.create_enrollment({ p_student_id: st.id, p_class_id: c.id, p_as_trial: false }); rpc.record_cash_payment({ p_student_id: st.id, p_amount: 250, p_paid_on: daysAgo(d), p_method: 'cash', p_notes: 'Admission fee' }); rpc.approve_enrollment({ p_enrollment_id: e.id, p_paid_from: daysAgo(d) }); return e; };
  const e6 = paid(s5, cSci, 60); rpc.set_enrollment_status({ p_enrollment_id: e6.id, p_status: 'withdrawn', p_reason: 'Family moved to Kandy' });
  const e7 = paid(s6, cCm, 50); rpc.set_enrollment_status({ p_enrollment_id: e7.id, p_status: 'suspended', p_reason: 'Fees overdue for two months' });
  const e8 = paid(s7, cEng, 120); rpc.set_enrollment_status({ p_enrollment_id: e8.id, p_status: 'completed', p_reason: 'Finished the 3-month spoken English course' });

  // Reviews (teacher feedback) + testimonials (teacher_id = null). Only approved ones are public.
  const rev = (teacher_id, reviewer_name, reviewer_role, grade, rating, comment, status = 'approved', featured = false, ago = 10) => ins('reviews', { teacher_id, reviewer_name, reviewer_role, grade, rating, comment, status, is_featured: featured, created_at: new Date(Date.now() - ago * 864e5).toISOString() });
  rev(t1.id, 'Kavin S.', 'student', '10', 5, 'Sir explains every step slowly and gives lots of past paper practice. My marks went up from 58 to 81.', 'approved', true, 6);
  rev(t1.id, 'R. Sivakumar', 'parent', '10', 5, 'Very disciplined class and regular progress updates on WhatsApp.', 'approved', false, 12);
  rev(t1.id, 'Nithya R.', 'student', '12', 4, 'Combined Maths applied section is much clearer now.', 'approved', false, 20);
  rev(t2.id, 'Aadhil R.', 'student', '11', 5, 'Practical lessons in the lab make ICT really fun.', 'approved', true, 8);
  rev(t2.id, 'M. Rizwan', 'parent', '11', 4, 'Good teacher, online sessions are well organised.', 'approved', false, 15);
  rev(t3.id, 'Ruwan J.', 'student', '7', 5, 'Miss helped me speak English without fear.', 'approved', false, 9);
  rev(t3.id, 'L. Jayasuriya', 'parent', '7', 5, 'My son now reads English story books on his own.', 'approved', false, 18);
  rev(t2.id, 'Anonymous', 'student', '13', 3, 'Please share more model papers.', 'pending', false, 1);
  rev(null, 'Mrs. M. Perera', 'parent', '10', 5, 'Clear fee statements and receipts every month — we always know what we paid for. Highly recommended in Negombo.', 'approved', true, 5);
  rev(null, 'Tharushi P.', 'student', '10', 5, 'The two free trial classes helped me choose the right Maths class before paying.', 'approved', true, 11);
  rev(null, 'K. Rajkumar', 'parent', '11', 4, 'Tamil medium ICT is hard to find. Mentora made it possible for my daughter.', 'approved', true, 16);
  rev(null, 'Sanduni S.', 'student', '7', 5, 'I love the Spoken English activities and the friendly teachers.', 'pending', false, 2);

  // Teacher media: YouTube lessons + free Zoom sessions (public on the teacher's page after approval).
  const tm = (teacher_id, kind, title, url, starts_at = null, status = 'approved') => ins('teacher_media', { teacher_id, kind, title, url, starts_at, status });
  tm(t1.id, 'youtube', 'Cramer\'s rule — solve simultaneous equations fast', 'https://www.youtube.com/watch?v=wnJ4jZt37Ak');
  tm(t1.id, 'youtube', 'Cross multiplication method', 'https://www.youtube.com/watch?v=KIXJM2qgKKw');
  tm(t1.id, 'free_session', 'Free O/L Maths revision seminar (Zoom)', 'https://zoom.us/j/0000000000', hoursFromNow(72));
  tm(t2.id, 'youtube', 'Introduction to number systems and binary', 'https://www.youtube.com/watch?v=ku4KOFQ-bB4');
  tm(t2.id, 'youtube', 'Number systems: decimal, binary, octal and hex', 'https://www.youtube.com/watch?v=FFDMzbrEXaE');
  tm(t2.id, 'free_session', 'Free A/L ICT paper discussion (Google Meet)', 'https://meet.google.com/demo-free', hoursFromNow(48));
  tm(t2.id, 'youtube', 'Logic gates crash course (waiting for approval)', 'https://www.youtube.com/watch?v=ku4KOFQ-bB4', null, 'pending');

  // Learning resources: free library (by grade / subject / topic) and enrolled-only class resources.
  const res = (o) => ins('resources', { status: 'approved', access: 'free', sort_order: 100, delete_requested: false, ...o });
  res({ title_en: 'Grade 10 Maths — 2024 term test paper', title_ta: 'தரம் 10 கணிதம் — 2024 தவணைப் பரீட்சை', kind: 'past_paper', url: 'https://drive.google.com/file/d/demo-paper/view', grade: '10', subject_id: subj.M.id, topic: 'Past papers' });
  res({ title_en: 'Algebra formula sheet', title_ta: 'அட்சரகணித சூத்திரத் தாள்', kind: 'short_note', url: 'https://drive.google.com/file/d/demo-note/view', grade: '10', subject_id: subj.M.id, topic: 'Algebra' });
  res({ title_en: 'Logic gates mind map', title_ta: 'தர்க்கப் படலைகள் மனவரைபடம்', kind: 'mindmap', url: 'https://drive.google.com/file/d/demo-mindmap/view', grade: '11', subject_id: subj.I.id, topic: 'Logic gates' });
  res({ title_en: 'Number systems explained (video)', title_ta: 'எண் முறைமைகள் விளக்கம் (காணொளி)', kind: 'youtube', url: 'https://www.youtube.com/watch?v=ku4KOFQ-bB4', grade: '11', subject_id: subj.I.id, topic: 'Number systems' });
  res({ title_en: 'Simultaneous equations — Cramer\'s rule', title_ta: 'ஒருங்கமை சமன்பாடுகள் — கிராமர் விதி', kind: 'youtube', url: 'https://www.youtube.com/watch?v=wnJ4jZt37Ak', grade: '10', subject_id: subj.M.id, topic: 'Algebra' });
  res({ title_en: 'Grade 10 Maths model paper (class only)', title_ta: 'தரம் 10 கணித மாதிரி வினாத்தாள் (வகுப்புக்கு மட்டும்)', kind: 'model_paper', url: 'https://drive.google.com/file/d/demo-model/view', grade: '10', subject_id: subj.M.id, class_id: cMath10.id, access: 'enrolled', topic: 'Model papers' });
  res({ title_en: 'ICT practical worksheet', title_ta: 'ICT செய்முறை பயிற்சித் தாள்', kind: 'short_note', url: 'https://drive.google.com/file/d/demo-ws/view', grade: '11', subject_id: subj.I.id, topic: 'Practicals', status: 'pending', teacher_id: t2.id });

  // Official community groups (WhatsApp / Telegram) by grade and subject.
  const grp = (o) => ins('community_links', { is_active: true, sort_order: 100, ...o });
  grp({ title_en: 'Mentora official Telegram — all grades', title_ta: 'Mentora உத்தியோகபூர்வ Telegram — அனைத்து தரங்கள்', platform: 'telegram', url: 'https://t.me/', sort_order: 1 });
  grp({ title_en: 'Grade 10 Mathematics resources', title_ta: 'தரம் 10 கணித வளங்கள்', platform: 'whatsapp', url: 'https://chat.whatsapp.com/demo-g10-math', grade: '10', subject_id: subj.M.id });
  grp({ title_en: 'O/L ICT papers & notes', title_ta: 'சா/த ICT வினாத்தாள்கள் & குறிப்புகள்', platform: 'telegram', url: 'https://t.me/', grade: '11', subject_id: subj.I.id });
  grp({ title_en: 'Mentora YouTube channel', title_ta: 'Mentora YouTube அலைவரிசை', platform: 'youtube', url: 'https://www.youtube.com/', sort_order: 2 });

  // Class recordings: one for all classes, one with a deadline.
  ins('recordings', { class_id: null, title_en: 'How to use the student portal (all classes)', title_ta: 'மாணவர் தளத்தைப் பயன்படுத்துவது எப்படி (அனைத்து வகுப்புகள்)', drive_url: 'https://www.youtube.com/watch?v=ku4KOFQ-bB4', recorded_on: daysAgo(3), is_published: true, status: 'approved', topic: 'Orientation' });
  ins('recordings', { class_id: cMath10.id, title_en: 'Statistics revision — available for 2 weeks', title_ta: 'புள்ளிவிபரவியல் மீட்டல் — 2 வாரங்களுக்கு', drive_url: 'https://drive.google.com/file/d/demo-stat/view', recorded_on: daysAgo(7), is_published: true, status: 'approved', topic: 'Statistics', teacher_id: t1.id, expires_at: new Date(Date.now() + 14 * 864e5).toISOString() });
  ins('recordings', { class_id: cIct.id, title_en: 'Logic gates lesson (submitted by teacher)', title_ta: 'தர்க்கப் படலைகள் பாடம் (ஆசிரியர் சமர்ப்பித்தது)', drive_url: 'https://drive.google.com/file/d/demo-lg/view', recorded_on: daysAgo(2), is_published: true, status: 'pending', teacher_id: t2.id, topic: 'Logic gates' });

  // Survey answers, a complaint and pending requests for the Approvals inbox.
  ins('audience_feedback', { name: 'S. Fernando', role: 'parent', grade: '9', needs: ['past_papers', 'weekend_classes'], rating: 4, improve: 'Please add Sinhala medium Science.', ideas: 'Monthly parent meeting online.', contact: '94771112222', status: 'new' });
  ins('audience_feedback', { name: null, role: 'student', grade: '12', needs: ['model_papers', 'recordings', 'mind_maps'], rating: 5, improve: 'More A/L Physics paper classes.', ideas: 'Telegram group for each subject.', contact: null, status: 'new' });
  rpc.submit_complaint({ p: { name: 'A. Silva', phone: '94766667788', category: 'facility', subject: 'Hall C is too warm', details: 'The fan in Hall C was not working during the Friday class.' } });
  ins('profile_change_requests', { subject_type: 'student', student_id: s2.id, changes: { phone: { from: s2.phone, to: '94771239876' }, guardian_phone: { from: s2.guardian_phone, to: '94771239876' } }, status: 'pending' });
  const lastAtt = db.t.attendance.find((a) => a.student_id === s1.id && a.status === 'absent');
  if (lastAtt) ins('attendance_disputes', { attendance_id: lastAtt.id, student_id: s1.id, class_id: lastAtt.class_id, session_id: lastAtt.session_id, current_status: 'absent', requested_status: 'present', reason: 'I was in the class but came in late from the back door.', status: 'pending' });
  ins('timetable_change_requests', { action: 'update', slot_id: db.t.timetable_slots.find((x) => x.class_id === cIct.id).id, class_id: cIct.id, proposed: { weekday: 7, start_time: '15:00', end_time: '17:00', room: 'Lab' }, reason: 'Students asked for a later start because of Sunday school.', status: 'pending', teacher_id: t2.id });
  // A paid statement for last month so the teacher "Earnings" page has something real to show.
  { const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth() - 1); const pm = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`;
    const lines = [{ class_id: cMath10.id, student_id: s1.id, class_code: cMath10.title_en, student_code: s1.student_code, revenue: 2000, rate: 0, commission: 0 }, { class_id: cMath10.id, student_id: s2.id, class_code: cMath10.title_en, student_code: s2.student_code, revenue: 2000, rate: 0, commission: 0 }, { class_id: cCm.id, student_id: s3.id, class_code: cCm.title_en, student_code: s3.student_code, revenue: 3000, rate: 0, commission: 0 }];
    ins('teacher_settlements', { teacher_id: t1.id, period_month: pm, gross_revenue: 7000, adjustments: 0, commission_amount: 0, statutory_deductions: 0, net_payable: 7000, status: 'paid', bank_reference: 'BOC-DEMO-1023', settlement_date: `${pm.slice(0, 8)}28`, notes: 'First eligible month — 0% commission (intro offer).', details: { is_first_eligible_month: true, lines } }); }
}
