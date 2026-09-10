-- ============================================================================
-- CatchUp — Migration 003: Explicit, per-title progress sharing
-- Workstream: Social / Realtime
-- ============================================================================
--
-- The privacy-critical migration. Everything before this only moved titles
-- between friends; this is the first time one user can see another user's
-- viewing data, so the rules are deliberately narrow.
--
--   "Viewing history must not automatically be visible to friends. Progress
--    sharing is explicit, opt-in, revocable, and scoped to a chosen show and
--    eventually chosen people. Being friends must never imply access to
--    viewing history."
--                                                -- docs/PRODUCT_VISION.md
--
-- Depends on 001 (friendships, are_friends) and 002 (the unfriend trigger).
--
-- ---------------------------------------------------------------------------
-- Design note: why one row per (title, recipient)
-- ---------------------------------------------------------------------------
-- The obvious alternative is an audience enum on the title -- 'all_friends' or
-- 'selected'. This models the grant itself instead: one row per person per
-- title. "Share with all my friends" becomes a fan-out in the UI.
--
-- That buys three things. Per-person scoping exists from day one, matching the
-- vision's "eventually chosen people" with no later migration. The RLS
-- predicate stays a trivial equality check rather than branching on an audience
-- kind. And revocation is a DELETE of exactly the grant being revoked, with no
-- read-modify-write of a set.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.progress_shares (
    owner_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shared_with_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_id            INTEGER NOT NULL,
    media_type          TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (owner_id, shared_with_user_id, media_id, media_type),
    CONSTRAINT progress_shares_no_self CHECK (owner_id <> shared_with_user_id)
);

-- Covers the recipient-side lookup ("what has been shared with me").
CREATE INDEX IF NOT EXISTS idx_progress_shares_recipient
    ON public.progress_shares (shared_with_user_id, media_id, media_type);

ALTER TABLE public.progress_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_shares REPLICA IDENTITY FULL;

-- ============================================================================
-- 2. Policies on the grants themselves
-- ============================================================================

-- Both sides can see a grant. The recipient needs to know a friend is sharing
-- with them; the owner needs to audit what they have given away.
DROP POLICY IF EXISTS "Users can view shares they granted or received" ON public.progress_shares;
CREATE POLICY "Users can view shares they granted or received"
    ON public.progress_shares FOR SELECT
    USING (auth.uid() IN (owner_id, shared_with_user_id));

-- Only the owner grants, and only to a current friend.
DROP POLICY IF EXISTS "Owners can share their own progress with friends" ON public.progress_shares;
CREATE POLICY "Owners can share their own progress with friends"
    ON public.progress_shares FOR INSERT
    WITH CHECK (
        auth.uid() = owner_id
        AND owner_id <> shared_with_user_id
        AND public.are_friends(owner_id, shared_with_user_id)
    );

-- Either party can end it: the owner revokes, and the recipient can decline to
-- keep receiving. Nobody is forced to hold data about someone else.
DROP POLICY IF EXISTS "Either party can end a share" ON public.progress_shares;
CREATE POLICY "Either party can end a share"
    ON public.progress_shares FOR DELETE
    USING (auth.uid() IN (owner_id, shared_with_user_id));

-- No UPDATE policy: a grant has no mutable fields. Changing who or what is
-- shared means deleting one grant and creating another, which keeps every
-- change an explicit act rather than an edit.

-- ============================================================================
-- 3. THE policy: friends reading shared progress
-- ============================================================================
--
-- This is the only route by which one user's watch_progress becomes visible to
-- another, and it requires three independent conditions to hold at once:
--
--   1. an explicit grant exists                    (opt-in)
--   2. it names this exact title                   (scoped)
--   3. the two are friends RIGHT NOW               (revocable)
--
-- Condition 3 is checked at read time, not at grant time. That is what makes
-- unfriending revoke every share instantly, with no cleanup job in the path --
-- the trigger below deletes the dead rows too, but access has already ended by
-- the time it runs.
--
-- Postgres ORs permissive policies, so this ADDS to the existing owner-only
-- policy from the baseline schema rather than replacing it. That widening is
-- precisely why `useContinueWatching` was given an explicit `user_id` filter
-- in advance: an unfiltered SELECT would otherwise begin returning a friend's
-- rows inside the user's own Continue Watching list.

DROP POLICY IF EXISTS "Friends can view explicitly shared progress" ON public.watch_progress;
CREATE POLICY "Friends can view explicitly shared progress"
    ON public.watch_progress FOR SELECT
    USING (
        auth.uid() <> user_id
        AND EXISTS (
            SELECT 1
            FROM public.progress_shares s
            WHERE s.owner_id = watch_progress.user_id
              AND s.shared_with_user_id = auth.uid()
              AND s.media_id = watch_progress.media_id
              AND s.media_type = watch_progress.media_type
        )
        AND public.are_friends(auth.uid(), watch_progress.user_id)
    );

-- Note there is deliberately no matching INSERT, UPDATE or DELETE policy. A
-- share grants READ only: a friend can see how far you are, never change it.

-- ============================================================================
-- 4. Unfriending revokes every share
-- ============================================================================
-- Extends the trigger function introduced in 002.

CREATE OR REPLACE FUNCTION public.handle_friendship_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Open invitations that only made sense between friends.
    DELETE FROM public.recommendations
     WHERE status = 'pending'
       AND (
             (sender_id = OLD.user_a_id AND recipient_id = OLD.user_b_id)
          OR (sender_id = OLD.user_b_id AND recipient_id = OLD.user_a_id)
       );

    -- Access has already ended, because the read policy re-checks friendship.
    -- Deleting the grants keeps the privacy centre honest: it must never list
    -- a share that no longer conveys anything.
    DELETE FROM public.progress_shares
     WHERE (owner_id = OLD.user_a_id AND shared_with_user_id = OLD.user_b_id)
        OR (owner_id = OLD.user_b_id AND shared_with_user_id = OLD.user_a_id);

    RETURN OLD;
END;
$$;

-- ============================================================================
-- 5. Functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- share_progress / revoke_progress_share
--
-- SECURITY INVOKER: both are ordinary writes governed by the policies above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_progress(
    p_media_id   INTEGER,
    p_media_type TEXT,
    p_friend_id  UUID
)
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

    IF p_media_type NOT IN ('movie', 'tv') THEN
        RAISE EXCEPTION 'Unknown media type' USING ERRCODE = '22023';
    END IF;

    IF NOT public.are_friends(v_uid, p_friend_id) THEN
        RAISE EXCEPTION 'You can only share progress with friends'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.progress_shares (owner_id, shared_with_user_id, media_id, media_type)
    VALUES (v_uid, p_friend_id, p_media_id, p_media_type)
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_progress_share(
    p_media_id   INTEGER,
    p_media_type TEXT,
    p_friend_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- No error when nothing matched: revoking something already revoked has
    -- achieved the caller's intent, and reporting failure would be misleading.
    DELETE FROM public.progress_shares
     WHERE owner_id = auth.uid()
       AND shared_with_user_id = p_friend_id
       AND media_id = p_media_id
       AND media_type = p_media_type;
END;
$$;

-- ----------------------------------------------------------------------------
-- revoke_all_progress_shares(media_id, media_type)
-- "Stop sharing this title with everyone", in one act.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_all_progress_shares(
    p_media_id   INTEGER,
    p_media_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.progress_shares
     WHERE owner_id = auth.uid()
       AND media_id = p_media_id
       AND media_type = p_media_type;
END;
$$;

-- ----------------------------------------------------------------------------
-- list_share_targets(media_id, media_type)
--
-- The friend list for the sharing control, annotated with who this title is
-- already shared with. One call, so the control renders without a query per
-- friend.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_share_targets(
    p_media_id   INTEGER,
    p_media_type TEXT
)
RETURNS TABLE (
    user_id    UUID,
    username   TEXT,
    full_name  TEXT,
    avatar_url TEXT,
    is_shared  BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT f.user_id,
           f.username,
           f.full_name,
           f.avatar_url,
           s.owner_id IS NOT NULL
      FROM public.list_friends() f
      LEFT JOIN public.progress_shares s
             ON s.owner_id = auth.uid()
            AND s.shared_with_user_id = f.user_id
            AND s.media_id = p_media_id
            AND s.media_type = p_media_type
     ORDER BY coalesce(f.full_name, f.username), f.user_id;
$$;

-- ----------------------------------------------------------------------------
-- list_my_progress_shares()
--
-- The privacy centre: everything the current user is currently sharing, with
-- whom. One screen that answers "who can see what I watch" completely.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_progress_shares()
RETURNS TABLE (
    media_id   INTEGER,
    media_type TEXT,
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
    SELECT s.media_id, s.media_type, p.id, p.username, p.full_name, p.avatar_url, s.created_at
      FROM public.progress_shares s
      JOIN public.profiles p ON p.id = s.shared_with_user_id
     WHERE s.owner_id = auth.uid()
     ORDER BY s.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- list_friend_progress(media_id, media_type)
--
-- The payoff: friends who have shared this title with the current user, and how
-- far along they are.
--
-- SECURITY INVOKER, so every row returned has already passed the read policy in
-- section 3. This function grants nothing on its own -- remove it and the
-- access rules are unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_friend_progress(
    p_media_id   INTEGER,
    p_media_type TEXT
)
RETURNS TABLE (
    user_id      UUID,
    username     TEXT,
    full_name    TEXT,
    avatar_url   TEXT,
    progress     INTEGER,
    last_watched TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT p.id, p.username, p.full_name, p.avatar_url, w.progress, w.last_watched
      FROM public.progress_shares s
      JOIN public.profiles p ON p.id = s.owner_id
      JOIN public.watch_progress w
        ON w.user_id = s.owner_id
       AND w.media_id = s.media_id
       AND w.media_type = s.media_type
     WHERE s.shared_with_user_id = auth.uid()
       AND s.media_id = p_media_id
       AND s.media_type = p_media_type
     ORDER BY w.progress DESC;
$$;

-- ============================================================================
-- 6. Grants
-- ============================================================================

GRANT SELECT, INSERT, DELETE ON public.progress_shares TO authenticated;

GRANT EXECUTE ON FUNCTION public.share_progress(INTEGER, TEXT, UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_progress_share(INTEGER, TEXT, UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_progress_shares(INTEGER, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_targets(INTEGER, TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_progress_shares()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friend_progress(INTEGER, TEXT)         TO authenticated;

-- ============================================================================
-- 7. Realtime
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.progress_shares;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

COMMIT;
