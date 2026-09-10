import type { TVShowDetails } from '@/lib/catalog';

import type {
  GeneratedRecap,
  GeneratedRecapAnswer,
  RecapGenerationRequest,
  RecapGenerator,
  RecapQuestionGenerationRequest,
  RecapQuestionGenerator,
} from './generator';
import type { PlotEvent, RecapBoundary } from './types';

interface SafeRecapServiceRequest {
  generator: RecapGenerator;
  show: TVShowDetails;
  boundary: RecapBoundary;
  events: PlotEvent[];
}

export const generateRecapFromSafeEvents = async ({
  generator,
  show,
  boundary,
  events,
}: SafeRecapServiceRequest): Promise<GeneratedRecap> => {
  if (events.length === 0) {
    return {
      text: `You have not completed an episode of ${show.name} before this point yet. Watch an episode and Catch Me Up will be ready when you return.`,
      provider: 'none',
      model: null,
    };
  }

  const request: RecapGenerationRequest = {
    showName: show.name,
    boundary,
    events,
  };

  return generator.generate(request);
};

interface SafeRecapQuestionServiceRequest {
  generator: RecapQuestionGenerator;
  show: TVShowDetails;
  boundary: RecapBoundary;
  events: PlotEvent[];
  question: string;
}

export const answerRecapQuestionFromSafeEvents = async ({
  generator,
  show,
  boundary,
  events,
  question,
}: SafeRecapQuestionServiceRequest): Promise<GeneratedRecapAnswer> => {
  if (events.length === 0) {
    return {
      text: `I can only answer from episodes you have completed. You have not completed an episode of ${show.name} before this point yet.`,
      provider: 'none',
      model: null,
    };
  }

  const request: RecapQuestionGenerationRequest = {
    showName: show.name,
    boundary,
    events,
    question,
  };

  return generator.answerQuestion(request);
};
