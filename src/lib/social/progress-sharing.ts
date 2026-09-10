// Explicit, per-title progress sharing.
//
// This is the only route by which one user's viewing data reaches another, and
// the database requires three independent conditions before a single row is
// returned: an explicit grant, naming that exact title, between people who are
// friends *right now*.
//
// Nothing in this file is the security boundary -- the policies in migration
// 003 are. These functions would return empty results if called by someone
// without access, because RLS applies inside them.

import { toSocialError } from './errors';
import type {
  FriendProgress,
  MediaType,
  ProgressShare,
  ShareTarget,
  SocialClient,
} from './types';

/**
 * Friends who can be shared this title with, each flagged with whether the
 * share is already active. One call, so the control renders without a query
 * per friend.
 */
export async function listShareTargets(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType
): Promise<ShareTarget[]> {
  const { data, error } = await supabase.rpc('list_share_targets', {
    p_media_id: mediaId,
    p_media_type: mediaType,
  });

  if (error) {
    throw toSocialError(error, 'Could not load your sharing settings.');
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isShared: row.is_shared,
  }));
}

/** Starts sharing progress on one title with one friend. Idempotent. */
export async function shareProgress(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType,
  friendId: string
): Promise<void> {
  const { error } = await supabase.rpc('share_progress', {
    p_media_id: mediaId,
    p_media_type: mediaType,
    p_friend_id: friendId,
  });

  if (error) {
    throw toSocialError(error, 'Could not start sharing this title.');
  }
}

/**
 * Stops sharing one title with one friend.
 *
 * Succeeds even when nothing was shared: the caller's intent is already
 * satisfied, and reporting a failure would be misleading.
 */
export async function revokeProgressShare(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType,
  friendId: string
): Promise<void> {
  const { error } = await supabase.rpc('revoke_progress_share', {
    p_media_id: mediaId,
    p_media_type: mediaType,
    p_friend_id: friendId,
  });

  if (error) {
    throw toSocialError(error, 'Could not stop sharing this title.');
  }
}

/** Stops sharing one title with everyone, in a single act. */
export async function revokeAllProgressShares(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType
): Promise<void> {
  const { error } = await supabase.rpc('revoke_all_progress_shares', {
    p_media_id: mediaId,
    p_media_type: mediaType,
  });

  if (error) {
    throw toSocialError(error, 'Could not stop sharing this title.');
  }
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

  if (error) {
    throw toSocialError(error, 'Could not load what you are sharing.');
  }

  return (data ?? []).map((row) => ({
    mediaId: row.media_id,
    mediaType: row.media_type,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  }));
}

/**
 * Friends who have shared this title with the current user, and how far along
 * they are. The payoff of the whole feature -- and the thing Watch Together
 * will use to tell you whether you are caught up enough to join.
 */
export async function listFriendProgress(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType
): Promise<FriendProgress[]> {
  const { data, error } = await supabase.rpc('list_friend_progress', {
    p_media_id: mediaId,
    p_media_type: mediaType,
  });

  if (error) {
    throw toSocialError(error, "Could not load your friends' progress.");
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    progress: row.progress,
    lastWatched: row.last_watched,
  }));
}
