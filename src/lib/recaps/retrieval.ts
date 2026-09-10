import type { SupabaseClient } from '@supabase/supabase-js';

import type { Episode, TVShowDetails } from '@/lib/catalog';
import type { Database } from '@/lib/supabase/database.types';

import { DEMO_PLOT_EVENTS } from './demo-plot-events';
import { determineRecapBoundary } from './spoiler-boundary';
import type {
  PlotEvent,
  PlotEventProgressReader,
  RecapWatchProgress,
  SpoilerSafePlotEventResult,
} from './types';

export interface SpoilerSafePlotEventRequest {
  userId: string;
  show: TVShowDetails;
  targetEpisode: Episode;
  progressReader: PlotEventProgressReader;
  plotEvents?: PlotEvent[];
}

const episodeOrder = (show: TVShowDetails): Map<string, number> =>
  new Map(
    show.seasons
      .slice()
      .sort((a, b) => a.season_number - b.season_number)
      .flatMap((season) =>
        season.episodes.slice().sort((a, b) => a.episode_number - b.episode_number)
      )
      .map((episode, index) => [episode.id, index])
  );

export const retrieveSpoilerSafePlotEvents = async ({
  userId,
  show,
  targetEpisode,
  progressReader,
  plotEvents = DEMO_PLOT_EVENTS,
}: SpoilerSafePlotEventRequest): Promise<SpoilerSafePlotEventResult> => {
  const progress = await progressReader.getWatchProgress(userId, show.id);
  const boundary = determineRecapBoundary({ userId, show, targetEpisode, progress });
  const allowedEpisodeIds = new Set(boundary.allowedEpisodeIds);
  const order = episodeOrder(show);

  const events = plotEvents
    .filter((event) => event.show_id === show.id && allowedEpisodeIds.has(event.episode_id))
    .sort(
      (a, b) =>
        (order.get(a.episode_id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.episode_id) ?? Number.MAX_SAFE_INTEGER) || a.event_order - b.event_order
    );

  return { boundary, events };
};

export const createSupabaseProgressReader = (
  supabase: SupabaseClient<Database>
): PlotEventProgressReader => ({
  async getWatchProgress(userId, showId): Promise<RecapWatchProgress[]> {
    const { data, error } = await supabase
      .from('watch_progress')
      .select('user_id,media_type,show_id,episode_id,completed')
      .eq('user_id', userId)
      .eq('media_type', 'tv')
      .eq('show_id', String(showId));

    if (error) {
      throw new Error('Unable to load watch progress for recap retrieval.');
    }

    return data ?? [];
  },
});
