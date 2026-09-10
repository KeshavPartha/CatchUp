'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchMovies, Movie } from '@/lib/tmdb';
import { MovieCard } from '@/components/movie-card';

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const results = await searchMovies(searchQuery);
      setMovies(results);
    } catch (error) {
      console.error('Search error:', error);
      setMovies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-screen-2xl px-4 md:px-8">
        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="mb-12">
          <div className="relative mx-auto max-w-2xl">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for movies..."
              className="w-full rounded-lg bg-netflix-darkGray px-6 py-4 pr-12 text-lg text-white placeholder-netflix-lightGray focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button
              type="submit"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-netflix-lightGray hover:text-white transition-colors"
              aria-label="Search"
            >
              <Search className="h-6 w-6" />
            </button>
          </div>
        </form>

        {/* Results */}
        {loading && (
          <div className="text-center">
            <p className="text-xl text-netflix-lightGray">Searching...</p>
          </div>
        )}

        {!loading && searched && movies.length === 0 && (
          <div className="text-center">
            <p className="text-xl text-netflix-lightGray">
              No results found for &quot;{query}&quot;. Try a different search.
            </p>
          </div>
        )}

        {!loading && movies.length > 0 && (
          <div>
            <h2 className="mb-6 text-2xl font-semibold">
              Search Results for &quot;{query}&quot; ({movies.length})
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {movies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          </div>
        )}

        {!searched && (
          <div className="text-center">
            <p className="text-xl text-netflix-lightGray">
              Enter a search term to find movies and TV shows.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function SearchSkeleton() {
  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-screen-2xl px-4 md:px-8">
        <div className="mb-12">
          <div className="relative mx-auto max-w-2xl">
            <div className="w-full h-14 rounded-lg bg-netflix-gray/30 animate-pulse" />
          </div>
        </div>
        <div className="text-center">
          <div className="h-6 w-64 mx-auto bg-netflix-gray/30 rounded animate-pulse" />
        </div>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchContent />
    </Suspense>
  );
}
