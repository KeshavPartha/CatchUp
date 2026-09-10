import { MovieRow } from '@/components/movie-row';
import { TVShowRow } from '@/components/tv-show-row';
import {
  getTrendingMovies,
  getUpcomingMovies,
  getNowPlayingMovies,
  getTrendingTVShows,
  getAiringTodayTVShows,
} from '@/lib/tmdb';

export default async function NewAndPopularPage() {
  // Fetch new and trending content in parallel
  const [trendingMovies, upcomingMovies, nowPlayingMovies, trendingShows, airingTodayShows] =
    await Promise.all([
      getTrendingMovies('day'), // Get daily trending for freshness
      getUpcomingMovies(),
      getNowPlayingMovies(),
      getTrendingTVShows('day'),
      getAiringTodayTVShows(),
    ]);

  return (
    <main className="relative min-h-screen pt-20">
      {/* Page Header */}
      <div className="mx-auto max-w-screen-2xl px-4 py-8 md:px-8">
        <h1 className="text-4xl font-bold md:text-5xl">New & Popular</h1>
        <p className="mt-2 text-netflix-lightGray">
          Discover the latest releases and trending content on Netflix
        </p>
      </div>

      {/* Content Rows */}
      <div className="space-y-8 pb-16">
        <MovieRow title="Trending Today" movies={trendingMovies} />
        <MovieRow title="Now Playing in Theaters" movies={nowPlayingMovies} />
        <MovieRow title="Coming Soon" movies={upcomingMovies} />
        <TVShowRow title="Trending TV Shows" shows={trendingShows} />
        <TVShowRow title="Airing Today" shows={airingTodayShows} />
      </div>
    </main>
  );
}

