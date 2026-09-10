'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MovieCard } from '@/components/movie-card';
import { TVShowCard } from '@/components/tv-show-card';
import { useMyList } from '@/hooks/use-my-list';
import { getMovieDetails, getTVShowDetails, MovieDetails, TVShowDetails } from '@/lib/tmdb';

// Lightweight skeleton
function MyListSkeleton() {
  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <div className="h-10 w-32 bg-netflix-gray/30 rounded animate-pulse mb-8" />
        <div className="h-5 w-20 bg-netflix-gray/30 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-netflix-gray/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </main>
  );
}

interface MediaItem {
  id: number;
  type: 'movie' | 'tv';
  data: MovieDetails | TVShowDetails;
}

export default function MyListPage() {
  const router = useRouter();
  const { myList, loading: listLoading } = useMyList();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch media details when myList changes
  useEffect(() => {
    let isMounted = true;

    const fetchMedia = async () => {
      if (listLoading) return;

      if (myList.length === 0) {
        setMediaItems([]);
        setLoading(false);
        return;
      }

      try {
        const promises = myList.map(async (item): Promise<MediaItem | null> => {
          try {
            if (item.media_type === 'movie') {
              const data = await getMovieDetails(item.media_id);
              return { id: item.media_id, type: 'movie' as const, data };
            } else {
              const data = await getTVShowDetails(item.media_id);
              return { id: item.media_id, type: 'tv' as const, data };
            }
          } catch {
            return null;
          }
        });

        const results = await Promise.all(promises);
        if (isMounted) {
          const validItems = results.filter((item): item is MediaItem => item !== null);
          setMediaItems(validItems);
        }
      } catch (error) {
        console.error('Error fetching media:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchMedia();
    return () => { isMounted = false; };
  }, [myList, listLoading]);

  // Show skeleton while loading
  if (listLoading || loading) {
    return <MyListSkeleton />;
  }

  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <h1 className="mb-8 text-3xl font-bold md:text-4xl">My List</h1>

        {mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 text-6xl">📺</div>
            <h2 className="mb-2 text-2xl font-semibold">Your list is empty</h2>
            <p className="mb-6 text-netflix-lightGray">
              Add movies and shows to your list to watch them later
            </p>
            <button
              onClick={() => router.push('/')}
              className="rounded bg-netflix-red px-6 py-3 font-semibold hover:bg-netflix-red/90 transition-colors"
            >
              Browse Content
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-6 text-netflix-lightGray">
              {mediaItems.length} {mediaItems.length === 1 ? 'title' : 'titles'}
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {mediaItems.map((item) => (
                item.type === 'movie' ? (
                  <MovieCard key={`movie-${item.id}`} movie={item.data as MovieDetails} />
                ) : (
                  <TVShowCard key={`tv-${item.id}`} show={item.data as TVShowDetails} />
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

