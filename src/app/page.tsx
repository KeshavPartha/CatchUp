import { HeroBanner } from '@/components/hero-banner';
import { MovieRow } from '@/components/movie-row';
import { ContinueWatchingRow } from '@/components/continue-watching-row';
import { FriendRecommendationsRow } from '@/components/social/friend-recommendations-row';
import {
  getTrendingMovies,
  getPopularMovies,
  getTopRatedMovies,
  getUpcomingMovies,
  getNowPlayingMovies,
} from '@/lib/catalog';

export default async function Home() {
  // Fetch all movie data in parallel
  const [trending, popular, topRated, upcoming, nowPlaying] = await Promise.all([
    getTrendingMovies(),
    getPopularMovies(),
    getTopRatedMovies(),
    getUpcomingMovies(),
    getNowPlayingMovies(),
  ]);

  // Use the first trending movie as the hero
  const heroMovie = trending[0];

  return (
    <main className="relative min-h-screen">
      {/* Hero Banner */}
      {heroMovie && <HeroBanner movie={heroMovie} />}

      {/* Movie Rows */}
      <div className="relative -mt-32 space-y-8 pb-16">
        {/* Continue Watching - only shows if user has watch history */}
        <ContinueWatchingRow />

        {/* Recommended by friends - only shows if friends have recommended something */}
        <FriendRecommendationsRow />

        <MovieRow title="Trending Now" movies={trending} />
        <MovieRow title="Popular picks" movies={popular} />
        <MovieRow title="Top Rated" movies={topRated} />
        <MovieRow title="Coming Soon" movies={upcoming} />
        <MovieRow title="Now Playing" movies={nowPlaying} />
      </div>
    </main>
  );
}
