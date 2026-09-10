import Image from 'next/image';
import { getMovieDetails, getMovieVideos, getBackdropUrl, getPosterUrl } from '@/lib/tmdb';
import { MovieRow } from '@/components/movie-row';
import { getPopularMovies } from '@/lib/tmdb';
import { MovieDetailActions } from '@/components/movie-detail-actions';

interface MoviePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { id } = await params;
  const movieId = parseInt(id);
  const [movie, videos, similarMovies] = await Promise.all([
    getMovieDetails(movieId),
    getMovieVideos(movieId),
    getPopularMovies(),
  ]);

  const trailer = videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <div className="relative h-[70vh] min-h-[500px] w-full">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src={getBackdropUrl(movie.backdrop_path)}
            alt={movie.title}
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
                  src={getPosterUrl(movie.poster_path)}
                  alt={movie.title}
                  fill
                  className="object-cover"
                />
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">{movie.title}</h1>

                <div className="flex flex-wrap items-center gap-4 text-sm md:text-base">
                  <span className="text-green-500 font-semibold">
                    {Math.round(movie.vote_average * 10)}% Match
                  </span>
                  <span>{movie.release_date?.split('-')[0]}</span>
                  <span>{movie.runtime} min</span>
                  {movie.genres && (
                    <span className="text-netflix-lightGray">
                      {movie.genres.map((g) => g.name).join(', ')}
                    </span>
                  )}
                </div>

                <MovieDetailActions
                  movieId={movieId}
                  movieTitle={movie.title}
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
              <p className="text-netflix-lightGray leading-relaxed">{movie.overview}</p>
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
            {movie.credits?.cast && (
              <div>
                <span className="text-netflix-lightGray">Cast: </span>
                <span>{movie.credits.cast.slice(0, 5).map((c) => c.name).join(', ')}</span>
              </div>
            )}
            {movie.production_companies && (
              <div>
                <span className="text-netflix-lightGray">Production: </span>
                <span>{movie.production_companies.map((c) => c.name).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Similar Movies */}
      <div className="pb-16">
        <MovieRow title="More Like This" movies={similarMovies} />
      </div>
    </main>
  );
}

