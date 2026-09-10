-- ============================================================================
-- CatchUp — RLS privacy suite: Watch Together sessions
-- ============================================================================
--
--   Kim   hosts a session.
--   Leo   is Kim's friend, and gets invited.
--   Mia   is Kim's friend, but is never invited.
--   Ned   is a stranger.
--
-- The through-line: a Watch Together session is private to the people actually
-- in it, invitations are the only way in, and the friendship rule that gates
-- them is the same are_friends() every other social policy uses.
-- ============================================================================

\set ON_ERROR_STOP on
\set KIM 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set LEO 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
\set MIA 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
\set NED 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

\echo ''
\echo '=============================================================='
\echo ' CatchUp Watch Together RLS suite'
\echo '=============================================================='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'KIM', 'kim@catchup.test', '{"full_name":"Kim Kaur"}'::JSONB),
    (:'LEO', 'leo@catchup.test', '{"full_name":"Leo Lang"}'::JSONB),
    (:'MIA', 'mia@catchup.test', '{"full_name":"Mia Moss"}'::JSONB),
    (:'NED', 'ned@catchup.test', '{"full_name":"Ned Novak"}'::JSONB);

CREATE OR REPLACE FUNCTION test.befriend(p_a UUID, p_b UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_req UUID;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_a)::TEXT, TRUE);
    v_req := public.send_friend_request(p_b);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_b)::TEXT, TRUE);
    PERFORM public.accept_friend_request(v_req);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'KIM', :'LEO');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'KIM', :'MIA');
COMMIT;

-- Kim starts a session.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.create_watch_session(1396, 'tv');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'session_kim', id::TEXT FROM public.watch_sessions WHERE host_id = :'KIM'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ----------------------------------------------------------------------------
-- 1. A new session is private to its host.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 1. A session starts private ---------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.eq('Kim sees her session',
                    (SELECT count(*) FROM public.watch_sessions), 1);
    PERFORM test.eq('and is seeded as a joined participant',
                    (SELECT count(*) FROM public.list_session_participants(
                        test.fixture('session_kim')) WHERE has_joined), 1);
    PERFORM test.ok('and is marked as the host',
                    (SELECT is_host FROM public.list_session_participants(
                        test.fixture('session_kim'))));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    -- Leo is Kim's friend. Friendship does not put him in her sessions.
    PERFORM test.eq('an uninvited friend cannot see the session',
                    (SELECT count(*) FROM public.watch_sessions), 0);
    PERFORM test.eq('nor its participant list',
                    (SELECT count(*) FROM public.list_session_participants(
                        test.fixture('session_kim'))), 0);
    PERFORM test.eq('and it is not in their session list',
                    (SELECT count(*) FROM public.list_my_watch_sessions()), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'NED');
DO $$
BEGIN
    PERFORM test.eq('a stranger sees nothing',
                    (SELECT count(*) FROM public.watch_sessions), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 2. Invitations: host only, friends only.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 2. Who may invite -------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.denied(
        'the host cannot invite a non-friend',
        $q$SELECT public.invite_to_watch_session(
               test.fixture('session_kim'), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'NED');
DO $$
BEGIN
    -- The attack that matters: adding yourself to someone else's session.
    PERFORM test.denied(
        'a stranger cannot add themselves to a session',
        $q$INSERT INTO public.watch_session_participants (session_id, user_id)
           VALUES (test.fixture('session_kim'),
                   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
DO $$
BEGIN
    PERFORM test.denied(
        'an uninvited friend cannot add themselves either',
        $q$INSERT INTO public.watch_session_participants (session_id, user_id)
           VALUES (test.fixture('session_kim'),
                   'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$q$);

    PERFORM test.denied(
        'and cannot join without an invitation',
        $q$SELECT public.join_watch_session(test.fixture('session_kim'))$q$);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 3. Kim invites Leo.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 3. Inviting -------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.invite_to_watch_session(test.fixture('session_kim'), :'LEO');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    PERFORM test.eq('an invitation makes the session visible',
                    (SELECT count(*) FROM public.watch_sessions), 1);
    PERFORM test.ok('but it is not joined yet',
                    NOT (SELECT has_joined FROM public.list_my_watch_sessions()));
    PERFORM test.eq('and only the host counts as present',
                    (SELECT participant_count FROM public.list_my_watch_sessions()), 1);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
DO $$
BEGIN
    -- Mia is equally Kim's friend, and equally uninvited.
    PERFORM test.eq('inviting one friend does not expose the session to another',
                    (SELECT count(*) FROM public.watch_sessions), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
SELECT public.join_watch_session(test.fixture('session_kim'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    PERFORM test.ok('Leo has now joined',
                    (SELECT has_joined FROM public.list_my_watch_sessions()));
    PERFORM test.eq('and both people are present',
                    (SELECT participant_count FROM public.list_my_watch_sessions()), 2);
    PERFORM test.eq('and he can see who else is here',
                    (SELECT count(*) FROM public.list_session_participants(
                        test.fixture('session_kim'))), 2);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 4. Playback is collaborative, identity is not.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 4. Driving playback -----------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
SELECT public.update_playback_state(test.fixture('session_kim'), 942, TRUE);
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('a guest can drive playback',
                    (SELECT position_seconds FROM public.watch_sessions
                      WHERE id = test.fixture('session_kim')), 942);
    PERFORM test.ok('and the play state moved with it',
                    (SELECT is_playing FROM public.watch_sessions
                      WHERE id = test.fixture('session_kim')));
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'NED');
DO $$
BEGIN
    PERFORM test.denied(
        'a stranger cannot drive playback',
        $q$SELECT public.update_playback_state(test.fixture('session_kim'), 0, FALSE)$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
DO $$
BEGIN
    PERFORM test.denied(
        'an uninvited friend cannot drive playback',
        $q$SELECT public.update_playback_state(test.fixture('session_kim'), 0, FALSE)$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    -- The session's identity is immutable even to a participant.
    PERFORM test.denied(
        'a guest cannot repoint the session at another title',
        $q$UPDATE public.watch_sessions SET media_id = 1399
            WHERE id = test.fixture('session_kim')$q$);

    PERFORM test.denied(
        'a guest cannot make themselves the host',
        $q$UPDATE public.watch_sessions
              SET host_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
            WHERE id = test.fixture('session_kim')$q$);

    PERFORM test.denied(
        'and cannot end the session',
        $q$SELECT public.end_watch_session(test.fixture('session_kim'))$q$);

    PERFORM test.denied(
        'not even by writing the status directly',
        $q$UPDATE public.watch_sessions SET status = 'ended'
            WHERE id = test.fixture('session_kim')$q$);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 5. Watch Together conveys no viewing history.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 5. Sessions leak no history ---------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
INSERT INTO public.watch_progress (user_id, media_id, media_type, progress)
VALUES (:'KIM', 1396, 'tv', 73);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    -- Leo is in Kim's session, for this exact title. That still says nothing
    -- about how far Kim has watched it on her own.
    PERFORM test.eq('watching together reveals no progress on the title',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0);
    PERFORM test.eq('and the friend-progress view stays empty',
                    (SELECT count(*) FROM public.list_friend_progress(1396, 'tv')), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 6. Leaving, and the invite picker.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 6. Leaving --------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.eq('the invite picker lists both friends',
                    (SELECT count(*) FROM public.list_watch_session_targets(
                        test.fixture('session_kim'))), 2);
    PERFORM test.ok('with Leo already invited',
                    (SELECT is_invited FROM public.list_watch_session_targets(
                        test.fixture('session_kim'))
                      WHERE user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
    PERFORM test.ok('and Mia not',
                    NOT (SELECT is_invited FROM public.list_watch_session_targets(
                        test.fixture('session_kim'))
                      WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
SELECT public.leave_watch_session(test.fixture('session_kim'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    PERFORM test.eq('leaving ends access to the session',
                    (SELECT count(*) FROM public.watch_sessions), 0);
    PERFORM test.eq('and to its participant list',
                    (SELECT count(*) FROM public.list_session_participants(
                        test.fixture('session_kim'))), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 7. Unfriending withdraws un-accepted invitations.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 7. Unfriending ----------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.invite_to_watch_session(test.fixture('session_kim'), :'MIA');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('Mia now has a pending invitation',
                    (SELECT count(*) FROM public.watch_session_participants
                      WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 1);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
SELECT public.unfriend(:'KIM');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('unfriending withdraws the un-accepted invitation',
                    (SELECT count(*) FROM public.watch_session_participants
                      WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 0);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
DO $$
BEGIN
    PERFORM test.eq('and the session is invisible again',
                    (SELECT count(*) FROM public.watch_sessions), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 8. Ending the session.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 8. Ending ---------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.end_watch_session(test.fixture('session_kim'));
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('the host can end the session',
                    (SELECT status FROM public.watch_sessions
                      WHERE id = test.fixture('session_kim')) = 'ended');
    PERFORM test.ok('and playback stops with it',
                    NOT (SELECT is_playing FROM public.watch_sessions
                          WHERE id = test.fixture('session_kim')));
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.eq('an ended session leaves the active list',
                    (SELECT count(*) FROM public.list_my_watch_sessions()), 0);
    PERFORM test.denied(
        'and cannot be driven any further',
        $q$SELECT public.update_playback_state(test.fixture('session_kim'), 10, TRUE)$q$);
    PERFORM test.denied(
        'nor invited into',
        $q$SELECT public.invite_to_watch_session(
               test.fixture('session_kim'), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '=============================================================='
\echo ' All Watch Together RLS assertions passed.'
\echo '=============================================================='
\echo ''
