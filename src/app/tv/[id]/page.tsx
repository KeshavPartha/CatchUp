import Image from 'next/image';
import { getTVShowDetails, getTVShowVideos, getBackdropUrl, getPosterUrl } from '@/lib/tmdb';
import { TVShowRow } from '@/components/tv-show-row';
import { getPopularTVShows } from '@/lib/tmdb';
import { TVShowDetailActions } from '@/components/tv-show-detail-actions';

interface TVShowPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TVShowPage({ params }: TVShowPageProps) {
  const { id } = await params;
  const tvId = parseInt(id);
  const [show, videos, similarShows] = await Promise.all([
    getTVShowDetails(tvId),
    getTVShowVideos(tvId),
    getPopularTVShows(),
  ]);

  const trailer = videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <div className="relative h-[70vh] min-h-[500px] w-full">
        {/* Background Image */}
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

        {/* Content */}
        <div className="absolute inset-0 flex items-end pb-16">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-end">
              {/* Poster */}
              <div className="relative h-64 w-44 flex-shrink-0 overflow-hidden rounded-lg md:h-80 md:w-56">
                <Image
                  src={getPosterUrl(show.poster_path)}
                  alt={show.name}
                  fill
                  className="object-cover"
                />
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">{show.name}</h1>

                <div className="flex flex-wrap items-center gap-4 text-sm md:text-base">
                  <span className="text-green-500 font-semibold">
                    {Math.round(show.vote_average * 10)}% Match
                  </span>
                  <span>{show.first_air_date?.split('-')[0]}</span>
                  <span>{show.number_of_seasons} Season{show.number_of_seasons !== 1 ? 's' : ''}</span>
                  {show.genres && (
                    <span className="text-netflix-lightGray">
                      {show.genres.map((g) => g.name).join(', ')}
                    </span>
                  )}
                </div>

                <TVShowDetailActions
                  showId={tvId}
                  showTitle={show.name}
                  trailerKey={trailer?.key || null}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="mx-auto max-w-screen-2xl px-4 py-12 md:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Overview */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Overview</h2>
              <p className="text-netflix-lightGray leading-relaxed">{show.overview}</p>
            </div>

            {trailer && (
              <div id="trailer-section">
                <h2 className="mb-4 text-2xl font-semibold">Trailer</h2>
                <div className="aspect-video w-full overflow-hidden rounded-lg">
                  <iframe
                    src={`https://www.youtube.com/embed/${trailer.key}`}
                    title={trailer.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Additional Info */}
          <div className="space-y-4 text-sm">
            {show.credits?.cast && (
              <div>
                <span className="text-netflix-lightGray">Cast: </span>
                <span>{show.credits.cast.slice(0, 5).map((c) => c.name).join(', ')}</span>
              </div>
            )}
            {show.networks && (
              <div>
                <span className="text-netflix-lightGray">Network: </span>
                <span>{show.networks.map((n) => n.name).join(', ')}</span>
              </div>
            )}
            {show.created_by && show.created_by.length > 0 && (
              <div>
                <span className="text-netflix-lightGray">Created by: </span>
                <span>{show.created_by.map((c) => c.name).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Similar Shows */}
      <div className="pb-16">
        <TVShowRow title="More Like This" shows={similarShows} />
      </div>
    </main>
  );
}

