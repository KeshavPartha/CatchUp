// Domain types for the Social / Realtime workstream.
//
// The database speaks snake_case; the app speaks camelCase. Mapping happens
// once, at the repository boundary in this folder, so no component needs to
// know the shape of a Postgres row.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Repository functions take a client rather than creating one, so the same
 * functions work from client components, server components and route handlers.
 */
export type SocialClient = SupabaseClient<Database>;

export type MediaType = 'movie' | 'tv';

/** The viewer's relationship to another user, as reported by `search_users`. */
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

export interface UserSearchResult extends SocialProfile {
  relationship: Relationship;
  /** The pending request between the viewer and this user, when one exists. */
  requestId: string | null;
}

export type RecommendationStatus = 'unread' | 'read' | 'dismissed';

/** A recommendation joined to its counterparty. */
export interface Recommendation extends SocialProfile {
  recommendationId: string;
  mediaId: number;
  mediaType: MediaType;
  note: string | null;
  status: RecommendationStatus;
  createdAt: string;
}

export interface RecommendationTarget extends SocialProfile {
  alreadySent: boolean;
}

/** A friend in the "share this show with" control. */
export interface ShareTarget extends SocialProfile {
  isShared: boolean;
}

/** One active grant, as listed in the privacy centre. */
export interface ProgressShare extends SocialProfile {
  showId: string;
  createdAt: string;
}

/**
 * A friend's furthest point in a show they have explicitly shared.
 *
 * Season and episode are the real boundary the product cares about; the
 * percentage is only progress through the current episode.
 */
export interface FriendShowProgress extends SocialProfile {
  seasonNumber: number | null;
  episodeNumber: number | null;
  progressPercent: number;
  lastWatchedAt: string;
}

export interface WatchPartySummary {
  partyId: string;
  showId: string;
  episodeId: string;
  isHost: boolean;
  memberCount: number;
  createdAt: string;
  host: SocialProfile;
}

export interface PartyMember extends SocialProfile {
  isHost: boolean;
  joinedAt: string;
}

export interface PartyInviteTarget extends SocialProfile {
  isInvited: boolean;
}

/**
 * Durable playback state of a party.
 *
 * `positionSeconds` is the last agreed position and `updatedAt` when it was
 * agreed, so live position is derived rather than streamed. `revision` is the
 * monotonic sequence docs/WATCH_TOGETHER_SPEC.md requires for discarding stale
 * events.
 */
export interface WatchPartyState {
  partyId: string;
  hostId: string;
  showId: string;
  episodeId: string;
  status: 'active' | 'ended';
  isPlaying: boolean;
  positionSeconds: number;
  revision: number;
  updatedAt: string;
}

const RELATIONSHIPS: readonly Relationship[] = [
  'none',
  'friends',
  'incoming_request',
  'outgoing_request',
];

/** Narrows the TEXT `relationship` column. Unknown values degrade to 'none'. */
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
