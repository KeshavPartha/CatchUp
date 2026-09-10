'use client';

import Link from 'next/link';
import { Play, Plus, ThumbsUp, Check } from 'lucide-react';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';

interface TVShowDetailActionsProps {
  showId: number;
  firstEpisodeId?: string;
}

export function TVShowDetailActions({ showId, firstEpisodeId }: TVShowDetailActionsProps) {
  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();
  const isInList = myList.some((item) => item.media_id === showId && item.media_type === 'tv');
  const liked = isLiked(showId, 'tv');

  const handleAddToList = async () => {
    if (isInList) {
      await removeFromList(showId, 'tv');
    } else {
      await addToList(showId, 'tv');
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {firstEpisodeId && (
        <Link
          href={`/tv/${showId}/episode/${firstEpisodeId}`}
          className="flex items-center gap-2 rounded bg-white px-6 py-2 text-lg font-semibold text-black transition-colors hover:bg-white/90"
        >
          <Play className="h-5 w-5 fill-current" />
          Start Watching
        </Link>
      )}
      <button
        onClick={handleAddToList}
        className={`flex items-center gap-2 rounded px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors ${
          isInList ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30'
        }`}
      >
        {isInList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        {isInList ? 'In My List' : 'My List'}
      </button>
      <button
        onClick={() => toggleLike(showId, 'tv')}
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
