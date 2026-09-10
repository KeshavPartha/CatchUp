import { afterEach, describe, expect, test, vi } from 'vitest';

import { ECHOES_OF_ORION_PLOT_EVENTS } from '../demo-plot-events';
import { createRecapGeneratorFromEnvironment, type RecapGenerationRequest } from '../generator';

const request: RecapGenerationRequest = {
  showName: 'Echoes of Orion',
  boundary: {
    showId: 1001,
    targetEpisodeId: 'show-1001-s1-e2',
    boundaryEpisodeId: 'show-1001-s1-e1',
    allowedEpisodeIds: ['show-1001-s1-e1'],
  },
  events: [ECHOES_OF_ORION_PLOT_EVENTS[0]],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Anthropic recap provider', () => {
  test('uses the Messages API and sends only the supplied safe events', async () => {
    vi.stubEnv('CATCHUP_RECAP_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-test-model');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'The crew follows an impossible signal.' }],
        }),
        { status: 200 }
      )
    );

    const generator = createRecapGeneratorFromEnvironment();
    const result = await generator.generate(request);
    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ content: string }>;
    };

    expect(result).toEqual({
      text: 'The crew follows an impossible signal.',
      provider: 'anthropic',
      model: 'claude-test-model',
    });
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options?.headers).toMatchObject({
      'x-api-key': 'test-anthropic-key',
      'anthropic-version': '2023-06-01',
    });
    expect(body.model).toBe('claude-test-model');
    expect(body.max_tokens).toBe(300);
    expect(body.system).toContain('only the supplied plot events');
    expect(body.messages[0].content).toContain('show-1001-s1-e1');
    expect(body.messages[0].content).not.toContain('show-1001-s1-e2');
  });

  test('defaults to Anthropic without requiring an OpenAI key', async () => {
    const originalProvider = process.env.CATCHUP_RECAP_PROVIDER;
    delete process.env.CATCHUP_RECAP_PROVIDER;
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'Safe recap.' }] }), {
        status: 200,
      })
    );

    try {
      const generator = createRecapGeneratorFromEnvironment();
      const result = await generator.generate(request);

      expect(result.provider).toBe('anthropic');
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      if (originalProvider === undefined) {
        delete process.env.CATCHUP_RECAP_PROVIDER;
      } else {
        process.env.CATCHUP_RECAP_PROVIDER = originalProvider;
      }
    }
  });

  test('reports a clear configuration error when the Anthropic key is missing', async () => {
    vi.stubEnv('CATCHUP_RECAP_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const generator = createRecapGeneratorFromEnvironment();

    await expect(generator.generate(request)).rejects.toThrow('ANTHROPIC_API_KEY');
  });
});
