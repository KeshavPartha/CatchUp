import { describe, expect, test } from 'vitest';

import { getEpisodeById, getShowById } from '@/lib/catalog';

import type { AuthenticatedRecapContext } from './auth';
import { handleRecapRequest, type RecapEndpointDependencies } from './endpoint';
import type { RecapGenerationRequest, RecapGenerator } from './generator';
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

const contextFor = (rows: RecapWatchProgress[]): AuthenticatedRecapContext => ({
  userId: 'user-1',
  progressReader: readerFor(rows),
});

const generatorFor = (received: RecapGenerationRequest[]): RecapGenerator => ({
  generate: async (request) => {
    received.push(request);
    return {
      text: 'A safe demo recap.',
      provider: 'test',
      model: null,
    };
  },
});

const dependenciesFor = (
  context: AuthenticatedRecapContext,
  generator: RecapGenerator
): RecapEndpointDependencies => ({
  authenticate: async () => context,
  getShow: async (showId) => (showId === show.id ? show : null),
  getEpisode: async (episodeId) => {
    try {
      return await getEpisodeById(episodeId);
    } catch {
      return null;
    }
  },
  supportsShow: () => true,
  retrieve: (authenticatedContext, requestedShow, targetEpisode) =>
    retrieveSpoilerSafePlotEvents({
      userId: authenticatedContext.userId,
      show: requestedShow,
      targetEpisode,
      progressReader: authenticatedContext.progressReader,
    }),
  generator,
});

const requestFor = (body: unknown): Request =>
  new Request('http://localhost/api/recap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Catch Me Up recap endpoint', () => {
  test('passes only safe completed-prior events to generation', async () => {
    const received: RecapGenerationRequest[] = [];
    const response = await handleRecapRequest(
      requestFor({
        showId: show.id,
        targetEpisodeId: episode(1, 2).id,
        plotEvents: [{ episode_id: episode(2, 3).id, event_text: 'client-supplied spoiler' }],
      }),
      dependenciesFor(
        contextFor([
          progressRow('user-1', episode(1, 1), true),
          progressRow('user-1', episode(1, 2), true),
          progressRow('user-1', episode(1, 3), true),
          progressRow('user-1', episode(2, 1), true),
        ]),
        generatorFor(received)
      )
    );

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].events.every((event) => event.episode_id === episode(1, 1).id)).toBe(true);
    expect(received[0].events.some((event) => event.episode_id === episode(1, 2).id)).toBe(false);
    expect(received[0].events.some((event) => event.episode_id === episode(2, 1).id)).toBe(false);
  });

  test('excludes a partially watched episode from generation', async () => {
    const received: RecapGenerationRequest[] = [];
    await handleRecapRequest(
      requestFor({ showId: show.id, targetEpisodeId: episode(1, 3).id }),
      dependenciesFor(
        contextFor([
          progressRow('user-1', episode(1, 1), true),
          progressRow('user-1', episode(1, 2), false),
          progressRow('user-1', episode(1, 3), true),
          progressRow('user-1', episode(2, 1), true),
        ]),
        generatorFor(received)
      )
    );

    expect(received[0].events.every((event) => event.episode_id === episode(1, 1).id)).toBe(true);
  });

  test('handles a user with no progress without calling the provider', async () => {
    const received: RecapGenerationRequest[] = [];
    const response = await handleRecapRequest(
      requestFor({ showId: show.id, targetEpisodeId: episode(1, 1).id }),
      dependenciesFor(contextFor([]), generatorFor(received))
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recap).toContain('You have not completed an episode');
    expect(received).toHaveLength(0);
  });

  test('requires authentication', async () => {
    const dependencies = dependenciesFor(contextFor([]), generatorFor([]));
    dependencies.authenticate = async () => null;

    const response = await handleRecapRequest(
      requestFor({ showId: show.id, targetEpisodeId: episode(1, 1).id }),
      dependencies
    );

    expect(response.status).toBe(401);
  });

  test('handles invalid show and episode requests cleanly', async () => {
    const dependencies = dependenciesFor(contextFor([]), generatorFor([]));

    const invalidShowResponse = await handleRecapRequest(
      requestFor({ showId: 9999, targetEpisodeId: episode(1, 1).id }),
      dependencies
    );
    const invalidEpisodeResponse = await handleRecapRequest(
      requestFor({ showId: show.id, targetEpisodeId: 'not-an-episode' }),
      dependencies
    );

    expect(invalidShowResponse.status).toBe(404);
    expect(invalidEpisodeResponse.status).toBe(404);
  });
});
