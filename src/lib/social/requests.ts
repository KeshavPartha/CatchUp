// Friend request lifecycle: send, accept, decline, cancel.
//
// Both list functions return *pending* requests only. That is a deliberate
// product decision, not an oversight: a declined request is never reported back
// to the sender, so declining stays quiet rather than being surfaced as a
// refusal. The row is retained in the database as history, and because the
// uniqueness constraint only covers pending rows, a request can be sent again
// later.

import { toSocialError } from './errors';
import type { FriendRequest, SocialClient } from './types';

interface RequestRow {
  request_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

function toFriendRequest(row: RequestRow): FriendRequest {
  return {
    requestId: row.request_id,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

/** Pending requests waiting on the current user's response. */
export async function listIncomingRequests(supabase: SocialClient): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_incoming_friend_requests');

  if (error) {
    throw toSocialError(error, 'Could not load your friend requests.');
  }

  return (data ?? []).map(toFriendRequest);
}

/** Pending requests the current user has sent and that are still unanswered. */
export async function listOutgoingRequests(supabase: SocialClient): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_outgoing_friend_requests');

  if (error) {
    throw toSocialError(error, 'Could not load your sent requests.');
  }

  return (data ?? []).map(toFriendRequest);
}

/**
 * Sends a friend request, returning the request id.
 *
 * Idempotent: sending twice returns the existing pending request rather than
 * failing. If the recipient has already sent *us* a request, this accepts it
 * instead of leaving two symmetric requests unanswered -- both people have now
 * expressed the same intent, so asking either of them to confirm again is
 * friction with no privacy benefit.
 */
export async function sendFriendRequest(
  supabase: SocialClient,
  recipientId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_recipient_id: recipientId,
  });

  if (error) {
    throw toSocialError(error, 'Could not send that friend request.');
  }

  return data;
}

/**
 * Accepts a request. Creates the friendship.
 *
 * This is the only path in the entire application that results in a row in
 * `friendships` -- the table has no INSERT policy, so no client can create an
 * edge directly. Consent is structurally required rather than merely checked.
 */
export async function acceptFriendRequest(
  supabase: SocialClient,
  requestId: string
): Promise<void> {
  const { error } = await supabase.rpc('accept_friend_request', { p_request_id: requestId });

  if (error) {
    throw toSocialError(error, 'Could not accept that friend request.');
  }
}

/** Declines a request addressed to the current user. The sender is not told. */
export async function declineFriendRequest(
  supabase: SocialClient,
  requestId: string
): Promise<void> {
  const { error } = await supabase.rpc('decline_friend_request', { p_request_id: requestId });

  if (error) {
    throw toSocialError(error, 'Could not decline that friend request.');
  }
}

/** Withdraws a request the current user sent. */
export async function cancelFriendRequest(
  supabase: SocialClient,
  requestId: string
): Promise<void> {
  const { error } = await supabase.rpc('cancel_friend_request', { p_request_id: requestId });

  if (error) {
    throw toSocialError(error, 'Could not cancel that friend request.');
  }
}
