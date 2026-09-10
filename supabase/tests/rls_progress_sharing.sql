-- ============================================================================
-- CatchUp — RLS privacy suite: explicit per-title progress sharing
-- ============================================================================
--
-- The most important suite in the project. It tests the one route by which one
-- user's viewing data becomes visible to another, and it exists to prove the
-- vision's central promise holds in the database and not merely in the UI.
--
--   Gina  shares her progress on one title, with one friend.
--   Hank  is that friend.
--   Iris  is also Gina's friend, but is never shared with.
--   Jack  is a stranger.
-- ============================================================================

\set ON_ERROR_STOP on
\set GINA '77777777-7777-4777-8777-777777777777'
\set HANK '88888888-8888-4888-8888-888888888888'
\set IRIS '99999999-9999-4999-8999-999999999999'
\set JACK 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

\echo ''
\echo '=============================================================='
\echo ' CatchUp progress-sharing RLS suite'
\echo '=============================================================='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'GINA', 'gina@catchup.test', '{"full_name":"Gina Gill"}'::JSONB),
    (:'HANK', 'hank@catchup.test', '{"full_name":"Hank Hall"}'::JSONB),
    (:'IRIS', 'iris@catchup.test', '{"full_name":"Iris Ito"}'::JSONB),
    (:'JACK', 'jack@catchup.test', '{"full_name":"Jack Judd"}'::JSONB);

-- Gina befriends Hank and Iris. Jack stays a stranger throughout.
CREATE OR REPLACE FUNCTION test.befriend(p_a UUID, p_b UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_req UUID;
BEGIN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', p_a)::TEXT, TRUE);
    v_req := public.send_friend_request(p_b);
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', p_b)::TEXT, TRUE);
    PERFORM public.accept_friend_request(v_req);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'GINA', :'HANK');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'GINA', :'IRIS');
COMMIT;

-- Gina is watching two shows; Hank is watching a film of his own.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
INSERT INTO public.watch_progress (user_id, media_id, media_type, progress) VALUES
    (:'GINA', 1396, 'tv', 60),
    (:'GINA', 1399, 'tv', 10);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
INSERT INTO public.watch_progress (user_id, media_id, media_type, progress)
VALUES (:'HANK', 550, 'movie', 25);
COMMIT;

-- ----------------------------------------------------------------------------
-- 1. Before any share, friendship conveys nothing.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 1. Friendship alone conveys nothing -------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.ok('Hank and Gina really are friends',
                    public.are_friends('88888888-8888-4888-8888-888888888888',
                                       '77777777-7777-4777-8777-777777777777'));
    PERFORM test.eq('yet Hank sees none of Gina''s progress',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0);
    PERFORM test.eq('and the friend-progress view is empty',
                    (SELECT count(*) FROM public.list_friend_progress(1396, 'tv')), 0);
    PERFORM test.eq('Hank''s own unfiltered read returns only his own row',
                    (SELECT count(*) FROM public.watch_progress), 1);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 2. Only the owner shares, and only with friends.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 2. Who may grant a share ------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
DO $$
BEGIN
    PERFORM test.denied(
        'a share cannot be granted to a non-friend',
        $q$SELECT public.share_progress(1396, 'tv',
               'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$);

    PERFORM test.denied(
        'a share cannot be granted to a non-friend by direct insert',
        $q$INSERT INTO public.progress_shares (owner_id, shared_with_user_id, media_id, media_type)
           VALUES ('77777777-7777-4777-8777-777777777777',
                   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1396, 'tv')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'JACK');
DO $$
BEGIN
    -- The attack that matters: granting yourself access to someone else's data.
    PERFORM test.denied(
        'a stranger cannot grant themselves access to someone''s progress',
        $q$INSERT INTO public.progress_shares (owner_id, shared_with_user_id, media_id, media_type)
           VALUES ('77777777-7777-4777-8777-777777777777',
                   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1396, 'tv')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.denied(
        'a friend cannot share progress that is not theirs',
        $q$INSERT INTO public.progress_shares (owner_id, shared_with_user_id, media_id, media_type)
           VALUES ('77777777-7777-4777-8777-777777777777',
                   '88888888-8888-4888-8888-888888888888', 1399, 'tv')$q$);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 3. Gina shares ONE title with ONE friend.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 3. Scoped sharing -------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.share_progress(1396, 'tv', :'HANK');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.eq('Hank can now see the shared title',
                    (SELECT count(*) FROM public.list_friend_progress(1396, 'tv')), 1);
    PERFORM test.eq('with the real progress value',
                    (SELECT progress FROM public.list_friend_progress(1396, 'tv')), 60);

    -- The heart of the whole feature: sharing one title shares ONLY that title.
    PERFORM test.eq('but NOT the other show Gina is watching',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'
                        AND media_id = 1399), 0);
    PERFORM test.eq('and the other show''s friend view is empty',
                    (SELECT count(*) FROM public.list_friend_progress(1399, 'tv')), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'IRIS');
DO $$
BEGIN
    -- Iris is just as much Gina's friend as Hank is. She was not chosen.
    PERFORM test.eq('a friend who was not chosen sees nothing',
                    (SELECT count(*) FROM public.list_friend_progress(1396, 'tv')), 0);
    PERFORM test.eq('not even by querying the table directly',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'JACK');
DO $$
BEGIN
    PERFORM test.eq('a stranger sees nothing',
                    (SELECT count(*) FROM public.watch_progress), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 4. The Continue Watching regression, demonstrated.
--
--    With a share live, Hank's UNFILTERED read of watch_progress legitimately
--    returns Gina's row alongside his own -- that is what the policy is for.
--    An unfiltered query in the Continue Watching hook would therefore have
--    listed Gina's show as Hank's own. The explicit user_id filter added in
--    src/hooks/use-continue-watching.ts is what keeps them apart.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 4. Continue Watching regression guard -----------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.eq('an UNFILTERED read now returns Gina''s row too',
                    (SELECT count(*) FROM public.watch_progress), 2);
    PERFORM test.eq('which is exactly why the hook filters by user_id',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '88888888-8888-4888-8888-888888888888'), 1);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 5. A share is read-only.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 5. Shares grant read only -----------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
-- Neither statement errors; RLS simply matches no rows. What matters is that
-- Gina's data is unchanged afterwards.
UPDATE public.watch_progress SET progress = 99
 WHERE user_id = :'GINA' AND media_id = 1396;
DELETE FROM public.watch_progress
 WHERE user_id = :'GINA' AND media_id = 1396;
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('a friend cannot alter shared progress',
                    (SELECT progress FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'
                        AND media_id = 1396), 60);
    PERFORM test.eq('nor delete it',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 2);
END $$;

-- ----------------------------------------------------------------------------
-- 6. The privacy centre answers "who can see what I watch".
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 6. Privacy centre -------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
DO $$
BEGIN
    PERFORM test.eq('Gina can audit exactly one active share',
                    (SELECT count(*) FROM public.list_my_progress_shares()), 1);
    PERFORM test.ok('and see who it is with',
                    (SELECT username FROM public.list_my_progress_shares()) = 'hank');
    PERFORM test.ok('the share control marks Hank as shared',
                    (SELECT is_shared FROM public.list_share_targets(1396, 'tv')
                      WHERE user_id = '88888888-8888-4888-8888-888888888888'));
    PERFORM test.ok('and Iris as not shared',
                    NOT (SELECT is_shared FROM public.list_share_targets(1396, 'tv')
                          WHERE user_id = '99999999-9999-4999-8999-999999999999'));
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 7. Revocation is immediate.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 7. Revoking -------------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.revoke_progress_share(1396, 'tv', :'HANK');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.eq('access ends the moment it is revoked',
                    (SELECT count(*) FROM public.list_friend_progress(1396, 'tv')), 0);
    PERFORM test.eq('and the row is unreachable again',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0);
END $$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 8. The recipient can decline to keep receiving.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 8. Recipient can end a share --------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.share_progress(1396, 'tv', :'IRIS');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'IRIS');
DELETE FROM public.progress_shares
 WHERE owner_id = :'GINA' AND shared_with_user_id = :'IRIS';
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('a recipient can end a share they did not ask for',
                    (SELECT count(*) FROM public.progress_shares
                      WHERE shared_with_user_id = '99999999-9999-4999-8999-999999999999'), 0);
END $$;

-- ----------------------------------------------------------------------------
-- 9. Unfriending revokes everything.
-- ----------------------------------------------------------------------------
\echo ''
\echo '-- 9. Unfriending revokes --------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.share_progress(1396, 'tv', :'HANK');
SELECT public.share_progress(1399, 'tv', :'HANK');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('two shares are live before unfriending',
                    (SELECT count(*) FROM public.progress_shares
                      WHERE owner_id = '77777777-7777-4777-8777-777777777777'
                        AND shared_with_user_id = '88888888-8888-4888-8888-888888888888'), 2);
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
SELECT public.unfriend(:'GINA');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.eq('unfriending ends all access at once',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0);
    PERFORM test.eq('and the friend-progress view is empty',
                    (SELECT count(*) FROM public.list_friend_progress(1396, 'tv')), 0);
END $$;
ROLLBACK;

DO $$
BEGIN
    -- The read policy re-checks friendship, so access had already ended above.
    -- The grants are deleted too, so the privacy centre cannot list a share
    -- that no longer conveys anything.
    PERFORM test.eq('the dead grants are cleaned up as well',
                    (SELECT count(*) FROM public.progress_shares
                      WHERE owner_id = '77777777-7777-4777-8777-777777777777'), 0);
END $$;

\echo ''
\echo '=============================================================='
\echo ' All progress-sharing RLS assertions passed.'
\echo '=============================================================='
\echo ''
