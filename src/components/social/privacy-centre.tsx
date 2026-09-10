'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';
import { showToast } from '@/components/toast';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  displayName,
  listMyProgressShares,
  revokeAllProgressShares,
  revokeProgressShare,
  socialErrorMessage,
  type MediaType,
  type ProgressShare,
} from '@/lib/social';
import { getMovieDetails, getPosterUrl, getTVShowDetails } from '@/lib/tmdb';

interface TitleGroup {
  mediaId: number;
  mediaType: MediaType;
  shares: ProgressShare[];
}

/**
 * Everything the current user is sharing, and with whom.
 *
 * The vision requires sharing to be revocable, which is only true in practice
 * if it is also *findable*. A per-title control on a detail page is not enough:
 * a user who has forgotten what they shared has no way back to it. This is the
 * one screen that answers the question completely.
 *
 * Because unfriending deletes the underlying grants, this list can never show a
 * share that no longer conveys anything.
 */
export function PrivacyCentre() {
  const { userId, loading: authLoading } = useCurrentUser();
  const supabase = useMemo(() => createSocialClient(), []);
  const [shares, setShares] = useState<ProgressShare[]>([]);
  const [titles, setTitles] = useState<Record<string, { title: string; posterPath: string | null }>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) {
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

  const groups = useMemo<TitleGroup[]>(() => {
    const byTitle = new Map<string, TitleGroup>();

    for (const share of shares) {
      const key = `${share.mediaType}-${share.mediaId}`;
      const existing = byTitle.get(key);
      if (existing) {
        existing.shares.push(share);
      } else {
        byTitle.set(key, {
          mediaId: share.mediaId,
          mediaType: share.mediaType,
          shares: [share],
        });
      }
    }

    return [...byTitle.values()];
  }, [shares]);

  // Resolve titles and artwork, the same way My List does.
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const missing = groups.filter((group) => !titles[`${group.mediaType}-${group.mediaId}`]);
      if (missing.length === 0) return;

      const fetched = await Promise.all(
        missing.map(async (group) => {
          const key = `${group.mediaType}-${group.mediaId}`;
          try {
            if (group.mediaType === 'movie') {
              const details = await getMovieDetails(group.mediaId);
              return [key, { title: details.title, posterPath: details.poster_path }] as const;
            }
            const details = await getTVShowDetails(group.mediaId);
            return [key, { title: details.name, posterPath: details.poster_path }] as const;
          } catch {
            return [key, { title: 'Unavailable title', posterPath: null }] as const;
          }
        })
      );

      if (!isMounted) return;
      setTitles((prev) => ({ ...prev, ...Object.fromEntries(fetched) }));
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [groups, titles]);

  const withBusy = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusy((prev) => new Set(prev).add(key));
      try {
        await action();
        await refresh();
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not stop sharing.'), 'error');
        await refresh();
      } finally {
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
          Nobody can see how far you are through anything. To share a title, open it and choose
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
          This is everything you share, in full. Each person listed can see how far you are through
          that one title — nothing else.
        </span>
      </p>

      {groups.map((group) => {
        const key = `${group.mediaType}-${group.mediaId}`;
        const info = titles[key];
        const href = `/${group.mediaType === 'movie' ? 'movie' : 'tv'}/${group.mediaId}`;

        return (
          <section key={key} className="rounded-lg bg-netflix-darkGray p-4">
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
                    disabled={busy.has(key)}
                    onClick={() =>
                      void withBusy(key, () =>
                        revokeAllProgressShares(supabase, group.mediaId, group.mediaType)
                      )
                    }
                    className="shrink-0 rounded bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                  >
                    Stop all
                  </button>
                </div>

                <ul className="flex flex-wrap gap-2">
                  {group.shares.map((share) => {
                    const personKey = `${key}-${share.userId}`;
                    return (
                      <li
                        key={share.userId}
                        className="flex items-center gap-2 rounded-full bg-netflix-gray/60 py-1 pl-1 pr-2"
                      >
                        <FriendAvatar profile={share} size="sm" className="h-6 w-6" />
                        <span className="text-xs font-medium">{displayName(share)}</span>
                        <button
                          type="button"
                          disabled={busy.has(personKey)}
                          onClick={() =>
                            void withBusy(personKey, () =>
                              revokeProgressShare(
                                supabase,
                                group.mediaId,
                                group.mediaType,
                                share.userId
                              )
                            )
                          }
                          className="rounded-full p-0.5 text-netflix-lightGray transition-colors hover:bg-netflix-black hover:text-white disabled:opacity-50"
                          aria-label={`Stop sharing ${info?.title ?? 'this title'} with ${displayName(share)}`}
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
