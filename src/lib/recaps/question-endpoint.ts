import type { AuthenticatedRecapContext } from './auth';
import type { RecapQuestionGenerator } from './generator';
import { answerRecapQuestionFromSafeEvents } from './service';
import type { SpoilerSafePlotEventResult } from './types';
import type { RecapRequestDependencies } from './endpoint';

interface RecapQuestionRequestBody {
  showId: number;
  targetEpisodeId: string;
  question: string;
}

export interface RecapQuestionEndpointDependencies extends RecapRequestDependencies {
  generator: RecapQuestionGenerator;
}

const json = (body: object, status = 200): Response => Response.json(body, { status });

const parseBody = async (request: Request): Promise<RecapQuestionRequestBody | null> => {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) return null;

    const { showId, targetEpisodeId, question } = body as Partial<RecapQuestionRequestBody>;
    const trimmedQuestion = typeof question === 'string' ? question.trim() : '';
    if (
      typeof showId !== 'number' ||
      !Number.isInteger(showId) ||
      typeof targetEpisodeId !== 'string' ||
      !targetEpisodeId.trim() ||
      !trimmedQuestion ||
      trimmedQuestion.length > 1000
    ) {
      return null;
    }

    return {
      showId,
      targetEpisodeId: targetEpisodeId.trim(),
      question: trimmedQuestion,
    };
  } catch {
    return null;
  }
};

export const handleRecapQuestionRequest = async (
  request: Request,
  dependencies: RecapQuestionEndpointDependencies
): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'Only POST is supported for recap questions.' }, 405);
  }

  let context: AuthenticatedRecapContext | null;
  try {
    context = await dependencies.authenticate(request);
  } catch {
    return json({ error: 'Authentication service is unavailable.' }, 503);
  }

  if (!context) {
    return json({ error: 'Authentication is required.' }, 401);
  }

  const body = await parseBody(request);
  if (!body) {
    return json(
      {
        error:
          'Request body must include showId, targetEpisodeId, and question (max 1000 characters).',
      },
      400
    );
  }

  const show = await dependencies.getShow(body.showId);
  if (!show) {
    return json({ error: 'Show not found.' }, 404);
  }

  if (!dependencies.supportsShow(show)) {
    return json({ error: 'Catch Me Up is currently available for Echoes of Orion only.' }, 422);
  }

  const targetEpisode = await dependencies.getEpisode(body.targetEpisodeId);
  if (!targetEpisode || targetEpisode.show_id !== show.id) {
    return json({ error: 'Target episode was not found for this show.' }, 404);
  }

  let retrieved: SpoilerSafePlotEventResult;
  try {
    retrieved = await dependencies.retrieve(context, show, targetEpisode);
  } catch {
    return json({ error: 'Unable to retrieve spoiler-safe recap context.' }, 500);
  }

  try {
    const generated = await answerRecapQuestionFromSafeEvents({
      generator: dependencies.generator,
      show,
      boundary: retrieved.boundary,
      events: retrieved.events,
      question: body.question,
    });

    return json({ answer: generated.text });
  } catch (error) {
    if (error instanceof Error && error.name === 'RecapProviderNotConfiguredError') {
      return json(
        {
          error: 'Recap generation is not configured on the server.',
          code: 'RECAP_PROVIDER_NOT_CONFIGURED',
        },
        503
      );
    }

    return json({ error: 'Unable to answer recap question.' }, 502);
  }
};
