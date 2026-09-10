-- ============================================================================
-- CatchUp — Migration 002: Friend-to-friend recommendations
-- Workstream: Social / Realtime
-- ============================================================================
--
-- "Friend recommends a show -> user starts watching" is the first step of the
-- vision's connected journey, and the first thing friendship actually unlocks.
--
-- Depends on 001 (friendships, are_friends). Additive; touches nothing owned by
-- another workstream.
--
-- Privacy shape:
--   * A recommendation is a deliberate, addressed act -- never derived from
--     what someone watched, liked, or added to a list.
--   * It carries a title and an optional note. It carries no progress, no
--     history, and no implication that the sender has watched it.
--   * Friendship is required by the INSERT policy itself, so it is enforced by
--     the database rather than assumed by the UI.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Table
-- ============================================================================

DO $$
BEGIN
    CREATE TYPE public.recommendation_status
        AS ENUM ('pending', 'seen', 'dismissed', 'added');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.recommendations (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_id     INTEGER NOT NULL,
    media_type   TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    note         TEXT CHECK (note IS NULL OR length(note) <= 280),
    status       public.recommendation_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT recommendations_no_self CHECK (sender_id <> recipient_id),
    -- One recommendation of a given title per pair, ever. Re-sending after a
    -- dismissal would be a nagging vector, so `recommend_title` is idempotent
    -- and returns the existing row instead.
    CONSTRAINT recommendations_unique_per_pair
        UNIQUE (sender_id, recipient_id, media_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_recipient
    ON public.recommendations (recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_sender
    ON public.recommendations (sender_id, created_at DESC);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations REPLICA IDENTITY FULL;

-- ============================================================================
-- 2. Policies
-- ============================================================================

-- Both parties can see it. Deliberately NOT re-checking friendship on read:
-- a recommendation already delivered should not silently vanish from the
-- recipient's inbox if the sender later unfriends them. Un-acted-upon
-- recommendations are instead cleaned up explicitly by the trigger below.
DROP POLICY IF EXISTS "Users can view recommendations they sent or received" ON public.recommendations;
CREATE POLICY "Users can view recommendations they sent or received"
    ON public.recommendations FOR SELECT
    USING (auth.uid() IN (sender_id, recipient_id));

-- Friendship is required to send, enforced here rather than only in the RPC,
-- so direct table access is equally safe.
DROP POLICY IF EXISTS "Friends can send recommendations" ON public.recommendations;
CREATE POLICY "Friends can send recommendations"
    ON public.recommendations FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND sender_id <> recipient_id
        AND status = 'pending'
        AND public.are_friends(sender_id, recipient_id)
    );

-- Only the recipient responds. The sender must not be able to mark their own
-- recommendation as seen or added on the recipient's behalf.
DROP POLICY IF EXISTS "Recipients can respond to recommendations" ON public.recommendations;
CREATE POLICY "Recipients can respond to recommendations"
    ON public.recommendations FOR UPDATE
    USING (auth.uid() = recipient_id)
    WITH CHECK (auth.uid() = recipient_id);

-- The sender may withdraw what they sent; the recipient may delete what they
-- received. Either way it is that person's own copy of the exchange.
DROP POLICY IF EXISTS "Participants can remove recommendations" ON public.recommendations;
CREATE POLICY "Participants can remove recommendations"
    ON public.recommendations FOR DELETE
    USING (auth.uid() IN (sender_id, recipient_id));

-- ============================================================================
-- 3. Unfriending withdraws un-acted-upon recommendations
-- ============================================================================
--
-- A pending recommendation is an open invitation that only made sense between
-- friends, so ending the friendship should withdraw it. Recommendations the
-- recipient already acted on (added or dismissed) are left alone -- those are
-- history, not open invitations.
--
-- This also keeps the inbox consistent: after unfriending, the sender's profile
-- is no longer readable, so a surviving pending row could not be rendered.

CREATE OR REPLACE FUNCTION public.handle_friendship_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.recommendations
     WHERE status = 'pending'
       AND (
             (sender_id = OLD.user_a_id AND recipient_id = OLD.user_b_id)
          OR (sender_id = OLD.user_b_id AND recipient_id = OLD.user_a_id)
       );

    -- NOTE: this is also where progress_shares must be revoked once migration
    -- 003 lands. The watch_progress friend-read policy will re-check
    -- are_friends() at read time as well, so access ends immediately either
    -- way -- but a grant that no longer means anything should not be retained.
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_friendship_removed ON public.friendships;
CREATE TRIGGER on_friendship_removed
    AFTER DELETE ON public.friendships
    FOR EACH ROW EXECUTE FUNCTION public.handle_friendship_removed();

-- ============================================================================
-- 4. Functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- recommend_title(recipient, media_id, media_type, note)
--
-- SECURITY INVOKER: the INSERT is subject to the policy above, so this is an
-- invariant checker and error-message surface, not a bypass.
-- Idempotent -- recommending the same title twice returns the original row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recommend_title(
    p_recipient_id UUID,
    p_media_id     INTEGER,
    p_media_type   TEXT,
    p_note         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
    v_id   UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT public.are_friends(v_uid, p_recipient_id) THEN
        RAISE EXCEPTION 'You can only recommend titles to friends'
            USING ERRCODE = '42501';
    END IF;

    IF p_media_type NOT IN ('movie', 'tv') THEN
        RAISE EXCEPTION 'Unknown media type' USING ERRCODE = '22023';
    END IF;

    IF length(coalesce(v_note, '')) > 280 THEN
        RAISE EXCEPTION 'Notes are limited to 280 characters' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.recommendations (sender_id, recipient_id, media_id, media_type, note)
    VALUES (v_uid, p_recipient_id, p_media_id, p_media_type, v_note)
    ON CONFLICT ON CONSTRAINT recommendations_unique_per_pair DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        SELECT id INTO v_id
          FROM public.recommendations
         WHERE sender_id = v_uid
           AND recipient_id = p_recipient_id
           AND media_id = p_media_id
           AND media_type = p_media_type;
    END IF;

    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- set_recommendation_status(id, status)
--
-- SECURITY INVOKER. The UPDATE policy restricts this to the recipient; the
-- WHERE clause states the same requirement explicitly (defence in depth) and
-- refuses the transitions that are not the recipient's to make.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_recommendation_status(
    p_id     UUID,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF p_status NOT IN ('seen', 'dismissed', 'added') THEN
        RAISE EXCEPTION 'Unknown recommendation status' USING ERRCODE = '22023';
    END IF;

    UPDATE public.recommendations
       SET status = p_status::public.recommendation_status,
           responded_at = NOW()
     WHERE id = p_id
       AND recipient_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recommendation not found or not yours to respond to'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- withdraw_recommendation(id) -- sender removes something they sent.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_recommendation(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    DELETE FROM public.recommendations
     WHERE id = p_id AND sender_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recommendation not found or not yours to withdraw'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- list_incoming_recommendations(include_resolved)
--
-- SECURITY INVOKER. Joins profiles, so it returns rows only because the
-- profiles policy from 001 permits reading a friend's profile.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_incoming_recommendations(
    p_include_resolved BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    recommendation_id UUID,
    media_id          INTEGER,
    media_type        TEXT,
    note              TEXT,
    status            TEXT,
    created_at        TIMESTAMP WITH TIME ZONE,
    user_id           UUID,
    username          TEXT,
    full_name         TEXT,
    avatar_url        TEXT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT r.id, r.media_id, r.media_type, r.note, r.status::TEXT, r.created_at,
           p.id, p.username, p.full_name, p.avatar_url
      FROM public.recommendations r
      JOIN public.profiles p ON p.id = r.sender_id
     WHERE r.recipient_id = auth.uid()
       AND (p_include_resolved OR r.status IN ('pending', 'seen'))
     ORDER BY r.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- list_outgoing_recommendations()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_outgoing_recommendations()
RETURNS TABLE (
    recommendation_id UUID,
    media_id          INTEGER,
    media_type        TEXT,
    note              TEXT,
    status            TEXT,
    created_at        TIMESTAMP WITH TIME ZONE,
    user_id           UUID,
    username          TEXT,
    full_name         TEXT,
    avatar_url        TEXT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT r.id, r.media_id, r.media_type, r.note, r.status::TEXT, r.created_at,
           p.id, p.username, p.full_name, p.avatar_url
      FROM public.recommendations r
      JOIN public.profiles p ON p.id = r.recipient_id
     WHERE r.sender_id = auth.uid()
     ORDER BY r.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- list_recommendation_targets(media_id, media_type)
--
-- The friend list for the "recommend this" picker, annotated with whether this
-- title has already been sent to each person. Returned in one call so the UI
-- can disable the ones already sent without N follow-up queries.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_recommendation_targets(
    p_media_id   INTEGER,
    p_media_type TEXT
)
RETURNS TABLE (
    user_id           UUID,
    username          TEXT,
    full_name         TEXT,
    avatar_url        TEXT,
    already_sent      BOOLEAN,
    recommendation_id UUID
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT f.user_id,
           f.username,
           f.full_name,
           f.avatar_url,
           r.id IS NOT NULL,
           r.id
      FROM public.list_friends() f
      LEFT JOIN public.recommendations r
             ON r.sender_id = auth.uid()
            AND r.recipient_id = f.user_id
            AND r.media_id = p_media_id
            AND r.media_type = p_media_type
     ORDER BY coalesce(f.full_name, f.username), f.user_id;
$$;

-- ============================================================================
-- 5. Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated;

GRANT EXECUTE ON FUNCTION public.recommend_title(UUID, INTEGER, TEXT, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_recommendation_status(UUID, TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_recommendation(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_incoming_recommendations(BOOLEAN)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_outgoing_recommendations()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_recommendation_targets(INTEGER, TEXT)      TO authenticated;

-- ============================================================================
-- 6. Realtime
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.recommendations;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

COMMIT;
