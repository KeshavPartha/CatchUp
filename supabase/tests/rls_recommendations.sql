-- ============================================================================
-- CatchUp — RLS privacy suite: friend-to-friend recommendations
-- ============================================================================
--
--   Dave and Erin are friends. Frank is a stranger.
--
-- A recommendation is a deliberate, addressed act. It must never be derivable
-- from what someone watched, and it must never reveal the sender's progress.
-- ============================================================================

\set ON_ERROR_STOP on
\set DAVE  '44444444-4444-4444-8444-444444444444'
\set ERIN  '55555555-5555-4555-8555-555555555555'
\set FRANK '66666666-6666-4666-8666-666666666666'

\echo ''
\echo '=== recommendations ==='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'DAVE',  'dave@catchup.test',  '{"full_name":"Dave Diaz"}'::JSONB),
    (:'ERIN',  'erin@catchup.test',  '{"full_name":"Erin Eze"}'::JSONB),
    (:'FRANK', 'frank@catchup.test', '{"full_name":"Frank Fox"}'::JSONB);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'DAVE', :'ERIN');
COMMIT;

\echo ''
\echo '-- 1. Friendship is required to send ---------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'FRANK');
DO $$
BEGIN
    PERFORM test.denied(
        'a stranger cannot recommend a title',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 101, 'tv', 'you will like this')$q$);

    PERFORM test.denied(
        'nor insert one directly',
        $q$INSERT INTO public.show_recommendations (sender_id, recipient_id, media_id, media_type)
           VALUES ('66666666-6666-4666-8666-666666666666',
                   '55555555-5555-4555-8555-555555555555', 101, 'tv')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.denied(
        'a recommendation cannot be sent in someone else''s name',
        $q$INSERT INTO public.show_recommendations (sender_id, recipient_id, media_id, media_type)
           VALUES ('66666666-6666-4666-8666-666666666666',
                   '55555555-5555-4555-8555-555555555555', 101, 'tv')$q$);

    PERFORM test.denied(
        'an over-long note is refused',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 101, 'tv', repeat('x', 281))$q$);

    PERFORM test.denied(
        'an unknown media type is refused',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 101, 'podcast', NULL)$q$);
END $$;
ROLLBACK;

\echo ''
\echo '-- 2. Sending --------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
SELECT public.recommend_title(:'ERIN', 101, 'tv', 'Start with season 1.');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
DECLARE
    v_first UUID;
    v_again UUID;
BEGIN
    SELECT id INTO v_first FROM public.show_recommendations WHERE media_id = 101;
    SELECT public.recommend_title('55555555-5555-4555-8555-555555555555', 101, 'tv', 'again!')
      INTO v_again;

    PERFORM test.ok('re-recommending returns the original row', v_first = v_again);
    PERFORM test.eq('and creates no duplicate',
                    (SELECT count(*) FROM public.show_recommendations WHERE media_id = 101), 1);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
DO $$
BEGIN
    PERFORM test.eq('Erin sees it',
                    (SELECT count(*) FROM public.list_incoming_recommendations()), 1);
    PERFORM test.ok('with the note',
                    (SELECT note FROM public.list_incoming_recommendations()) = 'Start with season 1.');
    PERFORM test.ok('attributed to Dave',
                    (SELECT username FROM public.list_incoming_recommendations()) = 'dave');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'FRANK');
DO $$
BEGIN
    PERFORM test.eq('a stranger sees no recommendations at all',
                    (SELECT count(*) FROM public.show_recommendations), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 3. Only the recipient responds ------------------------------'
INSERT INTO test.fixtures (key, value)
SELECT 'rec_dave_erin', id::TEXT FROM public.show_recommendations WHERE media_id = 101
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.denied(
        'the sender cannot respond on the recipient''s behalf',
        $q$SELECT public.set_recommendation_status(test.fixture('rec_dave_erin'), 'read')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
DO $$
BEGIN
    PERFORM test.denied(
        'an unknown status is refused',
        $q$SELECT public.set_recommendation_status(test.fixture('rec_dave_erin'), 'obliterated')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
SELECT public.set_recommendation_status(test.fixture('rec_dave_erin'), 'read');
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('the recipient can mark it read',
                    (SELECT status FROM public.show_recommendations
                      WHERE id = test.fixture('rec_dave_erin')) = 'read');
END $$;

\echo ''
\echo '-- 4. The picker knows what has been sent ----------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.eq('Dave can pick from his friends',
                    (SELECT count(*) FROM public.list_recommendation_targets(101, 'tv')), 1);
    PERFORM test.ok('Erin is marked already sent',
                    (SELECT already_sent FROM public.list_recommendation_targets(101, 'tv')));
    PERFORM test.ok('an unsent title is not',
                    NOT (SELECT already_sent FROM public.list_recommendation_targets(999, 'movie')));
END $$;
ROLLBACK;

\echo ''
\echo '-- 5. Recommendations leak no viewing history ------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES (:'DAVE', 'tv', '101', '101-s1e4', 1, 4, 900, 1800, 50);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
DO $$
BEGIN
    -- Erin was recommended this exact title by Dave, and they are friends.
    -- Neither fact reveals how far Dave has actually watched.
    PERFORM test.eq('being recommended a title reveals no progress on it',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '44444444-4444-4444-8444-444444444444'), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 6. Unfriending withdraws open invitations -------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
SELECT public.recommend_title(:'ERIN', 202, 'movie', 'this one next');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
SELECT public.unfriend(:'DAVE');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('the unread recommendation is withdrawn',
                    (SELECT count(*) FROM public.show_recommendations WHERE media_id = 202), 0);
    PERFORM test.eq('but the one already acted on is kept as history',
                    (SELECT count(*) FROM public.show_recommendations WHERE media_id = 101), 1);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.denied(
        'and recommending again is refused once unfriended',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 303, 'tv', NULL)$q$);
END $$;
ROLLBACK;

\echo ''
\echo '=== recommendations suite passed ==='
