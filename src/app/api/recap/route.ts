import { getEpisodeById, getTVShowDetails } from '@/lib/catalog';
import { authenticateRecapRequest } from '@/lib/recaps/auth';
import { handleRecapRequest } from '@/lib/recaps/endpoint';
import { createRecapGeneratorFromEnvironment, type RecapGenerator } from '@/lib/recaps/generator';
import { retrieveSpoilerSafePlotEvents } from '@/lib/recaps/retrieval';

export async function POST(request: Request): Promise<Response> {
  const generator: RecapGenerator = {
    generate: (input) => createRecapGeneratorFromEnvironment().generate(input),
  };

  return handleRecapRequest(request, {
    authenticate: authenticateRecapRequest,
    getShow: async (showId) => {
      try {
        return await getTVShowDetails(showId);
      } catch {
        return null;
      }
    },
    getEpisode: async (episodeId) => {
      try {
        return await getEpisodeById(episodeId);
      } catch {
        return null;
      }
    },
    supportsShow: (show) => show.id === 1001,
    retrieve: (context, show, targetEpisode) =>
      retrieveSpoilerSafePlotEvents({
        userId: context.userId,
        show,
        targetEpisode,
        progressReader: context.progressReader,
      }),
    generator,
  });
}
