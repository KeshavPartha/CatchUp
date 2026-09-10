-- ============================================================================
-- CatchUp — Test grants: replicate Supabase's default public-schema grants
-- ============================================================================
--
-- On a real Supabase project the `authenticated` role holds broad table
-- privileges and Row Level Security is what actually gates access. Replicating
-- that here is deliberate: it means the suite tests RLS under the same
-- permissive grant conditions as production, rather than passing because a
-- missing GRANT happened to block the statement.
--
-- Applied after the schema and migrations so every object is covered.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- generate_username stays internal even under the permissive default above.
REVOKE EXECUTE ON FUNCTION public.generate_username(TEXT) FROM PUBLIC, anon, authenticated;
