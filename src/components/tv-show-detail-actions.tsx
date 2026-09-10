'use client';

import Link from 'next/link';
import { Plus, ThumbsUp, Check } from 'lucide-react';
import { Episode } from '@/lib/catalog';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';
import { useShowPlaybackTarget } from '@/hooks/use-show-playback-target';
import { RecommendButton } from '@/components/social/recommend-button';
import { ShareProgressControl } from '@/components/social/share-progress-control';
import { FriendProgressStrip } from '@/components/social/friend-progress-strip';

interface TVShowDetailActionsProps {
  showId: number;
  showName: string;
  episodes: Episode[];
}

export function TVShowDetailActions({ showId, showName, episodes }: TVShowDetailActionsProps) {
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

  // watch_progress stores show_id as text, so the social layer keys on the same
  // string. Converting here keeps that conversion in one place.
  const showKey = String(showId);

  return (
    <>
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
      <RecommendButton mediaId={showId} mediaType="tv" title={showName} />
      <ShareProgressControl showId={showKey} title={showName} />
    </div>

    {/* Only renders when a friend has explicitly shared this show. */}
    <FriendProgressStrip showId={showKey} />
    </>
  );
}
