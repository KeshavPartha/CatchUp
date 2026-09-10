import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getMovieDetails, getBackdropUrl, getPosterUrl, getPopularMovies } from '@/lib/catalog';
import { MovieRow } from '@/components/movie-row';
import { MovieDetailActions } from '@/components/movie-detail-actions';

interface MoviePageProps {
  params: Promise<{ id: string }>;
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { id } = await params;
  const movieId = Number(id);
  if (!Number.isInteger(movieId)) notFound();

  let movie;
  try {
    movie = await getMovieDetails(movieId);
  } catch {
    notFound();
  }
  const similarMovies = await getPopularMovies();

  return (
    <main className="min-h-screen">
      <div className="relative h-[70vh] min-h-[500px] w-full">
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

        <div className="absolute inset-0 flex items-end pb-16">
          <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-end">
              <div className="relative h-64 w-44 flex-shrink-0 overflow-hidden rounded-lg md:h-80 md:w-56">
                <Image src={getPosterUrl(movie.poster_path)} alt={movie.title} fill className="object-cover" />
              </div>
              <div className="flex-1 space-y-4">
                <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">{movie.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm md:text-base">
                  <span className="font-semibold text-green-500">{Math.round(movie.vote_average * 10)}% Match</span>
                  <span>{movie.release_date.slice(0, 4)}</span>
                  <span className="text-netflix-lightGray">{movie.genres.join(', ')}</span>
                </div>
                <MovieDetailActions movie={movie} />
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
              <p className="leading-relaxed text-netflix-lightGray">{movie.overview}</p>
            </div>
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Cast</h2>
              <p className="text-netflix-lightGray">{movie.cast.join(', ')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-16">
        <MovieRow title="More Like This" movies={similarMovies} />
      </div>
    </main>
  );
}
