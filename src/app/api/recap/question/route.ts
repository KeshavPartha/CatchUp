import { getEpisodeById, getTVShowDetails } from '@/lib/catalog';
import { authenticateRecapRequest } from '@/lib/recaps/auth';
import type { RecapProvider } from '@/lib/recaps/generator';
import { createRecapGeneratorFromEnvironment } from '@/lib/recaps/generator';
import {
  handleRecapQuestionRequest,
  type RecapQuestionEndpointDependencies,
} from '@/lib/recaps/question-endpoint';
import { retrieveSpoilerSafePlotEvents } from '@/lib/recaps/retrieval';

export async function POST(request: Request): Promise<Response> {
  const generator: RecapProvider = {
    generate: (input) => createRecapGeneratorFromEnvironment().generate(input),
    answerQuestion: (input) => createRecapGeneratorFromEnvironment().answerQuestion(input),
  };

  const dependencies: RecapQuestionEndpointDependencies = {
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
  };

  return handleRecapQuestionRequest(request, dependencies);
}
