import type { TVShowDetails } from '@/lib/catalog';

import type { RecapGenerator, RecapGenerationRequest, GeneratedRecap } from './generator';
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
