#!/usr/bin/env bash
# OPTIONAL (advanced): run all migrations + tests on a LOCAL PostgreSQL (needs `sudo apt install postgresql`).
# You do NOT need this for Supabase — there you just paste the files into the SQL Editor.
set -e
cd "$(dirname "$0")/../.."
DB=mentora_test
sudo -u postgres dropdb --if-exists $DB
sudo -u postgres createdb $DB
for f in tools/localdb/supabase_shim.sql supabase/migrations/00*.sql supabase/seed.sql supabase/tests/flow_and_rls_tests.sql supabase/tests/v2_feature_tests.sql; do
  echo "→ $f"; sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f" > /dev/null
done
echo "Done. If you saw 'ALL TESTS PASSED' above, the database rules work."
