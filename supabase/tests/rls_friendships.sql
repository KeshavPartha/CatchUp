-- ============================================================================
-- CatchUp — RLS privacy suite: friendships, requests, blocking, discovery
-- ============================================================================
--
--   Alice and Bob become friends.
--   Carol is a stranger, and exists to prove that having a CatchUp account
--   grants no access to anyone else's data.
--
-- The foundation models friendships as a directional row
-- (requester_id, addressee_id, status), so the guarantees under test are:
-- only the addressee can accept, a resolved relationship cannot be silently
-- reopened, and blocking is mutual and total.
-- ============================================================================

\set ON_ERROR_STOP on
\set ALICE '11111111-1111-4111-8111-111111111111'
\set BOB   '22222222-2222-4222-8222-222222222222'
\set CAROL '33333333-3333-4333-8333-333333333333'

\echo ''
\echo '=== friendships, requests, blocking, discovery ==='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'ALICE', 'alice@catchup.test', '{"full_name":"Alice Alvarez"}'::JSONB),
    (:'BOB',   'bob@catchup.test',   '{"full_name":"Bob Brennan"}'::JSONB),
    (:'CAROL', 'carol@catchup.test', '{"full_name":"Carol Chen"}'::JSONB);

\echo ''
\echo '-- 1. Signup and baseline isolation ----------------------------'
DO $$
BEGIN
    PERFORM test.eq('the signup trigger created three profiles',
                    (SELECT count(*) FROM public.profiles), 3);
    PERFORM test.ok('with a username derived from the email',
                    (SELECT username FROM public.profiles WHERE email = 'alice@catchup.test') = 'alice');
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('Alice sees only her own profile',
                    (SELECT count(*) FROM public.profiles), 1);
    PERFORM test.ok('and is friends with nobody',
                    NOT public.are_friends('11111111-1111-4111-8111-111111111111',
                                           '22222222-2222-4222-8222-222222222222'));
END $$;
ROLLBACK;

\echo ''
\echo '-- 2. Discovery is exact-match only ----------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('an exact username finds Bob',
                    (SELECT count(*) FROM public.search_users('bob')), 1);
    PERFORM test.eq('a leading @ is tolerated',
                    (SELECT count(*) FROM public.search_users('@bob')), 1);
    PERFORM test.eq('an exact email finds Bob',
                    (SELECT count(*) FROM public.search_users('bob@catchup.test')), 1);
    PERFORM test.eq('a prefix of a real username finds nobody',
                    (SELECT count(*) FROM public.search_users('car')), 0);
    PERFORM test.eq('a query below the minimum length finds nobody',
                    (SELECT count(*) FROM public.search_users('bo')), 0);
    PERFORM test.eq('searching yourself finds nobody',
                    (SELECT count(*) FROM public.search_users('alice')), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 3. Sending a request ----------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
SELECT public.send_friend_request(:'BOB');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'req_alice_bob', id::TEXT FROM public.friendships
 WHERE requester_id = :'ALICE' AND addressee_id = :'BOB'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    PERFORM test.eq('Bob sees the incoming request',
                    (SELECT count(*) FROM public.list_incoming_friend_requests()), 1);
    PERFORM test.eq('an open request discloses the sender''s profile',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '11111111-1111-4111-8111-111111111111'), 1);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('a stranger cannot see other people''s relationships',
                    (SELECT count(*) FROM public.friendships), 0);
    PERFORM test.eq('and the request exposes no profile to them',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '11111111-1111-4111-8111-111111111111'), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 4. Forgery and consent --------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.denied(
        'a request cannot be sent in someone else''s name',
        $q$INSERT INTO public.friendships (requester_id, addressee_id, status)
           VALUES ('11111111-1111-4111-8111-111111111111',
                   '22222222-2222-4222-8222-222222222222', 'pending')$q$);

    PERFORM test.denied(
        'a friendship cannot be created pre-accepted',
        $q$INSERT INTO public.friendships (requester_id, addressee_id, status)
           VALUES ('33333333-3333-4333-8333-333333333333',
                   '11111111-1111-4111-8111-111111111111', 'accepted')$q$);

    PERFORM test.denied(
        'an uninvolved user cannot accept someone else''s request',
        $q$SELECT public.accept_friend_request(test.fixture('req_alice_bob'))$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    -- The load-bearing consent rule: the requester can never accept their own
    -- request, even by writing the row directly.
    PERFORM test.denied(
        'the requester cannot accept their own request',
        $q$SELECT public.accept_friend_request(test.fixture('req_alice_bob'))$q$);

    PERFORM test.denied(
        'not even by updating the status directly',
        $q$UPDATE public.friendships SET status = 'accepted'
            WHERE id = test.fixture('req_alice_bob')$q$);

    PERFORM test.denied(
        'a user cannot befriend themselves',
        $q$SELECT public.send_friend_request('11111111-1111-4111-8111-111111111111')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '-- 5. Accepting ------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
SELECT public.accept_friend_request(test.fixture('req_alice_bob'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
DO $$
BEGIN
    PERFORM test.eq('Alice has one friend', (SELECT count(*) FROM public.list_friends()), 1);
    PERFORM test.ok('and it is Bob', (SELECT username FROM public.list_friends()) = 'bob');
    PERFORM test.eq('whose profile is now readable',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '22222222-2222-4222-8222-222222222222'), 1);
    PERFORM test.ok('friendship reads the same from either side',
                    public.are_friends('22222222-2222-4222-8222-222222222222',
                                       '11111111-1111-4111-8111-111111111111'));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('a stranger has no friends',
                    (SELECT count(*) FROM public.list_friends()), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 6. THE CORE PROMISE: friendship grants no viewing history ---'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES (:'ALICE', 'tv', 'show-1', 'show-1-s2e3', 2, 3, 600, 1800, 33);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    -- "Being friends must never imply access to viewing history."
    PERFORM test.eq('a friend sees nothing in an unfiltered progress query',
                    (SELECT count(*) FROM public.watch_progress), 0);
    PERFORM test.eq('nor by targeting their friend''s rows directly',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 7. Declining is silent, and cannot be undone by a peer ------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
SELECT public.send_friend_request(:'BOB');
COMMIT;

INSERT INTO test.fixtures (key, value)
SELECT 'req_carol_bob', id::TEXT FROM public.friendships
 WHERE requester_id = :'CAROL' AND addressee_id = :'BOB'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
SELECT public.decline_friend_request(test.fixture('req_carol_bob'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('a declined request disappears from the sender''s view',
                    (SELECT count(*) FROM public.list_outgoing_friend_requests()), 0);
    PERFORM test.ok('and no friendship exists',
                    NOT public.are_friends('33333333-3333-4333-8333-333333333333',
                                           '22222222-2222-4222-8222-222222222222'));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    -- The guarantee that matters: the person who declined cannot resurrect the
    -- row and fabricate a request the other person never made.
    PERFORM test.denied(
        'the addressee cannot reopen a declined request',
        $q$UPDATE public.friendships SET status = 'pending'
            WHERE id = test.fixture('req_carol_bob')$q$);
END $$;
ROLLBACK;

-- Sending again is a deliberate act and is allowed.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
SELECT public.send_friend_request(:'BOB');
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('but the sender may send a fresh request',
                    (SELECT status FROM public.friendships
                      WHERE id = test.fixture('req_carol_bob')) = 'pending');
END $$;

\echo ''
\echo '-- 8. Blocking is mutual and total -----------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
SELECT public.block_user(:'CAROL');
COMMIT;

DO $$
BEGIN
    PERFORM test.ok('blocking records a block',
                    public.is_blocked_between('22222222-2222-4222-8222-222222222222',
                                              '33333333-3333-4333-8333-333333333333'));
    PERFORM test.eq('and clears the pending request',
                    (SELECT count(*) FROM public.friendships
                      WHERE status = 'pending'
                        AND requester_id = '33333333-3333-4333-8333-333333333333'), 0);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'CAROL');
DO $$
BEGIN
    PERFORM test.eq('a blocked user cannot find the blocker',
                    (SELECT count(*) FROM public.search_users('bob')), 0);
    PERFORM test.denied(
        'and cannot send them a request',
        $q$SELECT public.send_friend_request('22222222-2222-4222-8222-222222222222')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    PERFORM test.eq('the blocker can audit who they have blocked',
                    (SELECT count(*) FROM public.list_blocked_users()), 1);
END $$;
ROLLBACK;

\echo ''
\echo '-- 9. Unfriending ----------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'ALICE');
SELECT public.unfriend(:'BOB');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'BOB');
DO $$
BEGIN
    PERFORM test.eq('the removal is symmetric',
                    (SELECT count(*) FROM public.list_friends()), 0);
    PERFORM test.eq('and the profile is hidden again',
                    (SELECT count(*) FROM public.profiles
                      WHERE id = '11111111-1111-4111-8111-111111111111'), 0);
    PERFORM test.eq('and progress stays unreachable',
                    (SELECT count(*) FROM public.watch_progress), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 10. Usernames -----------------------------------------------'
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

\echo ''
\echo '=== friendships suite passed ==='
