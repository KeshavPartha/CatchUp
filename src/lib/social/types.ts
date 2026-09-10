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
