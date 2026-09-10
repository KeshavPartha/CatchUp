// Friendship reads and removal.
//
// Every function here goes through an RPC defined in migration 001 rather than
// querying tables directly. Two reasons:
//
//   1. The canonical (user_a_id < user_b_id) ordering stays in the database.
//      No caller has to know which column they are in.
//   2. Authorization stays reviewable in one place. These RPCs are
//      SECURITY INVOKER, so RLS still applies inside them -- they are an
//      ergonomic surface, never a way around the policies.

import { toSocialError } from './errors';
import type { Friend, SocialClient } from './types';

/**
 * The current user's friends, ordered by display name.
 *
 * Returns rows only because the profiles SELECT policy permits reading a
 * friend's profile. A user with no friends sees an empty list rather than an
 * error.
 */
export async function listFriends(supabase: SocialClient): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('list_friends');

  if (error) {
    throw toSocialError(error, 'Could not load your friends.');
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    friendsSince: row.friends_since,
  }));
}

/**
 * Ends a friendship. Either party may do this unilaterally and without notice.
 *
 * This is also the seam where progress sharing gets revoked once that lands.
 * The friend-read policy on watch_progress will re-check `are_friends()` at
 * read time, so access ends the moment this returns either way -- but the share
 * rows themselves should not outlive the friendship that justified them.
 */
export async function unfriend(supabase: SocialClient, otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('unfriend', { p_other_user_id: otherUserId });

  if (error) {
    throw toSocialError(error, 'Could not remove this friend.');
  }
}

/**
 * Whether two users are friends.
 *
 * Prefer deriving this from an already-loaded friend list in UI code; this is
 * for server-side checks where no list is in hand. It is the same function the
 * RLS policies call, so it can never disagree with them.
 */
export async function areFriends(
  supabase: SocialClient,
  userA: string,
  userB: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('are_friends', {
    p_user_a: userA,
    p_user_b: userB,
  });

  if (error) {
    throw toSocialError(error, 'Could not check this friendship.');
  }

  return data === true;
}
