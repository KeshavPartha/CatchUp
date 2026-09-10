-- ============================================================================
-- CatchUp — Migration 004: Watch Together sessions
-- Workstream: Social / Realtime
-- ============================================================================
--
-- Synchronized viewing between friends. Depends on 001 (friendships,
-- are_friends) and reuses that same friendship rule as the invite ACL, so there
-- is no second authorization model to keep in step.
--
-- ---------------------------------------------------------------------------
-- What lives in Postgres and what does not
-- ---------------------------------------------------------------------------
-- These tables hold DURABLE session state: who is in a session, what is being
-- watched, and the last agreed playback position. They are written on
-- transitions -- play, pause, seek, join, leave -- and NOT on every tick.
--
-- High-frequency synchronization (heartbeats, scrub-in-progress, presence)
-- belongs on a Realtime *broadcast* channel, which never touches the database.
-- Persisting every frame would hammer Postgres for no benefit, and the only
-- thing a late joiner or a reconnecting client actually needs is the last
-- committed transition plus the elapsed time since it.
--
-- That is why `position_seconds` is paired with `position_updated_at`: a client
-- joining mid-playback computes the live position as
--     position_seconds + (now() - position_updated_at)
-- rather than needing a continuous stream of updates to stay honest.
--
-- ---------------------------------------------------------------------------
-- RLS recursion
-- ---------------------------------------------------------------------------
-- "You can see a session if you are a participant" and "you can see
-- participants of your sessions" reference each other, which is the classic way
-- to write an infinitely recursive policy pair. Both are broken with
-- SECURITY DEFINER helpers (`is_session_participant`, `watch_session_host`)
-- that read the tables directly and so never re-enter a policy -- the same
-- pattern `are_friends()` uses in 001.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Tables
-- ============================================================================

DO $$
BEGIN
    CREATE TYPE public.watch_session_status AS ENUM ('active', 'ended');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.watch_sessions (
    id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    host_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_id             INTEGER NOT NULL,
    media_type           TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    status               public.watch_session_status NOT NULL DEFAULT 'active',
    is_playing           BOOLEAN NOT NULL DEFAULT FALSE,
    position_seconds     INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
    -- When position_seconds was last agreed. See the header note.
    position_updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    ended_at             TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_watch_sessions_host
    ON public.watch_sessions (host_id, status);

CREATE TABLE IF NOT EXISTS public.watch_session_participants (
    session_id   UUID NOT NULL REFERENCES public.watch_sessions(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invited_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    invited_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    -- NULL until they actually join. The row itself is the invitation, so
    -- there is no separate invites table to keep consistent.
    joined_at    TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_session_participants_user
    ON public.watch_session_participants (user_id);

ALTER TABLE public.watch_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_session_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.watch_sessions             REPLICA IDENTITY FULL;
ALTER TABLE public.watch_session_participants REPLICA IDENTITY FULL;

-- ============================================================================
-- 2. Recursion-breaking helpers
-- ============================================================================

-- Is this user in this session at all (invited or joined)?
CREATE OR REPLACE FUNCTION public.is_session_participant(
    p_session_id UUID,
    p_user_id    UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user_id IS NOT NULL
       AND EXISTS (
            SELECT 1 FROM public.watch_session_participants p
             WHERE p.session_id = p_session_id
               AND p.user_id = p_user_id
        );
$$;

CREATE OR REPLACE FUNCTION public.watch_session_host(p_session_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT host_id FROM public.watch_sessions WHERE id = p_session_id;
$$;

-- ============================================================================
-- 3. Policies
-- ============================================================================

-- --- watch_sessions ---------------------------------------------------------

DROP POLICY IF EXISTS "Participants can view their sessions" ON public.watch_sessions;
CREATE POLICY "Participants can view their sessions"
    ON public.watch_sessions FOR SELECT
    USING (
        auth.uid() = host_id
        OR public.is_session_participant(id, auth.uid())
    );

DROP POLICY IF EXISTS "Users can host their own sessions" ON public.watch_sessions;
CREATE POLICY "Users can host their own sessions"
    ON public.watch_sessions FOR INSERT
    WITH CHECK (auth.uid() = host_id);

-- Any participant may drive playback. Watching together means either person can
-- pause when someone needs a moment; making the host the only one who can stop
-- the video would be a worse experience between friends, and the blast radius
-- of a misuse is one session that either party can leave.
--
-- Which COLUMNS may change is enforced by the trigger below, because a WITH
-- CHECK clause cannot compare against the old row.
DROP POLICY IF EXISTS "Participants can drive playback" ON public.watch_sessions;
CREATE POLICY "Participants can drive playback"
    ON public.watch_sessions FOR UPDATE
    USING (public.is_session_participant(id, auth.uid()))
    WITH CHECK (public.is_session_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Hosts can delete their sessions" ON public.watch_sessions;
CREATE POLICY "Hosts can delete their sessions"
    ON public.watch_sessions FOR DELETE
    USING (auth.uid() = host_id);

-- --- watch_session_participants ---------------------------------------------

DROP POLICY IF EXISTS "Participants can see who else is in the session" ON public.watch_session_participants;
CREATE POLICY "Participants can see who else is in the session"
    ON public.watch_session_participants FOR SELECT
    USING (public.is_session_participant(session_id, auth.uid()));

-- Only the host invites, and only friends. This is the single place Watch
-- Together's access rule is stated, and it is the same are_friends() every
-- other social policy calls.
DROP POLICY IF EXISTS "Hosts can invite their friends" ON public.watch_session_participants;
CREATE POLICY "Hosts can invite their friends"
    ON public.watch_session_participants FOR INSERT
    WITH CHECK (
        auth.uid() = public.watch_session_host(session_id)
        AND (
            -- the host seeding their own participant row when creating
            user_id = auth.uid()
            -- or inviting someone they are actually friends with
            OR public.are_friends(auth.uid(), user_id)
        )
    );

-- A participant maintains their own row: joining, and heartbeating presence.
DROP POLICY IF EXISTS "Participants maintain their own membership" ON public.watch_session_participants;
CREATE POLICY "Participants maintain their own membership"
    ON public.watch_session_participants FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Leave, or be removed by the host.
DROP POLICY IF EXISTS "Participants can leave and hosts can remove" ON public.watch_session_participants;
CREATE POLICY "Participants can leave and hosts can remove"
    ON public.watch_session_participants FOR DELETE
    USING (
        auth.uid() = user_id
        OR auth.uid() = public.watch_session_host(session_id)
    );

-- ============================================================================
-- 4. Immutability trigger
-- ============================================================================
-- The UPDATE policy lets any participant write to the row. This constrains
-- WHICH columns they may move: playback state is collaborative, but a session's
-- identity is not, and ending it is the host's call alone.

CREATE OR REPLACE FUNCTION public.enforce_watch_session_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.host_id IS DISTINCT FROM OLD.host_id
       OR NEW.media_id IS DISTINCT FROM OLD.media_id
       OR NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'A session''s identity cannot be changed'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() <> OLD.host_id THEN
        RAISE EXCEPTION 'Only the host can end this session'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_watch_session_update ON public.watch_sessions;
CREATE TRIGGER on_watch_session_update
    BEFORE UPDATE ON public.watch_sessions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_watch_session_update();

-- ============================================================================
-- 5. Unfriending withdraws un-accepted invitations
-- ============================================================================
-- Extends the trigger from 002/003. Consistent with how pending recommendations
-- are treated: an invitation not yet acted on was only meaningful between
-- friends, while someone already watching with you is left alone until the
-- session ends.

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

    DELETE FROM public.progress_shares
     WHERE (owner_id = OLD.user_a_id AND shared_with_user_id = OLD.user_b_id)
        OR (owner_id = OLD.user_b_id AND shared_with_user_id = OLD.user_a_id);

    -- Un-accepted Watch Together invitations between the two.
    DELETE FROM public.watch_session_participants p
     USING public.watch_sessions s
     WHERE p.session_id = s.id
       AND p.joined_at IS NULL
       AND (
             (s.host_id = OLD.user_a_id AND p.user_id = OLD.user_b_id)
          OR (s.host_id = OLD.user_b_id AND p.user_id = OLD.user_a_id)
       );

    RETURN OLD;
END;
$$;

-- ============================================================================
-- 6. Functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- create_watch_session(media_id, media_type)
-- Creates the session and seeds the host as a joined participant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_watch_session(
    p_media_id   INTEGER,
    p_media_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id  UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    IF p_media_type NOT IN ('movie', 'tv') THEN
        RAISE EXCEPTION 'Unknown media type' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.watch_sessions (host_id, media_id, media_type)
    VALUES (v_uid, p_media_id, p_media_type)
    RETURNING id INTO v_id;

    INSERT INTO public.watch_session_participants (session_id, user_id, invited_by, joined_at, last_seen_at)
    VALUES (v_id, v_uid, v_uid, NOW(), NOW());

    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- invite_to_watch_session(session_id, friend_id)
-- SECURITY INVOKER: the INSERT is governed by the host-and-friend policy above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_to_watch_session(
    p_session_id UUID,
    p_friend_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF NOT public.are_friends(v_uid, p_friend_id) THEN
        RAISE EXCEPTION 'You can only invite friends to watch together'
            USING ERRCODE = '42501';
    END IF;

    IF (SELECT status FROM public.watch_sessions WHERE id = p_session_id) <> 'active' THEN
        RAISE EXCEPTION 'That session has ended' USING ERRCODE = '02000';
    END IF;

    INSERT INTO public.watch_session_participants (session_id, user_id, invited_by)
    VALUES (p_session_id, p_friend_id, v_uid)
    ON CONFLICT DO NOTHING;
END;
$$;

-- ----------------------------------------------------------------------------
-- join / leave / heartbeat
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_watch_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Only updates a row that already exists, so joining requires having been
    -- invited. There is no path here that creates membership.
    UPDATE public.watch_session_participants
       SET joined_at = coalesce(joined_at, NOW()),
           last_seen_at = NOW()
     WHERE session_id = p_session_id
       AND user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'You have not been invited to that session'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_watch_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.watch_session_participants
     WHERE session_id = p_session_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_watch_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.watch_session_participants
       SET last_seen_at = NOW()
     WHERE session_id = p_session_id AND user_id = auth.uid();
END;
$$;

-- ----------------------------------------------------------------------------
-- update_playback_state(session_id, position_seconds, is_playing)
--
-- Called on TRANSITIONS ONLY (play, pause, seek) -- never on a timer. Continuous
-- position is derived by clients from position_seconds + elapsed time, and
-- moment-to-moment sync rides a Realtime broadcast channel that never touches
-- the database.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_playback_state(
    p_session_id       UUID,
    p_position_seconds INTEGER,
    p_is_playing       BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_position_seconds < 0 THEN
        RAISE EXCEPTION 'Position cannot be negative' USING ERRCODE = '22023';
    END IF;

    UPDATE public.watch_sessions
       SET position_seconds = p_position_seconds,
           is_playing = p_is_playing,
           position_updated_at = NOW()
     WHERE id = p_session_id
       AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found, already ended, or not yours to control'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- end_watch_session(session_id) -- host only, enforced by the trigger too.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_watch_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.watch_sessions
       SET status = 'ended', ended_at = NOW(), is_playing = FALSE
     WHERE id = p_session_id
       AND host_id = auth.uid()
       AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found, already ended, or not yours to end'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- list_my_watch_sessions() -- active sessions the user hosts, joined, or was
-- invited to.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_watch_sessions()
RETURNS TABLE (
    session_id       UUID,
    media_id         INTEGER,
    media_type       TEXT,
    host_user_id     UUID,
    host_username    TEXT,
    host_full_name   TEXT,
    host_avatar_url  TEXT,
    is_host          BOOLEAN,
    has_joined       BOOLEAN,
    participant_count BIGINT,
    created_at       TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT s.id,
           s.media_id,
           s.media_type,
           h.id,
           h.username,
           h.full_name,
           h.avatar_url,
           s.host_id = auth.uid(),
           me.joined_at IS NOT NULL,
           (SELECT count(*) FROM public.watch_session_participants c
             WHERE c.session_id = s.id AND c.joined_at IS NOT NULL),
           s.created_at
      FROM public.watch_sessions s
      JOIN public.watch_session_participants me
        ON me.session_id = s.id AND me.user_id = auth.uid()
      JOIN public.profiles h ON h.id = s.host_id
     WHERE s.status = 'active'
     ORDER BY s.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- list_session_participants(session_id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_session_participants(p_session_id UUID)
RETURNS TABLE (
    user_id      UUID,
    username     TEXT,
    full_name    TEXT,
    avatar_url   TEXT,
    is_host      BOOLEAN,
    has_joined   BOOLEAN,
    joined_at    TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT p.user_id,
           pr.username,
           pr.full_name,
           pr.avatar_url,
           p.user_id = s.host_id,
           p.joined_at IS NOT NULL,
           p.joined_at,
           p.last_seen_at
      FROM public.watch_session_participants p
      JOIN public.watch_sessions s ON s.id = p.session_id
      JOIN public.profiles pr ON pr.id = p.user_id
     WHERE p.session_id = p_session_id
     ORDER BY p.user_id = s.host_id DESC, p.invited_at;
$$;

-- ----------------------------------------------------------------------------
-- list_watch_session_targets(session_id)
-- Friends who can be invited, flagged with whether they already have been.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_watch_session_targets(p_session_id UUID)
RETURNS TABLE (
    user_id      UUID,
    username     TEXT,
    full_name    TEXT,
    avatar_url   TEXT,
    is_invited   BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT f.user_id, f.username, f.full_name, f.avatar_url, p.user_id IS NOT NULL
      FROM public.list_friends() f
      LEFT JOIN public.watch_session_participants p
             ON p.session_id = p_session_id AND p.user_id = f.user_id
     ORDER BY coalesce(f.full_name, f.username), f.user_id;
$$;

-- ============================================================================
-- 7. Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_sessions             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_session_participants TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_session_participant(UUID, UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_session_host(UUID)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_watch_session(INTEGER, TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_watch_session(UUID, UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_watch_session(UUID)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_watch_session(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_watch_session(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_playback_state(UUID, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_watch_session(UUID)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_watch_sessions()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_session_participants(UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_watch_session_targets(UUID)            TO authenticated;

-- ============================================================================
-- 8. Realtime
-- ============================================================================
-- postgres_changes on these two tables covers durable transitions: someone
-- joins, the host pauses, the session ends. Moment-to-moment sync does NOT go
-- here -- it belongs on a broadcast channel, which needs no publication.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_sessions;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_session_participants;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

COMMIT;
