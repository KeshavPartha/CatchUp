#!/usr/bin/env bash
#
# Runs the CatchUp RLS privacy suites against throwaway PostgreSQL databases.
#
#   ./supabase/tests/run-rls-tests.sh          run every suite
#   ./supabase/tests/run-rls-tests.sh social   run suites matching "social"
#
# Requires only a local PostgreSQL server and psql -- no Supabase project, no
# network, no secrets. supabase/tests/bootstrap.sql shims the parts of Supabase
# the policies depend on (auth schema, auth.uid(), the PostgREST roles).
#
# Each suite gets its OWN freshly built database. That isolation is deliberate:
# suites seed their own users, so sharing a database would let one suite's rows
# change another's results and make failures depend on filename order. Databases
# are dropped on exit, including on failure.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILTER="${1:-}"

command -v psql >/dev/null 2>&1 || { echo "error: psql not found." >&2; exit 1; }
pg_isready -q || { echo "error: no PostgreSQL server accepting connections." >&2; exit 1; }

CURRENT_DB=""
cleanup() {
    [ -n "$CURRENT_DB" ] && dropdb --if-exists "$CURRENT_DB" 2>/dev/null || true
}
trap cleanup EXIT

# Builds a database at the current schema: shim, baseline, migrations, grants.
build_db() {
    local db="$1"
    createdb "$db"

    # Order matters: the shim must exist before the baseline schema, because
    # supabase-schema.sql attaches a trigger to auth.users.
    psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$ROOT/supabase/tests/bootstrap.sql" >/dev/null
    psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$ROOT/supabase-schema.sql" >/dev/null

    for migration in "$ROOT"/supabase/migrations/*.sql; do
        [ -e "$migration" ] || continue
        psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$migration" >/dev/null
    done

    # Applied last so it covers every object the migrations created.
    psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$ROOT/supabase/tests/grants.sql" >/dev/null
}

suites=0
for suite in "$ROOT"/supabase/tests/rls_*.sql; do
    [ -e "$suite" ] || continue
    name="$(basename "$suite" .sql)"

    if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then
        continue
    fi

    CURRENT_DB="catchup_test_${name}_$$"
    build_db "$CURRENT_DB"
    psql -v ON_ERROR_STOP=1 -q -d "$CURRENT_DB" -f "$suite"
    dropdb --if-exists "$CURRENT_DB"
    CURRENT_DB=""
    suites=$((suites + 1))
done

if [ "$suites" -eq 0 ]; then
    echo "no suites matched${FILTER:+ \"$FILTER\"}" >&2
    exit 1
fi

echo ""
echo "$suites suite(s) passed."
