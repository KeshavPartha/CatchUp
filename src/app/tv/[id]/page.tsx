import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTVShowDetails, getBackdropUrl, getPosterUrl, getPopularTVShows } from '@/lib/catalog';
import { TVShowRow } from '@/components/tv-show-row';
import { TVShowDetailActions } from '@/components/tv-show-detail-actions';

interface TVShowPageProps {
  params: Promise<{ id: string }>;
}

export default async function TVShowPage({ params }: TVShowPageProps) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  let show;
  try {
    show = await getTVShowDetails(showId);
  } catch {
    notFound();
  }
  const similarShows = await getPopularTVShows();
  const episodes = show.seasons.flatMap((season) => season.episodes);

  return (
    <main className="min-h-screen">
      <div className="relative h-[70vh] min-h-[500px] w-full">
        <div className="absolute inset-0">
          <Image
            src={getBackdropUrl(show.backdrop_path)}
            alt={show.name}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-netflix-black via-transparent to-transparent" />
        </div>

        <div className="absolute inset-0 flex items-end pb-16">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-end">
              <div className="relative h-64 w-44 flex-shrink-0 overflow-hidden rounded-lg md:h-80 md:w-56">
                <Image src={getPosterUrl(show.poster_path)} alt={show.name} fill className="object-cover" />
              </div>
              <div className="flex-1 space-y-4">
                <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">{show.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm md:text-base">
                  <span className="font-semibold text-green-500">{Math.round(show.vote_average * 10)}% Match</span>
                  <span>{show.first_air_date.slice(0, 4)}</span>
                  <span>{show.seasons.length} Season{show.seasons.length !== 1 ? 's' : ''}</span>
                  <span className="text-netflix-lightGray">{show.genres.join(', ')}</span>
                </div>
                <TVShowDetailActions showId={showId} showName={show.name} episodes={episodes} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-2xl px-4 py-12 md:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-6 md:col-span-2">
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Overview</h2>
              <p className="leading-relaxed text-netflix-lightGray">{show.overview}</p>
            </div>
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Cast</h2>
              <p className="text-netflix-lightGray">{show.cast.join(', ')}</p>
            </div>
            <section className="space-y-6">
              <h2 className="text-2xl font-semibold">Episodes</h2>
              {show.seasons.map((season) => (
                <div key={season.id} className="space-y-3">
                  <div>
                    <h3 className="text-xl font-semibold">{season.name}</h3>
                    <p className="text-sm text-netflix-lightGray">{season.overview}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {season.episodes.map((episode) => (
                      <Link
                        key={episode.id}
                        href={`/tv/${show.id}/episode/${episode.id}`}
                        aria-label={`Play ${episode.name}`}
                        className="group rounded-lg border border-netflix-gray bg-netflix-gray/20 p-4 transition-colors hover:bg-netflix-gray/50"
                      >
                        <p className="text-xs text-netflix-lightGray">
                          E{episode.episode_number} · {episode.runtime} min
                        </p>
                        <h4 className="mt-1 font-semibold">{episode.name}</h4>
                        <p className="mt-2 line-clamp-2 text-sm text-netflix-lightGray">{episode.overview}</p>
                        <span className="mt-4 inline-flex items-center gap-2 rounded bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors group-hover:bg-netflix-red group-hover:text-white">
                          <span aria-hidden="true">▶</span>
                          Play
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>

      <div className="pb-16">
        <TVShowRow title="More Like This" shows={similarShows} />
      </div>
    </main>
  );
}
