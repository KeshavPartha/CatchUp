'use client';

import { Episode } from '@/lib/catalog';
import { DemoPlayer } from '@/components/demo-player';

interface EpisodePlayerProps {
  episode: Episode;
  showName: string;
}

export function EpisodePlayer({ episode, showName }: EpisodePlayerProps) {
  return <DemoPlayer media={episode} title={showName} subtitle={episode.name} artwork={episode.still_path} />;
}
