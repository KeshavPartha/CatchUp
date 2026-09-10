import type { Episode, TVShowDetails } from '@/lib/catalog';
import type { Database } from '@/lib/supabase/database.types';

export type RecapWatchProgress = Pick<
  Database['public']['Tables']['watch_progress']['Row'],
  'user_id' | 'media_type' | 'show_id' | 'episode_id' | 'completed'
>;

export interface PlotEvent {
  id: string;
  show_id: number;
  season_id: string;
  season_number: number;
  episode_id: string;
  episode_number: number;
  event_order: number;
  event_text: string;
  involved_characters: string[];
  importance_score: number;
  tags: string[];
}

export interface RecapBoundary {
  showId: number;
  targetEpisodeId: string;
  boundaryEpisodeId: string | null;
  allowedEpisodeIds: string[];
}

export interface RecapBoundaryInput {
  userId: string;
  show: TVShowDetails;
  targetEpisode: Episode;
  progress: RecapWatchProgress[];
}

export interface PlotEventProgressReader {
  getWatchProgress(userId: string, showId: number): Promise<RecapWatchProgress[]>;
}

export interface SpoilerSafePlotEventResult {
  boundary: RecapBoundary;
  events: PlotEvent[];
}
