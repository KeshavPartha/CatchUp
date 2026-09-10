'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useRecommendations } from '@/hooks/use-recommendations';
import { displayName, type Recommendation } from '@/lib/social';
import { getMovieDetails, getPosterUrl, getTVShowDetails } from '@/lib/tmdb';

interface RecommendedItem {
  recommendation: Recommendation;
  title: string;
  backdropPath: string | null;
  posterPath: string | null;
}

/**
 * "Recommended by friends" on the home page.
 *
 * The vision asks that users "see friend recommendations in the product", not
 * only in a social inbox -- a recommendation that lives behind a tab is a
 * message, while one on the home row is a way to start watching. This is the
 * same data as the inbox on /friends, surfaced where browsing actually happens.
 *
 * Renders nothing when there is nothing recommended, so the home page is
 * unchanged for users with no friends.
 */
export function FriendRecommendationsRow() {
  const { incoming, loading } = useRecommendations();
  const [items, setItems] = useState<RecommendedItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (incoming.length === 0) {
        setItems([]);
        return;
      }

      const resolved = await Promise.all(
        incoming.map(async (recommendation): Promise<RecommendedItem | null> => {
          try {
            if (recommendation.mediaType === 'movie') {
              const details = await getMovieDetails(recommendation.mediaId);
              return {
                recommendation,
                title: details.title,
                backdropPath: details.backdrop_path,
                posterPath: details.poster_path,
              };
            }

            const details = await getTVShowDetails(recommendation.mediaId);
            return {
              recommendation,
              title: details.name,
              backdropPath: details.backdrop_path,
              posterPath: details.poster_path,
            };
          } catch {
            // Drop titles TMDB cannot resolve rather than showing a broken
            // card in a browse row. The inbox on /friends still lists them.
            return null;
          }
        })
      );

      if (!isMounted) return;
      setItems(resolved.filter((item): item is RecommendedItem => item !== null));
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [incoming]);

  if (loading || items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-4 text-lg font-semibold md:px-8 md:text-xl lg:text-2xl">
        Recommended by friends
      </h2>
      <div className="flex gap-2 overflow-x-scroll px-4 scrollbar-hide md:gap-3 md:px-8">
        {items.map(({ recommendation, title, backdropPath, posterPath }) => {
          const href = `/${recommendation.mediaType === 'movie' ? 'movie' : 'tv'}/${recommendation.mediaId}`;

          return (
            <div
              key={recommendation.recommendationId}
              className="w-48 flex-shrink-0 md:w-64 lg:w-72"
            >
              <Link href={href} className="group block">
                <div className="relative aspect-video overflow-hidden rounded-md bg-netflix-gray">
                  <Image
                    src={
                      backdropPath
                        ? `https://image.tmdb.org/t/p/w500${backdropPath}`
                        : getPosterUrl(posterPath)
                    }
                    alt={title}
                    fill
                    sizes="(max-width: 768px) 12rem, 18rem"
                    className="object-cover"
                  />

                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="rounded-full bg-white/90 p-3">
                      <Play className="h-8 w-8 fill-black text-black" />
                    </div>
                  </div>
                </div>

                <div className="mt-2">
                  <h3 className="truncate text-sm font-medium">{title}</h3>
                  <div className="mt-1 flex items-center gap-1.5">
                    <FriendAvatar
                      profile={recommendation}
                      size="sm"
                      className="h-4 w-4"
                    />
                    <p className="truncate text-xs text-netflix-lightGray">
                      {displayName(recommendation)}
                    </p>
                  </div>
                  {recommendation.note && (
                    <p className="mt-1 truncate text-xs italic text-netflix-lightGray">
                      &ldquo;{recommendation.note}&rdquo;
                    </p>
                  )}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
