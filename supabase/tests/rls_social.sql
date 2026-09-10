-- ============================================================================
-- CatchUp — RLS privacy suite: social friend graph
-- ============================================================================
--
-- Run with:  npm run test:rls
--
-- Reads as a narrative: three users meet, become friends, and part. Each step
-- asserts both what SHOULD be visible and -- more importantly -- what must not
-- be. A suite that only proves the happy path has tested nothing.
--
-- Cast:
--   Alice  and  Bob    become friends.
--   Carol  is a stranger throughout, and exists to prove that being a user of
--          CatchUp grants no access to anyone else's data.
--
-- Every assertion runs as `authenticated` with request.jwt.claims set, which is
-- exactly how PostgREST executes a real request. A failure aborts the run.
-- ============================================================================

\set ON_ERROR_STOP on
\set ALICE '11111111-1111-4111-8111-111111111111'
\set BOB   '22222222-2222-4222-8222-222222222222'
\set CAROL '33333333-3333-4333-8333-333333333333'

\echo ''
\echo '=============================================================='
\echo ' CatchUp social RLS suite'
\echo '=============================================================='

-- ----------------------------------------------------------------------------
-- Seed. Runs as the owner: inserting into auth.users fires the signup trigger,
-- which creates the profile and derives a username, exactly as on Supabase.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'ALICE', 'alice@catchup.test', '{"full_name":"Alice Alvarez"}'::JSONB),
    (:'BOB',   'bob@catchup.test',   '{"full_name":"Bob Brennan"}'::JSONB),
    (:'CAROL', 'carol@catchup.test', '{"full_name":"Carol Chen"}'::JSONB);

\echo ''
\echo '-- 1. Signup ---------------------------------------------------'
DO $$
BEGIN
    PERFORM test.eq('three profiles created by the signup trigger',
                    (SELECT count(*) FROM public.profiles), 3);
    PERFORM test.eq('every profile has a generated username',
                    (SELECT count(*) FROM public.profiles WHERE username IS NOT NULL), 3);
    PERFORM test.ok('username derived from the email local part',
                    (SELECT username FROM public.profiles
                      WHERE email = 'alice@catchup.test') = 'alice');
END $$;

-- ----------------------------------------------------------------------------
-- 2. Baseline isolation: strangers are invisible to each other.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 2. Baseline isolation ---------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('Alice sees only her own profile',
                    (SELECT count(*) FROM public.profiles), 1);
    PERFORM test.eq('Alice cannot read Bob''s profile',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '22222222-2222-4222-8222-222222222222'), 0);
    PERFORM test.ok('Alice is not friends with Bob',
                    NOT public.are_friends('11111111-1111-4111-8111-111111111111',
                                           '22222222-2222-4222-8222-222222222222'));
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 3. Discovery: exact match only, no enumeration.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 3. Discovery ------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('exact username finds Bob',
                    (SELECT count(*) FROM public.search_users('bob')), 1);
    PERFORM test.eq('a leading @ is tolerated',
                    (SELECT count(*) FROM public.search_users('@bob')), 1);
    PERFORM test.eq('exact email finds Bob',
                    (SELECT count(*) FROM public.search_users('bob@catchup.test')), 1);

    -- The enumeration guards.
    PERFORM test.eq('a prefix of a real username finds nobody',
                    (SELECT count(*) FROM public.search_users('car')), 0);
    PERFORM test.eq('a query under the minimum length finds nobody',
                    (SELECT count(*) FROM public.search_users('bo')), 0);
    PERFORM test.eq('searching yourself finds nobody',
                    (SELECT count(*) FROM public.search_users('alice')), 0);

    PERFORM test.ok('a stranger is reported as unrelated',
                    (SELECT relationship FROM public.search_users('bob')) = 'none');
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 4. Alice sends Bob a friend request.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 4. Sending a request ----------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
SELECT public.send_friend_request(:'BOB');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'req_alice_to_bob', id::TEXT
  FROM public.friend_requests
 WHERE sender_id = :'ALICE' AND recipient_id = :'BOB' AND status = 'pending'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('Alice sees her sent request',
                    (SELECT count(*) FROM public.list_outgoing_friend_requests()), 1);
    -- An open request discloses the counterparty, or the inbox cannot render.
    PERFORM test.eq('an open request makes Bob''s profile readable',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '22222222-2222-4222-8222-222222222222'), 1);
    PERFORM test.ok('search now reports the request as outgoing',
                    (SELECT relationship FROM public.search_users('bob')) = 'outgoing_request');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    PERFORM test.eq('Bob sees the incoming request',
                    (SELECT count(*) FROM public.list_incoming_friend_requests()), 1);
    PERFORM test.ok('search reports it as incoming for Bob',
                    (SELECT relationship FROM public.search_users('alice')) = 'incoming_request');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('Carol cannot see other people''s requests',
                    (SELECT count(*) FROM public.friend_requests), 0);
    PERFORM test.eq('the request does not expose Alice''s profile to Carol',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '11111111-1111-4111-8111-111111111111'), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 5. Forgery. The load-bearing tests.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 5. Forgery attempts -----------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.denied(
        'Carol cannot send a request in Alice''s name',
        $q$INSERT INTO public.friend_requests (sender_id, recipient_id)
           VALUES ('11111111-1111-4111-8111-111111111111',
                   '22222222-2222-4222-8222-222222222222')$q$);

    PERFORM test.denied(
        'Carol cannot insert herself into a friendship',
        $q$INSERT INTO public.friendships (user_a_id, user_b_id)
           VALUES ('11111111-1111-4111-8111-111111111111',
                   '33333333-3333-4333-8333-333333333333')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    -- friendships has no INSERT policy at all. Even the person who sent the
    -- request cannot conjure the edge without the recipient accepting.
    PERFORM test.denied(
        'not even a participant can create a friendship directly',
        $q$INSERT INTO public.friendships (user_a_id, user_b_id)
           VALUES ('11111111-1111-4111-8111-111111111111',
                   '22222222-2222-4222-8222-222222222222')$q$);

    PERFORM test.denied(
        'a user cannot befriend themselves',
        $q$SELECT public.send_friend_request(
               '11111111-1111-4111-8111-111111111111')$q$);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 6. Only the recipient may accept.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 6. Accepting ------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.denied(
        'an uninvolved user cannot accept someone else''s request',
        $q$SELECT public.accept_friend_request(test.fixture('req_alice_to_bob'))$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.denied(
        'the sender cannot accept their own request',
        $q$SELECT public.accept_friend_request(test.fixture('req_alice_to_bob'))$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
SELECT public.accept_friend_request(test.fixture('req_alice_to_bob'));
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('exactly one friendship row exists',
                    (SELECT count(*) FROM public.friendships), 1);
    PERFORM test.ok('stored in canonical order',
                    (SELECT user_a_id < user_b_id FROM public.friendships));
    PERFORM test.ok('the request is marked accepted',
                    (SELECT status FROM public.friend_requests
                      WHERE id = test.fixture('req_alice_to_bob')) = 'accepted');
END $$;

-- ----------------------------------------------------------------------------
-- 7. Friendship reads.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 7. Friendship visibility ------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('Alice has one friend', (SELECT count(*) FROM public.list_friends()), 1);
    PERFORM test.ok('and it is Bob',
                    (SELECT username FROM public.list_friends()) = 'bob');
    PERFORM test.eq('Alice can now read Bob''s profile',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '22222222-2222-4222-8222-222222222222'), 1);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('Carol has no friends', (SELECT count(*) FROM public.list_friends()), 0);
    PERFORM test.eq('Carol cannot see other people''s friendships',
                    (SELECT count(*) FROM public.friendships), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 8. THE CORE PROMISE: friendship grants no access to viewing history.
--
--    "Being friends must never imply access to viewing history."
--    -- docs/PRODUCT_VISION.md
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 8. Friendship grants no viewing history ---------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
INSERT INTO public.watch_progress (user_id, media_id, media_type, progress)
VALUES (:'ALICE', 1396, 'tv', 42);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    PERFORM test.eq('a friend sees nothing in an unfiltered progress query',
                    (SELECT count(*) FROM public.watch_progress), 0);
    PERFORM test.eq('a friend cannot target their friend''s rows directly',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    -- The Continue Watching regression guard: the owner's own unfiltered read
    -- must return exactly her own rows, so that when progress sharing adds a
    -- friend-read policy the count here cannot silently grow.
    PERFORM test.eq('Alice still sees her own progress',
                    (SELECT count(*) FROM public.watch_progress), 1);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 9. Reciprocal requests resolve to a friendship.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 9. Reciprocal requests --------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
SELECT public.send_friend_request(:'ALICE');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
SELECT public.send_friend_request(:'CAROL');
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('mutual requests become a friendship',
                    public.are_friends('11111111-1111-4111-8111-111111111111',
                                       '33333333-3333-4333-8333-333333333333'));
    PERFORM test.eq('no request is left dangling',
                    (SELECT count(*) FROM public.friend_requests WHERE status = 'pending'), 0);
    PERFORM test.eq('and no duplicate friendship was created',
                    (SELECT count(*) FROM public.friendships), 2);
END $$;

-- ----------------------------------------------------------------------------
-- 10. Declining is silent.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 10. Declining -----------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
SELECT public.send_friend_request(:'BOB');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'req_carol_to_bob', id::TEXT
  FROM public.friend_requests
 WHERE sender_id = :'CAROL' AND recipient_id = :'BOB' AND status = 'pending'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
SELECT public.decline_friend_request(test.fixture('req_carol_to_bob'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('a declined request disappears from the sender''s view',
                    (SELECT count(*) FROM public.list_outgoing_friend_requests()), 0);
    PERFORM test.ok('and no friendship was created',
                    NOT public.are_friends('33333333-3333-4333-8333-333333333333',
                                           '22222222-2222-4222-8222-222222222222'));
    PERFORM test.eq('Bob''s profile is hidden from Carol again',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '22222222-2222-4222-8222-222222222222'), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 11. Usernames.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 11. Usernames -----------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.denied('a taken username is refused',
                        $q$SELECT public.set_username('bob')$q$);
    PERFORM test.denied('too short is refused',
                        $q$SELECT public.set_username('ab')$q$);
    PERFORM test.denied('illegal characters are refused',
                        $q$SELECT public.set_username('Alice!')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
SELECT public.set_username('alice_a');
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('a valid username is accepted',
                    (SELECT username FROM public.profiles
                      WHERE id = '11111111-1111-4111-8111-111111111111') = 'alice_a');
END $$;

-- ----------------------------------------------------------------------------
-- 12. Unfriending revokes visibility.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 12. Unfriending ---------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
SELECT public.unfriend(:'BOB');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.ok('Alice and Bob are no longer friends',
                    NOT public.are_friends('11111111-1111-4111-8111-111111111111',
                                           '22222222-2222-4222-8222-222222222222'));
    PERFORM test.eq('Bob''s profile is hidden from Alice again',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '22222222-2222-4222-8222-222222222222'), 0);
    PERFORM test.eq('Alice''s remaining friend is Carol',
                    (SELECT count(*) FROM public.list_friends()), 1);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    -- Either party may end a friendship, and it ends for both at once.
    PERFORM test.eq('the removal is symmetric',
                    (SELECT count(*) FROM public.list_friends()), 0);
    PERFORM test.eq('Alice''s progress remains unreachable',
                    (SELECT count(*) FROM public.watch_progress), 0);
END $$;
ROLLBACK;

\echo ''
\echo '=============================================================='
\echo ' All social RLS assertions passed.'
\echo '=============================================================='
\echo ''
