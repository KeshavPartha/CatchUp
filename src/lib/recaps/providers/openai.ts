import type { GeneratedRecap, RecapGenerationRequest, RecapGenerator } from '../generator';
import { RecapProviderRequestError } from '../provider-errors';

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

const isOpenAIChatResponse = (value: unknown): value is OpenAIChatResponse =>
  typeof value === 'object' && value !== null && 'choices' in value;

const safeEventPayload = (events: RecapGenerationRequest['events']) =>
  events.map((event) => ({
    episode_id: event.episode_id,
    episode_number: event.episode_number,
    event_order: event.event_order,
    event_text: event.event_text,
    involved_characters: event.involved_characters,
    importance_score: event.importance_score,
    tags: event.tags,
  }));

export const createOpenAIRecapGenerator = (apiKey: string, model: string): RecapGenerator => ({
  async generate({ showName, boundary, events }): Promise<GeneratedRecap> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content:
              'You write concise streaming recaps. Use only the supplied plot events. Do not infer, invent, or mention any information not present in those events. Prioritize important plot developments and character relationships. Return plain text only, with no episode-by-episode narration.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              show: showName,
              recap_boundary_episode_id: boundary.boundaryEpisodeId,
              plot_events: safeEventPayload(events),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new RecapProviderRequestError(
        'The configured OpenAI provider could not generate a recap.'
      );
    }

    const payload: unknown = await response.json();
    const text = isOpenAIChatResponse(payload) ? payload.choices?.[0]?.message?.content : undefined;

    if (typeof text !== 'string' || !text.trim()) {
      throw new RecapProviderRequestError(
        'The configured OpenAI provider returned an empty response.'
      );
    }

    return {
      text: text.trim(),
      provider: 'openai',
      model,
    };
  },
});
