import { describe, expect, test } from 'vitest';

import { getShowById } from '@/lib/catalog';

import { determineRecapBoundary } from './spoiler-boundary';
import { retrieveSpoilerSafePlotEvents } from './retrieval';
import type { PlotEventProgressReader, RecapWatchProgress } from './types';

const show = getShowById(1001);

if (!show) {
  throw new Error('Echoes of Orion demo show is missing.');
}

const episodes = show.seasons.flatMap((season) => season.episodes);
const episode = (seasonNumber: number, episodeNumber: number) =>
  episodes.find(
    (item) => item.season_number === seasonNumber && item.episode_number === episodeNumber
  )!;

const progressRow = (
  userId: string,
  targetEpisode: ReturnType<typeof episode>,
  completed: boolean
): RecapWatchProgress => ({
  user_id: userId,
  media_type: 'tv',
  show_id: String(show.id),
  episode_id: targetEpisode.id,
  completed,
});

const readerFor = (rows: RecapWatchProgress[]): PlotEventProgressReader => ({
  getWatchProgress: async () => rows,
});

describe('episode-based spoiler boundaries', () => {
  test('returns an empty valid scope when there is no watch progress', () => {
    const result = determineRecapBoundary({
      userId: 'user-1',
      show,
      targetEpisode: episode(1, 1),
      progress: [],
    });

    expect(result.boundaryEpisodeId).toBeNull();
    expect(result.allowedEpisodeIds).toEqual([]);
  });

  test('allows a completed prior episode', async () => {
    const result = await retrieveSpoilerSafePlotEvents({
      userId: 'user-1',
      show,
      targetEpisode: episode(1, 2),
      progressReader: readerFor([progressRow('user-1', episode(1, 1), true)]),
    });

    expect(result.boundary.boundaryEpisodeId).toBe(episode(1, 1).id);
    expect(result.events.every((event) => event.episode_id === episode(1, 1).id)).toBe(true);
  });

  test('includes multiple completed episodes and excludes the target', async () => {
    const result = await retrieveSpoilerSafePlotEvents({
      userId: 'user-1',
      show,
      targetEpisode: episode(1, 3),
      progressReader: readerFor([
        progressRow('user-1', episode(1, 1), true),
        progressRow('user-1', episode(1, 2), true),
        progressRow('user-1', episode(1, 3), true),
      ]),
    });

    expect(result.boundary.allowedEpisodeIds).toEqual([episode(1, 1).id, episode(1, 2).id]);
    expect(result.events.some((event) => event.episode_id === episode(1, 3).id)).toBe(false);
  });

  test('does not make a partially watched episode eligible', async () => {
    const result = await retrieveSpoilerSafePlotEvents({
      userId: 'user-1',
      show,
      targetEpisode: episode(1, 2),
      progressReader: readerFor([progressRow('user-1', episode(1, 1), false)]),
    });

    expect(result.boundary.boundaryEpisodeId).toBeNull();
    expect(result.events).toEqual([]);
  });

  test('never returns later episodes even when their progress is completed', async () => {
    const result = await retrieveSpoilerSafePlotEvents({
      userId: 'user-1',
      show,
      targetEpisode: episode(1, 2),
      progressReader: readerFor([
        progressRow('user-1', episode(1, 1), true),
        progressRow('user-1', episode(1, 2), true),
        progressRow('user-1', episode(1, 3), true),
        progressRow('user-1', episode(2, 1), true),
      ]),
    });

    expect(result.events.map((event) => event.episode_id)).not.toContain(episode(1, 3).id);
    expect(result.events.map((event) => event.episode_id)).not.toContain(episode(2, 1).id);
  });

  test('supports a target in a later season and includes completed prior-season episodes', async () => {
    const result = await retrieveSpoilerSafePlotEvents({
      userId: 'user-1',
      show,
      targetEpisode: episode(2, 2),
      progressReader: readerFor([
        progressRow('user-1', episode(1, 1), true),
        progressRow('user-1', episode(1, 2), true),
        progressRow('user-1', episode(1, 3), true),
        progressRow('user-1', episode(2, 1), true),
      ]),
    });

    expect(result.boundary.boundaryEpisodeId).toBe(episode(2, 1).id);
    expect(result.boundary.allowedEpisodeIds).toEqual(episodes.slice(0, 4).map((item) => item.id));
    expect(
      result.events.every(
        (event) => event.episode_id !== episode(2, 2).id && event.episode_id !== episode(2, 3).id
      )
    ).toBe(true);
  });

  test('isolates progress to the requesting user', async () => {
    const result = await retrieveSpoilerSafePlotEvents({
      userId: 'user-1',
      show,
      targetEpisode: episode(1, 3),
      progressReader: readerFor([
        progressRow('other-user', episode(1, 1), true),
        progressRow('user-1', episode(1, 1), true),
        progressRow('other-user', episode(1, 2), true),
      ]),
    });

    expect(result.boundary.allowedEpisodeIds).toEqual([episode(1, 1).id]);
    expect(result.events.every((event) => event.episode_id === episode(1, 1).id)).toBe(true);
  });
});
