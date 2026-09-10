// Domain types for the Social / Realtime workstream.
//
// The database speaks snake_case; the app speaks camelCase. Mapping happens
// once, at the repository boundary in this folder, so no component ever has to
// know the shape of a Postgres row.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Every repository function takes a client rather than creating one, so the
 * same functions work from client components, server components, and route
 * handlers. Watch Together will need the server-side paths.
 *
 * This is the *correct* modern generic form. The app's current auth layer
 * (`@supabase/auth-helpers-nextjs`) does not produce it -- see
 * `createSocialClient` in ./client.ts for why, and for the single place that
 * discrepancy is reconciled.
 */
export type SocialClient = SupabaseClient<Database, 'public'>;

export type FriendRequestStatus = Database['public']['Enums']['friend_request_status'];
export type RecommendationStatus = Database['public']['Enums']['recommendation_status'];

/** Matches the media_type CHECK shared by every media-referencing table. */
export type MediaType = 'movie' | 'tv';

/**
 * The viewer's relationship to another user, as reported by `search_users`.
 * Returned with the search result so the UI can render the correct action
 * without a second round trip.
 */
export type Relationship = 'none' | 'friends' | 'incoming_request' | 'outgoing_request';

/** The minimal, non-sensitive projection of another user shown across social UI. */
export interface SocialProfile {
  userId: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface Friend extends SocialProfile {
  friendsSince: string;
}

export interface FriendRequest extends SocialProfile {
  requestId: string;
  createdAt: string;
}

/**
 * A recommendation joined to its counterparty -- the sender for an incoming
 * one, the recipient for an outgoing one.
 */
export interface Recommendation extends SocialProfile {
  recommendationId: string;
  mediaId: number;
  mediaType: MediaType;
  note: string | null;
  status: RecommendationStatus;
  createdAt: string;
}

/** A friend in the "recommend this title" picker. */
export interface RecommendationTarget extends SocialProfile {
  alreadySent: boolean;
  recommendationId: string | null;
}

/** A friend in the "share this title with" control. */
export interface ShareTarget extends SocialProfile {
  isShared: boolean;
}

/** One active grant, as listed in the privacy centre. */
export interface ProgressShare extends SocialProfile {
  mediaId: number;
  mediaType: MediaType;
  createdAt: string;
}

/** A friend's progress on a title they have explicitly shared with you. */
export interface FriendProgress extends SocialProfile {
  /** Percentage, 0-100, matching the watch_progress CHECK constraint. */
  progress: number;
  lastWatched: string;
}

export type WatchSessionStatus = Database['public']['Enums']['watch_session_status'];

/** An active Watch Together session the current user is in or invited to. */
export interface WatchSessionSummary {
  sessionId: string;
  mediaId: number;
  mediaType: MediaType;
  isHost: boolean;
  /** False while an invitation is still unaccepted. */
  hasJoined: boolean;
  participantCount: number;
  createdAt: string;
  host: SocialProfile;
}

export interface SessionParticipant extends SocialProfile {
  isHost: boolean;
  hasJoined: boolean;
  joinedAt: string | null;
  lastSeenAt: string | null;
}

/** A friend in the "invite to this session" picker. */
export interface WatchSessionTarget extends SocialProfile {
  isInvited: boolean;
}

/**
 * The durable playback state of a session.
 *
 * `positionSeconds` is the last agreed position and `positionUpdatedAt` is when
 * it was agreed. A client computes the live position from the two rather than
 * needing a continuous stream of updates to stay honest -- see
 * `livePosition` in use-watch-session.ts.
 */
export interface WatchSessionState {
  sessionId: string;
  hostId: string;
  mediaId: number;
  mediaType: MediaType;
  status: WatchSessionStatus;
  isPlaying: boolean;
  positionSeconds: number;
  positionUpdatedAt: string;
}

export interface UserSearchResult extends SocialProfile {
  relationship: Relationship;
  /** The pending request between the viewer and this user, when one exists. */
  requestId: string | null;
}

const RELATIONSHIPS: readonly Relationship[] = [
  'none',
  'friends',
  'incoming_request',
  'outgoing_request',
];

/**
 * `search_users` returns `relationship` as TEXT, so narrow it at the boundary
 * rather than asserting. An unrecognized value degrades to 'none', which shows
 * an "Add friend" button -- the safe failure, since the action is still
 * authorized server-side.
 */
export function toRelationship(value: string): Relationship {
  return RELATIONSHIPS.includes(value as Relationship) ? (value as Relationship) : 'none';
}

/** How a user is addressed in the UI. Never falls through to an email address. */
export function displayName(profile: SocialProfile): string {
  const name = profile.fullName?.trim();
  if (name) return name;
  if (profile.username) return `@${profile.username}`;
  return 'CatchUp member';
}

/** The shareable handle, or null when a user has not claimed one. */
export function handle(profile: SocialProfile): string | null {
  return profile.username ? `@${profile.username}` : null;
}

/** Up to two initials for avatar fallbacks. */
export function initials(profile: SocialProfile): string {
  const source = profile.fullName?.trim() || profile.username || '?';
  const parts = source.split(/[\s_]+/).filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
