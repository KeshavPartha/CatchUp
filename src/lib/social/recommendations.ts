// Friend-to-friend recommendations.
//
// A recommendation is a deliberate, addressed act -- never derived from what
// someone watched, liked or listed. It carries a title and an optional note,
// and conveys no progress and no implication that the sender has watched it.

import { toSocialError } from './errors';
import type {
  MediaType,
  Recommendation,
  RecommendationStatus,
  RecommendationTarget,
  SocialClient,
} from './types';

/** Mirrored by a CHECK constraint in the social layer migration. */
export const MAX_NOTE_LENGTH = 280;

const STATUSES: readonly RecommendationStatus[] = ['unread', 'read', 'dismissed'];

function toStatus(value: string): RecommendationStatus {
  return STATUSES.includes(value as RecommendationStatus)
    ? (value as RecommendationStatus)
    : 'unread';
}

/**
 * Recommendations sent to the current user.
 *
 * Defaults to open ones. Dismissed recommendations are history, not an inbox,
 * so they are fetched only on request.
 */
export async function listIncomingRecommendations(
  supabase: SocialClient,
  includeDismissed = false
): Promise<Recommendation[]> {
  const { data, error } = await supabase.rpc('list_incoming_recommendations', {
    p_include_dismissed: includeDismissed,
  });
  if (error) throw toSocialError(error, 'Could not load your recommendations.');

  return (data ?? []).map((row) => ({
    recommendationId: row.recommendation_id,
    mediaId: row.media_id,
    mediaType: row.media_type as MediaType,
    note: row.note,
    status: toStatus(row.status),
    createdAt: row.created_at,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  }));
}

/**
 * Friends who can receive this title, each flagged with whether it has already
 * been sent. One call, so the picker renders without a query per friend.
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
  if (error) throw toSocialError(error, 'Could not load your friends.');

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    alreadySent: row.already_sent,
  }));
}

/**
 * Recommends a title to a friend.
 *
 * Idempotent: sending the same title to the same person twice returns the
 * original row. Re-sending would be a nagging vector, so the database enforces
 * one recommendation per title per pair.
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
    p_note: note && note.length > 0 ? note : undefined,
  });
  if (error) throw toSocialError(error, 'Could not send that recommendation.');
  return data;
}

/** Records the recipient's response. Only the recipient may call this. */
export async function setRecommendationStatus(
  supabase: SocialClient,
  recommendationId: string,
  status: 'read' | 'dismissed'
): Promise<void> {
  const { error } = await supabase.rpc('set_recommendation_status', {
    p_id: recommendationId,
    p_status: status,
  });
  if (error) throw toSocialError(error, 'Could not update that recommendation.');
}

/** Withdraws a recommendation the current user sent. */
export async function withdrawRecommendation(
  supabase: SocialClient,
  recommendationId: string
): Promise<void> {
  const { error } = await supabase.rpc('withdraw_recommendation', { p_id: recommendationId });
  if (error) throw toSocialError(error, 'Could not withdraw that recommendation.');
}
