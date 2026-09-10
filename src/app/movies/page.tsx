import { MovieRow } from '@/components/movie-row';
import {
  getTrendingMovies,
  getPopularMovies,
  getTopRatedMovies,
  getUpcomingMovies,
  getNowPlayingMovies,
} from '@/lib/tmdb';

export default async function MoviesPage() {
  // Fetch all movie data in parallel
  const [trending, popular, topRated, upcoming, nowPlaying] = await Promise.all([
    getTrendingMovies(),
    getPopularMovies(),
    getTopRatedMovies(),
    getUpcomingMovies(),
    getNowPlayingMovies(),
  ]);

  return (
    <main className="relative min-h-screen pt-20">
      {/* Page Header */}
      <div className="mx-auto max-w-screen-2xl px-4 py-8 md:px-8">
        <h1 className="text-4xl font-bold md:text-5xl">Movies</h1>
        <p className="mt-2 text-netflix-lightGray">
          Discover trending movies, popular films, and upcoming releases
        </p>
      </div>

      {/* Movie Rows */}
      <div className="space-y-8 pb-16">
        <MovieRow title="Trending Now" movies={trending} />
        <MovieRow title="Popular on Netflix" movies={popular} />
        <MovieRow title="Top Rated" movies={topRated} />
        <MovieRow title="Coming Soon" movies={upcoming} />
        <MovieRow title="Now Playing" movies={nowPlaying} />
      </div>
    </main>
  );
}

