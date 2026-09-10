'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, Plus, ThumbsUp, Check } from 'lucide-react';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';
import { TrailerModal } from './trailer-modal';

interface TVShowDetailActionsProps {
  showId: number;
  showTitle: string;
  trailerKey: string | null;
}

export function TVShowDetailActions({ showId, showTitle, trailerKey }: TVShowDetailActionsProps) {
  const searchParams = useSearchParams();
  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();
  const [showTrailer, setShowTrailer] = useState(false);
  
  const isInList = myList.some(item => item.media_id === showId && item.media_type === 'tv');
  const liked = isLiked(showId, 'tv');
  const autoplay = searchParams.get('autoplay') === 'true';
  const hasTrailer = !!trailerKey;

  // Auto-open trailer if autoplay is true
  useEffect(() => {
    if (autoplay && hasTrailer) {
      setShowTrailer(true);
    }
  }, [autoplay, hasTrailer]);

  const handlePlay = () => {
    if (hasTrailer) {
      setShowTrailer(true);
    }
  };

  const handleAddToList = async () => {
    if (isInList) {
      await removeFromList(showId, 'tv');
    } else {
      await addToList(showId, 'tv');
    }
  };

  const handleLike = async () => {
    await toggleLike(showId, 'tv');
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button 
          onClick={handlePlay}
          disabled={!hasTrailer}
          className="flex items-center gap-2 rounded bg-white px-6 py-2 text-lg font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="h-5 w-5 fill-current" />
          {hasTrailer ? 'Play Trailer' : 'No Trailer'}
        </button>
        <button 
          onClick={handleAddToList}
          className={`flex items-center gap-2 rounded px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors ${
            isInList ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30'
          }`}
        >
          {isInList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          My List
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

      {showTrailer && trailerKey && (
        <TrailerModal
          videoKey={trailerKey}
          title={showTitle}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </>
  );
}

