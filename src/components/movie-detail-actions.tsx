'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, Plus, ThumbsUp, Check } from 'lucide-react';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';
import { TrailerModal } from './trailer-modal';

interface MovieDetailActionsProps {
  movieId: number;
  movieTitle: string;
  trailerKey: string | null;
}

export function MovieDetailActions({ movieId, movieTitle, trailerKey }: MovieDetailActionsProps) {
  const searchParams = useSearchParams();
  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();
  const [showTrailer, setShowTrailer] = useState(false);

  const isInList = myList.some(item => item.media_id === movieId && item.media_type === 'movie');
  const liked = isLiked(movieId, 'movie');
  const autoplay = searchParams.get('autoplay') === 'true';
  const hasTrailer = !!trailerKey;

  // Auto-play trailer if autoplay=true
  useEffect(() => {
    if (autoplay && hasTrailer) {
      setTimeout(() => {
        setShowTrailer(true);
      }, 500);
    }
  }, [autoplay, hasTrailer]);

  const handlePlay = () => {
    if (hasTrailer) {
      setShowTrailer(true);
    }
  };

  const handleMyList = async () => {
    if (isInList) {
      await removeFromList(movieId, 'movie');
    } else {
      await addToList(movieId, 'movie');
    }
  };

  const handleLike = async () => {
    await toggleLike(movieId, 'movie');
  };

  return (
    <>
      <div className="flex gap-3">
        <button
          onClick={handlePlay}
          disabled={!hasTrailer}
          className="flex items-center gap-2 rounded bg-white px-6 py-2 text-lg font-semibold text-black transition-colors hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="h-5 w-5 fill-current" />
          {hasTrailer ? 'Play Trailer' : 'No Trailer'}
        </button>
        <button
          onClick={handleMyList}
          className="flex items-center gap-2 rounded bg-white/20 px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors hover:bg-white/30"
        >
          {isInList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {isInList ? 'In My List' : 'My List'}
        </button>
        <button
          onClick={handleLike}
          className={`flex items-center gap-2 rounded px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors ${
            liked ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30'
          }`}
        >
          <ThumbsUp className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Trailer Modal */}
      {showTrailer && trailerKey && (
        <TrailerModal
          videoKey={trailerKey}
          title={movieTitle}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </>
  );
}

