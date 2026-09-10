-- ============================================================================
-- CatchUp — Test bootstrap: a minimal Supabase-compatible shim
-- ============================================================================
--
-- Recreates just enough of a Supabase project on a stock PostgreSQL server for
-- the RLS suite to run: the `auth` schema, `auth.users`, `auth.uid()`, and the
-- PostgREST roles. This lets privacy tests run locally, in CI, and on any
-- developer machine with psql -- no Supabase project, no network, no secrets.
--
-- This file is TEST INFRASTRUCTURE ONLY. It is never applied to a real project,
-- where Supabase provides all of the below.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Roles that PostgREST authenticates as. NOLOGIN: they are assumed via SET ROLE.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- auth schema
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email              TEXT UNIQUE NOT NULL,
    raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mirrors Supabase's auth.uid(): reads the `sub` claim of the request JWT.
-- Tests impersonate a user by setting request.jwt.claims directly.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(
        nullif(current_setting('request.jwt.claims', true), '')::json->>'sub',
        ''
    )::UUID;
$$;

GRANT USAGE   ON SCHEMA auth           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid()   TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Test assertion helpers
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS test;

-- Passing assertion prints; a failing one aborts the run (psql ON_ERROR_STOP).
CREATE OR REPLACE FUNCTION test.ok(p_label TEXT, p_condition BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF coalesce(p_condition, FALSE) THEN
        RAISE NOTICE '  PASS   %', p_label;
    ELSE
        RAISE EXCEPTION 'FAILED: %', p_label;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION test.eq(p_label TEXT, p_actual BIGINT, p_expected BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_actual IS NOT DISTINCT FROM p_expected THEN
        RAISE NOTICE '  PASS   % (= %)', p_label, p_expected;
    ELSE
        RAISE EXCEPTION 'FAILED: % -- expected %, got %',
            p_label, p_expected, p_actual;
    END IF;
END;
$$;

-- Asserts a statement is REFUSED. The rejection reason is printed so a reviewer
-- can confirm the statement failed for the security reason intended and not,
-- say, a typo in the test itself.
CREATE OR REPLACE FUNCTION test.denied(p_label TEXT, p_sql TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_rejected BOOLEAN := FALSE;
    v_reason   TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_rejected := TRUE;
        v_reason   := SQLERRM;
    END;

    IF v_rejected THEN
        RAISE NOTICE '  PASS   % [rejected: %]', p_label, v_reason;
    ELSE
        RAISE EXCEPTION
            'FAILED: % -- statement was PERMITTED but must be denied', p_label;
    END IF;
END;
$$;

-- Values carried between test transactions (request ids and the like). Lives
-- outside `public` and has no RLS, so impersonated roles can read it freely.
CREATE TABLE IF NOT EXISTS test.fixtures (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION test.fixture(p_key TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT value::UUID FROM test.fixtures WHERE key = p_key;
$$;

-- Impersonate a user for subsequent statements in this transaction.
CREATE OR REPLACE FUNCTION test.act_as(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', p_user_id, 'role', 'authenticated')::TEXT,
                       TRUE);
END;
$$;

-- Makes two users friends, going through the real request/accept path rather
-- than inserting an accepted row -- which the transition trigger forbids
-- anyway, and which would skip the very consent rule under test elsewhere.
CREATE OR REPLACE FUNCTION test.befriend(p_a UUID, p_b UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_request UUID;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_a)::TEXT, TRUE);
    v_request := public.send_friend_request(p_b);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_b)::TEXT, TRUE);
    PERFORM public.accept_friend_request(v_request);
END;
$$;

GRANT USAGE  ON SCHEMA test           TO anon, authenticated;
GRANT SELECT ON test.fixtures         TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated;
