// Explicit, per-show progress sharing.
//
// This is the only route by which one user's viewing data reaches another, and
// the database requires four independent conditions before a single row is
// returned: an enabled grant, naming that exact show, on show progress rather
// than a movie, between people who are friends *right now*.
//
// Nothing here is the security boundary -- the policies in the social layer
// migration are. These functions would return empty results if called by
// someone without access, because RLS applies inside them.

import { toSocialError } from './errors';
import type { FriendShowProgress, ProgressShare, ShareTarget, SocialClient } from './types';

/**
 * Friends this show can be shared with, each flagged with the current state.
 * One call, so the control renders without a query per friend.
 */
export async function listShareTargets(
  supabase: SocialClient,
  showId: string
): Promise<ShareTarget[]> {
  const { data, error } = await supabase.rpc('list_share_targets', { p_show_id: showId });
  if (error) throw toSocialError(error, 'Could not load your sharing settings.');

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isShared: row.is_shared,
  }));
}

/** Starts sharing this show's progress with one friend. Idempotent. */
export async function shareShowProgress(
  supabase: SocialClient,
  showId: string,
  friendId: string
): Promise<void> {
  const { error } = await supabase.rpc('share_show_progress', {
    p_show_id: showId,
    p_friend_id: friendId,
  });
  if (error) throw toSocialError(error, 'Could not start sharing this show.');
}

/**
 * Stops sharing this show with one friend.
 *
 * Succeeds even when nothing was shared: the caller's intent is already
 * satisfied, and reporting a failure would be misleading.
 */
export async function revokeShowProgress(
  supabase: SocialClient,
  showId: string,
  friendId: string
): Promise<void> {
  const { error } = await supabase.rpc('revoke_show_progress', {
    p_show_id: showId,
    p_friend_id: friendId,
  });
  if (error) throw toSocialError(error, 'Could not stop sharing this show.');
}

/** Stops sharing this show with everyone, in a single act. */
export async function revokeAllShowProgress(
  supabase: SocialClient,
  showId: string
): Promise<void> {
  const { error } = await supabase.rpc('revoke_all_show_progress', { p_show_id: showId });
  if (error) throw toSocialError(error, 'Could not stop sharing this show.');
}

/**
 * Everything the current user is currently sharing, and with whom.
 *
 * Powers the privacy centre: one screen that answers "who can see what I
 * watch" completely. Because unfriending deletes the underlying grants, this
 * can never list a share that no longer conveys anything.
 */
export async function listMyProgressShares(supabase: SocialClient): Promise<ProgressShare[]> {
  const { data, error } = await supabase.rpc('list_my_progress_shares');
  if (error) throw toSocialError(error, 'Could not load what you are sharing.');

  return (data ?? []).map((row) => ({
    showId: row.show_id,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  }));
}

/**
 * Friends who have shared this show, and how far through it they are.
 *
 * Spoiler-safe by construction: the database withholds season and episode for
 * anyone ahead of the viewer, so this can only ever return a position the
 * viewer has already passed. See `isAhead`.
 */
export async function listFriendShowProgress(
  supabase: SocialClient,
  showId: string
): Promise<FriendShowProgress[]> {
  const { data, error } = await supabase.rpc('list_friend_show_progress', { p_show_id: showId });
  if (error) throw toSocialError(error, "Could not load your friends' progress.");

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    progressPercent: row.progress_percent,
    lastWatchedAt: row.last_watched_at,
    isAhead: row.is_ahead,
  }));
}
