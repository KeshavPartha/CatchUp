import type { NarrativeExtractionProvider } from '../types';

interface AnthropicMessageResponse {
  content?: Array<{
    type?: unknown;
    text?: unknown;
  }>;
}

const isAnthropicMessageResponse = (value: unknown): value is AnthropicMessageResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const content = (value as { content?: unknown }).content;
  return Array.isArray(content);
};

export class NarrativeIngestionProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeIngestionProviderError';
  }
}

export const createAnthropicNarrativeExtractionProvider = (
  apiKey: string,
  model: string
): NarrativeExtractionProvider => ({
  async extractEvents({
    showName,
    seasonNumber,
    episodeNumber,
    transcriptChunk,
    chunkIndex,
    totalChunks,
  }): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        system:
          'You extract meaningful narrative events for CatchUp from an episode transcript. Return strict JSON only in the shape {"events":[{"event_text":"...","involved_characters":["..."],"importance_score":0.0,"tags":["..."]}]}. Include only meaningful plot developments, revelations, decisions, conflicts, relationship changes, or setup that will matter for later context. Exclude greetings, routine dialogue, trivia, and repeated wording. Use only facts stated in this transcript chunk. Do not infer or invent events. importance_score must be between 0 and 1. Keep event_text concise and self-contained. If the chunk contains no meaningful events, return {"events":[]}.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              show: showName,
              season_number: seasonNumber,
              episode_number: episodeNumber,
              chunk: `${chunkIndex + 1} of ${totalChunks}`,
              transcript: transcriptChunk,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new NarrativeIngestionProviderError(
        'The configured Anthropic provider could not extract narrative events.'
      );
    }

    const payload: unknown = await response.json();
    const text = isAnthropicMessageResponse(payload)
      ? payload.content
          ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text as string)
          .join('\n')
      : undefined;

    if (!text?.trim()) {
      throw new NarrativeIngestionProviderError(
        'The Anthropic provider returned no narrative extraction output.'
      );
    }

    return text.trim();
  },
});

export const createNarrativeExtractionProviderFromEnvironment = (): NarrativeExtractionProvider => {
  const provider = process.env.CATCHUP_RECAP_PROVIDER ?? 'anthropic';
  if (provider !== 'anthropic') {
    throw new NarrativeIngestionProviderError(
      `Narrative ingestion currently supports the Anthropic provider only; configure CATCHUP_RECAP_PROVIDER=anthropic (received "${provider}").`
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new NarrativeIngestionProviderError(
      'Set the server-only ANTHROPIC_API_KEY before running narrative ingestion.'
    );
  }

  return createAnthropicNarrativeExtractionProvider(
    apiKey,
    process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'
  );
};
