# Mentora Learning Centre / Exedra Readiness Audit

**Mode:** Audit only. No repository changes, backend connection, real data, or repairs were made.

**Targets audited:**

- Live home: https://nashath53.github.io/Tutor-Management-system/index.html
- Live login: https://nashath53.github.io/Tutor-Management-system/login.html
- Repository: https://github.com/Nashath53/Tutor-Management-system
- Local clone: `/tmp/mentora-audit-repo`
- Local server: `python3 -m http.server` on `127.0.0.1:8000`

## A. Executive summary

The current system is a substantial static HTML/CSS/vanilla ES-module application with a clear service abstraction, a browser demo provider, Supabase migrations, role-aware navigation, SQL RPC functions, RLS policies, financial ledger concepts, and offline/PWA code. The live public site and demo admin/cashier flows were reachable and rendered successfully. The local Playwright smoke test passed for home rendering, admin demo login, and cashier direct navigation to the forbidden settings route.

The release is **not ready for real student, teacher, payment, or academy data**. The live deployment is still in demo mode because Supabase configuration remains placeholder text. The main production risks are therefore readiness and verification risks rather than a demonstrated live data breach: no shared backend is connected, the SQL/RLS suites were not executable without an approved staging database, the live host does not serve the repository's `_headers`, and root-level robots/sitemap coverage is missing.

The pre-confirmed finding about the “New2 free trial classes” badge is **not reproduced**: the live page shows a separate `New` badge followed by “2 free trial classes for every new student.” The pre-confirmed finding about subpath asset handling is also **not confirmed as a current break**: the live manifest and service worker return HTTP 200 and source registration uses the document base path. It still needs full install/offline testing.

Priorities in this report follow the requested definitions. `HIGH` means a release-blocking function, security, or data-integrity concern. `MEDIUM` means material usability, hosting, maintainability, or workflow risk. `LOW` means a minor defect or positive-control item. Full issue details are in `issues.csv`.

## B. Architecture

The application is a static multi-page site with public pages, admin pages, teacher pages, and student portal pages. HTML files mount page-specific ES modules. Shared components cover layout, shells, modals, tables, charts, toasts, receipts, formatting, validation, form guards, storage, and offline queue behavior.

`js/services/api.js` is the data boundary. When Supabase placeholders remain unchanged it loads the demo provider; when configured it creates a Supabase client and routes services through Supabase Auth, table access, storage, and RPC functions. This is a good current-stack decision and does not justify a rebuild.

The backend design uses ordered SQL migrations, database functions for sensitive actions, RLS policies, storage policies, audit functions, and transactional SQL test suites. The source contains protections for student isolation, teacher class scoping, cashier/admin separation, payment verification, receipts, reversals, settlement calculations, approved recording access, and link-host validation. These protections are promising but source-only until executed against an approved staging database.

The deployment is GitHub Pages under `/Tutor-Management-system/`. The repository also contains a Cloudflare Pages `_headers` file. That hosting mismatch is confirmed at runtime: the live GitHub Pages URL returns 404 for `_headers`, so the repository's CSP, HSTS, frame, and cache directives are not evidenced as active.

## C. Role findings

### Admin

The live admin demo login reached the dashboard. The dashboard displayed KPI cards, revenue and attendance charts, enrolment mix, approvals, payment verification, enquiries, and links to people, academic, finance, reports, and settings modules. This is a positive runtime result, not evidence of backend persistence or authorization.

Source and SQL tests indicate the intended admin model is broad but controlled through admin-only RPC assertions, audit logging, and role-aware policies. The database tests cover admission, attendance, payment verification, receipts, reversals, settlements, teacher removal, and auditability. Execution remains **NOT EXECUTED**.

### Cashier

The live cashier demo login reached the reduced admin dashboard. A direct navigation to `admin/settings.html` redirected to `admin/index.html` in the local Playwright run. This positive control should be retained and expanded to every forbidden cashier route. The SQL test suite also contains a source-only check that cashiers can record cash but cannot approve enrolments.

### Teacher

Teacher navigation and SQL source indicate intended limits around own classes, rosters, optional phone visibility, attendance permission, content submission, reviews, earnings, and timetable requests. The SQL v2 test suite explicitly checks own-class roster access, hides phone numbers without permission, blocks another teacher's roster, blocks attendance by default, validates recording hosts, and requires approval before students see recordings. Because the database suite was not executed, these are source-only controls and not a production security certification.

### Student

Student portal pages cover classes, fees, attendance, notices, recordings, profile, receipts, and payment status. The source and SQL tests intend to restrict records to the current student, keep receipt-sent payments unverified, prevent self-verification, require staff approval, hide unapproved recordings, and require approval for sensitive profile changes. Other-student record access and student isolation were not executed against PostgreSQL.

## D. Functional

The public home page, login page, live admin login, live cashier login, local home rendering, local admin demo login, and cashier direct settings route were executed. The live home page rendered subjects, class cards, teachers, FAQ tabs, testimonials, and public calls to action. The local server returned HTTP 200 for all 45 HTML pages.

The home page without JavaScript retains static hero and explanatory copy, but dynamic metrics fall to zero and the FAQ details are absent. This is a real resilience and accessibility limitation, tagged `RUNTIME` in `issues.csv`.

The pre-confirmed badge glitch is wrong. The live page displays “New” and “2 free trial classes for every new student” correctly. The login lead omission of teachers is confirmed in the English translation and rendered login copy.

The enquiry-to-enrolment, trial-to-paid flow, attendance-to-fee flow, no-trial-charge rule, duplicate charge prevention, reversal, cash versus bank transfer, receipt verification, settlement, and recording approval workflows are represented in SQL tests and demo services. They were not fully executed end-to-end in this audit because that would require either mutating demo data repeatedly across separate role contexts or an approved staging database. The SQL execution status is explicitly recorded as **NOT EXECUTED**.

## E. Security

No service-role key was found in the inspected client configuration. The Supabase client source explicitly expects an anon public key and the migrations revoke broad table/function access and use RLS, role assertions, security-definer functions, and storage policies. The source also avoids exposing private teacher fields through public functions and validates public submission lengths, phone formats, rate limits, and approved recording hosts.

The most important security boundary is not currently live: Supabase is not configured. Browser demo authentication and localStorage role state are suitable for a preview but are not a production authorization mechanism. This is a readiness blocker, not evidence that a real Supabase environment is vulnerable.

The intended security headers in `_headers` are not active on GitHub Pages based on the live 404. Verify actual response headers on the deployed domain before accepting real data. PWA and offline behavior also need testing to confirm that drafts, cache entries, failed syncs, and sign-out behavior never resemble verified payments.

## F. Financial

The source model is directionally strong. The SQL tests cover free trials without charges, one-time admission fee, approval only after verified payment, duplicate prevention using `client_uuid`, payment deletion prevention, reversal on absence, admission-fee exclusion from teacher settlement, introductory commission, and student isolation from payment/ledger tables.

The app contains LKR formatting, ledger entry types, payment methods, receipt status, commission, WHT, reversal, and settlement concepts. These are source-level observations. Rounding, decimal behavior, historical dates, timezone conversion, and actual database constraints were not run in staging and remain release gates. Do not accept a production payment migration until the SQL suites pass and additional boundary tests cover fractional amounts, currency precision, backdated attendance, status reversal, voided receipts, duplicate sync, and timezone edges.

## G. UI/UX

The live public page and admin dashboard rendered at the browser's default desktop viewport. The public site exposes English and Tamil controls, a dark-theme control, responsive layout classes, mobile-oriented shells, bottom navigation for portal pages, empty-state components, skeleton loading states, error toasts, print-aware classes, and accessible labels in many shared components.

The audit did not complete a full visual matrix at 375px, 390px, tablet, desktop, dark theme, Tamil, print, keyboard-only, contrast, modal, chart, and offline states. Those items are marked in `COVERAGE.md` as source-only or not executed. The next pass should use screenshots and keyboard traversal at each required viewport and verify that tables, modals, charts, and bottom navigation remain usable.

## H. Technical

The project has a coherent current-stack architecture and build helpers for HTML, translations, and service worker output. The generated-file comments are useful, but CI should regenerate artifacts and fail on a dirty diff so source templates and deployed outputs cannot drift.

Relative asset references are internally consistent in the local source scan: no missing relative HTML `href` or `src` target was found. The live manifest and service worker are available under the repository subpath. Full service-worker install, update, offline, sync, and draft behavior was not executed.

The repository includes extensive `innerHTML` usage, but shared escaping helpers are used in many dynamic paths. This warrants a targeted XSS review of every user-controlled field and URL, not a rebuild. The SQL functions also validate public text and approved link hosts. Production sign-off should include a hostile-input test suite.

## I. Backend readiness

The central readiness gap is configuration: `js/config/supabase.js` still contains placeholder values and the live application explicitly identifies itself as preview/demo mode. No real backend was connected during this audit, as prohibited by the task.

Before real data, complete a staging Supabase deployment with migrations in order, seed only synthetic fixtures, configure Auth users and email flows, verify storage buckets, execute both SQL test suites, inspect RLS policies using separate JWT roles, verify RPC execute grants, test backup/restore, and confirm that no private record is reachable through public RPCs or storage URLs.

The current SQL source includes useful safeguards: role assertions, RLS, security-definer RPCs with fixed search paths, audit events, soft teacher removal, payment non-deletion, and private storage. These should be retained as the foundation of the current stack.

## J. Migration readiness

No historical import implementation was found in the audited top-level inventory. Before importing historical data, add a controlled import design with `import_batches`, source-to-target mapping, staging validation, duplicate detection, deterministic external IDs, error quarantine, reconciliation totals, dry-run reports, approval, rollback, and a preserved historical date/timezone policy.

Import financial data as immutable historical facts or audited adjustments. Do not overwrite current balances to make totals match. Reconcile payments, receipts, admission fees, attendance-derived charges, reversals, teacher settlements, and WHT separately.

SQL tests and migration source show a mature single-academy direction, but no `academy_id` or tenant-isolation model was found in the current migrations. This is a Phase 2 design decision, not a reason to retrofit tenant columns casually after production data exists.

## K. Exedra Phase 2 recommendations

Keep the current HTML/CSS/Bootstrap/vanilla ES-module stack and service boundary. Add multi-academy support at the data and authorization layers rather than rebuilding the UI.

First define the tenant model: `academies`, academy membership, academy-scoped roles, `academy_id` on every tenant-owned table, composite uniqueness where needed, tenant-aware RPC signatures, tenant-aware storage paths, and RLS policies that derive the academy from the authenticated membership rather than trusting a browser-supplied ID.

Then add plan and feature-flag tables, academy portability exports, per-academy configuration for currency/timezone/WHT/commission, backup and restore procedures, audit retention, and operational observability. Keep global public marketing content separate from academy-private operational data.

For portability, export students, teachers, classes, enrolments, attendance, ledger, payments, receipts, recordings metadata, audit log, and import lineage with stable IDs and timestamps. Test an export-import round trip into a new academy before calling the system portable.

## Audit conclusion

The project is a promising demo and architecture baseline. It is not a production-ready academy system until Supabase is configured in staging, the SQL/RLS suites pass, hosting headers and SEO root behavior are fixed or deliberately replaced, and the required role, financial, PWA, mobile, keyboard, and migration tests are executed and archived.

## Evidence and references

The complete findings register is in `issues.csv`. Runtime scripts, screenshots, and logs are in `tests/`, `screenshots/`, and `logs/`. The most important runtime evidence is `logs/runtime-results.json`, `screenshots/live-home.webp`, `screenshots/live-admin-dashboard.webp`, `screenshots/live-cashier-dashboard.webp`, and `logs/live-assets.txt`.
