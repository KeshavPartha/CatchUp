import type { Episode, TVShowDetails } from '@/lib/catalog';

import { generateRecapFromSafeEvents } from './service';
import type { AuthenticatedRecapContext } from './auth';
import type { RecapGenerator } from './generator';
import type { SpoilerSafePlotEventResult } from './types';

interface RecapRequestBody {
  showId: number;
  targetEpisodeId: string;
}

export interface RecapRequestDependencies {
  authenticate(request: Request): Promise<AuthenticatedRecapContext | null>;
  getShow(showId: number): Promise<TVShowDetails | null>;
  getEpisode(episodeId: string): Promise<Episode | null>;
  supportsShow(show: TVShowDetails): boolean;
  retrieve(
    context: AuthenticatedRecapContext,
    show: TVShowDetails,
    targetEpisode: Episode
  ): Promise<SpoilerSafePlotEventResult>;
}

export interface RecapEndpointDependencies extends RecapRequestDependencies {
  generator: RecapGenerator;
}

const json = (body: object, status = 200): Response => Response.json(body, { status });

const parseBody = async (request: Request): Promise<RecapRequestBody | null> => {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) return null;

    const { showId, targetEpisodeId } = body as Partial<RecapRequestBody>;
    if (
      typeof showId !== 'number' ||
      !Number.isInteger(showId) ||
      typeof targetEpisodeId !== 'string' ||
      !targetEpisodeId.trim()
    ) {
      return null;
    }

    return { showId, targetEpisodeId: targetEpisodeId.trim() };
  } catch {
    return null;
  }
};

export const handleRecapRequest = async (
  request: Request,
  dependencies: RecapEndpointDependencies
): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'Only POST is supported for recap generation.' }, 405);
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
    return json({ error: 'Request body must include showId and targetEpisodeId.' }, 400);
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
    const generated = await generateRecapFromSafeEvents({
      generator: dependencies.generator,
      show,
      boundary: retrieved.boundary,
      events: retrieved.events,
    });

    return json({ recap: generated.text });
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

    return json({ error: 'Unable to generate recap.' }, 502);
  }
};
