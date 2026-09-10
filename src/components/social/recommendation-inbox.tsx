'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Inbox, Plus, X } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useRecommendations } from '@/hooks/use-recommendations';
import { useMyList } from '@/hooks/use-my-list';
import { displayName, type Recommendation } from '@/lib/social';
import { getMovieDetails, getPosterUrl, getTVShowDetails } from '@/lib/catalog';

interface TitleInfo {
  title: string;
  posterPath: string | null;
  year: string | null;
}

/**
 * Recommendations sent to the current user.
 *
 * The recommendation rows carry only a catalog id, so titles and artwork are
 * fetched client-side per item -- the same approach My List and Continue
 * Watching already take. Details are cached in component state so re-renders
 * (and Realtime refreshes) do not re-fetch what is already known.
 */
export function RecommendationInbox() {
  const { incoming, loading, busyIds, markAllSeen, dismiss, markAdded } = useRecommendations();
  const { addToList } = useMyList();
  const [titles, setTitles] = useState<Record<string, TitleInfo>>({});

  // Opening the inbox clears the "new" badge without resolving anything.
  useEffect(() => {
    if (!loading && incoming.length > 0) {
      void markAllSeen();
    }
    // Intentionally runs on load only; markAllSeen is a no-op once nothing is
    // pending, and depending on `incoming` here would re-fire on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const missing = incoming.filter((item) => !titles[keyFor(item)]);
      if (missing.length === 0) return;

      const fetched = await Promise.all(
        missing.map(async (item) => {
          try {
            if (item.mediaType === 'movie') {
              const details = await getMovieDetails(item.mediaId);
              return [
                keyFor(item),
                {
                  title: details.title,
                  posterPath: details.poster_path,
                  year: details.release_date?.slice(0, 4) || null,
                },
              ] as const;
            }

            const details = await getTVShowDetails(item.mediaId);
            return [
              keyFor(item),
              {
                title: details.name,
                posterPath: details.poster_path,
                year: details.first_air_date?.slice(0, 4) || null,
              },
            ] as const;
          } catch {
            // A title that cannot be resolved still renders, with a fallback
            // name -- losing the recommendation entirely would be worse.
            return [keyFor(item), { title: 'Unavailable title', posterPath: null, year: null }] as const;
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
  }, [incoming, titles]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg bg-netflix-gray/30" />
        ))}
      </div>
    );
  }

  if (incoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-netflix-darkGray px-6 py-16 text-center">
        <Inbox className="mb-4 h-12 w-12 text-netflix-lightGray" />
        <h2 className="mb-2 text-xl font-semibold">Nothing recommended yet</h2>
        <p className="max-w-md text-sm text-netflix-lightGray">
          When a friend recommends a show or film, it lands here with their note.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {incoming.map((item) => {
        const info = titles[keyFor(item)];
        const href = `/${item.mediaType === 'movie' ? 'movie' : 'tv'}/${item.mediaId}`;
        const busy = busyIds.has(item.recommendationId);

        return (
          <li
            key={item.recommendationId}
            className="flex gap-4 rounded-lg bg-netflix-darkGray p-4"
          >
            <Link href={href} className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded bg-netflix-gray">
              {info?.posterPath ? (
                <Image
                  src={getPosterUrl(info.posterPath)}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full animate-pulse bg-netflix-gray" />
              )}
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-1 flex items-center gap-2 text-sm text-netflix-lightGray">
                <FriendAvatar profile={item} size="sm" className="h-6 w-6" />
                <span className="truncate">
                  <span className="font-semibold text-white">{displayName(item)}</span> recommends
                </span>
              </div>

              <Link href={href} className="truncate font-semibold hover:underline">
                {info?.title ?? 'Loading...'}
                {info?.year && (
                  <span className="ml-2 font-normal text-netflix-lightGray">{info.year}</span>
                )}
              </Link>

              {item.note && (
                <p className="mt-1 line-clamp-2 border-l-2 border-netflix-gray pl-2 text-sm italic text-netflix-lightGray">
                  &ldquo;{item.note}&rdquo;
                </p>
              )}

              <div className="mt-auto flex gap-2 pt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    // Add to the list first: if that fails there is nothing to
                    // record, and the recommendation stays actionable.
                    const added = await addToList(item.mediaId, item.mediaType);
                    if (added) await markAdded(item.recommendationId);
                  }}
                  className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-white/85 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add to My List
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void dismiss(item.recommendationId)}
                  className="flex items-center gap-1.5 rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold text-netflix-lightGray transition-colors hover:bg-netflix-gray/80 hover:text-white disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Not for me</span>
                </button>
                {item.status === 'read' && (
                  <span className="ml-auto flex items-center gap-1 self-center text-xs text-netflix-lightGray">
                    <Check className="h-3 w-3" />
                    Seen
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function keyFor(item: Recommendation): string {
  return `${item.mediaType}-${item.mediaId}`;
}
