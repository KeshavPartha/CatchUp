// Friend-to-friend recommendations.
//
// A recommendation is a deliberate, addressed act. It is never derived from
// what someone watched, liked, or added to a list -- CatchUp has no automatic
// social signal, by design. It carries a title and an optional note, and it
// conveys no progress and no implication that the sender has watched it.

import { toSocialError } from './errors';
import type { MediaType, Recommendation, RecommendationTarget, SocialClient } from './types';

/** The maximum note length, mirrored by a CHECK constraint in migration 002. */
export const MAX_NOTE_LENGTH = 280;

interface RecommendationRow {
  recommendation_id: string;
  media_id: number;
  media_type: 'movie' | 'tv';
  note: string | null;
  status: string;
  created_at: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

const STATUSES = ['pending', 'seen', 'dismissed', 'added'] as const;
type RecommendationStatus = (typeof STATUSES)[number];

function toStatus(value: string): RecommendationStatus {
  return (STATUSES as readonly string[]).includes(value)
    ? (value as RecommendationStatus)
    : 'pending';
}

function toRecommendation(row: RecommendationRow): Recommendation {
  return {
    recommendationId: row.recommendation_id,
    mediaId: row.media_id,
    mediaType: row.media_type,
    note: row.note,
    status: toStatus(row.status),
    createdAt: row.created_at,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  };
}

/**
 * Recommendations sent to the current user.
 *
 * Defaults to open ones (pending and seen). Dismissed and added recommendations
 * are history, not an inbox, so they are fetched only on request.
 */
export async function listIncomingRecommendations(
  supabase: SocialClient,
  includeResolved = false
): Promise<Recommendation[]> {
  const { data, error } = await supabase.rpc('list_incoming_recommendations', {
    p_include_resolved: includeResolved,
  });

  if (error) {
    throw toSocialError(error, 'Could not load your recommendations.');
  }

  return (data ?? []).map(toRecommendation);
}

/** Recommendations the current user has sent. */
export async function listOutgoingRecommendations(
  supabase: SocialClient
): Promise<Recommendation[]> {
  const { data, error } = await supabase.rpc('list_outgoing_recommendations');

  if (error) {
    throw toSocialError(error, 'Could not load what you have recommended.');
  }

  return (data ?? []).map(toRecommendation);
}

/**
 * Friends who can receive a recommendation for this title, each flagged with
 * whether it has already been sent to them.
 *
 * Returned in one call so the picker can disable the ones already sent without
 * a query per friend.
 */
export async function listRecommendationTargets(
  supabase: SocialClient,
  mediaId: number,
  mediaType: MediaType
): Promise<RecommendationTarget[]> {
  const { data, error } = await supabase.rpc('list_recommendation_targets', {
    p_media_id: mediaId,
    p_media_type: mediaType,
  });

  if (error) {
    throw toSocialError(error, 'Could not load your friends.');
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    alreadySent: row.already_sent,
    recommendationId: row.recommendation_id,
  }));
}

/**
 * Recommends a title to a friend.
 *
 * Idempotent: recommending the same title to the same person twice returns the
 * original row rather than sending again. Re-sending would be a nagging vector,
 * so the database enforces one recommendation per title per pair.
 */
export async function recommendTitle(
  supabase: SocialClient,
  params: { recipientId: string; mediaId: number; mediaType: MediaType; note?: string }
): Promise<string> {
  const note = params.note?.trim();

  const { data, error } = await supabase.rpc('recommend_title', {
    p_recipient_id: params.recipientId,
    p_media_id: params.mediaId,
    p_media_type: params.mediaType,
    p_note: note && note.length > 0 ? note : null,
  });

  if (error) {
    throw toSocialError(error, 'Could not send that recommendation.');
  }

  return data;
}

/** Records the recipient's response. Only the recipient may call this. */
export async function setRecommendationStatus(
  supabase: SocialClient,
  recommendationId: string,
  status: 'seen' | 'dismissed' | 'added'
): Promise<void> {
  const { error } = await supabase.rpc('set_recommendation_status', {
    p_id: recommendationId,
    p_status: status,
  });

  if (error) {
    throw toSocialError(error, 'Could not update that recommendation.');
  }
}

/** Withdraws a recommendation the current user sent. */
export async function withdrawRecommendation(
  supabase: SocialClient,
  recommendationId: string
): Promise<void> {
  const { error } = await supabase.rpc('withdraw_recommendation', { p_id: recommendationId });

  if (error) {
    throw toSocialError(error, 'Could not withdraw that recommendation.');
  }
}
