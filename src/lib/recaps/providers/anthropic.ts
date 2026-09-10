import type { GeneratedRecap, RecapGenerationRequest, RecapGenerator } from '../generator';
import { RecapProviderRequestError } from '../provider-errors';

interface AnthropicMessageResponse {
  content?: Array<{
    type?: unknown;
    text?: unknown;
  }>;
}

const isAnthropicMessageResponse = (value: unknown): value is AnthropicMessageResponse =>
  typeof value === 'object' && value !== null && 'content' in value;

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

export const createAnthropicRecapGenerator = (apiKey: string, model: string): RecapGenerator => ({
  async generate({ showName, boundary, events }): Promise<GeneratedRecap> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system:
          'You write concise streaming recaps for CatchUp. Use only the supplied plot events. Do not invent, infer, or mention any information not present in those events. Never infer future plot information. Prioritize important plot developments and character relationships. Return plain text only, without episode-by-episode narration.',
        messages: [
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
        'The configured Anthropic provider could not generate a recap.'
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
      throw new RecapProviderRequestError(
        'The configured Anthropic provider returned an empty response.'
      );
    }

    return {
      text: text.trim(),
      provider: 'anthropic',
      model,
    };
  },
});
