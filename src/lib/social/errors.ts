// Error handling for social operations.
//
// The database RPCs raise with messages already written for a human ("You are
// already friends", "That username is taken"), so the useful default is to
// surface the database's own message. This module exists to make that safe:
// only messages raised by our own functions are shown, and anything else --
// a constraint name, a driver-level failure, a policy violation -- is replaced
// with a generic message so internal detail never reaches the UI.

import type { PostgrestError } from '@supabase/supabase-js';

export class SocialError extends Error {
  /** Postgres SQLSTATE, when the failure came from the database. */
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'SocialError';
    this.code = code;
  }
}

/**
 * SQLSTATEs raised deliberately by migration 001's RPCs. A failure carrying one
 * of these has a message we wrote and can show verbatim.
 *
 * '23505' (unique_violation) and '42501' (insufficient_privilege) can also be
 * raised by Postgres itself rather than by our RAISE statements, so they are
 * deliberately excluded -- a raw constraint or RLS message is not something a
 * user should ever read.
 */
const AUTHORED_CODES = new Set([
  'P0001', // raise_exception -- plain RAISE EXCEPTION without an explicit code
  '22023', // invalid_parameter_value -- bad username, self-request
  '54000', // program_limit_exceeded -- pending-request ceiling
  '02000', // no_data -- request not found or already resolved
]);

/** Messages for the cases where the raw database text is not fit to display. */
const GENERIC_BY_CODE: Record<string, string> = {
  '28000': 'You need to be signed in to do that.',
  '42501': "You don't have permission to do that.",
  '23505': 'That already exists.',
  '23503': 'That user no longer exists.',
  '23514': "That value isn't allowed.",
};

/**
 * Converts a Supabase error into a `SocialError` carrying a message safe to
 * show a user.
 *
 * @param error    the error returned by supabase-js
 * @param fallback what to say when the failure has no message we trust
 */
export function toSocialError(error: PostgrestError, fallback: string): SocialError {
  const code = error.code ?? null;

  if (code && AUTHORED_CODES.has(code) && error.message) {
    return new SocialError(error.message, code);
  }

  if (code && GENERIC_BY_CODE[code]) {
    return new SocialError(GENERIC_BY_CODE[code], code);
  }

  return new SocialError(fallback, code);
}

/** Extracts a displayable message from an unknown thrown value. */
export function socialErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SocialError) return error.message;
  return fallback;
}
