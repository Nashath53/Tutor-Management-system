# Mentora Learning Centre: Complete Project Guide

This guide explains **what every page does, how it works, what you should change, and how to upgrade it later**. It also includes the **full backend guidelines** (database, security, money rules and day-to-day operations).

Read it once from top to bottom. After that, use it as a reference.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [The student journey (end to end)](#2-the-student-journey-end-to-end)
3. [Public website pages](#3-public-website-pages)
4. [Student portal pages](#4-student-portal-pages)
5. [Admin pages](#5-admin-pages)
6. [Shared building blocks (the code behind every page)](#6-shared-building-blocks)
7. [Backend full guidelines](#7-backend-full-guidelines)
8. [What you must change before launch](#8-what-you-must-change-before-launch)
9. [Upgrade tips and roadmap](#9-upgrade-tips-and-roadmap)
10. [Golden rules (print this)](#10-golden-rules)
11. [Version 2: what's new and where to find it](#11-version-2-whats-new-and-where-to-find-it)

---

## 1. The big picture

```
 Visitor / Student / Admin (browser or installed app)
        │
        │  HTML + CSS + JavaScript  (served by Cloudflare Pages)
        ▼
 js/services/api.js  ──►  DEMO mode (sample data in the browser)   ← while keys are placeholders
        │
        └──────────────►  LIVE mode: Supabase
                            ├─ Auth        (who you are: email + password)
                            ├─ PostgreSQL  (all data)
                            ├─ RLS         (which rows you may see)
                            ├─ Functions   (the business rules: money, approvals, codes)
                            └─ Storage     (teacher CVs/certificates, teacher photos)
```

The most important idea: **the browser can only *ask*. The database decides.**
Anything about money or access (charging a session, verifying a payment, approving an enrolment, issuing a receipt, calculating commission) runs inside a PostgreSQL function. Those functions live in `supabase/migrations/004a–004d`. Even if someone edits the JavaScript in their own browser, the database still refuses anything they are not allowed to do.

### Three kinds of users

| Role | How they get it | What they can do |
|---|---|---|
| **Visitor** (not logged in) | Anyone | See subjects, public classes and approved teacher profiles. Submit the Join/Trial form and the Teach With Us form. |
| **Student** | Admin creates a login with the same email as the student record | See **only their own** classes, fees, payments, receipts, attendance, notices and recordings. Create bank-transfer payment references. |
| **Cashier** (front desk) | `role = 'cashier'` in `profiles` | Students, enquiries, enrolments (view and create), attendance, recording cash, fees, receipts and reports. **Cannot** verify bank transfers, approve enrolments, see teacher finance or change settings. |
| **Admin** | `role = 'admin'` in `profiles` | Everything. |

> There is **no teacher login** in this MVP. Teachers are managed by the admin, and their settlements are sent to them. See [Upgrade tips](#9-upgrade-tips-and-roadmap).

---

## 2. The student journey (end to end)

This is the main flow the whole system is built around. Every page below is one step of it.

```
1. Visitor fills "Book free trial" (Courses page) or "Join a class" form
       → saved to student_enquiries → optional pre-filled WhatsApp message
2. Admin → Enquiries → Convert  → creates Student (MA-0001) + Enrolment (MMPE-001) as TRIAL
3. Admin/Cashier → Attendance → marks the trial sessions  → status "Trial", NO charge
       → after 2 trial sessions (configurable) the enrolment becomes "Trial completed"
4. Student (portal) or Admin → "Request paid admission"
       → status "Admission requested" + admission fee LKR 250 charged ONCE
5. Student pays:
     a) Bank transfer: Portal → Fees → creates a payment reference → transfers money →
        sends the bank slip on WhatsApp → clicks "I sent the receipt"  (still NOT paid)
        → Admin → Payments → checks the bank statement → Verify (+ bank reference)
     b) Cash: Cashier → Payments → Record cash  → verified immediately + receipt
6. Admin → Enrolments → Approve  (only if the minimum payment % is VERIFIED, or a written override)
       → paid group / online links unlock in the student portal
7. Each paid session marked Present/Late → one session charge (never duplicated)
8. Monthly: student statement → teacher earnings → settlement (commission, WHT, net) → paid
```

---

## 3. Public website pages

All public pages are **bilingual** (EN / தமிழ் switch, top right) and **installable** as an app.
Each `.html` file is **generated** by `tools/build_html.py`. The matching JavaScript is in `js/pages/`.

> **How to change page text:** Most visible text comes from `tools/i18n_source.py` (each key holds English and Tamil). Edit it, run `python3 tools/i18n_source.py`, then `node tools/i18n_keys.mjs`, then `python3 tools/build_sw.py`.
> **How to change the page layout:** Edit the page's section in `tools/build_html.py`, run it, then run `build_sw.py`.

### 3.1 Home: `index.html` (`js/pages/home.js`)

- **What it shows:** A hero section ("try two for free"), live counters (subjects, open classes, verified teachers), subject cards, a "how it works" section, featured teachers and the call-to-action buttons.
- **How it works:** It calls `listSubjects()`, `get_public_classes()` and `get_public_teachers()`. These return **only public-safe fields**, so a teacher's phone number or bank details can never reach this page.
- **What to change:**
  - The hero headline and intro text (`home.*` keys in `i18n_source.py`).
  - The small "This week" demo card in the hero, which is static sample HTML in `build_html.py`. Update it to show your real timetable, or remove it.
  - Add a real photo of your centre (put it in `assets/` and reference it in `build_html.py`).

### 3.2 Classes: `courses.html` (`js/pages/courses.js`, `shared-cards.js`)

- **What it shows:** Every active public class, with filters (subject, grade, medium, mode), rate per session and a **"Free trial" badge**.
- **Free-trial booking:** "Join free trial" opens a short form (name, guardian, phone, grade, medium, mode, consent). There is **no admission form**, as the spec requires. It saves through `submit_student_enquiry` with `class_type = free_trial`. It then offers:
  - "Open WhatsApp message" (pre-filled text to your office number).
  - "Open trial group" if the class has a **trial WhatsApp group link**. This link is public on purpose. The **paid** group link is private (see 4.2).
- **What to change:** Class details are data, not code. Change them in **Admin → Classes**.

### 3.3 Teachers: `teachers.html` (`js/pages/teachers.js`)

- **What it shows:** Only teachers that are **active and published**. It shows display name, photo, bio (EN/TA), years of experience, subjects and grades, and **verified** qualifications.
- **Privacy rule:** Unverified qualifications, phone, email, bank details, CV and certificates are **never** sent to the browser.
- **What to change:** In Admin → Teachers, add a photo URL, write the bio in both languages, verify qualifications and turn on "Publish profile".

### 3.4 Join a Class (Admission form): `join-class.html` (`js/pages/join-class.js`)

- **What it does:** The full admission/enquiry form: student and guardian, phone and WhatsApp, subject, grade, medium, mode, class type, preferred start date, requirements, **"How did you hear about us?" checkboxes and note**, and **guardian consent**.
- **How it works:**
  1. The browser validates the form, with Tamil error messages in Tamil mode.
  2. It **saves to the database first** (`submit_student_enquiry`). The database checks the data again and applies a **rate limit** of 5 submissions per phone number per hour.
  3. Only then does it show "Open WhatsApp message". Opening WhatsApp is recorded only as "opened", **never** as "sent".
  4. **Offline:** If there's no internet, the form is saved as a **draft on the device** and sent automatically when the connection returns.
- **What to change:** The WhatsApp message wording is in `i18n_source.py` (`wa.*` keys). Dropdown options are in `js/config/app.config.js` → `OPTIONS`.

### 3.5 Teach With Us: `teach-with-us.html` (`js/pages/teach-with-us.js`)

- **What it does:** The teacher application form: personal details, subjects, grades, mediums, class types and modes, qualifications, experience, availability, and **optional CV and certificate uploads** (PDF/JPG/PNG, maximum 5 MB each).
- **How it works:** Files go to the **private** storage bucket `teacher-documents` (folder `applications/`). Visitors can **upload but never read** files. Only admins open them, through a link that expires after **5 minutes**. The form is then saved with `submit_teacher_application` (rate limited to 3 per hour).
- **What to change:** Benefits text and the commission explanation (`teach.*` keys). Make sure the commission text matches your Settings.

### 3.6 Contact: `contact.html` (`js/pages/contact.js`)

- **What it shows:** WhatsApp chat button, phone, email, address and opening hours.
- **Where the values come from:** **Admin → Settings → Contact** (database). If Supabase isn't connected yet, they come from `app.config.js`.
- **What to change:** Add a Google Maps link or embed. If you embed a map, add `https://www.google.com` to `frame-src` in `_headers`.

### 3.7 Privacy: `privacy.html`

- A bilingual privacy notice covering what is collected, why, who can see it, guardian consent and how to ask for deletion or correction.
- **What to change:** **Put in your real contact person, email and address. Have it reviewed** before launch. Sri Lanka has a Personal Data Protection Act; ask a professional which parts apply to you.

### 3.8 Login: `login.html` (`js/pages/login.js`)

- **What it does:** Email and password login. After login it sends you to the right place: **admin/cashier → Admin dashboard**, **student → Portal**. "Forgot password" emails a reset link that lands on Portal → Profile, where the student sets a new password.
- **Demo mode only:** It shows one-click demo accounts and "Reset demo data".
- **There is no public sign-up**, on purpose. You create every login yourself.

### 3.9 Offline page: `offline.html`

- Shown by the service worker when the user has no internet and the page they want isn't cached. It explains that saved drafts will be sent later.

---

## 4. Student portal pages

Folder `portal/`, scripts in `js/pages/portal/`. These pages are **bilingual** and **mobile-first** (bottom tab bar on phones). Every page checks the login first (`portal-shell.js`); if you aren't logged in you're sent to the login page.
**Database protection:** Row Level Security makes sure a student only ever receives **their own** rows. It is tested in `supabase/tests/flow_and_rls_tests.sql`.

`portal-data.js` loads the student's enrolments, fee ledger, payments and receipts once, and calculates the balance:
**balance = all charges − all verified payments** (a negative balance means credit).

### 4.1 Home: `portal/index.html`

- A student ID card (MA-0001, name, grade), four quick stats (balance due, active classes, trial classes, payments awaiting verification), "My classes" and the latest notices.
- **Change:** Nothing in code. It's all data.

### 4.2 My Classes: `portal/classes.html`

- One card per enrolment, showing the enrolment code (MMPE-001) and status:
  - **Trial:** "X of 2 trial sessions used" and the trial group button.
  - **Trial completed:** a **"Request paid admission"** button (calls `request_paid_admission`). This charges the admission fee once.
  - **Admission requested:** how much is verified versus the minimum required, plus "Pay now".
  - **Approved:** "Paid from" date, plus the **private paid WhatsApp group** and **online meeting link**. These links come from the `class_private` table, which the database only shows to **approved** students of that class.
- **Change:** Put the real links in Admin → Classes → (class) → Private links.

### 4.3 Fees: `portal/fees.html`

- Balance due, payments awaiting verification, receipts issued, and a **monthly statement** (opening balance, charges, payments, closing balance) with month arrows and printing.
- **Pay by bank transfer:**
  1. The student enters the amount and gets a **payment reference** (e.g. `MP-2611-0004`) plus your bank details from Settings.
  2. They transfer the money and send the slip on WhatsApp. The pre-filled message includes the reference.
  3. They click **"I sent the receipt"**, which only marks it as `receipt_sent`.
  4. **Nothing is paid until an admin verifies it.** The page says this clearly.
- Receipts: a list of the student's **verified** receipts, each printable.

### 4.4 Attendance: `portal/attendance.html`

- Each session with its date, class, topic and status (Present / Late / Absent / Excused / Trial / Cancelled).

### 4.5 Notices: `portal/notices.html`

- Published notices for everyone, plus notices for the student's own classes. Tamil text is used when the language is Tamil and a Tamil version exists.

### 4.6 Recordings: `portal/recordings.html`

- Links to class recordings (e.g. Google Drive or unlisted YouTube). **Only approved (paid) students** of that class can see them.
- **Tip:** Share Drive files as "Anyone with the link can view" and keep the link only here. The database hides the link from everyone else.

### 4.7 Profile: `portal/profile.html`

- The student's details (read-only, so ask the office to change them), guardian consent status, and **Change password**.

---

## 5. Admin pages

Folder `admin/`, scripts in `js/pages/admin/`. The admin area is **English only**, as the spec allows. The sidebar hides pages a cashier may not use. **The database also blocks them**, so hiding is only for convenience.
Most list pages use the shared **CRUD table** (`js/components/crud.js`), which provides search, filters, a "New" button, edit forms in a pop-up window, row actions and CSV export where needed.

| # | Page | Who | What it's for |
|---|---|---|---|
| 1 | Dashboard | Staff | What needs attention today |
| 2 | Students | Staff | Student records (MA-0001) |
| 3 | Enquiries | Staff | Website trial/admission requests |
| 4 | Teachers | Admin | Private teacher records, plus the public profile |
| 5 | Teacher applications | Admin | Teach With Us submissions |
| 6 | Subjects | Admin | Subject list (EN/TA) |
| 7 | Classes | Admin | Classes, rates, teachers and allocation % |
| 8 | Enrolments | Staff (approve = admin) | Trial → admission → approval |
| 9 | Attendance | Staff | Marks sessions, which creates charges |
| 10 | Notices & recordings | Admin | Portal content |
| 11 | Fees & balances | Staff | Ledger and statements per student |
| 12 | Payments | Staff (verify = admin) | Verify bank transfers, record cash |
| 13 | Receipts | Staff | All receipts; print or view void ones |
| 14 | Teacher earnings | Admin | Revenue per teacher and month |
| 15 | Settlements | Admin | Monthly teacher payout statements |
| 16 | Reports | Staff | Charts, cash reconciliation, audit log |
| 17 | Settings | Admin | Fees, trial, billing, commission, tax, bank, contact |

### 5.1 Dashboard: `admin/index.html`
- KPI cards: collected this month (**verified only**), outstanding fees, active students, free trials and teachers. Below them are "to-do" lists: payments to verify, admission requests and new enquiries. Quick actions are at the bottom.
- Data comes from `get_dashboard_stats()`, which is calculated in the database.

### 5.2 Students: `admin/students.html`
- Search by ID, name, phone, guardian or email. Filter by status or grade. The table shows the student's classes and current balance.
- New/Edit: student details, guardian details, consent, referral source, notes. **The student ID is generated by the database and can never be edited.**
- **Important:** The **email** here must equal the student's login email (see Backend 7.6).

### 5.3 Enquiries: `admin/enquiries.html`
- Every form submission from the website, with its status (`new → contacted → trial → converted / closed`), whether WhatsApp was **opened**, and admin notes.
- **Convert:** Pick a class and choose "free trial" or "direct paid admission". The database creates the student (if new) and the enrolment code in one safe step (`convert_enquiry`).
- **Reply on WhatsApp:** Opens a pre-filled reply to the parent.

### 5.4 Teachers: `admin/teachers.html`
- The private teacher record: teacher code (MT-001), contact details, bank details (for settlements), mediums, modes, bio EN/TA and a **photo URL**.
- **Adding a photo:** Upload it in **Supabase → Storage → teacher-photos**, copy its public URL, and paste it into the "Public photo URL" field. Direct upload from the admin page is listed in the upgrades.
- Subjects and grades: a teacher can have **many** subjects, grades, mediums and modes.
- Qualifications: add them, then tick **Verified** after checking the original documents. Tick **Public** to show them on the website.
- **Publish profile** switch: only after you've verified everything.

### 5.5 Teacher applications: `admin/teacher-applications.html`
- View the application and open the CV/certificates (private 5-minute links). Statuses: new, under review, approved, rejected.
- **Approve** creates a **private** teacher record (not public yet). You finish verification and publishing on the Teachers page.

### 5.6 Subjects: `admin/subjects.html`
- Code (one letter, e.g. `M`), English and Tamil names and descriptions, an icon (Bootstrap icon name), grades, display order and active/hidden.
- **The code becomes part of every enrolment code** (M**M**PE-001). **Never change a code after you've enrolled students**; create a new subject instead.

### 5.7 Classes: `admin/classes.html`
- Subject, title EN/TA, grade, medium, mode (physical/online/hybrid), type, schedule EN/TA, location, **rate per session**, free trial on/off, **trial group link** (public), visibility.
- **Teachers & allocation %:** Assign one or more teachers. Allocation % decides how class revenue is split between teachers in settlements (for example 70% / 30%). **Make sure the shares add up to 100%.**
- **Private links:** The paid WhatsApp group and online meeting link (visible only to approved students).

### 5.8 Enrolments: `admin/enrollments.html`
- Every enrolment with its code, student, class, status and trial count. Filter by status.
- Actions:
  - **New enrolment** (trial or direct).
  - **Request paid admission** (charges the admission fee once).
  - **Waive admission fee** (admin, reason required). This creates a reversal, not a deletion.
  - **Payment status**: charges versus verified payments versus the minimum required.
  - **Approve** (admin only). It's blocked until the minimum % is verified. You can override, but a **written reason is required** and logged. You choose the **"paid from" date**: sessions on or after this date are billable.
  - **Suspend / Withdraw / Reject / Re-activate**, each with a reason, added to the notes.

### 5.9 Attendance: `admin/attendance.html`
- Choose a class and date, enter an optional topic, and you get the roster. Tap Present / Late / Absent / Excused for each student. "Mark all present" is a shortcut.
- **What the database does when you save** (`mark_attendance`):
  - A trial student: status **Trial**, **no charge**, and the trial counter goes up.
  - An approved student with a billable status (Present/Late by default) on or after the paid-from date: **one** session charge. Saving again never adds a second charge.
  - Changing to Absent/Excused: the charge is **reversed** with a new row (never deleted).
- **Cancel session:** Reverses all charges for that day and sets everyone to Cancelled.
- **Offline:** If the internet drops, attendance is saved as a draft and synced later. A unique ID stops it being saved twice.

### 5.10 Notices & recordings: `admin/content.html`
- Notices: title and message in EN/TA, for all students or one class, published or draft.
- Recordings: title, class, date, Drive/YouTube link, published or not.
- Note: Deleting a notice or recording is permanent. That's fine, because it's not money data.

### 5.11 Fees & balances: `admin/fees.html`
- Pick a student on the left. On the right you see their statement for any month, **Print**, **Record cash** (jumps to Payments), and **Adjustment** (admin only: a positive amount is an extra charge, a negative amount is a discount or credit; a description is required).

### 5.12 Payments: `admin/payments.html`
Three tabs:
- **To verify:** Bank transfers in `pending` / `receipt_sent`.
  - **Verify:** First check the money in your **bank statement**. Enter the amount actually received and the **bank transaction reference**. The database then marks the payment verified, allocates it to the oldest unpaid charges first, and issues a **unique receipt number** (MR-2026-000001).
  - **Reject:** A reason is required.
- **Record cash:** Pick a student, enter the amount and method (**cash** or **authorised representative**, with the representative's name). It's verified immediately and a receipt is printed. It works offline as a draft, but **the official receipt number only comes after sync**.
- **All payments:** History. **Reverse** (admin only, reason required) voids the receipt, releases the allocations and writes an audit record. **Payments are never deleted.**

### 5.13 Receipts: `admin/receipts.html`
- All receipts with their number, student, date, amount and Valid/Void status. View and print.

### 5.14 Teacher earnings: `admin/teacher-finance.html`
- For a chosen month: each teacher's share of **collected** class revenue (by allocation %). Admission fees aren't included. This is a preview; the official numbers are in Settlements.

### 5.15 Settlements: `admin/settlements.html`
- **Generate** (teacher + month): The database calculates:
  - **Gross revenue:** The teacher's share of **verified, collected** session payments that month. Admission fees and reversed money are excluded.
  - **Commission:** **0%** in the teacher's **first eligible month** for their **first 20** eligible students; **5%** otherwise. All three numbers can be changed in Settings.
  - **Adjustments:** Manual plus or minus, with notes.
  - **Statutory deductions (WHT):** Only if enabled in Settings and above the threshold.
  - **Net payable.**
- **Draft → Approved** (figures locked) **→ Paid** (bank transfer reference and date required). Print the settlement statement for the teacher.

### 5.16 Reports: `admin/reports.html`
- **Overview:** Verified collections for the last 6 months, this month by payment method, enrolments by status, how students found you, and the enquiry-to-student conversion rate.
- **Cash reconciliation:** At the end of the day, enter the cash you physically counted. The system compares it with recorded cash payments and shows the difference.
- **Audit log:** Who did what and when (approvals, verifications, reversals, settings changes…). It's append-only and can't be edited or deleted.
- **CSV export** of verified payments for backups and your accountant. CSV export is also on Payments (all payments) and Fees & balances (all balances).

### 5.17 Settings: `admin/settings.html`
Each group is saved to the `app_settings` table:

| Group | Fields | Default |
|---|---|---|
| Admission fee | enabled, amount | on, LKR 250 |
| Free trial | sessions per class | 2 |
| Billing & approval | billable statuses, minimum verified payment %, allow partial | Present + Late, 50%, yes |
| Teacher commission | first-month rate, first-N-students cap, standard rate | 0%, 20, 5% |
| Tax | WHT on/off, rate, monthly threshold | off, 5%, LKR 100,000 |
| Bank | bank, account name, number, branch | placeholders, so **change them** |
| Contact | WhatsApp, phone, email, address, hours | placeholders, so **change them** |

Changing a setting affects **future** actions only. Old charges and settlements keep the values they were created with.

---

## 6. Shared building blocks

```
js/
├── config/        supabase.js (keys) · app.config.js (defaults, dropdown OPTIONS)
├── services/      one file per feature — the ONLY place that talks to the database
│   ├── api.js     picks LIVE (Supabase) or DEMO; exposes select/insert/update/rpc/upload/auth
│   └── demo/      demo-api.js, demo-rpc.js (a JavaScript copy of the SQL functions), demo-seed.js
├── components/    layout (header/footer), admin-shell & portal-shell (menus + login check),
│                  crud (tables + forms), modal, toast, receipt (printable receipt)
├── pages/         one script per page
├── pwa/           register-sw.js (safe auto-update), offline-queue.service.js (drafts)
├── i18n/          language.js (switching, data-i18n attributes), en.js / ta.js (generated)
└── utils/         dom, validate (Tamil messages), format (LKR, dates), whatsapp, ids, storage, form-guard
```

**How a page works, step by step** (example: Payments → Verify):
`payments.js` (button click) → `payment.service.js → verifyPayment()` → `api.rpc('verify_payment', …)` → Supabase runs the SQL function → it checks you're an admin, updates the payment, allocates the money, issues a receipt and writes the audit log → the result comes back → toast message → table reloads.

**Service worker (`sw.js`, generated):**
- **Pages:** Network-first. When online you always get the newest page; when offline you get the cached copy or `offline.html`.
- **CSS/JS/icons:** Served from a versioned cache, so they load fast.
- **Supabase and anything private:** **Never cached.**
- **Updates:** A new version downloads in the background and switches over only when **no form has unsaved changes**. Otherwise an "Update ready" bar appears.
- **That's why you must run `python3 tools/build_sw.py` after every change.** It gives the cache a new version name.

---

## 7. Backend full guidelines

### 7.1 Migration files (run order)

| File | What it creates |
|---|---|
| `001_schema.sql` | 28 tables, ID generators, the code-lock trigger, the "never delete money" triggers, the append-only audit log |
| `002_security.sql` | Helper functions (`is_admin()`, `is_staff()`, `my_student_id()`…), **RLS on every table**, policies, grants, audit triggers |
| `003_storage.sql` | Buckets: `teacher-documents` (private, 5 MB, PDF/JPG/PNG) and `teacher-photos` (public, 2 MB) |
| `004a_helpers.sql` | Internal helpers: settings, rate limit, ledger reversal, FIFO allocation, receipts, admission fee |
| `004b_public_enrolment_attendance.sql` | Public form functions, teacher approval, enquiry conversion, enrolments, attendance |
| `004c_payments_settlements.sql` | Bank/cash payments, verification, reversal, statements, cash reconciliation, settlements, dashboard |
| `004d_logins_permissions.sql` | Auto-create a profile for each login, link students by email, **execute permissions** |
| `seed.sql` | Default settings and 6 subjects |
| `005a_schema_v2.sql` | v2 tables: reviews, audience survey, complaints, timetable + change requests, attendance corrections, class polls, resources, community links, teacher media, profile change requests; teacher role; `completed` enrolment status |
| `005b_security_v2.sql` | RLS for all v2 tables, **teacher** rules (own classes only), the `has_perm()` permission switch, private `student-photos` bucket |
| `005c_functions_v2.sql` | v2 functions (approvals, timetable requests, polls, reviews, delete-with-reason). Re-run after any 004d re-run |
| `tests/v2_feature_tests.sql` | v2 checks; ends with "ALL V2 TESTS PASSED" |
| `tests/flow_and_rls_tests.sql` | 16 automated checks; ends with the result row "ALL TESTS PASSED" |

### 7.2 Tables (grouped)

| Group | Tables | Notes |
|---|---|---|
| Settings | `app_settings` | JSON values; `is_public` controls whether visitors may read them |
| People | `profiles`, `students`, `teachers`, `teacher_qualifications`, `teacher_subjects`, `teacher_applications` | `profiles.id` = the Supabase Auth user id |
| Academics | `subjects`, `classes`, `class_private`, `class_teachers` | `class_private` = paid links (approved students only) |
| Admissions | `student_enquiries`, `enrollments` | enrolment status: trial → trial_completed → admission_requested → approved (also suspended/withdrawn/rejected) |
| Attendance | `class_sessions`, `attendance`, `attendance_batches` | batches stop duplicate offline syncs |
| Money | `fee_ledger`, `payments`, `payment_allocations`, `receipts`, `payment_reversals`, `cash_reconciliations`, `teacher_settlements` | **cannot be deleted** |
| Content | `notices`, `recordings` | |
| System | `audit_log`, `code_counters`, `rate_limits` | audit log is append-only |

### 7.3 How the money works (the ledger)

Think of a bank passbook:

- **`fee_ledger`** = everything the student **owes**: `session_charge`, `admission_fee`, `adjustment` (plus or minus), and `reversal` (a negative copy that cancels an earlier row).
- **`payments`** = money the student **paid**. Only `verified` payments count.
- **`payment_allocations`** = which payment paid which charge (oldest first). Any leftover stays as **credit**.
- **Balance** = sum of ledger − sum of verified payments.

**Why we never delete:** If you delete a charge, last month's statement changes and the totals stop matching your bank. Instead, a **reversal row** cancels it, and both rows stay visible with a reason and a name in the audit log.

**Duplicate protection (built into the database):**
- Only **one active session charge** per enrolment per session (unique index).
- Only **one active admission fee** per enrolment.
- Each receipt number, payment reference, student ID and enrolment code is unique (generated from `code_counters` with locking).
- Offline drafts carry a `client_uuid`. The same draft sent twice is saved once.

### 7.4 Every database function (what calls what)

| Function | Who can call | Used by |
|---|---|---|
| `submit_student_enquiry`, `submit_teacher_application`, `mark_whatsapp_opened`, `get_public_classes`, `get_public_teachers` | Anyone | Public forms and pages |
| `create_bank_payment`, `mark_receipt_sent`, `request_paid_admission`, `enrollment_payment_status`, `get_student_statement` | Student (own data only) and staff | Portal |
| `convert_enquiry`, `create_enrollment`, `upsert_session`, `mark_attendance`, `cancel_session`, `record_cash_payment`, `save_cash_reconciliation`, `get_dashboard_stats` | Staff (admin + cashier) | Admin |
| `approve_teacher_application`, `approve_enrollment`, `set_enrollment_status`, `waive_admission_fee`, `verify_payment`, `reverse_payment`, `add_ledger_adjustment`, `generate_settlement`, `update_settlement_status`, `link_user_profile` | **Admin only** | Admin |
| `_setting`, `_allocate`, `_issue_receipt`, `_reverse_ledger`, … (names starting with `_`) | **Nobody directly** (internal) | Other functions |

Every function is `SECURITY DEFINER` with a fixed `search_path`. It **checks the caller's role itself** and writes to `audit_log`.

### 7.5 Row Level Security in plain words

- **Students** see a row only if `student_id = my_student_id()`.
- **Staff** (admin/cashier) see operational rows. Only **admins** see teacher bank details, settlements, settings and the audit log.
- **Visitors** (`anon`) can read active subjects and public classes, and call the public functions. Nothing else.
- **Money tables** can't be inserted or updated directly from the browser. They change **only** through the functions above.
- A student **can't change their own role**. The test file proves this.

**Rule for every new table you add:** `alter table … enable row level security;` plus at least one policy. A table without RLS is readable by anyone who has your anon key, and the anon key is public by design.

### 7.6 Auth (logins)

- **Sign-ups are off.** You create users in **Supabase → Authentication → Users → Add user** (tick *Auto Confirm*).
- A trigger (`handle_new_user`) automatically creates a `profiles` row with role `student`.
- **Linking a student:** If the login email equals the email on a student record, they're linked automatically, whichever was created first. Otherwise, run as admin in the SQL Editor:
  ```sql
  select public.link_user_profile('<auth user id>', '<student id>');
  ```
- **Making an admin or cashier:**
  ```sql
  update public.profiles set role = 'admin'   where email = 'owner@example.com';
  update public.profiles set role = 'cashier' where email = 'desk@example.com';
  ```
- **Removing access:** Supabase → Users → (user) → **Ban user** or **Delete user**. Their student record and payments stay; only the login goes.

### 7.7 Storage

| Bucket | Public? | Who can upload | Who can read |
|---|---|---|---|
| `teacher-documents` | **No** | Visitors (only into `applications/`), admins | **Admins only**, through 5-minute signed links |
| `teacher-photos` | Yes | Admins (in the Supabase Storage dashboard) | Everyone (it's shown on the website) |

Never put anything private in `teacher-photos`.

### 7.8 Useful SQL recipes (SQL Editor)

```sql
-- Who are my admins/cashiers?
select email, role from public.profiles where role <> 'student';

-- Students whose login is NOT linked yet
select p.email from public.profiles p where p.role = 'student' and p.student_id is null;

-- Outstanding balance per student (top 20)
select s.student_code, s.full_name,
       coalesce((select sum(amount) from public.fee_ledger l where l.student_id = s.id), 0)
     - coalesce((select sum(amount) from public.payments p where p.student_id = s.id and p.status = 'verified'), 0) as balance
from public.students s order by balance desc limit 20;

-- Bank transfers waiting for verification
select payment_ref, amount, status, created_at from public.payments
where status in ('pending', 'receipt_sent') order by created_at;

-- Last 50 important actions
select created_at, action, table_name, details from public.audit_log order by created_at desc limit 50;

-- Current settings
select key, value from public.app_settings order by key;
```

### 7.9 Changing the database later (safe method)

1. **Never edit 001–004 after going live.** Create a **new file**, e.g. `supabase/migrations/005_add_sibling_discount.sql`.
2. **Only add**: new tables, new columns (with a default), new functions. **Never drop or rename** a column the website uses.
3. For a new table: enable RLS, add policies, add `grant`s, and add an audit trigger if it matters.
4. For a new function: `security definer set search_path = public`, check the role at the top (`perform public._assert_admin();`), write `_audit(...)`, and `grant execute … to authenticated`.
5. **Test on a second "staging" Supabase project first** (free plan), then run it on the real one.
6. If you changed a rule that the demo copies, update `js/services/demo/demo-rpc.js` too, so demo mode behaves the same.
7. Re-run `tests/flow_and_rls_tests.sql`. It must still say **ALL TESTS PASSED**.

### 7.10 Keys and secrets

| Key | Where it goes | Safe in the browser? |
|---|---|---|
| Project URL | `js/config/supabase.js` | Yes |
| **anon / publishable** key | `js/config/supabase.js` | **Yes**, because RLS protects the data |
| **service_role / secret** key | **Nowhere in this project.** Keep it only in Supabase or a password manager | **NEVER.** It bypasses all security |
| Database password | Password manager | Never |

If you ever leak the service_role key: Supabase → Settings → API → **roll/regenerate** it immediately.

### 7.11 Operations: daily, weekly, monthly

| When | Task | Where |
|---|---|---|
| Daily | Verify bank transfers against the bank app | Payments → To verify |
| Daily | Cash count and reconciliation | Reports → Cash reconciliation |
| Daily | Reply to new enquiries | Enquiries |
| Each class | Mark attendance (works offline) | Attendance |
| Weekly | Approve completed trials that have paid | Enrolments (filter "Admission requested") |
| Weekly | **Export CSVs** (payments and balances) and keep them safe | Payments, Fees & balances, Reports |
| Monthly | Send statements to parents; generate, approve and pay settlements | Fees, Settlements |
| Monthly | Review the audit log for unusual reversals/overrides | Reports → Audit log |
| Quarterly | Check tax rules with your accountant | Settings → Tax |

**Backups:** The free Supabase plan only has limited automatic backups. Besides weekly CSV exports, you can run `pg_dump` with the Supabase CLI, or upgrade to Pro for daily backups.
**Free-plan pause:** Free Supabase projects pause after a period with no activity. Log in to the dashboard regularly, or upgrade before real use.

### 7.12 Tax note (WHT)

Withholding tax on teacher payments is a **separate statutory deduction**, not Mentora's commission. The setting is **off** by default. Rates and thresholds (e.g. 5% above LKR 100,000/month) can change and depend on each teacher's situation. **Confirm with a qualified Sri Lankan accountant** before enabling it, and keep the settlement statements for your records.

---

## 8. What you must change before launch

**Configuration (no coding):**
- [ ] `js/config/supabase.js`: your Project URL and anon key.
- [ ] `js/config/app.config.js`: WhatsApp number (`9477…`), phone, email, address and hours (used before Settings load).
- [ ] Admin → Settings: **real bank details**, contact details, admission fee, trial sessions, minimum %, commission.
- [ ] Admin → Subjects, Teachers (verify and publish), Classes (rates, links, teacher allocation % = 100).
- [ ] `privacy.html`: your real details, reviewed.

**Branding:**
- [ ] Logo and icons: replace the files in `assets/icons/` (keep the same names and sizes: 192, 512, maskable 512, apple-touch 180, favicon 32).
- [ ] Colours: `css/style.css` top section (`--m-primary` teal `#15475a`, `--m-accent` amber `#b8730a`, background `#f7f5ef`).
- [ ] App name: `manifest.webmanifest` and `APP.name` in `app.config.js`.
- [ ] The homepage "This week" sample card should show your real timetable or be removed.

**Remove demo bits for production (optional but cleaner):**
- [ ] When keys are set, demo mode switches off automatically. The demo accounts and the "Reset demo data" button disappear by themselves.
- [ ] If you want to delete the demo code completely, remove `js/services/demo/` **only after** confirming live mode works.

**After every change:** run `python3 tools/build_sw.py`, commit, push.

---

## 9. Upgrade tips and roadmap

### Quick wins (1–2 days each)
1. **Spam protection:** Add **Cloudflare Turnstile** (a free CAPTCHA alternative) to the Join and Teach forms, checked by a Supabase Edge Function. The current rate limit already stops simple floods.
2. **Custom domain:** `mentora.lk` on Cloudflare Pages, then update the Site URL in Supabase Auth.
3. **Real photos:** Centre, classrooms and teachers (with permission). They build trust more than anything else.
4. **Google Business Profile** and a WhatsApp Business account with a catalogue and quick replies.
5. **Sinhala language:** Add a third column to `tools/i18n_source.py` and a `si.js` file. The language switcher is built to support more languages.
6. **Teacher photo upload button:** Upload straight from Admin → Teachers into the `teacher-photos` bucket, instead of pasting a URL.
7. **Statement sharing:** A "Send statement on WhatsApp" button in Fees, with a pre-filled message showing the balance and month.

### Medium upgrades (1–2 weeks each)
8. **Teacher login (read-only):** Add role `teacher`, link `profiles` to `teachers.id`, and add RLS so a teacher sees only their own classes, attendance and settlements. Optionally let teachers mark attendance for their own classes.
9. **Online card payments:** Integrate a Sri Lankan gateway (for example PayHere) through a **Supabase Edge Function** that receives the gateway's server-to-server notification and calls a new `verify_online_payment` function. **Never mark a payment paid from the browser redirect alone.**
10. **Automatic messages:** WhatsApp Business Platform (Cloud API) or SMS (e.g. Dialog/Mobitel/Notify.lk-type providers) from an Edge Function for:
   - payment verified, with the receipt number
   - class reminders
   - monthly balance
   This needs message templates and an approved business number.
11. **Email receipts and PDF statements:** Generate them in an Edge Function and email them through a provider (Resend, Brevo…).
12. **Discounts:** Sibling discount, scholarships and early payment. Add them as `adjustment` ledger rows created by a new function, so they're audited.
13. **Timetable and sessions calendar:** Create sessions in advance from a weekly schedule, and give students a calendar view.

### Bigger steps (when you grow)
14. **Supabase CLI and GitHub Actions:** Keep migrations in Git, run the SQL tests automatically on every push, and deploy migrations from CI instead of copy/paste.
15. **Staging environment:** A second Supabase project and a Cloudflare preview branch for testing.
16. **Monitoring:** Supabase logs and email alerts; Cloudflare Web Analytics (privacy-friendly, free).
17. **Parent accounts with multiple children:** A `guardians` table linked to many students, with RLS by guardian.
18. **Exams and progress:** Marks, term reports and a parent progress view.
19. **Move the admin UI to Tamil too:** The i18n system already supports it. Wrap the admin strings in `t()`.

### Code-quality tips for you as a junior developer
- **One change at a time → test → commit.** Small commits are easy to undo (`git revert`).
- **Read the error message fully.** Supabase errors usually name the exact function and line.
- **Keep demo and SQL in sync.** If you change a rule in SQL, change `demo-rpc.js` too.
- **Don't trust the browser.** Any new rule about money or access belongs in a database function, not in JavaScript.
- **Ask an AI or a senior to review any SQL migration** before running it on the live project.

---

## 10. Golden rules

1. The **service_role key never** goes into the website.
2. **Every new table gets RLS** and policies.
3. **Never delete money rows.** Use reversals.
4. **A receipt only comes after verification.** WhatsApp or "receipt sent" is not proof.
5. **Trial sessions are never charged.** Paid billing starts at the approved "paid from" date.
6. **Database changes go in new migration files (005, 006…) and are tested on staging first.**
7. **Run `python3 tools/build_sw.py` before every deploy.**
8. **Back up weekly** (CSV exports) and review the audit log monthly.
9. **Tax decisions come from an accountant**, not from the software.
10. **Re-run the SQL tests** after any database change. They must say **ALL TESTS PASSED**.

---

## 11. Version 2: what's new and where to find it

Version 2 adds a **teacher panel**, an **approvals inbox**, **reviews/feedback**, a **timetable**, and a premium design with **light/dark themes** (light by default). The colour plan follows your 60/30/10 palette. **60%** is deep indigo/royal blue (`#1E293B`, `#2563EB`): text, sidebars, main buttons. **30%** is cyber teal (`#06B6D4`, `#10B981`): success, charts, secondary chips. **10%** is gold/orange (`#F97316`, `#FBBF24`): badges, counters, highlights only. All colours live as CSS variables in `css/style.css`. Change them there, never inside pages.

### 11.1 Public website
| Page | New |
|---|---|
| Home `index.html` | Animated hero, stats, theme toggle, **testimonials (only admin-approved)**, premium teacher cards with expertise badges, FAQ accordion (students + teachers), **audience survey** (needs, papers, ideas) |
| Teachers `teachers.html` → `teacher-profile.html?id=…` | Students joined, rating + review breakdown, approved feedback, **free Zoom sessions + YouTube videos**, LinkedIn/YouTube/Facebook/website links. **Never** phone, address or bank data |
| Classes `courses.html` | Interactive cards (hover, filters, schedule chips) |
| Teach with us | Interactive commission calculator; commission card no longer collapses |
| Contact | Interactive map (OpenStreetMap, loads only when it scrolls into view so 3G stays fast), interactive cards, **complaint form** |
| Tamil | Longer Tamil words wrap instead of breaking the layout (Tamil-specific rules under `html[lang='ta']` in the CSS files) |

### 11.2 Student portal (`/portal/`)
Home: this month's attendance rate + charts, and the **"Joining tomorrow's class?" Yes/No poll** (shows ~24 h before a class, disappears when the class starts, answers are deleted). Classes: responsive cards, and **"I sent the receipt" asks for confirmation** first. Attendance: charts + **"Request a correction"** button. Recordings: class recordings, free recordings by grade/topic, admin/teacher-picked YouTube videos, papers/notes/mind maps, and **official grade/subject groups** (WhatsApp/Telegram links managed by admin). Profile: change **name and photo** directly; **email/phone/guardian phone** go to admin for approval; password with **eye button**.

### 11.3 Teacher panel (`/teacher/`) — new
| Page | What the teacher can do |
|---|---|
| Dashboard | Today's and upcoming classes, poll counts, attendance trend, rating, latest reviews |
| Timetable | View **all grades**; "My classes only" switch; **request** add/change/remove of own slots (admin approves) |
| My classes | Own classes and roster (phone numbers only if admin turns that on) |
| Attendance | Mark own classes (if allowed). Off-timetable sessions need a reason |
| Recordings & resources | Submit recordings, papers/notes, YouTube/free Zoom links. All wait for admin approval. Delete own pending items |
| Earnings | Own approved/paid settlement statements and print |
| Reviews | Approved reviews and star breakdown |
| Profile | Request public profile changes (admin approves), change password |

Access rights for teachers and cashiers are **only** changed by the admin in **Settings → Access & roles**. The database checks them too (`has_perm()`), so hiding a button is never the only protection.

### 11.4 Admin panel
- **Dashboard**: KPI cards with sparklines, revenue/attendance/enrolment charts, today's timetable, poll counts, inbox.
- **Approvals inbox** (`admin/requests.html`): profile changes, attendance corrections, timetable changes, teacher uploads, all in one place.
- **Feedback & reviews** (`admin/feedback.html`): approve/feature testimonials (verify by phone first), survey insights with charts + CSV, complaints with status and notes.
- **Students**: interactive table with status tabs (**Trial, Pending approval, Paid, Withdrawn, Suspended, Completed**). Class column shows 2 classes, then "+N more".
- **Teachers**: neat cards, tags no longer overlap. **⋮ menu → Remove teacher** (soft delete with reason, can be restored), Link teacher login.
- **Teacher applications**: status can be edited directly (including Approved).
- **Attendance**: calendar colours: **yellow = scheduled**, **green = held**, **red = cancelled**. Off-timetable classes require a reason.
- **Timetable** (`admin/timetable.html`): add/edit/remove slots, clash warnings, approve teacher requests, print. Cashiers can view it.
- **Notices & learning**: "All classes" option, optional **deadline** (empty = stays until admin removes), teacher uploads need approval, resources + community groups + teacher media tabs.
- **Fees**: filters **All / Due / Completed / Overpaid**; new **professional receipt** with logo, amount in words and PAID/VOID stamp.
- **Settlements**: card view, **Delete settlement** (only unpaid, asks twice, needs a reason, audited).
- **Reports**: charts; **Delete cash reconciliation** (asks twice, audited).
- **Settings**: side navigation, unsaved-change dots, save bar, social links, map, poll, Access & roles.

### 11.5 Upgrade tips for v2
1. Self-host the two Google fonts and Bootstrap for even faster 3G loads (then update `_headers` and `tools/build_sw.py`).
2. Add WhatsApp Business API later to **send** reminders automatically (today the app only opens WhatsApp; it never assumes a message was sent).
3. Add a monthly "teacher of the month" badge computed from attendance + reviews.
4. Move survey insights into a weekly email to the admin (Supabase Edge Function + scheduled job).

