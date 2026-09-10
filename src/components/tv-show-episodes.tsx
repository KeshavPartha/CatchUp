'use client';

import Link from 'next/link';

import type { Season } from '@/lib/catalog';
import { CatchMeUpButton } from '@/components/catch-me-up-button';
import { useShowPlaybackTarget } from '@/hooks/use-show-playback-target';

interface TVShowEpisodesProps {
  showId: number;
  seasons: Season[];
}

export function TVShowEpisodes({ showId, seasons }: TVShowEpisodesProps) {
  const episodes = seasons.flatMap((season) => season.episodes);
  const { loading, isEligibleForRecap, isResumeForEpisode } = useShowPlaybackTarget(
    showId,
    episodes
  );

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">Episodes</h2>
      {seasons.map((season) => (
        <div key={season.id} className="space-y-3">
          <div>
            <h3 className="text-xl font-semibold">{season.name}</h3>
            <p className="text-sm text-netflix-lightGray">{season.overview}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {season.episodes.map((episode) => (
              <div
                key={episode.id}
                className="rounded-lg border border-netflix-gray bg-netflix-gray/20 p-4 transition-colors hover:bg-netflix-gray/50"
              >
                <Link
                  href={`/tv/${showId}/episode/${episode.id}`}
                  aria-label={`${isResumeForEpisode(episode) ? 'Resume' : 'Play'} ${episode.name}`}
                  className="group block"
                >
                  <p className="text-xs text-netflix-lightGray">
                    E{episode.episode_number} · {episode.runtime} min
                  </p>
                  <h4 className="mt-1 font-semibold">{episode.name}</h4>
                  <p className="mt-2 line-clamp-2 text-sm text-netflix-lightGray">
                    {episode.overview}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors group-hover:bg-netflix-red group-hover:text-white">
                    <span aria-hidden="true">▶</span>
                    {isResumeForEpisode(episode) ? 'Resume' : 'Play'}
                  </span>
                </Link>
                {!loading && isEligibleForRecap(episode) && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <CatchMeUpButton
                      showId={showId}
                      targetEpisode={episode}
                      compact
                      isResume={isResumeForEpisode(episode)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="sr-only">
        Catch Me Up is available for completed episodes before each episode.
      </p>
    </section>
  );
}
