'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';
import { showToast } from '@/components/toast';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  displayName,
  listMyProgressShares,
  revokeAllShowProgress,
  revokeShowProgress,
  socialErrorMessage,
  type ProgressShare,
} from '@/lib/social';
import { getPosterUrl, getTVShowDetails } from '@/lib/catalog';

interface ShowGroup {
  showId: string;
  shares: ProgressShare[];
}

interface ShowInfo {
  title: string;
  posterPath: string | null;
}

/**
 * Everything the current user is sharing, and with whom.
 *
 * The vision requires sharing to be revocable, which is only true in practice
 * if it is also *findable*. A control on a show page is not enough: a user who
 * has forgotten what they shared has no way back to it. This is the one screen
 * that answers the question completely.
 *
 * Because ending a friendship deletes the underlying grants, this can never
 * list a share that no longer conveys anything.
 */
export function PrivacyCentre() {
  const { userId, loading: authLoading } = useCurrentUser();
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const [shares, setShares] = useState<ProgressShare[]>([]);
  const [shows, setShows] = useState<Record<string, ShowInfo>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setShares([]);
      setLoading(false);
      return;
    }

    try {
      setShares(await listMyProgressShares(supabase));
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not load what you are sharing.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  // One grant covers a show, so the list is grouped by show and each person is
  // revocable individually within it.
  const groups = useMemo<ShowGroup[]>(() => {
    const byShow = new Map<string, ShowGroup>();

    for (const share of shares) {
      const existing = byShow.get(share.showId);
      if (existing) {
        existing.shares.push(share);
      } else {
        byShow.set(share.showId, { showId: share.showId, shares: [share] });
      }
    }

    return [...byShow.values()];
  }, [shares]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const missing = groups.filter((group) => !shows[group.showId]);
      if (missing.length === 0) return;

      const fetched = await Promise.all(
        missing.map(async (group) => {
          try {
            const details = await getTVShowDetails(Number(group.showId));
            return [group.showId, { title: details.name, posterPath: details.poster_path }] as const;
          } catch {
            // A show that no longer resolves still has to be revocable, so it
            // renders with a placeholder rather than disappearing.
            return [group.showId, { title: 'Unavailable show', posterPath: null }] as const;
          }
        })
      );

      if (!isMounted) return;
      setShows((prev) => ({ ...prev, ...Object.fromEntries(fetched) }));
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [groups, shows]);

  const withBusy = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusy((prev) => new Set(prev).add(key));
      try {
        await action();
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not stop sharing.'), 'error');
      } finally {
        await refresh();
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [refresh]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-netflix-gray/30" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-netflix-darkGray px-6 py-16 text-center">
        <ShieldCheck className="mb-4 h-12 w-12 text-netflix-lightGray" />
        <h2 className="mb-2 text-xl font-semibold">You aren&rsquo;t sharing any progress</h2>
        <p className="max-w-md text-sm text-netflix-lightGray">
          Nobody can see how far you are through anything. To share a show, open it and choose
          &ldquo;Share progress&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-netflix-lightGray">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This is everything you share, in full. Each person listed can see which episode of that
          one show you have reached — nothing else.
        </span>
      </p>

      {groups.map((group) => {
        const info = shows[group.showId];
        const href = `/tv/${group.showId}`;

        return (
          <section key={group.showId} className="rounded-lg bg-netflix-darkGray p-4">
            <div className="flex gap-4">
              <Link
                href={href}
                className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded bg-netflix-gray"
              >
                {info?.posterPath ? (
                  <Image
                    src={getPosterUrl(info.posterPath)}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full animate-pulse bg-netflix-gray" />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={href} className="truncate font-semibold hover:underline">
                      {info?.title ?? 'Loading...'}
                    </Link>
                    <p className="text-sm text-netflix-lightGray">
                      Shared with {group.shares.length}{' '}
                      {group.shares.length === 1 ? 'person' : 'people'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy.has(group.showId) || !supabase}
                    onClick={() =>
                      void withBusy(group.showId, async () => {
                        if (supabase) await revokeAllShowProgress(supabase, group.showId);
                      })
                    }
                    className="shrink-0 rounded bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                  >
                    Stop all
                  </button>
                </div>

                <ul className="flex flex-wrap gap-2">
                  {group.shares.map((share) => {
                    const personKey = `${group.showId}-${share.userId}`;
                    return (
                      <li
                        key={share.userId}
                        className="flex items-center gap-2 rounded-full bg-netflix-gray/60 py-1 pl-1 pr-2"
                      >
                        <FriendAvatar profile={share} size="sm" className="h-6 w-6" />
                        <span className="text-xs font-medium">{displayName(share)}</span>
                        <button
                          type="button"
                          disabled={busy.has(personKey) || !supabase}
                          onClick={() =>
                            void withBusy(personKey, async () => {
                              if (supabase) {
                                await revokeShowProgress(supabase, group.showId, share.userId);
                              }
                            })
                          }
                          className="rounded-full p-0.5 text-netflix-lightGray transition-colors hover:bg-netflix-black hover:text-white disabled:opacity-50"
                          aria-label={`Stop sharing ${info?.title ?? 'this show'} with ${displayName(share)}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
