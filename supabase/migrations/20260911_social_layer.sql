-- ============================================================================
-- CatchUp — Social / Realtime layer
-- ============================================================================
--
-- The foundation schema (supabase-schema.sql) creates the social tables with
-- RLS enabled and deliberately no client policies:
--
--   "Future tables intentionally have no permissive client policies yet.
--    Add narrow policies with their features."
--
-- This migration is that. It adds no tables of its own except where a column is
-- genuinely missing; it supplies the policies, helper functions, and RPCs that
-- make `friendships`, `show_recommendations`, `progress_shares`,
-- `watch_parties`, `watch_party_members` and `watch_party_events` usable, plus
-- the one additional policy on `watch_progress` that lets an explicitly
-- authorised friend read shared show progress.
--
-- Apply after: supabase-schema.sql (or 20260910_watch_progress_foundation.sql
-- on a project initialised from the original starter).
--
-- ---------------------------------------------------------------------------
-- Security model
-- ---------------------------------------------------------------------------
-- Row Level Security is the enforcement boundary. The RPCs exist for ergonomics
-- and to keep authorisation logic in one auditable place; almost all are
-- SECURITY INVOKER, so policies still apply inside them.
--
-- SECURITY DEFINER is used only where a policy or invariant genuinely requires
-- reading rows the caller cannot see, and every such function pins
-- `search_path` to defeat search-path hijacking.
--
-- Ownership: this file is Social/Realtime workstream territory per
-- docs/TEAM_SPLIT.md. It does not alter watch-progress write behaviour, the
-- catalog, or anything in the AI workstream's area.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Usernames — discovery without account enumeration
-- ============================================================================
--
-- Discovery by raw email confirms whether an address has a CatchUp account.
-- A username is a handle the user chooses to hand out, so it is the safer
-- primary discovery key. Email lookup still works for someone who already
-- knows the address (see search_users).
--
-- SHARED-TABLE NOTE: this adds a nullable column to `profiles` and extends
-- handle_new_user() to populate it. Profile creation behaviour is otherwise
-- identical. Flagged in docs/SOCIAL_SPEC.md as a coordination point.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username));

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  v_base := lower(regexp_replace(split_part(coalesce(p_email, ''), '@', 1), '[^a-z0-9_]', '', 'gi'));
  IF length(v_base) < 3 THEN
    v_base := 'user' || v_base;
  END IF;

  v_base      := left(v_base, 16);
  v_candidate := v_base;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_candidate)
        AND v_suffix < 10000 LOOP
    v_suffix    := v_suffix + 1;
    v_candidate := left(v_base, 16) || v_suffix::TEXT;
  END LOOP;

  RETURN v_candidate;
END;
$$;

UPDATE public.profiles
SET username = public.generate_username(email)
WHERE username IS NULL;

-- Extends the foundation trigger; the only change is the username column.
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

-- ============================================================================
-- 2. Friendship helpers
-- ============================================================================
--
-- The foundation models friendships as a DIRECTIONAL row
-- (requester_id, addressee_id, status) rather than a canonical unordered pair,
-- so "are these two friends" means: an accepted row exists in either direction.
-- Defined once here; every downstream policy calls it, so a correction to the
-- friendship rule propagates everywhere at once and the rules cannot drift.
--
-- SECURITY DEFINER because it is called from policies on other tables
-- (profiles, watch_progress) where the caller may not be either party.

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
       SELECT 1 FROM public.friendships f
       WHERE f.status = 'accepted'
         AND ((f.requester_id = p_user_a AND f.addressee_id = p_user_b)
           OR (f.requester_id = p_user_b AND f.addressee_id = p_user_a))
     );
$$;

-- A block in EITHER direction stops all interaction between two users.
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'blocked'
      AND ((f.requester_id = p_user_a AND f.addressee_id = p_user_b)
        OR (f.requester_id = p_user_b AND f.addressee_id = p_user_a))
  );
$$;

-- ============================================================================
-- 3. friendships policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own relationships" ON public.friendships;
CREATE POLICY "Users can view their own relationships"
  ON public.friendships FOR SELECT
  USING (auth.uid() IN (requester_id, addressee_id));

-- A user may only ever create a relationship in their own name, and only as a
-- request or a block — never pre-accepted.
DROP POLICY IF EXISTS "Users can open relationships as themselves" ON public.friendships;
CREATE POLICY "Users can open relationships as themselves"
  ON public.friendships FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> addressee_id
    AND status IN ('pending', 'blocked')
  );

-- Reachability only. WHICH transitions are legal is enforced by the trigger
-- below, because a WITH CHECK clause cannot compare against the old row.
DROP POLICY IF EXISTS "Participants can update their relationships" ON public.friendships;
CREATE POLICY "Participants can update their relationships"
  ON public.friendships FOR UPDATE
  USING (auth.uid() IN (requester_id, addressee_id))
  WITH CHECK (auth.uid() IN (requester_id, addressee_id));

-- Cancel a request, unfriend, or unblock.
DROP POLICY IF EXISTS "Participants can remove their relationships" ON public.friendships;
CREATE POLICY "Participants can remove their relationships"
  ON public.friendships FOR DELETE
  USING (auth.uid() IN (requester_id, addressee_id));

-- ----------------------------------------------------------------------------
-- Transition guard.
--
-- This is what makes consent structural rather than merely checked: a row can
-- only reach 'accepted' by the ADDRESSEE acting on a pending request. The
-- requester cannot accept their own request under any circumstances, even with
-- direct table access.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_friendship_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id THEN
    RAISE EXCEPTION 'A relationship cannot be repointed at other users'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Only a pending request can be accepted' USING ERRCODE = '22023';
      END IF;
      IF auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only the recipient can accept this request' USING ERRCODE = '42501';
      END IF;

    ELSIF NEW.status = 'declined' THEN
      IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Only a pending request can be declined' USING ERRCODE = '22023';
      END IF;
      IF auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only the recipient can decline this request' USING ERRCODE = '42501';
      END IF;

    ELSIF NEW.status = 'blocked' THEN
      -- Either party may block the other at any point.
      NULL;

    ELSIF NEW.status = 'pending' THEN
      -- Re-sending after a decline is a deliberate act by the person who was
      -- refused, and is allowed. What must never happen is the ADDRESSEE
      -- resurrecting a declined row, which would fabricate a request the other
      -- person did not make.
      IF OLD.status <> 'declined' OR auth.uid() <> OLD.requester_id THEN
        RAISE EXCEPTION 'A resolved relationship cannot be reopened; send a new request'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_friendship_transition ON public.friendships;
CREATE TRIGGER on_friendship_transition
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_friendship_transition();

-- ----------------------------------------------------------------------------
-- Ending a relationship revokes everything it authorised.
--
-- Access has already ended by the time this runs, because every read policy
-- re-checks are_friends(). Deleting the dependent rows keeps the privacy centre
-- honest: it must never list a share that no longer conveys anything.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_relationship_ended()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a UUID := OLD.requester_id;
  v_b UUID := OLD.addressee_id;
BEGIN
  -- Only act when the pair is genuinely no longer friends. A declined request
  -- sitting alongside an accepted one in the other direction must not revoke.
  IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  IF public.are_friends(v_a, v_b) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  DELETE FROM public.show_recommendations
   WHERE status = 'unread'
     AND ((sender_id = v_a AND recipient_id = v_b) OR (sender_id = v_b AND recipient_id = v_a));

  DELETE FROM public.progress_shares
   WHERE (owner_id = v_a AND friend_id = v_b) OR (owner_id = v_b AND friend_id = v_a);

  -- Watch-party invitations the other party never took up.
  DELETE FROM public.watch_party_members m
   USING public.watch_parties p
   WHERE m.party_id = p.id
     AND m.role = 'participant'
     AND ((p.host_id = v_a AND m.user_id = v_b) OR (p.host_id = v_b AND m.user_id = v_a));

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_relationship_deleted ON public.friendships;
CREATE TRIGGER on_relationship_deleted
  AFTER DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.handle_relationship_ended();

DROP TRIGGER IF EXISTS on_relationship_changed ON public.friendships;
CREATE TRIGGER on_relationship_changed
  AFTER UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.handle_relationship_ended();

-- ============================================================================
-- 4. profiles disclosure
-- ============================================================================
--
-- The foundation policy is `auth.uid() = id`: you can read nobody's profile but
-- your own, which makes every social surface unrenderable. This adds the
-- minimum needed — friends, and the counterparty of an open request, without
-- which a request inbox cannot show who is asking.
--
-- Postgres ORs permissive policies, so this widens rather than replaces the
-- foundation's self-access policy, which is left untouched.
--
-- Recursion check: this reads `friendships`, whose own policies compare only
-- against auth.uid() and never reference `profiles`. are_friends() is
-- SECURITY DEFINER and does not re-enter friendships' policies. No cycle.

DROP POLICY IF EXISTS "Users can view friend and pending-request profiles" ON public.profiles;
CREATE POLICY "Users can view friend and pending-request profiles"
  ON public.profiles FOR SELECT
  USING (
    public.are_friends(auth.uid(), id)
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'pending'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = profiles.id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = profiles.id))
    )
  );

-- ============================================================================
-- 5. Friendship RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_friend_request(p_addressee_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_reciprocal UUID;
  v_pending    INTEGER;
  v_id         UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_addressee_id IS NULL OR p_addressee_id = v_uid THEN
    RAISE EXCEPTION 'You cannot send a friend request to yourself' USING ERRCODE = '22023';
  END IF;

  IF public.is_blocked_between(v_uid, p_addressee_id) THEN
    -- Deliberately the same message either way: telling the sender they have
    -- been blocked discloses a decision the other person did not share.
    RAISE EXCEPTION 'That request could not be sent' USING ERRCODE = '42501';
  END IF;

  IF public.are_friends(v_uid, p_addressee_id) THEN
    RAISE EXCEPTION 'You are already friends' USING ERRCODE = '22023';
  END IF;

  -- If they already asked us, both have expressed the same intent; asking
  -- either to confirm again is friction with no privacy benefit.
  SELECT id INTO v_reciprocal
    FROM public.friendships
   WHERE requester_id = p_addressee_id AND addressee_id = v_uid AND status = 'pending'
   LIMIT 1;

  IF v_reciprocal IS NOT NULL THEN
    UPDATE public.friendships SET status = 'accepted' WHERE id = v_reciprocal;
    RETURN v_reciprocal;
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.friendships WHERE requester_id = v_uid AND status = 'pending';
  IF v_pending >= 50 THEN
    RAISE EXCEPTION 'Too many pending friend requests' USING ERRCODE = '54000';
  END IF;

  -- A previous declined row blocks the unique key, so reuse it.
  UPDATE public.friendships
     SET status = 'pending', updated_at = NOW()
   WHERE requester_id = v_uid AND addressee_id = p_addressee_id AND status = 'declined'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (v_uid, p_addressee_id, 'pending')
  ON CONFLICT (requester_id, addressee_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.friendships
     WHERE requester_id = v_uid AND addressee_id = p_addressee_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.friendships
     SET status = 'accepted'
   WHERE id = p_request_id
     AND addressee_id = auth.uid()
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or not yours to accept' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.friendships
     SET status = 'declined'
   WHERE id = p_request_id
     AND addressee_id = auth.uid()
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or not yours to decline' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.friendships
   WHERE id = p_request_id AND requester_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or not yours to cancel' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.unfriend(p_other_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  DELETE FROM public.friendships
   WHERE status = 'accepted'
     AND ((requester_id = v_uid AND addressee_id = p_other_user_id)
       OR (requester_id = p_other_user_id AND addressee_id = v_uid));
END;
$$;

CREATE OR REPLACE FUNCTION public.block_user(p_other_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_other_user_id = v_uid THEN
    RAISE EXCEPTION 'You cannot block yourself' USING ERRCODE = '22023';
  END IF;

  -- Clear any existing relationship in both directions first, so the block is
  -- the only thing left and its triggers revoke shares and recommendations.
  DELETE FROM public.friendships
   WHERE (requester_id = v_uid AND addressee_id = p_other_user_id)
      OR (requester_id = p_other_user_id AND addressee_id = v_uid);

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (v_uid, p_other_user_id, 'blocked');
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_other_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.friendships
   WHERE status = 'blocked'
     AND requester_id = auth.uid()
     AND addressee_id = p_other_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_friends()
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT,
  friends_since TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url, f.updated_at
    FROM public.friendships f
    JOIN public.profiles p
      ON p.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
   WHERE f.status = 'accepted'
     AND auth.uid() IN (f.requester_id, f.addressee_id)
   ORDER BY coalesce(p.full_name, p.username), p.id;
$$;

CREATE OR REPLACE FUNCTION public.list_incoming_friend_requests()
RETURNS TABLE (
  request_id UUID, user_id UUID, username TEXT, full_name TEXT,
  avatar_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT f.id, p.id, p.username, p.full_name, p.avatar_url, f.created_at
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.requester_id
   WHERE f.addressee_id = auth.uid() AND f.status = 'pending'
   ORDER BY f.created_at DESC;
$$;

-- Pending only: a declined request is never reported back to the sender, so
-- declining stays quiet rather than being surfaced as a refusal.
CREATE OR REPLACE FUNCTION public.list_outgoing_friend_requests()
RETURNS TABLE (
  request_id UUID, user_id UUID, username TEXT, full_name TEXT,
  avatar_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT f.id, p.id, p.username, p.full_name, p.avatar_url, f.created_at
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.addressee_id
   WHERE f.requester_id = auth.uid() AND f.status = 'pending'
   ORDER BY f.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_blocked_users()
RETURNS TABLE (user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.addressee_id
   WHERE f.requester_id = auth.uid() AND f.status = 'blocked'
   ORDER BY coalesce(p.full_name, p.username);
$$;

-- ----------------------------------------------------------------------------
-- search_users — the one place a stranger's profile is disclosed.
--
--  * Exact match only. No prefix, no fuzzy, no LIKE, so the directory cannot be
--    enumerated or harvested.
--  * Fixed minimal projection; email is never returned, so an email lookup
--    confirms nothing the searcher did not already supply.
--  * Blocked users, in either direction, are invisible.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_users(p_query TEXT)
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT,
  relationship TEXT, request_id UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_query TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_query := ltrim(lower(btrim(coalesce(p_query, ''))), '@');
  IF length(v_query) < 3 THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url,
         CASE
           WHEN public.are_friends(v_uid, p.id) THEN 'friends'
           WHEN incoming.id IS NOT NULL         THEN 'incoming_request'
           WHEN outgoing.id IS NOT NULL         THEN 'outgoing_request'
           ELSE 'none'
         END::TEXT,
         coalesce(incoming.id, outgoing.id)
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT f.id FROM public.friendships f
     WHERE f.requester_id = p.id AND f.addressee_id = v_uid AND f.status = 'pending' LIMIT 1
  ) incoming ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.id FROM public.friendships f
     WHERE f.requester_id = v_uid AND f.addressee_id = p.id AND f.status = 'pending' LIMIT 1
  ) outgoing ON TRUE
  WHERE p.id <> v_uid
    AND (lower(p.username) = v_query OR lower(p.email) = v_query)
    AND NOT public.is_blocked_between(v_uid, p.id)
  LIMIT 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_username(p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT := lower(btrim(coalesce(p_username, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_username !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Username must be 3-20 characters, using a-z, 0-9 or _' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_username AND id <> v_uid) THEN
    RAISE EXCEPTION 'That username is taken' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles SET username = v_username WHERE id = v_uid;
END;
$$;

-- ============================================================================
-- 6. show_recommendations
-- ============================================================================

DROP POLICY IF EXISTS "Users can view recommendations they sent or received" ON public.show_recommendations;
CREATE POLICY "Users can view recommendations they sent or received"
  ON public.show_recommendations FOR SELECT
  USING (auth.uid() IN (sender_id, recipient_id));

-- Friendship is required to send, enforced here and not only in the RPC, so
-- direct table access is equally safe.
DROP POLICY IF EXISTS "Friends can send recommendations" ON public.show_recommendations;
CREATE POLICY "Friends can send recommendations"
  ON public.show_recommendations FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> recipient_id
    AND status = 'unread'
    AND public.are_friends(sender_id, recipient_id)
  );

-- Only the recipient responds; a sender must not mark their own recommendation
-- read or dismissed on the recipient's behalf.
DROP POLICY IF EXISTS "Recipients can respond to recommendations" ON public.show_recommendations;
CREATE POLICY "Recipients can respond to recommendations"
  ON public.show_recommendations FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Participants can remove recommendations" ON public.show_recommendations;
CREATE POLICY "Participants can remove recommendations"
  ON public.show_recommendations FOR DELETE
  USING (auth.uid() IN (sender_id, recipient_id));

-- One recommendation of a title per pair. Re-sending after a dismissal would be
-- a nagging vector, so recommend_title is idempotent instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_show_recommendations_unique_pair
  ON public.show_recommendations (sender_id, recipient_id, media_type, media_id);

CREATE OR REPLACE FUNCTION public.recommend_title(
  p_recipient_id UUID, p_media_id INTEGER, p_media_type TEXT, p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
  v_id   UUID;
BEGIN
  IF NOT public.are_friends(v_uid, p_recipient_id) THEN
    RAISE EXCEPTION 'You can only recommend titles to friends' USING ERRCODE = '42501';
  END IF;

  IF p_media_type NOT IN ('movie', 'tv') THEN
    RAISE EXCEPTION 'Unknown media type' USING ERRCODE = '22023';
  END IF;

  IF length(coalesce(v_note, '')) > 280 THEN
    RAISE EXCEPTION 'Notes are limited to 280 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.show_recommendations (sender_id, recipient_id, media_id, media_type, note)
  VALUES (v_uid, p_recipient_id, p_media_id, p_media_type, v_note)
  ON CONFLICT (sender_id, recipient_id, media_type, media_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.show_recommendations
     WHERE sender_id = v_uid AND recipient_id = p_recipient_id
       AND media_id = p_media_id AND media_type = p_media_type;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_recommendation_status(p_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('read', 'dismissed') THEN
    RAISE EXCEPTION 'Unknown recommendation status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.show_recommendations
     SET status = p_status,
         read_at = coalesce(read_at, NOW())
   WHERE id = p_id AND recipient_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found or not yours to respond to' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_recommendation(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.show_recommendations WHERE id = p_id AND sender_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found or not yours to withdraw' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_incoming_recommendations(p_include_dismissed BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  recommendation_id UUID, media_id INTEGER, media_type TEXT, note TEXT,
  status TEXT, created_at TIMESTAMPTZ,
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.media_id, r.media_type, r.note, r.status, r.created_at,
         p.id, p.username, p.full_name, p.avatar_url
    FROM public.show_recommendations r
    JOIN public.profiles p ON p.id = r.sender_id
   WHERE r.recipient_id = auth.uid()
     AND (p_include_dismissed OR r.status IN ('unread', 'read'))
   ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_recommendation_targets(p_media_id INTEGER, p_media_type TEXT)
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT,
  already_sent BOOLEAN, recommendation_id UUID
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT f.user_id, f.username, f.full_name, f.avatar_url, r.id IS NOT NULL, r.id
    FROM public.list_friends() f
    LEFT JOIN public.show_recommendations r
           ON r.sender_id = auth.uid() AND r.recipient_id = f.user_id
          AND r.media_id = p_media_id AND r.media_type = p_media_type
   ORDER BY coalesce(f.full_name, f.username), f.user_id;
$$;

-- ============================================================================
-- 7. progress_shares — and THE policy on watch_progress
-- ============================================================================

DROP POLICY IF EXISTS "Users can view shares they granted or received" ON public.progress_shares;
CREATE POLICY "Users can view shares they granted or received"
  ON public.progress_shares FOR SELECT
  USING (auth.uid() IN (owner_id, friend_id));

DROP POLICY IF EXISTS "Owners can share their own progress with friends" ON public.progress_shares;
CREATE POLICY "Owners can share their own progress with friends"
  ON public.progress_shares FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND owner_id <> friend_id
    AND public.are_friends(owner_id, friend_id)
  );

-- The owner toggles `enabled`; the recipient cannot switch their own access on.
DROP POLICY IF EXISTS "Owners can change their own shares" ON public.progress_shares;
CREATE POLICY "Owners can change their own shares"
  ON public.progress_shares FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Either party may end it: the owner revokes, and the recipient may decline to
-- keep receiving. Nobody is forced to hold data about someone else.
DROP POLICY IF EXISTS "Either party can end a share" ON public.progress_shares;
CREATE POLICY "Either party can end a share"
  ON public.progress_shares FOR DELETE
  USING (auth.uid() IN (owner_id, friend_id));

-- ----------------------------------------------------------------------------
-- The only route by which one user's watch_progress becomes visible to another.
-- Four independent conditions must hold at once:
--
--   1. an explicit grant exists, still enabled and not revoked   (opt-in)
--   2. it names this exact show                                  (scoped)
--   3. the row is show progress, not a movie                     (per spec)
--   4. the two are friends RIGHT NOW                             (revocable)
--
-- Condition 4 is checked at READ time, not grant time. That is what makes
-- unfriending revoke every share instantly, with no cleanup job in the path.
--
-- Postgres ORs permissive policies, so this ADDS to the foundation's owner-only
-- policy rather than replacing it. That widening is exactly why every
-- watch_progress query in the app must filter by user_id explicitly — an
-- unfiltered SELECT would otherwise start returning a friend's rows.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Friends can view explicitly shared show progress" ON public.watch_progress;
CREATE POLICY "Friends can view explicitly shared show progress"
  ON public.watch_progress FOR SELECT
  USING (
    auth.uid() <> user_id
    AND watch_progress.show_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.progress_shares s
      WHERE s.owner_id = watch_progress.user_id
        AND s.friend_id = auth.uid()
        AND s.show_id = watch_progress.show_id
        AND s.enabled
        AND s.revoked_at IS NULL
    )
    AND public.are_friends(auth.uid(), watch_progress.user_id)
  );

-- No matching INSERT/UPDATE/DELETE policy: a share grants READ only. A friend
-- can see how far you are, never change it.

CREATE OR REPLACE FUNCTION public.share_show_progress(p_show_id TEXT, p_friend_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.are_friends(v_uid, p_friend_id) THEN
    RAISE EXCEPTION 'You can only share progress with friends' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.progress_shares (owner_id, friend_id, show_id, enabled)
  VALUES (v_uid, p_friend_id, p_show_id, TRUE)
  ON CONFLICT (owner_id, friend_id, show_id)
  DO UPDATE SET enabled = TRUE, revoked_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_show_progress(p_show_id TEXT, p_friend_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  -- No error when nothing matched: revoking something already revoked has
  -- achieved the caller's intent.
  UPDATE public.progress_shares
     SET enabled = FALSE, revoked_at = NOW()
   WHERE owner_id = auth.uid() AND friend_id = p_friend_id AND show_id = p_show_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_all_show_progress(p_show_id TEXT)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.progress_shares
     SET enabled = FALSE, revoked_at = NOW()
   WHERE owner_id = auth.uid() AND show_id = p_show_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_share_targets(p_show_id TEXT)
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT, is_shared BOOLEAN
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT f.user_id, f.username, f.full_name, f.avatar_url,
         coalesce(s.enabled AND s.revoked_at IS NULL, FALSE)
    FROM public.list_friends() f
    LEFT JOIN public.progress_shares s
           ON s.owner_id = auth.uid() AND s.friend_id = f.user_id AND s.show_id = p_show_id
   ORDER BY coalesce(f.full_name, f.username), f.user_id;
$$;

CREATE OR REPLACE FUNCTION public.list_my_progress_shares()
RETURNS TABLE (
  show_id TEXT, user_id UUID, username TEXT, full_name TEXT,
  avatar_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT s.show_id, p.id, p.username, p.full_name, p.avatar_url, s.created_at
    FROM public.progress_shares s
    JOIN public.profiles p ON p.id = s.friend_id
   WHERE s.owner_id = auth.uid() AND s.enabled AND s.revoked_at IS NULL
   ORDER BY s.created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- list_friend_show_progress(show_id)
--
-- Friends who share this show, and how far through it they are -- CLAMPED to
-- the viewer's own boundary.
--
-- ---------------------------------------------------------------------------
-- Spoiler safety
-- ---------------------------------------------------------------------------
-- docs/SOCIAL_SPEC.md: "Any shared progress must expose only a boundary
-- appropriate to the recipient's own progress... Social UI should avoid showing
-- episode titles or plot context beyond what the viewer has authorized and can
-- safely see."
--
-- A friend who is BEHIND or level with the viewer is shown exactly. A friend
-- who is AHEAD is reported as ahead, with season and episode withheld: knowing
-- someone has reached S3E8 tells you the show runs at least that far and that
-- they are still watching it, which is precisely the kind of thing a viewer on
-- S1E2 asked not to learn.
--
-- Clamped HERE rather than in the UI, because docs/TEAM_SPLIT.md is explicit:
-- "Do not rely on frontend-only privacy checks." A client that calls this
-- function directly gets the same redaction.
--
-- A viewer who has not started the show at all has a boundary of zero, so every
-- friend reads as "ahead" -- which is correct: nothing is safe to reveal yet.
--
-- SECURITY INVOKER, so every row has already passed the read policy above; this
-- function grants nothing on its own and only narrows what it returns.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_friend_show_progress(p_show_id TEXT)
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT,
  season_number INTEGER, episode_number INTEGER,
  progress_percent INTEGER, last_watched_at TIMESTAMPTZ,
  is_ahead BOOLEAN
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  WITH mine AS (
    -- The viewer's own furthest point in this show. Ordered by the episode
    -- boundary rather than recency: rewatching an early episode must not
    -- retract a boundary they have already passed.
    SELECT coalesce(max(w.current_season_number), 0)  AS season,
           coalesce(max(w.current_episode_number), 0) AS episode
      FROM public.watch_progress w
     WHERE w.user_id = auth.uid()
       AND w.show_id = p_show_id
       AND w.current_season_number = (
             SELECT max(w2.current_season_number) FROM public.watch_progress w2
              WHERE w2.user_id = auth.uid() AND w2.show_id = p_show_id
           )
  ),
  theirs AS (
    SELECT DISTINCT ON (w.user_id)
           w.user_id, w.current_season_number AS season,
           w.current_episode_number AS episode,
           w.progress_percent, w.last_watched_at
      FROM public.watch_progress w
     WHERE w.show_id = p_show_id
       AND w.user_id <> auth.uid()
     ORDER BY w.user_id, w.current_season_number DESC NULLS LAST,
              w.current_episode_number DESC NULLS LAST
  )
  SELECT p.id, p.username, p.full_name, p.avatar_url,
         CASE WHEN ahead.value THEN NULL ELSE t.season END,
         CASE WHEN ahead.value THEN NULL ELSE t.episode END,
         CASE WHEN ahead.value THEN 0 ELSE t.progress_percent END,
         t.last_watched_at,
         ahead.value
    FROM theirs t
    JOIN public.profiles p ON p.id = t.user_id
   CROSS JOIN mine m
   CROSS JOIN LATERAL (
     SELECT (coalesce(t.season, 0), coalesce(t.episode, 0)) > (m.season, m.episode) AS value
   ) ahead
   ORDER BY coalesce(p.full_name, p.username);
$$;

-- ============================================================================
-- 8. Watch parties
-- ============================================================================
--
-- Recursion break: "you can see a party if you are a member" and "you can see
-- members of your parties" reference each other. Both go through SECURITY
-- DEFINER helpers, the same pattern are_friends() uses.

CREATE OR REPLACE FUNCTION public.is_party_member(p_party_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.watch_party_members m
     WHERE m.party_id = p_party_id AND m.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.watch_party_host(p_party_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT host_id FROM public.watch_parties WHERE id = p_party_id;
$$;

DROP POLICY IF EXISTS "Members can view their parties" ON public.watch_parties;
CREATE POLICY "Members can view their parties"
  ON public.watch_parties FOR SELECT
  USING (auth.uid() = host_id OR public.is_party_member(id, auth.uid()));

DROP POLICY IF EXISTS "Users can host their own parties" ON public.watch_parties;
CREATE POLICY "Users can host their own parties"
  ON public.watch_parties FOR INSERT
  WITH CHECK (auth.uid() = host_id);

-- docs/WATCH_TOGETHER_SPEC.md: "The host is the default authority for play/pause
-- and seeking; the final product decision can add participant controls later."
-- Only the host may write playback state.
DROP POLICY IF EXISTS "Hosts drive playback" ON public.watch_parties;
CREATE POLICY "Hosts drive playback"
  ON public.watch_parties FOR UPDATE
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can delete their parties" ON public.watch_parties;
CREATE POLICY "Hosts can delete their parties"
  ON public.watch_parties FOR DELETE
  USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Members can see who else is in the party" ON public.watch_party_members;
CREATE POLICY "Members can see who else is in the party"
  ON public.watch_party_members FOR SELECT
  USING (public.is_party_member(party_id, auth.uid()));

-- Only the host admits people, and only friends. Same are_friends() as
-- everything else.
DROP POLICY IF EXISTS "Hosts can admit their friends" ON public.watch_party_members;
CREATE POLICY "Hosts can admit their friends"
  ON public.watch_party_members FOR INSERT
  WITH CHECK (
    auth.uid() = public.watch_party_host(party_id)
    AND (user_id = auth.uid() OR public.are_friends(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Members can leave and hosts can remove" ON public.watch_party_members;
CREATE POLICY "Members can leave and hosts can remove"
  ON public.watch_party_members FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = public.watch_party_host(party_id));

DROP POLICY IF EXISTS "Members can read party events" ON public.watch_party_events;
CREATE POLICY "Members can read party events"
  ON public.watch_party_events FOR SELECT
  USING (public.is_party_member(party_id, auth.uid()));

-- Members may append heartbeats; only the host may append control events.
DROP POLICY IF EXISTS "Members can append authorised events" ON public.watch_party_events;
CREATE POLICY "Members can append authorised events"
  ON public.watch_party_events FOR INSERT
  WITH CHECK (
    auth.uid() = actor_id
    AND public.is_party_member(party_id, auth.uid())
    AND (event_type = 'heartbeat' OR auth.uid() = public.watch_party_host(party_id))
  );

-- A party's identity is immutable.
CREATE OR REPLACE FUNCTION public.enforce_watch_party_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.host_id IS DISTINCT FROM OLD.host_id
     OR NEW.show_id IS DISTINCT FROM OLD.show_id THEN
    RAISE EXCEPTION 'A party''s host and show cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'Party revision cannot move backwards' USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_watch_party_update ON public.watch_parties;
CREATE TRIGGER on_watch_party_update
  BEFORE UPDATE ON public.watch_parties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watch_party_update();

CREATE OR REPLACE FUNCTION public.create_watch_party(p_show_id TEXT, p_episode_id TEXT)
RETURNS UUID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.watch_parties (host_id, show_id, episode_id)
  VALUES (v_uid, p_show_id, p_episode_id)
  RETURNING id INTO v_id;

  INSERT INTO public.watch_party_members (party_id, user_id, role)
  VALUES (v_id, v_uid, 'host');

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_to_watch_party(p_party_id UUID, p_friend_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.are_friends(auth.uid(), p_friend_id) THEN
    RAISE EXCEPTION 'You can only invite friends to watch together' USING ERRCODE = '42501';
  END IF;

  IF (SELECT status FROM public.watch_parties WHERE id = p_party_id) <> 'active' THEN
    RAISE EXCEPTION 'That session has ended' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.watch_party_members (party_id, user_id, role)
  VALUES (p_party_id, p_friend_id, 'participant')
  ON CONFLICT (party_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_watch_party(p_party_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.watch_party_members
   WHERE party_id = p_party_id AND user_id = auth.uid();
END;
$$;

-- Host-only. Bumps `revision` so clients can discard stale events, as
-- docs/WATCH_TOGETHER_SPEC.md requires, and appends to the event log.
CREATE OR REPLACE FUNCTION public.update_party_playback(
  p_party_id UUID, p_position_seconds INTEGER, p_is_playing BOOLEAN, p_event_type TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_revision BIGINT;
BEGIN
  IF p_position_seconds < 0 THEN
    RAISE EXCEPTION 'Position cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_event_type NOT IN ('play', 'pause', 'seek') THEN
    RAISE EXCEPTION 'Unknown playback event' USING ERRCODE = '22023';
  END IF;

  UPDATE public.watch_parties
     SET position_seconds = p_position_seconds,
         is_playing = p_is_playing,
         revision = revision + 1
   WHERE id = p_party_id AND status = 'active' AND host_id = v_uid
   RETURNING revision INTO v_revision;

  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'Only the host can control playback in this session'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.watch_party_events (party_id, actor_id, event_type, position_seconds, revision)
  VALUES (p_party_id, v_uid, p_event_type, p_position_seconds, v_revision);

  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_watch_party(p_party_id UUID)
RETURNS VOID
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.watch_parties
     SET status = 'ended', is_playing = FALSE, revision = revision + 1
   WHERE id = p_party_id AND host_id = auth.uid() AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found, already ended, or not yours to end'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_watch_parties()
RETURNS TABLE (
  party_id UUID, show_id TEXT, episode_id TEXT, is_host BOOLEAN,
  member_count BIGINT, host_user_id UUID, host_username TEXT,
  host_full_name TEXT, host_avatar_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.show_id, p.episode_id, p.host_id = auth.uid(),
         (SELECT count(*) FROM public.watch_party_members c WHERE c.party_id = p.id),
         h.id, h.username, h.full_name, h.avatar_url, p.created_at
    FROM public.watch_parties p
    JOIN public.watch_party_members me ON me.party_id = p.id AND me.user_id = auth.uid()
    JOIN public.profiles h ON h.id = p.host_id
   WHERE p.status = 'active'
   ORDER BY p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_party_members(p_party_id UUID)
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT,
  is_host BOOLEAN, joined_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT m.user_id, pr.username, pr.full_name, pr.avatar_url,
         m.role = 'host', m.joined_at
    FROM public.watch_party_members m
    JOIN public.profiles pr ON pr.id = m.user_id
   WHERE m.party_id = p_party_id
   ORDER BY m.role = 'host' DESC, m.joined_at;
$$;

CREATE OR REPLACE FUNCTION public.list_party_invite_targets(p_party_id UUID)
RETURNS TABLE (
  user_id UUID, username TEXT, full_name TEXT, avatar_url TEXT, is_invited BOOLEAN
)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT f.user_id, f.username, f.full_name, f.avatar_url, m.user_id IS NOT NULL
    FROM public.list_friends() f
    LEFT JOIN public.watch_party_members m
           ON m.party_id = p_party_id AND m.user_id = f.user_id
   ORDER BY coalesce(f.full_name, f.username), f.user_id;
$$;

-- ============================================================================
-- 9. Grants
-- ============================================================================
-- RLS still gates every row; these only make the objects reachable.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_recommendations  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress_shares       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_parties         TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.watch_party_members   TO authenticated;
GRANT SELECT, INSERT                 ON public.watch_party_events    TO authenticated;

GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(UUID)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfriend(UUID)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(UUID)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friends()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_incoming_friend_requests()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_outgoing_friend_requests()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_blocked_users()                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(TEXT)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_username(TEXT)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.recommend_title(UUID, INTEGER, TEXT, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_recommendation_status(UUID, TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_recommendation(UUID)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_incoming_recommendations(BOOLEAN)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_recommendation_targets(INTEGER, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_show_progress(TEXT, UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_show_progress(TEXT, UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_show_progress(TEXT)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_targets(TEXT)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_progress_shares()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friend_show_progress(TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_party_member(UUID, UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_party_host(UUID)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_watch_party(TEXT, TEXT)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_watch_party(UUID, UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_watch_party(UUID)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_party_playback(UUID, INTEGER, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_watch_party(UUID)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_watch_parties()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_party_members(UUID)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_party_invite_targets(UUID)                  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_username(TEXT) FROM PUBLIC;

-- ============================================================================
-- 10. Realtime
-- ============================================================================
-- RLS applies to Realtime exactly as to a query, so a client is only notified
-- about rows its policies already permit it to read.
--
-- High-frequency party sync rides a broadcast channel, which needs no
-- publication; these carry durable transitions only.

DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY[
      'friendships', 'show_recommendations', 'progress_shares',
      'watch_parties', 'watch_party_members'
    ] LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END LOOP;
  END IF;
END $$;

-- DELETE events carry the old row only under FULL replica identity, which
-- clients need to know which relationship or share ended.
ALTER TABLE public.friendships          REPLICA IDENTITY FULL;
ALTER TABLE public.show_recommendations REPLICA IDENTITY FULL;
ALTER TABLE public.progress_shares      REPLICA IDENTITY FULL;
ALTER TABLE public.watch_parties        REPLICA IDENTITY FULL;
ALTER TABLE public.watch_party_members  REPLICA IDENTITY FULL;

COMMIT;
