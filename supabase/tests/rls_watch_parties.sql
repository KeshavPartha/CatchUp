-- ============================================================================
-- CatchUp — RLS privacy suite: Watch Together parties
-- ============================================================================
--
--   Kim hosts. Leo is her friend and gets invited. Mia is her friend and does
--   not. Ned is a stranger.
--
-- docs/WATCH_TOGETHER_SPEC.md makes the host the authority for play/pause and
-- seeking, so the guarantees under test are: membership is the only way in,
-- invitations are host-only and friends-only, and only the host may move
-- playback or end the session.
-- ============================================================================

\set ON_ERROR_STOP on
\set KIM 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set LEO 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
\set MIA 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
\set NED 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

\echo ''
\echo '=== watch parties ==='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'KIM', 'kim@catchup.test', '{"full_name":"Kim Kaur"}'::JSONB),
    (:'LEO', 'leo@catchup.test', '{"full_name":"Leo Lang"}'::JSONB),
    (:'MIA', 'mia@catchup.test', '{"full_name":"Mia Moss"}'::JSONB),
    (:'NED', 'ned@catchup.test', '{"full_name":"Ned Novak"}'::JSONB);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'KIM', :'LEO');
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'KIM', :'MIA');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.create_watch_party('orion', 'orion-s1e1');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'party_kim', id::TEXT FROM public.watch_parties WHERE host_id = :'KIM'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

\echo ''
\echo '-- 1. A party starts private -----------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.eq('Kim sees her party', (SELECT count(*) FROM public.watch_parties), 1);
    PERFORM test.eq('and is seeded as the only member',
                    (SELECT count(*) FROM public.list_party_members(test.fixture('party_kim'))), 1);
    PERFORM test.ok('with the host role',
                    (SELECT is_host FROM public.list_party_members(test.fixture('party_kim'))));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    -- Leo is Kim's friend. Friendship does not put him in her sessions.
    PERFORM test.eq('an uninvited friend cannot see the party',
                    (SELECT count(*) FROM public.watch_parties), 0);
    PERFORM test.eq('nor its member list',
                    (SELECT count(*) FROM public.list_party_members(test.fixture('party_kim'))), 0);
    PERFORM test.eq('nor its event log',
                    (SELECT count(*) FROM public.watch_party_events), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'NED');
DO $$
BEGIN
    PERFORM test.eq('a stranger sees nothing', (SELECT count(*) FROM public.watch_parties), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 2. Who may admit people -------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.denied(
        'the host cannot invite a non-friend',
        $q$SELECT public.invite_to_watch_party(
               test.fixture('party_kim'), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'NED');
DO $$
BEGIN
    -- The attack that matters: adding yourself to someone else's session.
    PERFORM test.denied(
        'a stranger cannot add themselves',
        $q$INSERT INTO public.watch_party_members (party_id, user_id)
           VALUES (test.fixture('party_kim'), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
DO $$
BEGIN
    PERFORM test.denied(
        'an uninvited friend cannot add themselves either',
        $q$INSERT INTO public.watch_party_members (party_id, user_id)
           VALUES (test.fixture('party_kim'), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '-- 3. Inviting -------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.invite_to_watch_party(test.fixture('party_kim'), :'LEO');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    PERFORM test.eq('membership makes the party visible',
                    (SELECT count(*) FROM public.watch_parties), 1);
    PERFORM test.eq('it appears in his session list',
                    (SELECT count(*) FROM public.list_my_watch_parties()), 1);
    PERFORM test.eq('and he can see who else is here',
                    (SELECT count(*) FROM public.list_party_members(test.fixture('party_kim'))), 2);
    PERFORM test.ok('but he is not the host',
                    NOT (SELECT is_host FROM public.list_my_watch_parties()));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
DO $$
BEGIN
    PERFORM test.eq('inviting one friend does not expose the party to another',
                    (SELECT count(*) FROM public.watch_parties), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 4. The host is the playback authority -----------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.update_party_playback(test.fixture('party_kim'), 942, TRUE, 'play');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('the host can drive playback',
                    (SELECT position_seconds FROM public.watch_parties
                      WHERE id = test.fixture('party_kim')), 942);
    PERFORM test.ok('and the play state moved with it',
                    (SELECT is_playing FROM public.watch_parties
                      WHERE id = test.fixture('party_kim')));
    PERFORM test.eq('the revision advanced',
                    (SELECT revision FROM public.watch_parties
                      WHERE id = test.fixture('party_kim')), 1);
    PERFORM test.eq('and the transition was logged',
                    (SELECT count(*) FROM public.watch_party_events
                      WHERE party_id = test.fixture('party_kim')), 1);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    -- Per docs/WATCH_TOGETHER_SPEC.md the host is the default authority.
    PERFORM test.denied(
        'a guest cannot drive playback',
        $q$SELECT public.update_party_playback(test.fixture('party_kim'), 0, FALSE, 'pause')$q$);

    -- A restrictive USING clause FILTERS rather than raising, so a guest's
    -- direct write silently matches no rows. What matters is that the session
    -- is unmoved afterwards.
    UPDATE public.watch_parties SET position_seconds = 0
     WHERE id = test.fixture('party_kim');
    PERFORM test.eq('a guest writing the row directly changes nothing',
                    (SELECT position_seconds FROM public.watch_parties
                      WHERE id = test.fixture('party_kim')), 942);

    PERFORM test.denied(
        'nor forge a control event',
        $q$INSERT INTO public.watch_party_events
             (party_id, actor_id, event_type, position_seconds, revision)
           VALUES (test.fixture('party_kim'),
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'seek', 0, 99)$q$);

    PERFORM test.denied(
        'and cannot end the session',
        $q$SELECT public.end_watch_party(test.fixture('party_kim'))$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
INSERT INTO public.watch_party_events (party_id, actor_id, event_type, position_seconds, revision)
VALUES (test.fixture('party_kim'), :'LEO', 'heartbeat', 942, 1);
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('but a guest may append a heartbeat',
                    (SELECT count(*) FROM public.watch_party_events
                      WHERE event_type = 'heartbeat'), 1);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'NED');
DO $$
BEGIN
    PERFORM test.denied(
        'a stranger cannot drive playback',
        $q$SELECT public.update_party_playback(test.fixture('party_kim'), 0, FALSE, 'pause')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '-- 5. A party''s identity is immutable --------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.denied(
        'even the host cannot repoint the party at another show',
        $q$UPDATE public.watch_parties SET show_id = 'quiet'
            WHERE id = test.fixture('party_kim')$q$);

    PERFORM test.denied(
        'nor hand off the host role by writing the row',
        $q$UPDATE public.watch_parties
              SET host_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
            WHERE id = test.fixture('party_kim')$q$);

    PERFORM test.denied(
        'and the revision cannot move backwards',
        $q$UPDATE public.watch_parties SET revision = 0
            WHERE id = test.fixture('party_kim')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '-- 6. A party conveys no viewing history -----------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES (:'KIM', 'tv', 'orion', 'orion-s3e1', 3, 1, 500, 1800, 73);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    -- Leo is in Kim's party, for this exact show. That still says nothing
    -- about how far Kim has watched it on her own.
    PERFORM test.eq('watching together reveals no personal progress',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0);
    PERFORM test.eq('and the shared-progress view stays empty',
                    (SELECT count(*) FROM public.list_friend_show_progress('orion')), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 7. Leaving and unfriending ----------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
SELECT public.leave_watch_party(test.fixture('party_kim'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'LEO');
DO $$
BEGIN
    PERFORM test.eq('leaving ends access to the party',
                    (SELECT count(*) FROM public.watch_parties), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.invite_to_watch_party(test.fixture('party_kim'), :'MIA');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'MIA');
SELECT public.unfriend(:'KIM');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('unfriending withdraws the membership',
                    (SELECT count(*) FROM public.watch_party_members
                      WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 0);
END $$;

\echo ''
\echo '-- 8. Ending ---------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
SELECT public.end_watch_party(test.fixture('party_kim'));
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('the host can end the party',
                    (SELECT status FROM public.watch_parties
                      WHERE id = test.fixture('party_kim')) = 'ended');
    PERFORM test.ok('and playback stops with it',
                    NOT (SELECT is_playing FROM public.watch_parties
                          WHERE id = test.fixture('party_kim')));
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'KIM');
DO $$
BEGIN
    PERFORM test.eq('an ended party leaves the active list',
                    (SELECT count(*) FROM public.list_my_watch_parties()), 0);
    PERFORM test.denied(
        'and cannot be driven any further',
        $q$SELECT public.update_party_playback(test.fixture('party_kim'), 10, TRUE, 'play')$q$);
    PERFORM test.denied(
        'nor invited into',
        $q$SELECT public.invite_to_watch_party(
               test.fixture('party_kim'), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '=== watch parties suite passed ==='
