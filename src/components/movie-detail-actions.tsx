'use client';

import { Plus, ThumbsUp, Check } from 'lucide-react';
import Link from 'next/link';
import { MovieDetails } from '@/lib/catalog';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';
import { useWatchProgress } from '@/hooks/use-watch-progress';

interface MovieDetailActionsProps {
  movie: MovieDetails;
}

export function MovieDetailActions({ movie }: MovieDetailActionsProps) {
  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();
  const { progress } = useWatchProgress(movie);
  const isInList = myList.some((item) => item.media_id === movie.id && item.media_type === 'movie');
  const liked = isLiked(movie.id, 'movie');
  const canResume = Boolean(progress && !progress.completed && progress.position_seconds > 0);

  const handleMyList = async () => {
    if (isInList) {
      await removeFromList(movie.id, 'movie');
    } else {
      await addToList(movie.id, 'movie');
    }
  };

  return (
    <div className="flex gap-3">
      <Link
        href={`/movie/${movie.id}/play`}
        className="flex items-center gap-2 rounded bg-white px-6 py-2 text-lg font-semibold text-black transition-colors hover:bg-white/90"
      >
        <span aria-hidden="true">▶</span>
        {canResume ? 'Resume' : 'Play'}
      </Link>
      <button
        onClick={handleMyList}
        className="flex items-center gap-2 rounded bg-white/20 px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors hover:bg-white/30"
      >
        {isInList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        {isInList ? 'In My List' : 'My List'}
      </button>
      <button
        onClick={() => toggleLike(movie.id, 'movie')}
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
