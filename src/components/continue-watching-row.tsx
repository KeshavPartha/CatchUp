'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, X } from 'lucide-react';
import { useContinueWatching } from '@/hooks/use-continue-watching';
import { getMovieDetails, MovieDetails, getPosterUrl } from '@/lib/tmdb';

interface ContinueWatchingItem {
  media_id: number;
  media_type: 'movie' | 'tv';
  progress: number;
  movie?: MovieDetails;
}

export function ContinueWatchingRow() {
  const { watchList, loading, removeFromWatching, isAuthenticated } = useContinueWatching();
  const [items, setItems] = useState<ContinueWatchingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    const fetchMovieDetails = async () => {
      if (watchList.length === 0) {
        setItems([]);
        return;
      }

      setLoadingItems(true);
      try {
        const movieItems = watchList.filter(w => w.media_type === 'movie');
        const moviePromises = movieItems.map(async (item): Promise<ContinueWatchingItem> => {
          try {
            const movie = await getMovieDetails(item.media_id);
            return { media_id: item.media_id, media_type: item.media_type, progress: item.progress, movie };
          } catch {
            return { media_id: item.media_id, media_type: item.media_type, progress: item.progress };
          }
        });

        const results = await Promise.all(moviePromises);
        setItems(results.filter((r): r is ContinueWatchingItem & { movie: MovieDetails } => r.movie !== undefined));
      } catch (error) {
        console.error('Error fetching movie details:', error);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchMovieDetails();
  }, [watchList]);

  if (!isAuthenticated || loading || loadingItems || items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="px-4 text-lg font-semibold md:px-8 md:text-xl lg:text-2xl">
        Continue Watching
      </h2>
      <div className="flex gap-2 overflow-x-scroll px-4 scrollbar-hide md:gap-3 md:px-8">
        {items.map((item) => (
          <div key={item.media_id} className="w-48 flex-shrink-0 md:w-64 lg:w-72">
            <ContinueWatchingCard
              item={item}
              onRemove={() => removeFromWatching(item.media_id, item.media_type)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

interface CardProps {
  item: ContinueWatchingItem;
  onRemove: () => void;
}

function ContinueWatchingCard({ item, onRemove }: CardProps) {
  const { movie, progress } = item;
  if (!movie) return null;

  return (
    <div className="group relative">
      <Link href={`/movie/${movie.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-md bg-netflix-gray">
          <Image
            src={movie.backdrop_path ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}` : getPosterUrl(movie.poster_path)}
            alt={movie.title}
            fill
            className="object-cover"
          />
          
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="rounded-full bg-white/90 p-3">
              <Play className="h-8 w-8 fill-black text-black" />
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
            <div 
              className="h-full bg-netflix-red" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-2">
          <h3 className="truncate text-sm font-medium">{movie.title}</h3>
          <p className="text-xs text-netflix-lightGray">{progress}% watched</p>
        </div>
      </Link>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 rounded-full bg-black/70 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
        aria-label="Remove from Continue Watching"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

