import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createAnthropicNarrativeExtractionProvider,
  createNarrativeExtractionProviderFromEnvironment,
} from './anthropic';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Anthropic narrative extraction provider', () => {
  test('uses the Messages API and sends transcript context without watch progress', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{"events":[]}' }],
        }),
        { status: 200 }
      )
    );
    const provider = createAnthropicNarrativeExtractionProvider(
      'test-anthropic-key',
      'claude-test-model'
    );

    await expect(
      provider.extractEvents({
        showId: 1001,
        showName: 'Echoes of Orion',
        seasonId: 'show-1001-s1',
        seasonNumber: 1,
        episodeId: 'show-1001-s1-e1',
        episodeNumber: 1,
        transcriptChunk: 'Mara follows the repeating signal.',
        chunkIndex: 0,
        totalChunks: 1,
      })
    ).resolves.toBe('{"events":[]}');

    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body)) as {
      model: string;
      messages: Array<{ content: string }>;
    };

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options?.headers).toMatchObject({
      'x-api-key': 'test-anthropic-key',
      'anthropic-version': '2023-06-01',
    });
    expect(body.model).toBe('claude-test-model');
    expect(body.messages[0].content).toContain('Mara follows the repeating signal.');
    expect(body.messages[0].content).not.toContain('watch_progress');
    expect(body.messages[0].content).not.toContain('completed');
  });

  test('uses the existing server-only Anthropic configuration', () => {
    vi.stubEnv('CATCHUP_RECAP_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-test-model');

    expect(createNarrativeExtractionProviderFromEnvironment()).toBeDefined();
  });

  test('rejects a malformed Anthropic message response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: 'not-an-array' }), { status: 200 })
    );
    const provider = createAnthropicNarrativeExtractionProvider(
      'test-anthropic-key',
      'claude-test-model'
    );

    await expect(
      provider.extractEvents({
        showId: 1001,
        showName: 'Echoes of Orion',
        seasonId: 'show-1001-s1',
        seasonNumber: 1,
        episodeId: 'show-1001-s1-e1',
        episodeNumber: 1,
        transcriptChunk: 'Mara follows the repeating signal.',
        chunkIndex: 0,
        totalChunks: 1,
      })
    ).rejects.toThrow('no narrative extraction output');
  });
});
