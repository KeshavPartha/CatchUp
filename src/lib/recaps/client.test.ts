import { describe, expect, test, vi } from 'vitest';

import { requestRecap, RecapClientAuthenticationError, RecapClientRequestError } from './client';

const responseFor = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('client recap request', () => {
  test('sends only the target identifiers and the authenticated bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      responseFor({
        recap: 'The crew follows an impossible signal.',
        sourceEpisodeIds: ['internal-id-that-client-does-not-read'],
        provider: 'anthropic',
      })
    );

    const result = await requestRecap({
      showId: 1001,
      targetEpisodeId: 'show-1001-s1-e2',
      getAccessToken: async () => 'supabase-access-token',
      fetcher,
    });
    const [, options] = fetcher.mock.calls[0];

    expect(result).toEqual({ recap: 'The crew follows an impossible signal.' });
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer supabase-access-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      showId: 1001,
      targetEpisodeId: 'show-1001-s1-e2',
    });
  });

  test('handles an unauthenticated session without calling the endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      requestRecap({
        showId: 1001,
        targetEpisodeId: 'show-1001-s1-e2',
        getAccessToken: async () => null,
        fetcher,
      })
    ).rejects.toBeInstanceOf(RecapClientAuthenticationError);

    expect(fetcher).not.toHaveBeenCalled();
  });

  test('turns server failures into a retryable client error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        responseFor({ error: 'Recap generation is not configured on the server.' }, 503)
      );

    await expect(
      requestRecap({
        showId: 1001,
        targetEpisodeId: 'show-1001-s1-e2',
        getAccessToken: async () => 'supabase-access-token',
        fetcher,
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'RecapClientRequestError',
        message: 'Recap generation is not configured on the server.',
      } satisfies Partial<RecapClientRequestError>)
    );
  });

  test('treats an expired server session as unauthenticated', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(responseFor({}, 401));

    await expect(
      requestRecap({
        showId: 1001,
        targetEpisodeId: 'show-1001-s1-e2',
        getAccessToken: async () => 'expired-token',
        fetcher,
      })
    ).rejects.toBeInstanceOf(RecapClientAuthenticationError);
  });
});
