import { createAnthropicRecapGenerator } from './providers/anthropic';
import { createOpenAIRecapGenerator } from './providers/openai';
import { RecapProviderNotConfiguredError } from './provider-errors';
import type { PlotEvent, RecapBoundary } from './types';

export interface RecapGenerationRequest {
  showName: string;
  boundary: RecapBoundary;
  events: PlotEvent[];
}

export interface GeneratedRecap {
  text: string;
  provider: string;
  model: string | null;
}

export interface RecapQuestionGenerationRequest {
  showName: string;
  boundary: RecapBoundary;
  events: PlotEvent[];
  question: string;
}

export interface GeneratedRecapAnswer {
  text: string;
  provider: string;
  model: string | null;
}

export interface RecapGenerator {
  generate(request: RecapGenerationRequest): Promise<GeneratedRecap>;
}

export interface RecapQuestionGenerator {
  answerQuestion(request: RecapQuestionGenerationRequest): Promise<GeneratedRecapAnswer>;
}

export type RecapProvider = RecapGenerator & RecapQuestionGenerator;

export const createRecapGeneratorFromEnvironment = (): RecapProvider => {
  const provider = process.env.CATCHUP_RECAP_PROVIDER ?? 'anthropic';

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        async generate(): Promise<GeneratedRecap> {
          throw new RecapProviderNotConfiguredError(
            'Set the server-only ANTHROPIC_API_KEY before generating a recap.'
          );
        },
        async answerQuestion() {
          throw new RecapProviderNotConfiguredError(
            'Set the server-only ANTHROPIC_API_KEY before answering recap questions.'
          );
        },
      };
    }

    return createAnthropicRecapGenerator(apiKey, process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5');
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        async generate(): Promise<GeneratedRecap> {
          throw new RecapProviderNotConfiguredError(
            'Set the server-only OPENAI_API_KEY before generating a recap.'
          );
        },
        async answerQuestion() {
          throw new RecapProviderNotConfiguredError(
            'Set the server-only OPENAI_API_KEY before answering recap questions.'
          );
        },
      };
    }

    return createOpenAIRecapGenerator(apiKey, process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }

  throw new RecapProviderNotConfiguredError(
    `Unsupported recap provider "${provider}". Configure CATCHUP_RECAP_PROVIDER=anthropic.`
  );
};
