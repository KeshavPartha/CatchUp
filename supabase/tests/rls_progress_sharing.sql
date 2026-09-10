-- ============================================================================
-- CatchUp — RLS privacy suite: explicit per-show progress sharing
-- ============================================================================
--
-- The most important suite in the project. It covers the one route by which a
-- user's viewing data becomes visible to another person.
--
--   Gina shares one show with one friend.
--   Hank is that friend.
--   Iris is also Gina's friend, and is never shared with.
--   Jack is a stranger.
-- ============================================================================

\set ON_ERROR_STOP on
\set GINA '77777777-7777-4777-8777-777777777777'
\set HANK '88888888-8888-4888-8888-888888888888'
\set IRIS '99999999-9999-4999-8999-999999999999'
\set JACK 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

\echo ''
\echo '=== progress sharing ==='

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (:'GINA', 'gina@catchup.test', '{"full_name":"Gina Gill"}'::JSONB),
    (:'HANK', 'hank@catchup.test', '{"full_name":"Hank Hall"}'::JSONB),
    (:'IRIS', 'iris@catchup.test', '{"full_name":"Iris Ito"}'::JSONB),
    (:'JACK', 'jack@catchup.test', '{"full_name":"Jack Judd"}'::JSONB);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'GINA', :'HANK');
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.befriend(:'GINA', :'IRIS');
COMMIT;

-- Gina is watching two shows; Hank is watching one of his own.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES
    (:'GINA', 'tv', 'orion', 'orion-s2e3', 2, 3, 600, 1800, 60),
    (:'GINA', 'tv', 'quiet', 'quiet-s1e1', 1, 1, 120, 1800, 10);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES (:'HANK', 'tv', 'mosaic', 'mosaic-s1e1', 1, 1, 300, 1800, 25);
COMMIT;

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
    PERFORM test.eq('and the friend view is empty',
                    (SELECT count(*) FROM public.list_friend_show_progress('orion')), 0);
    PERFORM test.eq('his unfiltered read returns only his own row',
                    (SELECT count(*) FROM public.watch_progress), 1);
END $$;
ROLLBACK;

\echo ''
\echo '-- 2. Who may grant a share ------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
DO $$
BEGIN
    PERFORM test.denied(
        'a share cannot be granted to a non-friend',
        $q$SELECT public.share_show_progress('orion', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$);

    PERFORM test.denied(
        'nor by direct insert',
        $q$INSERT INTO public.progress_shares (owner_id, friend_id, show_id)
           VALUES ('77777777-7777-4777-8777-777777777777',
                   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'orion')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'JACK');
DO $$
BEGIN
    -- The attack that matters: granting yourself access to someone's data.
    PERFORM test.denied(
        'a stranger cannot grant themselves access',
        $q$INSERT INTO public.progress_shares (owner_id, friend_id, show_id)
           VALUES ('77777777-7777-4777-8777-777777777777',
                   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'orion')$q$);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.denied(
        'a friend cannot share progress that is not theirs',
        $q$INSERT INTO public.progress_shares (owner_id, friend_id, show_id)
           VALUES ('77777777-7777-4777-8777-777777777777',
                   '88888888-8888-4888-8888-888888888888', 'quiet')$q$);
END $$;
ROLLBACK;

\echo ''
\echo '-- 3. Scoped sharing -------------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.share_show_progress('orion', :'HANK');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.eq('Hank can now see the shared show',
                    (SELECT count(*) FROM public.list_friend_show_progress('orion')), 1);
    -- Detail is withheld here because Hank has not started the show; the
    -- spoiler rule is covered in full in section 3b below.

    -- The heart of the feature: sharing one show shares ONLY that show.
    PERFORM test.eq('but NOT the other show Gina is watching',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'
                        AND show_id = 'quiet'), 0);
    PERFORM test.eq('and its friend view stays empty',
                    (SELECT count(*) FROM public.list_friend_show_progress('quiet')), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 3b. Spoiler safety: a viewer never sees past their own boundary --'
-- Hank has not started 'orion' at all, so Gina (S2E3) reads as ahead with no
-- specifics. This is the state most viewers are in.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.ok('a friend further ahead is flagged, not detailed',
                    (SELECT is_ahead FROM public.list_friend_show_progress('orion')));
    PERFORM test.ok('their season is withheld',
                    (SELECT season_number FROM public.list_friend_show_progress('orion')) IS NULL);
    PERFORM test.ok('and their episode is withheld',
                    (SELECT episode_number FROM public.list_friend_show_progress('orion')) IS NULL);
    PERFORM test.eq('and no partial position leaks either',
                    (SELECT progress_percent FROM public.list_friend_show_progress('orion')), 0);
END $$;
ROLLBACK;

-- Once Hank catches up past Gina, there is nothing left to protect.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES (:'HANK', 'tv', 'orion', 'orion-s4e1', 4, 1, 60, 1800, 5);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.ok('a friend who is behind is shown exactly',
                    NOT (SELECT is_ahead FROM public.list_friend_show_progress('orion')));
    PERFORM test.eq('with their real season',
                    (SELECT season_number FROM public.list_friend_show_progress('orion')), 2);
    PERFORM test.eq('and their real episode',
                    (SELECT episode_number FROM public.list_friend_show_progress('orion')), 3);
END $$;
ROLLBACK;

-- Level-pegging counts as safe: same episode, nothing revealed.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DELETE FROM public.watch_progress WHERE user_id = :'HANK' AND show_id = 'orion';
INSERT INTO public.watch_progress
    (user_id, media_type, show_id, episode_id, current_season_number,
     current_episode_number, position_seconds, duration_seconds, progress_percent)
VALUES (:'HANK', 'tv', 'orion', 'orion-s2e3', 2, 3, 30, 1800, 2);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.ok('a friend at the same episode is not treated as ahead',
                    NOT (SELECT is_ahead FROM public.list_friend_show_progress('orion')));
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'IRIS');
DO $$
BEGIN
    -- Iris is just as much Gina's friend as Hank. She was not chosen.
    PERFORM test.eq('a friend who was not chosen sees nothing',
                    (SELECT count(*) FROM public.list_friend_show_progress('orion')), 0);
    PERFORM test.eq('not even querying the table directly',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'JACK');
DO $$
BEGIN
    PERFORM test.eq('a stranger sees nothing', (SELECT count(*) FROM public.watch_progress), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 4. Continue Watching regression guard -----------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    -- With a share live, an UNFILTERED read legitimately returns Gina's row
    -- too. That is why every watch_progress query in the app filters by
    -- user_id: without it, Continue Watching would list a friend's show as
    -- the viewer's own.
    -- Hank owns two rows by now (his own show, plus the orion row he added
    -- while catching up); Gina's shared orion row is the third.
    PERFORM test.eq('an unfiltered read returns Gina''s row as well',
                    (SELECT count(*) FROM public.watch_progress), 3);
    PERFORM test.eq('while filtering by user_id returns only his own',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '88888888-8888-4888-8888-888888888888'), 2);
END $$;
ROLLBACK;

\echo ''
\echo '-- 5. A share grants read only ---------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
UPDATE public.watch_progress SET progress_percent = 99
 WHERE user_id = :'GINA' AND show_id = 'orion';
DELETE FROM public.watch_progress
 WHERE user_id = :'GINA' AND show_id = 'orion';
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('a friend cannot alter shared progress',
                    (SELECT progress_percent FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'
                        AND show_id = 'orion'), 60);
    PERFORM test.eq('nor delete it',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 2);
END $$;

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
                    (SELECT is_shared FROM public.list_share_targets('orion')
                      WHERE user_id = '88888888-8888-4888-8888-888888888888'));
    PERFORM test.ok('and Iris as not shared',
                    NOT (SELECT is_shared FROM public.list_share_targets('orion')
                          WHERE user_id = '99999999-9999-4999-8999-999999999999'));
END $$;
ROLLBACK;

\echo ''
\echo '-- 7. Revoking is immediate ------------------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.revoke_show_progress('orion', :'HANK');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'HANK');
DO $$
BEGIN
    PERFORM test.eq('access ends the moment it is revoked',
                    (SELECT count(*) FROM public.list_friend_show_progress('orion')), 0);
    PERFORM test.eq('and the rows are unreachable again',
                    (SELECT count(*) FROM public.watch_progress
                      WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0);
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
DO $$
BEGIN
    PERFORM test.eq('and the privacy centre no longer lists it',
                    (SELECT count(*) FROM public.list_my_progress_shares()), 0);
END $$;
ROLLBACK;

\echo ''
\echo '-- 8. The recipient can end a share ----------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.share_show_progress('orion', :'IRIS');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'IRIS');
DELETE FROM public.progress_shares WHERE owner_id = :'GINA' AND friend_id = :'IRIS';
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('a recipient can end a share they did not ask for',
                    (SELECT count(*) FROM public.progress_shares
                      WHERE friend_id = '99999999-9999-4999-8999-999999999999'), 0);
END $$;

\echo ''
\echo '-- 9. Unfriending revokes everything ---------------------------'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT test.act_as(:'GINA');
SELECT public.share_show_progress('orion', :'HANK');
SELECT public.share_show_progress('quiet', :'HANK');
COMMIT;

DO $$
BEGIN
    PERFORM test.eq('two shares are live before unfriending',
                    (SELECT count(*) FROM public.progress_shares
                      WHERE owner_id = '77777777-7777-4777-8777-777777777777'
                        AND friend_id = '88888888-8888-4888-8888-888888888888'
                        AND enabled), 2);
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
END $$;
ROLLBACK;

DO $$
BEGIN
    PERFORM test.eq('and the dead grants are cleaned up',
                    (SELECT count(*) FROM public.progress_shares
                      WHERE owner_id = '77777777-7777-4777-8777-777777777777'), 0);
END $$;

\echo ''
\echo '=== progress sharing suite passed ==='
