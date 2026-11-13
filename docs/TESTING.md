# Testing guide

## 1. Database rules (most important)
Supabase → SQL Editor → paste `supabase/tests/flow_and_rls_tests.sql` → Run → look for **ALL TESTS PASSED**.
It runs in a transaction and rolls back, so it is safe on your live project.

What it proves:

| # | Rule |
|---|---|
| 1 | Student IDs look like `MA-0001`; enrolment codes like `MMPE-001` |
| 2 | Student logins link to student records by email |
| 3 | Trial sessions are stored as `trial` and **never** create charges; 2 trials → "trial completed" |
| 4 | Admission fee (LKR 250) is charged **once** per enrolment |
| 5 | Approval is blocked until the minimum payment is **verified** |
| 6 | A student's "receipt sent" does not count as payment and issues no receipt |
| 7 | A student cannot verify their own payment |
| 8 | Admin verification issues exactly one receipt |
| 9 | Marking the same session twice never double-charges; Absent reverses the charge |
| 10 | Offline cash payments with the same client id are saved once |
| 11 | Payments can never be deleted |
| 12 | First-month commission is 0% and admission fees are excluded from teacher revenue |
| 13 | Student B sees none of Student A's students/payments/ledger/enrolments/receipts/statement |
| 14 | Students cannot see settlements or the audit log, and cannot make themselves admin |
| 15 | Cashiers cannot approve enrolments |
| 16 | Anonymous visitors cannot read students, teachers or payments; public teacher data contains no bank details |

**Version 2:** also run `supabase/tests/v2_feature_tests.sql` and look for **ALL V2 TESTS PASSED**. It checks that teachers see only their own classes and no private data, students can't see unapproved recordings or other students, poll answers stay private, and settlements/reconciliations can only be deleted through the audited admin function.

Optional local run (Linux with PostgreSQL installed): `bash tools/localdb/run_db_tests.sh`

## 2. Front-end checks
```bash
for f in $(find js tools -name "*.js" -o -name "*.mjs"); do node --check "$f" || echo "SYNTAX ERROR: $f"; done
node tools/i18n_keys.mjs          # every English key has a Tamil translation
```

## 3. Manual checks
See **Step 8** in `BACKEND_SETUP_TODO.md` (works on phone and laptop, EN and TA).
- Teacher panel: log in as `teacher@mentora.demo` / `demo1234` and open every page under `/teacher/`.
- Check light **and** dark theme, English **and** தமிழ், on a 375 px phone width.
