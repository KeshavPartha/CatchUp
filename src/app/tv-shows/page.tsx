import { TVShowRow } from '@/components/tv-show-row';
import {
  getTrendingTVShows,
  getPopularTVShows,
  getTopRatedTVShows,
  getAiringTodayTVShows,
  getOnTheAirTVShows,
} from '@/lib/tmdb';

export default async function TVShowsPage() {
  // Fetch all TV show data in parallel
  const [trending, popular, topRated, airingToday, onTheAir] = await Promise.all([
    getTrendingTVShows(),
    getPopularTVShows(),
    getTopRatedTVShows(),
    getAiringTodayTVShows(),
    getOnTheAirTVShows(),
  ]);

  return (
    <main className="relative min-h-screen pt-20">
      {/* Page Header */}
      <div className="mx-auto max-w-screen-2xl px-4 py-8 md:px-8">
        <h1 className="text-4xl font-bold md:text-5xl">TV Shows</h1>
        <p className="mt-2 text-netflix-lightGray">
          Explore popular TV shows, trending series, and top-rated programs
        </p>
      </div>

      {/* TV Show Rows */}
      <div className="space-y-8 pb-16">
        <TVShowRow title="Trending Now" shows={trending} />
        <TVShowRow title="Popular on Netflix" shows={popular} />
        <TVShowRow title="Top Rated" shows={topRated} />
        <TVShowRow title="Airing Today" shows={airingToday} />
        {onTheAir && onTheAir.length > 0 && (
          <TVShowRow title="On The Air" shows={onTheAir} />
        )}
      </div>
    </main>
  );
}

