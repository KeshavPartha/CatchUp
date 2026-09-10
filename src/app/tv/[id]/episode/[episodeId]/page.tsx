import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { EpisodePlayer } from '@/components/episode-player';
import { WatchTogetherButton } from '@/components/social/watch-together-button';
import { getEpisodeById, getTVShowDetails } from '@/lib/catalog';

interface EpisodePageProps {
  params: Promise<{ id: string; episodeId: string }>;
}

export default async function EpisodePage({ params }: EpisodePageProps) {
  const { id, episodeId } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  let episode;
  let show;
  try {
    [episode, show] = await Promise.all([getEpisodeById(episodeId), getTVShowDetails(showId)]);
  } catch {
    notFound();
  }
  if (episode.show_id !== showId) notFound();

  const episodes = show.seasons.flatMap((season) => season.episodes);
  const currentIndex = episodes.findIndex((item) => item.id === episode.id);
  const nextEpisode = episodes[currentIndex + 1];

  return (
    <main className="min-h-screen px-4 pb-16 pt-24 md:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link href={`/tv/${show.id}`} className="inline-flex items-center gap-2 text-sm text-netflix-lightGray hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to {show.name}
        </Link>
        <header>
          <p className="text-sm text-netflix-lightGray">
            Season {episode.season_number} · Episode {episode.episode_number}
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-5xl">{episode.name}</h1>
          <p className="mt-3 max-w-3xl text-netflix-lightGray">{episode.overview}</p>
        </header>
        <EpisodePlayer episode={episode} showName={show.name} />
        {/*
          Watch Together is episode-scoped: WATCH_TOGETHER_SPEC defines a
          session as "for a specific show and episode", so the launcher belongs
          here rather than on the show page.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <WatchTogetherButton
            showId={show.id}
            episodeId={episode.id}
            episodeName={episode.name}
          />
          <p className="text-xs text-netflix-lightGray">
            Starts a synchronised session you can invite friends into.
          </p>
        </div>
        {nextEpisode && (
          <Link href={`/tv/${show.id}/episode/${nextEpisode.id}`} className="flex items-center justify-between rounded-lg border border-netflix-gray p-4 hover:bg-netflix-gray/30">
            <span>
              <span className="block text-xs text-netflix-lightGray">Next episode</span>
              <span className="font-semibold">{nextEpisode.name}</span>
            </span>
            <ArrowRight className="h-5 w-5" />
          </Link>
        )}
      </div>
    </main>
  );
}
