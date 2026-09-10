'use client';

import { useCallback, useMemo, useState } from 'react';
import { Search, UserPlus, Check, Clock } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  MIN_SEARCH_LENGTH,
  displayName,
  handle,
  normalizeSearchQuery,
  searchUsers,
  socialErrorMessage,
  type UserSearchResult,
} from '@/lib/social';

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; results: UserSearchResult[]; query: string };

interface AddFriendSearchProps {
  /** Sends a request; resolves true on success so the row can update in place. */
  onSend: (userId: string) => Promise<boolean>;
  /** Ids with a request in flight. */
  busyIds: ReadonlySet<string>;
  /** Jump to the requests tab after accepting from here. */
  onAcceptExisting: (requestId: string) => void;
}

export function AddFriendSearch({ onSend, busyIds, onAcceptExisting }: AddFriendSearchProps) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  // null when Supabase is unconfigured -- runSearch below must settle into a
  // safe empty state rather than calling createClient() and throwing.
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);

  const normalized = normalizeSearchQuery(query);
  const canSearch = normalized.length >= MIN_SEARCH_LENGTH;

  const runSearch = useCallback(
    async (raw: string) => {
      const trimmed = normalizeSearchQuery(raw);
      if (trimmed.length < MIN_SEARCH_LENGTH) return;

      if (!supabase) {
        showToast('Search is unavailable right now.', 'error');
        return;
      }

      setState({ status: 'searching' });

      try {
        const results = await searchUsers(supabase, trimmed);
        setState({ status: 'done', results, query: trimmed });
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not run that search.'), 'error');
        setState({ status: 'idle' });
      }
    },
    [supabase]
  );

  const handleSend = useCallback(
    async (userId: string) => {
      const sent = await onSend(userId);
      if (!sent) return;

      // Reflect the new state in place rather than making the user search again.
      setState((prev) =>
        prev.status === 'done'
          ? {
              ...prev,
              results: prev.results.map((result) =>
                result.userId === userId ? { ...result, relationship: 'outgoing_request' } : result
              ),
            }
          : prev
      );
    },
    [onSend]
  );

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-netflix-lightGray" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Username or email address"
            aria-label="Find someone by username or email address"
            autoComplete="off"
            className="w-full rounded bg-netflix-darkGray py-2.5 pl-9 pr-3 text-sm placeholder-netflix-lightGray focus:outline-none focus:ring-2 focus:ring-netflix-red"
          />
        </div>
        <button
          type="submit"
          disabled={!canSearch || state.status === 'searching'}
          className="rounded bg-netflix-red px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-netflix-red/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === 'searching' ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/*
        Stating the exact-match rule up front is a product decision, not just a
        hint: it explains why a partial name finds nothing, and it tells the
        user that CatchUp cannot be browsed for people. The same rule is
        enforced in the database, so this text describes real behaviour.
      */}
      <p className="mt-3 text-sm text-netflix-lightGray">
        Searches match a full username or email address exactly — CatchUp has no browsable
        directory, so people can only be found by someone who already knows how to reach them.
      </p>

      {state.status === 'done' && state.results.length === 0 && (
        <div className="mt-6 rounded-lg bg-netflix-darkGray p-6 text-center">
          <p className="font-semibold">No match for &ldquo;{state.query}&rdquo;</p>
          <p className="mt-1 text-sm text-netflix-lightGray">
            Check the spelling, or ask them for the exact username on their profile.
          </p>
        </div>
      )}

      {state.status === 'done' && state.results.length > 0 && (
        <ul className="mt-6 space-y-3">
          {state.results.map((result) => {
            const name = displayName(result);
            const userHandle = handle(result);
            const busy = busyIds.has(result.userId);

            return (
              <li
                key={result.userId}
                className="flex items-center gap-4 rounded-lg bg-netflix-darkGray p-4"
              >
                <FriendAvatar profile={result} />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{name}</p>
                  {userHandle && (
                    <p className="truncate text-sm text-netflix-lightGray">{userHandle}</p>
                  )}
                </div>

                {result.relationship === 'friends' && (
                  <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-netflix-lightGray">
                    <Check className="h-4 w-4" />
                    Friends
                  </span>
                )}

                {result.relationship === 'outgoing_request' && (
                  <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-netflix-lightGray">
                    <Clock className="h-4 w-4" />
                    Requested
                  </span>
                )}

                {result.relationship === 'incoming_request' && result.requestId && (
                  <button
                    type="button"
                    onClick={() => onAcceptExisting(result.requestId as string)}
                    className="shrink-0 rounded bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-white/85"
                  >
                    Accept request
                  </button>
                )}

                {result.relationship === 'none' && (
                  <button
                    type="button"
                    onClick={() => void handleSend(result.userId)}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1.5 rounded bg-netflix-red px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-netflix-red/90 disabled:opacity-50"
                    aria-label={`Send a friend request to ${name}`}
                  >
                    <UserPlus className="h-4 w-4" />
                    {busy ? 'Sending...' : 'Add friend'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
