-- ============================================================================
-- CatchUp — Migration 001: Social friend graph
-- Workstream: Social / Realtime
-- ============================================================================
--
-- Adds the friend graph that every other social feature (recommendations,
-- per-show progress sharing, Watch Together) will authorize against.
--
-- Apply order for a fresh project:
--   1. supabase-schema.sql   (baseline: profiles, my_list, liked_items,
--                             watch_progress)
--   2. supabase/migrations/001_social_friend_graph.sql   (this file)
--
-- This migration is additive. It does not drop or alter any existing column,
-- policy, or table, with two deliberate exceptions that are called out inline:
--   * public.profiles gains a nullable `username` column.
--   * public.handle_new_user() is replaced so new signups get a username.
-- Both are noted in docs/SOCIAL_SPEC.md as cross-workstream coordination points.
--
-- ---------------------------------------------------------------------------
-- Security model
-- ---------------------------------------------------------------------------
-- Row Level Security is the enforcement boundary. The RPCs below exist for
-- ergonomics and to keep authorization logic in one auditable place -- they are
-- not the security boundary, and almost all of them are SECURITY INVOKER so RLS
-- still applies inside them.
--
-- SECURITY DEFINER is used in exactly three places, each justified inline:
--   * are_friends()            -- must read the graph on behalf of policies
--   * accept_friend_request()  -- the ONLY writer of public.friendships
--   * search_users()           -- minimal disclosure on an exact match
-- Every SECURITY DEFINER function pins `search_path` to defeat search_path
-- hijacking, which is the standard escalation path against definer functions.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Usernames  (friend discovery without account enumeration)
-- ============================================================================
--
-- Discovery by raw email address confirms whether an address has a CatchUp
-- account, which is a disclosure we do not want to offer to unauthenticated
-- guessing. A username is a handle the user chooses to share, so it is the
-- safer primary discovery key. Email lookup is still supported for the case
-- where the searcher already knows the address (see search_users below).

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS username TEXT;

-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
    ON public.profiles (lower(username));

DO $$
BEGIN
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_username_format
        CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Derives a unique, URL-safe handle from an email local part.
-- Used by the signup trigger and by the backfill below.
CREATE OR REPLACE FUNCTION public.generate_username(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_base      TEXT;
    v_candidate TEXT;
    v_suffix    INTEGER := 0;
BEGIN
    -- Keep only characters legal in a handle.
    v_base := lower(regexp_replace(split_part(coalesce(p_email, ''), '@', 1),
                                   '[^a-z0-9_]', '', 'gi'));

    IF length(v_base) < 3 THEN
        v_base := 'user' || v_base;
    END IF;

    v_base      := left(v_base, 16);
    v_candidate := v_base;

    -- Suffix until free. Bounded so a pathological collision cannot spin.
    WHILE EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(username) = v_candidate
    ) AND v_suffix < 10000 LOOP
        v_suffix    := v_suffix + 1;
        v_candidate := left(v_base, 16) || v_suffix::TEXT;
    END LOOP;

    RETURN v_candidate;
END;
$$;

-- Backfill handles for accounts that predate this migration.
UPDATE public.profiles
SET username = public.generate_username(email)
WHERE username IS NULL;

-- Replaces the baseline trigger function so new signups get a handle
-- immediately. The only change from supabase-schema.sql is the username
-- column; profile creation behavior is otherwise identical.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, username)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        public.generate_username(NEW.email)
    );
    RETURN NEW;
END;
$$;

-- Users may set their own handle. The format CHECK and the unique index
-- enforce validity; this policy only governs who may attempt the write.
-- (The baseline "Users can update their own profile" policy already scopes
-- UPDATE to auth.uid() = id, so no new policy is required here.)

-- ============================================================================
-- 2. friendships  (canonical, symmetric)
-- ============================================================================
--
-- One row per friendship, never two mirrored rows. The CHECK enforces a
-- canonical ordering (user_a_id < user_b_id) so a pair can be stored exactly
-- one way. This makes "are these two friends" a single unambiguous lookup and
-- makes unfriending a single atomic DELETE with no risk of half-removed state.
--
-- Foreign keys point at public.profiles rather than auth.users so that a
-- friendship always has a readable profile on both ends, and so PostgREST can
-- embed profile rows if a future feature needs it.

CREATE TABLE IF NOT EXISTS public.friendships (
    user_a_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_a_id, user_b_id),
    CONSTRAINT friendships_canonical_order CHECK (user_a_id < user_b_id)
);

-- The PK covers lookups by user_a_id; this covers the other direction.
CREATE INDEX IF NOT EXISTS idx_friendships_user_b
    ON public.friendships (user_b_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- DELETE events over Realtime only carry the old row under FULL replica
-- identity, which the client needs in order to know which friendship ended.
ALTER TABLE public.friendships REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friendships;
CREATE POLICY "Users can view their own friendships"
    ON public.friendships FOR SELECT
    USING (auth.uid() IN (user_a_id, user_b_id));

-- Either party may end the friendship unilaterally.
DROP POLICY IF EXISTS "Users can remove their own friendships" ON public.friendships;
CREATE POLICY "Users can remove their own friendships"
    ON public.friendships FOR DELETE
    USING (auth.uid() IN (user_a_id, user_b_id));

-- NOTE: there is deliberately NO INSERT policy and NO UPDATE policy on
-- public.friendships. The only code path that can create an edge is
-- accept_friend_request(), which is SECURITY DEFINER. This means a client
-- cannot forge a friendship under any circumstances, even with a valid JWT and
-- direct table access -- consent is structurally required, not merely checked.

-- ----------------------------------------------------------------------------
-- are_friends(a, b) -- the single source of truth for "are these two friends".
--
-- Defined here, immediately after the table it reads, because the policies in
-- the sections below depend on it and Postgres resolves function references at
-- CREATE POLICY time.
--
-- SECURITY DEFINER because it is called from RLS policies on other tables
-- (profiles today; watch_progress once per-show progress sharing lands) where
-- the caller may not be one of the two users being compared. Centralizing it
-- means the friendship rule is defined exactly once and every future policy
-- inherits any correction to it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user_a IS NOT NULL
       AND p_user_b IS NOT NULL
       AND p_user_a <> p_user_b
       AND EXISTS (
            SELECT 1
            FROM public.friendships f
            WHERE f.user_a_id = least(p_user_a, p_user_b)
              AND f.user_b_id = greatest(p_user_a, p_user_b)
        );
$$;

-- ============================================================================
-- 3. friend_requests  (directional, with lifecycle)
-- ============================================================================

DO $$
BEGIN
    CREATE TYPE public.friend_request_status
        AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.friend_requests (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status       public.friend_request_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT friend_requests_no_self CHECK (sender_id <> recipient_id)
);

-- At most one *open* request per ordered pair. Terminal rows are retained as
-- history, so a declined request can be re-sent later without conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_unique_pending
    ON public.friend_requests (sender_id, recipient_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient
    ON public.friend_requests (recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
    ON public.friend_requests (sender_id, status);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Users can view requests they sent or received" ON public.friend_requests;
CREATE POLICY "Users can view requests they sent or received"
    ON public.friend_requests FOR SELECT
    USING (auth.uid() IN (sender_id, recipient_id));

-- A user may only ever create a request in their own name, to someone who is
-- not already a friend. Enforced here rather than only in send_friend_request()
-- so that direct table access is equally safe.
DROP POLICY IF EXISTS "Users can send requests as themselves" ON public.friend_requests;
CREATE POLICY "Users can send requests as themselves"
    ON public.friend_requests FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND sender_id <> recipient_id
        AND status = 'pending'
        AND NOT public.are_friends(sender_id, recipient_id)
    );

-- Both parties can transition a request, but only one they are part of.
-- Which transitions are legal is enforced by the RPCs and the CHECK above;
-- this policy governs reachability only.
DROP POLICY IF EXISTS "Participants can update their requests" ON public.friend_requests;
CREATE POLICY "Participants can update their requests"
    ON public.friend_requests FOR UPDATE
    USING (auth.uid() IN (sender_id, recipient_id))
    WITH CHECK (auth.uid() IN (sender_id, recipient_id));

-- ============================================================================
-- 4. profiles disclosure
-- ============================================================================
--
-- The baseline policy is `auth.uid() = id`, i.e. you can read nobody's profile
-- but your own -- which makes every social surface unrenderable. This adds the
-- minimum disclosure needed: friends, and the counterparty of an open request
-- (without which a request inbox cannot show who is asking).
--
-- Postgres ORs permissive policies together, so this widens rather than
-- replaces the baseline self-access policy, which is left untouched.
--
-- Recursion check: this policy reads friend_requests, whose own policies
-- compare only against auth.uid() and never reference profiles. are_friends()
-- is SECURITY DEFINER and so does not re-enter friendships' policies. No cycle.

DROP POLICY IF EXISTS "Users can view friend and pending-request profiles" ON public.profiles;
CREATE POLICY "Users can view friend and pending-request profiles"
    ON public.profiles FOR SELECT
    USING (
        public.are_friends(auth.uid(), id)
        OR EXISTS (
            SELECT 1
            FROM public.friend_requests r
            WHERE r.status = 'pending'
              AND (
                    (r.sender_id = auth.uid() AND r.recipient_id = profiles.id)
                 OR (r.recipient_id = auth.uid() AND r.sender_id = profiles.id)
              )
        )
    );

-- ============================================================================
-- 5. Functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- accept_friend_request(request_id)
--
-- The ONLY writer of public.friendships. SECURITY DEFINER is required because
-- friendships has no INSERT policy by design. The function re-derives the
-- acting user from auth.uid() and refuses unless that user is the recipient of
-- a pending request, so elevated rights are never exercised on behalf of a
-- caller who has not been asked.
--
-- The request transition and the edge creation happen in one statement pair
-- inside the caller's transaction, so a friendship can never exist without an
-- accepted request behind it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_sender    UUID;
    v_recipient UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    -- Lock the row so two concurrent accepts cannot both proceed.
    SELECT sender_id, recipient_id
      INTO v_sender, v_recipient
      FROM public.friend_requests
     WHERE id = p_request_id
       AND status = 'pending'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend request not found or already resolved'
            USING ERRCODE = '02000';
    END IF;

    -- Only the recipient may accept. This is the check that makes DEFINER safe.
    IF v_recipient <> v_uid THEN
        RAISE EXCEPTION 'Only the recipient can accept this request'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.friend_requests
       SET status = 'accepted', responded_at = NOW()
     WHERE id = p_request_id;

    INSERT INTO public.friendships (user_a_id, user_b_id)
    VALUES (least(v_sender, v_recipient), greatest(v_sender, v_recipient))
    ON CONFLICT DO NOTHING;

    -- Any request pointing the other way is now redundant.
    UPDATE public.friend_requests
       SET status = 'accepted', responded_at = NOW()
     WHERE status = 'pending'
       AND sender_id = v_recipient
       AND recipient_id = v_sender;
END;
$$;

-- ----------------------------------------------------------------------------
-- send_friend_request(recipient_id)
--
-- SECURITY INVOKER: the INSERT below is subject to the RLS policy above, so
-- this function is a convenience and an invariant checker, never a bypass.
-- It exists to give the UI clear errors and to handle the reciprocal case.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_friend_request(p_recipient_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid          UUID := auth.uid();
    v_reciprocal   UUID;
    v_pending_sent INTEGER;
    v_request_id   UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    IF p_recipient_id IS NULL OR p_recipient_id = v_uid THEN
        RAISE EXCEPTION 'You cannot send a friend request to yourself'
            USING ERRCODE = '22023';
    END IF;

    IF public.are_friends(v_uid, p_recipient_id) THEN
        RAISE EXCEPTION 'You are already friends' USING ERRCODE = '23505';
    END IF;

    -- If they already asked us, accepting is the intended outcome rather than
    -- leaving two symmetric pending requests sitting unanswered.
    SELECT id INTO v_reciprocal
      FROM public.friend_requests
     WHERE sender_id = p_recipient_id
       AND recipient_id = v_uid
       AND status = 'pending'
     LIMIT 1;

    IF v_reciprocal IS NOT NULL THEN
        PERFORM public.accept_friend_request(v_reciprocal);
        RETURN v_reciprocal;
    END IF;

    -- Cheap abuse ceiling on outbound request spam.
    SELECT count(*) INTO v_pending_sent
      FROM public.friend_requests
     WHERE sender_id = v_uid
       AND status = 'pending';

    IF v_pending_sent >= 50 THEN
        RAISE EXCEPTION 'Too many pending friend requests' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.friend_requests (sender_id, recipient_id)
    VALUES (v_uid, p_recipient_id)
    ON CONFLICT (sender_id, recipient_id) WHERE status = 'pending'
    DO NOTHING
    RETURNING id INTO v_request_id;

    -- Already had an identical pending request; return it so the call is
    -- idempotent from the caller's point of view.
    IF v_request_id IS NULL THEN
        SELECT id INTO v_request_id
          FROM public.friend_requests
         WHERE sender_id = v_uid
           AND recipient_id = p_recipient_id
           AND status = 'pending';
    END IF;

    RETURN v_request_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- decline_friend_request / cancel_friend_request
--
-- SECURITY INVOKER. Both are ordinary UPDATEs constrained by RLS; the WHERE
-- clauses make the role requirement explicit rather than relying on the policy
-- alone (defence in depth -- the policy permits either participant to update,
-- these restrict each verb to the correct side).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    UPDATE public.friend_requests
       SET status = 'declined', responded_at = NOW()
     WHERE id = p_request_id
       AND recipient_id = v_uid
       AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend request not found or not yours to decline'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    UPDATE public.friend_requests
       SET status = 'cancelled', responded_at = NOW()
     WHERE id = p_request_id
       AND sender_id = v_uid
       AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend request not found or not yours to cancel'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- unfriend(other_user_id)
--
-- SECURITY INVOKER -- the DELETE policy already allows either party. This just
-- spares the client from having to know the canonical column ordering.
--
-- Once per-show progress sharing lands, this is the seam where shares are
-- revoked. The friend-read policy on watch_progress will also re-check
-- are_friends() at read time, so revocation is immediate either way; deleting
-- the share rows here additionally avoids retaining a grant that is no longer
-- meaningful.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unfriend(p_other_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    DELETE FROM public.friendships
     WHERE user_a_id = least(v_uid, p_other_user_id)
       AND user_b_id = greatest(v_uid, p_other_user_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- list_friends()
--
-- SECURITY INVOKER: returns rows only because the profiles policy above lets
-- the caller see friends' profiles. Hides the canonical a/b ordering from the
-- client and avoids PostgREST embedding hints for a two-FK table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_friends()
RETURNS TABLE (
    user_id       UUID,
    username      TEXT,
    full_name     TEXT,
    avatar_url    TEXT,
    friends_since TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT p.id, p.username, p.full_name, p.avatar_url, f.created_at
      FROM public.friendships f
      JOIN public.profiles p
        ON p.id = CASE WHEN f.user_a_id = auth.uid()
                       THEN f.user_b_id ELSE f.user_a_id END
     WHERE auth.uid() IN (f.user_a_id, f.user_b_id)
     ORDER BY coalesce(p.full_name, p.username), p.id;
$$;

-- ----------------------------------------------------------------------------
-- list_incoming_friend_requests / list_outgoing_friend_requests
--
-- SECURITY INVOKER. Pending only: a declined request is not surfaced back to
-- the sender, so declining stays quiet rather than being reported as a refusal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_incoming_friend_requests()
RETURNS TABLE (
    request_id UUID,
    user_id    UUID,
    username   TEXT,
    full_name  TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT r.id, p.id, p.username, p.full_name, p.avatar_url, r.created_at
      FROM public.friend_requests r
      JOIN public.profiles p ON p.id = r.sender_id
     WHERE r.recipient_id = auth.uid()
       AND r.status = 'pending'
     ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_outgoing_friend_requests()
RETURNS TABLE (
    request_id UUID,
    user_id    UUID,
    username   TEXT,
    full_name  TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT r.id, p.id, p.username, p.full_name, p.avatar_url, r.created_at
      FROM public.friend_requests r
      JOIN public.profiles p ON p.id = r.recipient_id
     WHERE r.sender_id = auth.uid()
       AND r.status = 'pending'
     ORDER BY r.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- search_users(query)
--
-- SECURITY DEFINER, and the one place a non-friend's profile is disclosed.
-- Three properties make that acceptable:
--   * Exact match only -- no prefix, no fuzzy, no LIKE. A searcher must
--     already know the handle or address, so this cannot be used to enumerate
--     the user base or harvest the directory.
--   * A fixed, minimal projection: id, username, full_name, avatar_url. Email
--     is never returned, so an email lookup confirms nothing the searcher did
--     not already supply.
--   * The caller's own row is excluded.
--
-- It also returns the current relationship so the UI can render the correct
-- action without a second round trip that would itself leak state.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_users(p_query TEXT)
RETURNS TABLE (
    user_id      UUID,
    username     TEXT,
    full_name    TEXT,
    avatar_url   TEXT,
    relationship TEXT,
    request_id   UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_query TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    -- Tolerate a leading "@" so a pasted handle just works.
    v_query := lower(trim(both from coalesce(p_query, '')));
    v_query := ltrim(v_query, '@');

    IF length(v_query) < 3 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        CASE
            WHEN public.are_friends(v_uid, p.id) THEN 'friends'
            WHEN incoming.id IS NOT NULL         THEN 'incoming_request'
            WHEN outgoing.id IS NOT NULL         THEN 'outgoing_request'
            ELSE 'none'
        END::TEXT,
        coalesce(incoming.id, outgoing.id)
    FROM public.profiles p
    LEFT JOIN LATERAL (
        SELECT r.id FROM public.friend_requests r
         WHERE r.sender_id = p.id AND r.recipient_id = v_uid
           AND r.status = 'pending' LIMIT 1
    ) incoming ON TRUE
    LEFT JOIN LATERAL (
        SELECT r.id FROM public.friend_requests r
         WHERE r.sender_id = v_uid AND r.recipient_id = p.id
           AND r.status = 'pending' LIMIT 1
    ) outgoing ON TRUE
    WHERE p.id <> v_uid
      AND (lower(p.username) = v_query OR lower(p.email) = v_query)
    LIMIT 10;
END;
$$;

-- ----------------------------------------------------------------------------
-- set_username(username) -- claim or change a handle, with a clear error.
-- SECURITY INVOKER: the UPDATE is governed by the baseline profiles policy.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_username(p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_username TEXT := lower(trim(both from coalesce(p_username, '')));
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    IF v_username !~ '^[a-z0-9_]{3,20}$' THEN
        RAISE EXCEPTION 'Username must be 3-20 characters, using a-z, 0-9 or _'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.profiles
         WHERE lower(username) = v_username AND id <> v_uid
    ) THEN
        RAISE EXCEPTION 'That username is taken' USING ERRCODE = '23505';
    END IF;

    UPDATE public.profiles SET username = v_username WHERE id = v_uid;
END;
$$;

-- ============================================================================
-- 6. Grants
-- ============================================================================
-- Table privileges are still gated by RLS; these grants only make the tables
-- and RPCs reachable by the PostgREST roles.

GRANT SELECT, DELETE          ON public.friendships     TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.friend_requests TO authenticated;

GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfriend(UUID)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friends()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_incoming_friend_requests()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_outgoing_friend_requests()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(TEXT)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_username(TEXT)                TO authenticated;

-- generate_username is an internal helper for the signup trigger and backfill.
REVOKE EXECUTE ON FUNCTION public.generate_username(TEXT) FROM PUBLIC;

-- ============================================================================
-- 7. Realtime
-- ============================================================================
-- Publishing these two tables lets a friend request appear in the recipient's
-- inbox without a refresh. RLS still applies to Realtime, so a client only
-- receives change events for rows its policies already permit it to read.
--
-- This is deliberately the first Realtime surface in CatchUp: it proves the
-- Realtime + RLS plumbing on a low-risk feature before Watch Together depends
-- on the same mechanism for playback synchronization.
--
-- Guarded because the publication only exists on a real Supabase project, and
-- because re-running the migration would otherwise fail on a duplicate.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

COMMIT;
