// Watch Together: synchronised viewing between friends.
//
// These functions manage DURABLE party state -- who is in it, what episode, and
// the last agreed playback transition. They are called on transitions, never on
// a timer. Moment-to-moment sync rides a Realtime broadcast channel in
// use-watch-party.ts, which never touches the database.
//
// docs/WATCH_TOGETHER_SPEC.md makes the HOST the authority for play/pause and
// seeking, so every playback function here is host-only at the database level.

import { toSocialError } from './errors';
import type {
  PartyInviteTarget,
  PartyMember,
  SocialClient,
  WatchPartyState,
  WatchPartySummary,
} from './types';

/**
 * The position playback should be at right now, in seconds.
 *
 * A party stores the last agreed position plus when it was agreed, so live
 * position is derived rather than streamed. Defined once and used by both the
 * hook and the player adapter -- two implementations of this would be two
 * things to keep in step, and any disagreement would look like drift.
 */
export function livePositionOf(state: WatchPartyState): number {
  if (!state.isPlaying) return state.positionSeconds;

  const elapsed = (Date.now() - new Date(state.updatedAt).getTime()) / 1000;
  // Negative elapsed means our clock is behind the server's; clamp rather than
  // rewind the video under the viewer.
  return state.positionSeconds + Math.max(0, elapsed);
}

/** Starts a party for one episode and joins the host to it. */
export async function createWatchParty(
  supabase: SocialClient,
  showId: string,
  episodeId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_watch_party', {
    p_show_id: showId,
    p_episode_id: episodeId,
  });
  if (error) throw toSocialError(error, 'Could not start a Watch Together session.');
  return data;
}

/**
 * Invites a friend. Host only, friends only -- both enforced by the policy on
 * watch_party_members, using the same are_friends() as every other social rule.
 */
export async function inviteToWatchParty(
  supabase: SocialClient,
  partyId: string,
  friendId: string
): Promise<void> {
  const { error } = await supabase.rpc('invite_to_watch_party', {
    p_party_id: partyId,
    p_friend_id: friendId,
  });
  if (error) throw toSocialError(error, 'Could not send that invitation.');
}

export async function leaveWatchParty(supabase: SocialClient, partyId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_watch_party', { p_party_id: partyId });
  if (error) throw toSocialError(error, 'Could not leave that session.');
}

/** Host only. Ending stops playback for everyone. */
export async function endWatchParty(supabase: SocialClient, partyId: string): Promise<void> {
  const { error } = await supabase.rpc('end_watch_party', { p_party_id: partyId });
  if (error) throw toSocialError(error, 'Could not end that session.');
}

/**
 * Commits a playback transition and returns the new revision.
 *
 * Host only. Call on transitions (play, pause, seek) -- never on a timer.
 * The revision lets clients discard events that arrive out of order.
 */
export async function updatePartyPlayback(
  supabase: SocialClient,
  partyId: string,
  positionSeconds: number,
  isPlaying: boolean,
  eventType: 'play' | 'pause' | 'seek'
): Promise<number> {
  const { data, error } = await supabase.rpc('update_party_playback', {
    p_party_id: partyId,
    p_position_seconds: Math.max(0, Math.round(positionSeconds)),
    p_is_playing: isPlaying,
    p_event_type: eventType,
  });
  if (error) throw toSocialError(error, 'Could not sync playback.');
  return data;
}

/** Active parties the user hosts or belongs to. */
export async function listMyWatchParties(supabase: SocialClient): Promise<WatchPartySummary[]> {
  const { data, error } = await supabase.rpc('list_my_watch_parties');
  if (error) throw toSocialError(error, 'Could not load your Watch Together sessions.');

  return (data ?? []).map((row) => ({
    partyId: row.party_id,
    showId: row.show_id,
    episodeId: row.episode_id,
    isHost: row.is_host,
    memberCount: Number(row.member_count),
    createdAt: row.created_at,
    host: {
      userId: row.host_user_id,
      username: row.host_username,
      fullName: row.host_full_name,
      avatarUrl: row.host_avatar_url,
    },
  }));
}

export async function listPartyMembers(
  supabase: SocialClient,
  partyId: string
): Promise<PartyMember[]> {
  const { data, error } = await supabase.rpc('list_party_members', { p_party_id: partyId });
  if (error) throw toSocialError(error, 'Could not load who is in this session.');

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isHost: row.is_host,
    joinedAt: row.joined_at,
  }));
}

/** Friends who can be invited, flagged with whether they already have been. */
export async function listPartyInviteTargets(
  supabase: SocialClient,
  partyId: string
): Promise<PartyInviteTarget[]> {
  const { data, error } = await supabase.rpc('list_party_invite_targets', { p_party_id: partyId });
  if (error) throw toSocialError(error, 'Could not load your friends.');

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isInvited: row.is_invited,
  }));
}
