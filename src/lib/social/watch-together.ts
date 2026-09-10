// Watch Together: synchronized viewing between friends.
//
// The functions here manage DURABLE session state -- who is in a session, what
// is being watched, and the last agreed playback transition. They are called on
// transitions (play, pause, seek, join, leave), never on a timer.
//
// Moment-to-moment synchronization does not live here. It rides a Realtime
// broadcast channel in `use-watch-session.ts`, which never touches the
// database. See the header of migration 004 for the reasoning.

import { toSocialError } from './errors';
import type {
  MediaType,
  SessionParticipant,
  SocialClient,
  WatchSessionSummary,
  WatchSessionTarget,
} from './types';

/** Starts a session and joins the host to it. Returns the session id. */
export async function createWatchSession(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType
): Promise<string> {
  const { data, error } = await supabase.rpc('create_watch_session', {
    p_media_id: mediaId,
    p_media_type: mediaType,
  });

  if (error) {
    throw toSocialError(error, 'Could not start a Watch Together session.');
  }

  return data;
}

/**
 * Invites a friend. Host only, friends only -- both enforced by the policy on
 * `watch_session_participants`, using the same `are_friends()` every other
 * social rule calls.
 */
export async function inviteToWatchSession(
  supabase: SocialClient,
  sessionId: string,
  friendId: string
): Promise<void> {
  const { error } = await supabase.rpc('invite_to_watch_session', {
    p_session_id: sessionId,
    p_friend_id: friendId,
  });

  if (error) {
    throw toSocialError(error, 'Could not send that invitation.');
  }
}

/**
 * Accepts an invitation.
 *
 * Only ever updates an existing participant row, so joining requires having
 * been invited -- there is no path here that creates membership.
 */
export async function joinWatchSession(
  supabase: SocialClient,
  sessionId: string
): Promise<void> {
  const { error } = await supabase.rpc('join_watch_session', { p_session_id: sessionId });

  if (error) {
    throw toSocialError(error, 'Could not join that session.');
  }
}

export async function leaveWatchSession(
  supabase: SocialClient,
  sessionId: string
): Promise<void> {
  const { error } = await supabase.rpc('leave_watch_session', { p_session_id: sessionId });

  if (error) {
    throw toSocialError(error, 'Could not leave that session.');
  }
}

/** Host only. Ending stops playback for everyone. */
export async function endWatchSession(
  supabase: SocialClient,
  sessionId: string
): Promise<void> {
  const { error } = await supabase.rpc('end_watch_session', { p_session_id: sessionId });

  if (error) {
    throw toSocialError(error, 'Could not end that session.');
  }
}

/**
 * Commits a playback transition.
 *
 * Any joined participant may drive playback -- watching together means either
 * person can pause when someone needs a moment.
 *
 * Call this on transitions only. Continuous position is derived by clients from
 * `positionSeconds` plus elapsed time since `positionUpdatedAt`.
 */
export async function updatePlaybackState(
  supabase: SocialClient,
  sessionId: string,
  positionSeconds: number,
  isPlaying: boolean
): Promise<void> {
  const { error } = await supabase.rpc('update_playback_state', {
    p_session_id: sessionId,
    p_position_seconds: Math.max(0, Math.round(positionSeconds)),
    p_is_playing: isPlaying,
  });

  if (error) {
    throw toSocialError(error, 'Could not sync playback.');
  }
}

/** Refreshes the caller's presence timestamp. Cheap; safe to call on a timer. */
export async function heartbeatWatchSession(
  supabase: SocialClient,
  sessionId: string
): Promise<void> {
  // Presence is best-effort: a failed heartbeat should never surface an error
  // to someone who is happily watching.
  await supabase.rpc('heartbeat_watch_session', { p_session_id: sessionId });
}

/** Active sessions the user hosts, has joined, or has been invited to. */
export async function listMyWatchSessions(
  supabase: SocialClient
): Promise<WatchSessionSummary[]> {
  const { data, error } = await supabase.rpc('list_my_watch_sessions');

  if (error) {
    throw toSocialError(error, 'Could not load your Watch Together sessions.');
  }

  return (data ?? []).map((row) => ({
    sessionId: row.session_id,
    mediaId: row.media_id,
    mediaType: row.media_type,
    isHost: row.is_host,
    hasJoined: row.has_joined,
    participantCount: Number(row.participant_count),
    createdAt: row.created_at,
    host: {
      userId: row.host_user_id,
      username: row.host_username,
      fullName: row.host_full_name,
      avatarUrl: row.host_avatar_url,
    },
  }));
}

export async function listSessionParticipants(
  supabase: SocialClient,
  sessionId: string
): Promise<SessionParticipant[]> {
  const { data, error } = await supabase.rpc('list_session_participants', {
    p_session_id: sessionId,
  });

  if (error) {
    throw toSocialError(error, 'Could not load who is in this session.');
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isHost: row.is_host,
    hasJoined: row.has_joined,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
  }));
}

/** Friends who can be invited, flagged with whether they already have been. */
export async function listWatchSessionTargets(
  supabase: SocialClient,
  sessionId: string
): Promise<WatchSessionTarget[]> {
  const { data, error } = await supabase.rpc('list_watch_session_targets', {
    p_session_id: sessionId,
  });

  if (error) {
    throw toSocialError(error, 'Could not load your friends.');
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isInvited: row.is_invited,
  }));
}
