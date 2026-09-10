'use client';

import { Plus, ThumbsUp, Check } from 'lucide-react';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';

interface MovieDetailActionsProps {
  movieId: number;
}

export function MovieDetailActions({ movieId }: MovieDetailActionsProps) {
  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();
  const isInList = myList.some((item) => item.media_id === movieId && item.media_type === 'movie');
  const liked = isLiked(movieId, 'movie');

  const handleMyList = async () => {
    if (isInList) {
      await removeFromList(movieId, 'movie');
    } else {
      await addToList(movieId, 'movie');
    }
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handleMyList}
        className="flex items-center gap-2 rounded bg-white/20 px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors hover:bg-white/30"
      >
        {isInList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        {isInList ? 'In My List' : 'My List'}
      </button>
      <button
        onClick={() => toggleLike(movieId, 'movie')}
        aria-label={liked ? 'Unlike' : 'Like'}
        className={`flex items-center gap-2 rounded px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors ${
          liked ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30'
        }`}
      >
        <ThumbsUp className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
        {liked ? 'Liked' : 'Like'}
      </button>
    </div>
  );
}
