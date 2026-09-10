#!/usr/bin/env bash
#
# Runs the CatchUp RLS privacy suite against a throwaway PostgreSQL database.
#
#   ./supabase/tests/run-rls-tests.sh        (or: npm run test:rls)
#
# Requires only a local PostgreSQL server and psql -- no Supabase project, no
# network, no secrets. supabase/tests/bootstrap.sql shims the parts of Supabase
# the policies depend on (auth schema, auth.uid(), the PostgREST roles).
#
# The database is created fresh and dropped on exit, including on failure, so
# runs never interfere with each other or leave anything behind.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="catchup_rls_test_$$"

if ! command -v psql >/dev/null 2>&1; then
    echo "error: psql not found. Install PostgreSQL client tools." >&2
    exit 1
fi

if ! pg_isready -q; then
    echo "error: no PostgreSQL server is accepting connections." >&2
    exit 1
fi

cleanup() {
    dropdb --if-exists "$DB" 2>/dev/null || true
}
trap cleanup EXIT

createdb "$DB"

# Order matters: the shim must exist before the baseline schema, because
# supabase-schema.sql attaches a trigger to auth.users.
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/tests/bootstrap.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase-schema.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
    [ -e "$migration" ] || continue
    echo "applying $(basename "$migration")"
    psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$migration"
done

# Applied last so it covers every object the migrations created.
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/tests/grants.sql"

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/tests/rls_social.sql"
