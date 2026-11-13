-- =====================================================================
-- Mentora Learning Centre — starter data (run AFTER migrations 001, 002, 003, 004a, 004b, 004c, 004d)
-- Safe to run more than once: existing rows are left untouched.
-- Change the bank/contact values later in Admin → Settings.
-- =====================================================================

insert into public.app_settings (key, value, is_public) values
  ('admission_fee', '{"enabled": true, "amount": 250}', true),
  ('trial',         '{"sessions": 2}', true),
  ('billing',       '{"billable_statuses": ["present", "late"], "min_payment_percent": 50, "allow_partial": true}', false),
  ('commission',    '{"intro_rate": 0, "intro_student_cap": 20, "standard_rate": 5}', false),
  ('tax',           '{"wht_enabled": false, "wht_rate": 5, "wht_threshold": 100000}', false),
  ('bank',          '{"bank_name": "YOUR BANK", "account_name": "Mentora Learning Centre", "account_number": "0000 0000 0000", "branch": "Negombo"}', true),
  ('contact',       '{"whatsapp": "94770000000", "phone": "+94 77 000 0000", "email": "hello@mentora.lk", "address": "Main Street, Negombo, Sri Lanka", "hours": "Mon–Sat · 8:00 AM – 8:00 PM"}', true)
on conflict (key) do nothing;

insert into public.subjects (code, name_en, name_ta, description_en, description_ta, icon, grades, sort_order) values
  ('M', 'Mathematics', 'கணிதம்', 'Concept-first lessons, past papers and weekly practice for Grades 6–11.', 'தரம் 6–11 க்கான அடிப்படை விளக்கம், கடந்தகால வினாத்தாள்கள் மற்றும் வாராந்திர பயிற்சி.', 'bi-calculator', '{6,7,8,9,10,11}', 1),
  ('C', 'Combined Mathematics', 'இணைந்த கணிதம்', 'A/L pure and applied mathematics with structured revision.', 'உயர்தர தூய மற்றும் பிரயோக கணிதம், திட்டமிட்ட மீட்டல் வகுப்புகளுடன்.', 'bi-graph-up', '{12,13}', 2),
  ('I', 'ICT', 'தகவல் தொடர்பாடல் தொழில்நுட்பம்', 'O/L and A/L ICT theory with hands-on practical sessions.', 'சாதாரண மற்றும் உயர்தர ICT கோட்பாடு, செய்முறை பயிற்சிகளுடன்.', 'bi-pc-display', '{9,10,11,12,13}', 3),
  ('S', 'Science', 'விஞ்ஞானம்', 'Physics, chemistry and biology foundations for O/L success.', 'சாதாரண தர வெற்றிக்கான பௌதிகவியல், இரசாயனவியல், உயிரியல் அடிப்படைகள்.', 'bi-radioactive', '{6,7,8,9,10,11}', 4),
  ('E', 'English Language', 'ஆங்கில மொழி', 'Grammar, writing and spoken English for every grade.', 'அனைத்து தரங்களுக்கும் இலக்கணம், எழுத்து மற்றும் பேச்சு ஆங்கிலம்.', 'bi-translate', '{6,7,8,9,10,11,12,13}', 5),
  ('P', 'Physics', 'பௌதிகவியல்', 'A/L physics theory, problem solving and model papers.', 'உயர்தர பௌதிகவியல் கோட்பாடு, கணக்கீடுகள் மற்றும் மாதிரி வினாத்தாள்கள்.', 'bi-lightning-charge', '{12,13}', 6)
on conflict (code) do nothing;
