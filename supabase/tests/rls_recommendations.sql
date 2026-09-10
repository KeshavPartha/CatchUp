-- ============================================================================
-- CatchUp — RLS privacy suite: friend-to-friend recommendations
-- ============================================================================
--
-- Self-contained: seeds its own cast so the file can run in any order relative
-- to the other suites.
--
--   Dave  and  Erin   become friends and recommend titles to each other.
--   Frank stays a stranger, and proves that recommending requires friendship.
-- ============================================================================

\set ON_ERROR_STOP on
\set DAVE  '44444444-4444-4444-8444-444444444444'
\set ERIN  '55555555-5555-4555-8555-555555555555'
\set FRANK '66666666-6666-4666-8666-666666666666'

\echo ''
\echo '=============================================================='
\echo ' CatchUp recommendations RLS suite'
\echo '=============================================================='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'DAVE',  'dave@catchup.test',  '{"full_name":"Dave Diaz"}'::JSONB),
    (:'ERIN',  'erin@catchup.test',  '{"full_name":"Erin Eze"}'::JSONB),
    (:'FRANK', 'frank@catchup.test', '{"full_name":"Frank Fox"}'::JSONB);

-- Dave and Erin become friends.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
SELECT public.send_friend_request(:'ERIN');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'req_dave_to_erin', id::TEXT
  FROM public.friend_requests
 WHERE sender_id = :'DAVE' AND recipient_id = :'ERIN' AND status = 'pending'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
SELECT public.accept_friend_request(test.fixture('req_dave_to_erin'));
COMMIT;

-- ----------------------------------------------------------------------------
-- 1. Friendship is required to recommend.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 1. Friendship is required -----------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'FRANK');
DO $$
BEGIN
    PERFORM test.denied(
        'a stranger cannot recommend a title',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 1396, 'tv', 'you will like this')$q$);

    PERFORM test.denied(
        'a stranger cannot insert a recommendation directly',
        $q$INSERT INTO public.recommendations (sender_id, recipient_id, media_id, media_type)
           VALUES ('66666666-6666-4666-8666-666666666666',
                   '55555555-5555-4555-8555-555555555555', 1396, 'tv')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.denied(
        'a recommendation cannot be sent in someone else''s name',
        $q$INSERT INTO public.recommendations (sender_id, recipient_id, media_id, media_type)
           VALUES ('66666666-6666-4666-8666-666666666666',
                   '55555555-5555-4555-8555-555555555555', 1396, 'tv')$q$);

    PERFORM test.denied(
        'a note longer than 280 characters is refused',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 1396, 'tv', repeat('x', 281))$q$);

    PERFORM test.denied(
        'an unknown media type is refused',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 1396, 'podcast', NULL)$q$);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 2. Sending.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 2. Sending a recommendation ---------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
SELECT public.recommend_title(:'ERIN', 1396, 'tv', 'Start with season 1.');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
DECLARE
    v_first  UUID;
    v_second UUID;
BEGIN
    SELECT id INTO v_first FROM public.recommendations
     WHERE recipient_id = '55555555-5555-4555-8555-555555555555' AND media_id = 1396;

    -- Idempotent: re-sending must not create a second row or nag the recipient.
    SELECT public.recommend_title(
        '55555555-5555-4555-8555-555555555555', 1396, 'tv', 'again!') INTO v_second;

    PERFORM test.ok('re-recommending returns the original row', v_first = v_second);
    PERFORM test.eq('and creates no duplicate',
                    (SELECT count(*) FROM public.recommendations
                      WHERE media_id = 1396
                        AND recipient_id = '55555555-5555-4555-8555-555555555555'), 1);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
DO $$
BEGIN
    PERFORM test.eq('Erin sees the recommendation',
                    (SELECT count(*) FROM public.list_incoming_recommendations()), 1);
    PERFORM test.ok('the note came through',
                    (SELECT note FROM public.list_incoming_recommendations())
                    = 'Start with season 1.');
    PERFORM test.ok('and it is attributed to Dave',
                    (SELECT username FROM public.list_incoming_recommendations()) = 'dave');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'FRANK');
DO $$
BEGIN
    PERFORM test.eq('a stranger cannot see other people''s recommendations',
                    (SELECT count(*) FROM public.recommendations), 0);
    PERFORM test.eq('nor through the inbox function',
                    (SELECT count(*) FROM public.list_incoming_recommendations()), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 3. Only the recipient responds.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 3. Responding -----------------------------------------------'
INSERT INTO test.fixtures (key, value)
SELECT 'rec_dave_erin_1396', id::TEXT
  FROM public.recommendations
 WHERE sender_id = :'DAVE' AND recipient_id = :'ERIN' AND media_id = 1396
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    -- The sender must not be able to mark their own recommendation as taken up.
    PERFORM test.denied(
        'the sender cannot respond on the recipient''s behalf',
        $q$SELECT public.set_recommendation_status(
               test.fixture('rec_dave_erin_1396'), 'added')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'FRANK');
DO $$
BEGIN
    PERFORM test.denied(
        'an uninvolved user cannot respond',
        $q$SELECT public.set_recommendation_status(
               test.fixture('rec_dave_erin_1396'), 'dismissed')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
DO $$
BEGIN
    PERFORM test.denied(
        'an unknown status is refused',
        $q$SELECT public.set_recommendation_status(
               test.fixture('rec_dave_erin_1396'), 'obliterated')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
SELECT public.set_recommendation_status(test.fixture('rec_dave_erin_1396'), 'added');
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('the recipient can mark it added',
                    (SELECT status FROM public.recommendations
                      WHERE id = test.fixture('rec_dave_erin_1396')) = 'added');
END $$;

-- ----------------------------------------------------------------------------
-- 4. The picker knows what has already been sent.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 4. Recommendation targets -----------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.eq('Dave can pick from his friends',
                    (SELECT count(*) FROM public.list_recommendation_targets(1396, 'tv')), 1);
    PERFORM test.ok('and Erin is marked as already sent',
                    (SELECT already_sent FROM public.list_recommendation_targets(1396, 'tv')));
    PERFORM test.ok('while an unsent title is not',
                    NOT (SELECT already_sent
                           FROM public.list_recommendation_targets(550, 'movie')));
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 5. A recommendation still conveys no viewing history.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 5. Recommendations leak no history --------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
INSERT INTO public.watch_progress (user_id, media_id, media_type, progress)
VALUES (:'DAVE', 1396, 'tv', 88);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
DO $$
BEGIN
    -- Erin was recommended this exact title by Dave, and they are friends.
    -- Neither fact grants any view of how far Dave has actually watched.
    PERFORM test.eq('being recommended a title reveals no progress on it',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '44444444-4444-4444-8444-444444444444'), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 6. Unfriending withdraws open invitations, keeps resolved history.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 6. Unfriending ----------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
SELECT public.recommend_title(:'ERIN', 550, 'movie', 'this one next');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('a second, still-pending recommendation exists',
                    (SELECT count(*) FROM public.recommendations
                      WHERE media_id = 550 AND status = 'pending'), 1);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ERIN');
SELECT public.unfriend(:'DAVE');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('unfriending withdraws the pending recommendation',
                    (SELECT count(*) FROM public.recommendations WHERE media_id = 550), 0);
    PERFORM test.eq('but keeps the one already acted on',
                    (SELECT count(*) FROM public.recommendations
                      WHERE media_id = 1396 AND status = 'added'), 1);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'DAVE');
DO $$
BEGIN
    PERFORM test.denied(
        'and recommending again is refused once unfriended',
        $q$SELECT public.recommend_title(
               '55555555-5555-4555-8555-555555555555', 1399, 'tv', NULL)$q$);
END $$;
ROLLBACK;

\echo ''
\echo '=============================================================='
\echo ' All recommendation RLS assertions passed.'
\echo '=============================================================='
\echo ''
