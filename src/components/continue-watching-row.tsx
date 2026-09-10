'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, X } from 'lucide-react';
import { getEpisodeById, getTVShowDetails, Episode, TVShowDetails, getPosterUrl } from '@/lib/catalog';
import { ContinueWatchingItem, useContinueWatching } from '@/hooks/use-continue-watching';

interface ResolvedContinueItem extends ContinueWatchingItem {
  episode: Episode;
  show: TVShowDetails;
}

export function ContinueWatchingRow() {
  const { watchList, loading, removeFromWatching, isAuthenticated } = useContinueWatching();
  const [items, setItems] = useState<ResolvedContinueItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    let mounted = true;
    const resolveItems = async () => {
      if (watchList.length === 0) {
        setItems([]);
        return;
      }

      setLoadingItems(true);
      const resolved = await Promise.all(
        watchList.map(async (item) => {
          if (!item.episode_id || !item.show_id) return null;
          try {
            const [episode, show] = await Promise.all([
              getEpisodeById(item.episode_id),
              getTVShowDetails(Number(item.show_id)),
            ]);
            return { ...item, episode, show };
          } catch {
            return null;
          }
        })
      );
      if (mounted) {
        setItems(resolved.filter((item): item is ResolvedContinueItem => item !== null));
        setLoadingItems(false);
      }
    };

    void resolveItems();
    return () => {
      mounted = false;
    };
  }, [watchList]);

  if (!isAuthenticated || loading || loadingItems || items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-4 text-lg font-semibold md:px-8 md:text-xl lg:text-2xl">Continue Watching</h2>
      <div className="flex gap-2 overflow-x-scroll px-4 scrollbar-hide md:gap-3 md:px-8">
        {items.map((item) => (
          <div key={item.episode_id} className="w-56 flex-shrink-0 md:w-72">
            <ContinueWatchingCard
              item={item}
              onRemove={() => removeFromWatching(item.episode_id ?? '')}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ContinueWatchingCard({ item, onRemove }: { item: ResolvedContinueItem; onRemove: () => void }) {
  const { episode, show, progress_percent: progress } = item;

  return (
    <div className="group relative overflow-hidden rounded-md bg-netflix-gray">
      <Link href={`/tv/${show.id}/episode/${episode.id}`} className="block">
        <div className="relative aspect-video">
          <Image
            src={episode.still_path || getPosterUrl(show.poster_path)}
            alt={`${show.name} - ${episode.name}`}
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="rounded-full bg-white/90 p-3 text-black">
              <Play className="h-6 w-6 fill-current" />
            </div>
          </div>
        </div>
        <div className="space-y-1 p-3">
          <p className="truncate font-semibold">{show.name}</p>
          <p className="truncate text-sm text-netflix-lightGray">
            S{episode.season_number} E{episode.episode_number} · {episode.name}
          </p>
          <div className="h-1 w-full overflow-hidden rounded bg-netflix-darkGray">
            <div className="h-full bg-netflix-red" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-netflix-lightGray">{progress}% watched</p>
        </div>
      </Link>
      <button
        onClick={onRemove}
        aria-label={`Remove ${episode.name} from Continue Watching`}
        className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
