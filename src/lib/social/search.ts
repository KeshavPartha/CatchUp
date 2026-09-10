// Friend discovery.
//
// Privacy note, because this is the one place a stranger's profile is exposed:
//
// `search_users` matches EXACTLY -- no prefix, no fuzzy, no LIKE. A searcher
// must already know the handle or the email address, so this cannot be used to
// enumerate the user base or harvest the directory. The projection is fixed and
// minimal (id, username, full name, avatar) and never includes email, so
// searching by an address confirms nothing the searcher did not already supply.
//
// The minimum query length is enforced in the database as well; it is repeated
// here only to avoid a pointless round trip while typing.

import { toSocialError } from './errors';
import { toRelationship, type SocialClient, type UserSearchResult } from './types';

export const MIN_SEARCH_LENGTH = 3;

/** Strips a leading "@" so a pasted handle just works. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/^@+/, '');
}

/**
 * Finds a user by exact username or exact email address.
 *
 * Returns an empty list -- never an error -- when the query is too short or
 * matches nobody, so the UI can treat "no match" and "not searched yet" the
 * same way. Each result carries the viewer's current relationship to that user
 * so the correct action can be rendered without a second query that would
 * itself leak state.
 */
export async function searchUsers(
  supabase: SocialClient,
  query: string
): Promise<UserSearchResult[]> {
  const normalized = normalizeSearchQuery(query);

  if (normalized.length < MIN_SEARCH_LENGTH) {
    return [];
  }

  const { data, error } = await supabase.rpc('search_users', { p_query: normalized });

  if (error) {
    throw toSocialError(error, 'Could not run that search.');
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    relationship: toRelationship(row.relationship),
    requestId: row.request_id,
  }));
}

/** Claims or changes the current user's handle. */
export async function setUsername(supabase: SocialClient, username: string): Promise<void> {
  const { error } = await supabase.rpc('set_username', {
    p_username: normalizeSearchQuery(username).toLowerCase(),
  });

  if (error) {
    throw toSocialError(error, 'Could not update your username.');
  }
}
