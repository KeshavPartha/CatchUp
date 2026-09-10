'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Plus, Check, ThumbsUp, ChevronDown } from 'lucide-react';
import { TVShow } from '@/lib/tmdb';
import { getPosterUrl } from '@/lib/tmdb';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useMyList } from '@/hooks/use-my-list';
import { useLikedItems } from '@/hooks/use-liked-items';

interface TVShowCardProps {
  show: TVShow;
  priority?: boolean;
}

export function TVShowCard({ show, priority = false }: TVShowCardProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { myList, addToList, removeFromList } = useMyList();
  const { isLiked, toggleLike } = useLikedItems();

  const inList = myList.some(item => item.media_id === show.id && item.media_type === 'tv');
  const liked = isLiked(show.id, 'tv');

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/tv/${show.id}?autoplay=true`);
  };

  const handleAddToList = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inList) {
      await removeFromList(show.id, 'tv');
    } else {
      await addToList(show.id, 'tv');
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleLike(show.id, 'tv');
  };

  const handleMoreInfo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/tv/${show.id}`);
  };

  return (
    <Link
      href={`/tv/${show.id}`}
      className="group relative block w-full cursor-pointer transition-transform duration-300 hover:scale-110 hover:z-10 active:scale-105"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setTimeout(() => setIsHovered(false), 2000)}
    >
      {/* TV Show Poster - using explicit width/height instead of fill */}
      <div className="relative w-full overflow-hidden rounded-md bg-netflix-gray">
        <Image
          src={imageError ? '/placeholder-movie.jpg' : getPosterUrl(show.poster_path)}
          alt={show.name}
          width={500}
          height={750}
          className="h-auto w-full object-cover"
          priority={priority}
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          onError={() => setImageError(true)}
        />

        {/* Hover Overlay */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-end rounded-md bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 opacity-0 transition-opacity duration-300',
            isHovered && 'opacity-100'
          )}
        >
          {/* Action Buttons */}
          <div className="mb-2 flex gap-1">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black hover:bg-white/80 transition-colors"
              aria-label="Play"
              onClick={handlePlay}
            >
              <Play className="h-3 w-3 fill-current" />
            </button>
            <button
              onClick={handleAddToList}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border-2 text-white transition-colors",
                inList
                  ? "border-white bg-white/20 hover:bg-white/30"
                  : "border-white/50 hover:border-white"
              )}
              aria-label={inList ? "Remove from My List" : "Add to My List"}
            >
              {inList ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </button>
            <button
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border-2 text-white transition-colors",
                liked
                  ? "border-white bg-white/20 hover:bg-white/30"
                  : "border-white/50 hover:border-white"
              )}
              aria-label={liked ? "Unlike" : "Like"}
              onClick={handleLike}
            >
              <ThumbsUp className={cn("h-3 w-3", liked && "fill-current")} />
            </button>
            <button
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/50 text-white hover:border-white transition-colors"
              aria-label="More Info"
              onClick={handleMoreInfo}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* TV Show Info */}
          <div className="space-y-1">
            <h3 className="line-clamp-1 text-xs font-semibold">{show.name}</h3>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-green-500 font-semibold">
                {Math.round(show.vote_average * 10)}% Match
              </span>
              <span className="text-netflix-lightGray">
                {show.first_air_date?.split('-')[0] || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

