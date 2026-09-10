import { describe, expect, test } from 'vitest';

import { getEpisodeById, getShowById } from '@/lib/catalog';

import type { AuthenticatedRecapContext } from './auth';
import type { RecapQuestionGenerationRequest, RecapQuestionGenerator } from './generator';
import {
  handleRecapQuestionRequest,
  type RecapQuestionEndpointDependencies,
} from './question-endpoint';
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

const generatorFor = (received: RecapQuestionGenerationRequest[]): RecapQuestionGenerator => ({
  answerQuestion: async (request) => {
    received.push(request);
    return {
      text: 'I cannot answer that from what you have watched yet.',
      provider: 'test',
      model: null,
    };
  },
});

const dependenciesFor = (
  context: AuthenticatedRecapContext,
  generator: RecapQuestionGenerator
): RecapQuestionEndpointDependencies => ({
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
  new Request('http://localhost/api/recap/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const completedProgressThroughEpisodeOne = [progressRow('user-1', episode(1, 1), true)];

describe('Catch Me Up follow-up question endpoint', () => {
  test.each([
    'Who dies later?',
    'What happens in the next episode?',
    'Who betrays the crew?',
    'Tell me what happens in Season 2.',
  ])('keeps adversarial question scope spoiler-safe: %s', async (question) => {
    const received: RecapQuestionGenerationRequest[] = [];
    const response = await handleRecapQuestionRequest(
      requestFor({
        showId: show.id,
        targetEpisodeId: episode(1, 2).id,
        question,
        plotEvents: [{ episode_id: episode(2, 3).id, event_text: 'client spoiler' }],
      }),
      dependenciesFor(contextFor(completedProgressThroughEpisodeOne), generatorFor(received))
    );

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].question).toBe(question);
    expect(received[0].events.every((event) => event.episode_id === episode(1, 1).id)).toBe(true);
    expect(received[0].events.some((event) => event.episode_id === episode(1, 2).id)).toBe(false);
    expect(received[0].events.some((event) => event.episode_id === episode(2, 3).id)).toBe(false);
  });

  test('excludes partial episodes and the target from the question context', async () => {
    const received: RecapQuestionGenerationRequest[] = [];
    await handleRecapQuestionRequest(
      requestFor({
        showId: show.id,
        targetEpisodeId: episode(1, 3).id,
        question: 'Why did Mara follow the signal?',
      }),
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

  test('does not call the provider when there is no completed progress', async () => {
    const received: RecapQuestionGenerationRequest[] = [];
    const response = await handleRecapQuestionRequest(
      requestFor({
        showId: show.id,
        targetEpisodeId: episode(1, 2).id,
        question: 'Who is Ilya?',
      }),
      dependenciesFor(contextFor([]), generatorFor(received))
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toContain('only answer from episodes you have completed');
    expect(received).toHaveLength(0);
  });

  test('requires authentication and validates the request', async () => {
    const dependencies = dependenciesFor(contextFor([]), generatorFor([]));
    dependencies.authenticate = async () => null;

    const unauthenticatedResponse = await handleRecapQuestionRequest(
      requestFor({
        showId: show.id,
        targetEpisodeId: episode(1, 2).id,
        question: 'Who is Ilya?',
      }),
      dependencies
    );
    expect(unauthenticatedResponse.status).toBe(401);

    dependencies.authenticate = async () => contextFor([]);
    const invalidRequest = await handleRecapQuestionRequest(
      requestFor({ showId: show.id, targetEpisodeId: episode(1, 2).id, question: '   ' }),
      dependencies
    );
    expect(invalidRequest.status).toBe(400);
  });
});
