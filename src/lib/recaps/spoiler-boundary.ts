import type { Episode, TVShowDetails } from '@/lib/catalog';

import type { RecapBoundary, RecapBoundaryInput, RecapWatchProgress } from './types';

const orderedEpisodes = (show: TVShowDetails): Episode[] =>
  show.seasons
    .slice()
    .sort((a, b) => a.season_number - b.season_number)
    .flatMap((season) =>
      season.episodes.slice().sort((a, b) => a.episode_number - b.episode_number)
    );

const isCompletedEpisodeForUser = (
  progress: RecapWatchProgress,
  userId: string,
  showId: number
): boolean =>
  progress.user_id === userId &&
  progress.media_type === 'tv' &&
  progress.show_id === String(showId) &&
  progress.episode_id !== null &&
  progress.completed;

export const determineRecapBoundary = ({
  userId,
  show,
  targetEpisode,
  progress,
}: RecapBoundaryInput): RecapBoundary => {
  if (targetEpisode.show_id !== show.id) {
    throw new Error('Target episode does not belong to the requested show.');
  }

  const episodes = orderedEpisodes(show);
  const targetIndex = episodes.findIndex((episode) => episode.id === targetEpisode.id);

  if (targetIndex === -1) {
    throw new Error('Target episode is not part of the requested show catalog.');
  }

  const completedEpisodeIds = new Set(
    progress
      .filter((row) => isCompletedEpisodeForUser(row, userId, show.id))
      .map((row) => row.episode_id)
  );
  const allowedEpisodeIds = episodes
    .slice(0, targetIndex)
    .filter((episode) => completedEpisodeIds.has(episode.id))
    .map((episode) => episode.id);

  return {
    showId: show.id,
    targetEpisodeId: targetEpisode.id,
    boundaryEpisodeId: allowedEpisodeIds.at(-1) ?? null,
    allowedEpisodeIds,
  };
};
