// Friendships, requests and blocking.
//
// The foundation models all three as one directional table
// (requester_id, addressee_id, status), so they live in one module here too.
//
// Every function goes through an RPC rather than querying the table directly:
// authorisation stays reviewable in one place, and the RPCs are SECURITY
// INVOKER, so RLS still applies inside them.

import { toSocialError } from './errors';
import type { Friend, FriendRequest, SocialClient, SocialProfile } from './types';

interface RequestRow {
  request_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

function toRequest(row: RequestRow): FriendRequest {
  return {
    requestId: row.request_id,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export async function listFriends(supabase: SocialClient): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('list_friends');
  if (error) throw toSocialError(error, 'Could not load your friends.');

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    friendsSince: row.friends_since,
  }));
}

/** Pending requests waiting on the current user's response. */
export async function listIncomingRequests(supabase: SocialClient): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_incoming_friend_requests');
  if (error) throw toSocialError(error, 'Could not load your friend requests.');
  return (data ?? []).map(toRequest);
}

/**
 * Pending requests the current user has sent and that are still unanswered.
 *
 * Pending only, deliberately: a declined request is never reported back to the
 * sender, so declining stays quiet rather than surfacing as a refusal.
 */
export async function listOutgoingRequests(supabase: SocialClient): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_outgoing_friend_requests');
  if (error) throw toSocialError(error, 'Could not load your sent requests.');
  return (data ?? []).map(toRequest);
}

/**
 * Sends a friend request, returning its id.
 *
 * Idempotent. If the recipient has already asked us, this accepts instead --
 * both people have expressed the same intent, so asking either to confirm
 * again is friction with no privacy benefit.
 */
export async function sendFriendRequest(
  supabase: SocialClient,
  addresseeId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_addressee_id: addresseeId,
  });
  if (error) throw toSocialError(error, 'Could not send that friend request.');
  return data;
}

/**
 * Accepts a request.
 *
 * Only the addressee can do this. A transition trigger enforces it in the
 * database, so the requester cannot accept their own request even by writing
 * the row directly -- consent is structural, not merely checked.
 */
export async function acceptFriendRequest(supabase: SocialClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_friend_request', { p_request_id: id });
  if (error) throw toSocialError(error, 'Could not accept that friend request.');
}

/** Declines a request. The sender is not told. */
export async function declineFriendRequest(supabase: SocialClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('decline_friend_request', { p_request_id: id });
  if (error) throw toSocialError(error, 'Could not decline that friend request.');
}

/** Withdraws a request the current user sent. */
export async function cancelFriendRequest(supabase: SocialClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_friend_request', { p_request_id: id });
  if (error) throw toSocialError(error, 'Could not cancel that friend request.');
}

/**
 * Ends a friendship. Either party may do this unilaterally and without notice.
 *
 * Everything the friendship authorised goes with it: progress shares are
 * deleted, unread recommendations withdrawn, and un-accepted watch-party
 * invitations removed.
 */
export async function unfriend(supabase: SocialClient, otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('unfriend', { p_other_user_id: otherUserId });
  if (error) throw toSocialError(error, 'Could not remove this friend.');
}

/**
 * Blocks a user. Mutual and total: neither can find, request, recommend to, or
 * share with the other, in either direction.
 */
export async function blockUser(supabase: SocialClient, otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_other_user_id: otherUserId });
  if (error) throw toSocialError(error, 'Could not block this user.');
}

export async function unblockUser(supabase: SocialClient, otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_other_user_id: otherUserId });
  if (error) throw toSocialError(error, 'Could not unblock this user.');
}

export async function listBlockedUsers(supabase: SocialClient): Promise<SocialProfile[]> {
  const { data, error } = await supabase.rpc('list_blocked_users');
  if (error) throw toSocialError(error, 'Could not load your blocked list.');

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  }));
}

/** Whether two users are friends. The same function every RLS policy calls. */
export async function areFriends(
  supabase: SocialClient,
  userA: string,
  userB: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('are_friends', { p_user_a: userA, p_user_b: userB });
  if (error) throw toSocialError(error, 'Could not check this friendship.');
  return data === true;
}
