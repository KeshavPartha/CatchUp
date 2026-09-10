'use client';

import Link from 'next/link';
import { Plus, ThumbsUp, Check } from 'lucide-react';
import { Episode } from '@/lib/catalog';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';
import { useShowPlaybackTarget } from '@/hooks/use-show-playback-target';

interface TVShowDetailActionsProps {
  showId: number;
  episodes: Episode[];
}

export function TVShowDetailActions({ showId, episodes }: TVShowDetailActionsProps) {
  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();
  const { targetEpisode, isResume } = useShowPlaybackTarget(showId, episodes);
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
      {targetEpisode && (
        <Link
          href={`/tv/${showId}/episode/${targetEpisode.id}`}
          className="flex items-center gap-2 rounded bg-white px-6 py-2 text-lg font-semibold text-black transition-colors hover:bg-white/90"
        >
          <span aria-hidden="true">▶</span>
          {isResume ? 'Resume' : 'Play'}
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
