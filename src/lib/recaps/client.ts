export class RecapClientAuthenticationError extends Error {
  constructor() {
    super('Sign in to use Catch Me Up.');
    this.name = 'RecapClientAuthenticationError';
  }
}

export class RecapClientRequestError extends Error {
  constructor(message = 'Catch Me Up is temporarily unavailable. Please try again.') {
    super(message);
    this.name = 'RecapClientRequestError';
  }
}

interface RecapClientRequest {
  showId: number;
  targetEpisodeId: string;
  getAccessToken(): Promise<string | null>;
  fetcher?: typeof fetch;
}

interface RecapClientResponse {
  recap?: unknown;
  error?: unknown;
}

const isRecapClientResponse = (value: unknown): value is RecapClientResponse =>
  typeof value === 'object' && value !== null;

export const requestRecap = async ({
  showId,
  targetEpisodeId,
  getAccessToken,
  fetcher = fetch,
}: RecapClientRequest): Promise<{ recap: string }> => {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new RecapClientAuthenticationError();

  const response = await fetcher('/api/recap', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ showId, targetEpisodeId }),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new RecapClientAuthenticationError();

    const message =
      isRecapClientResponse(payload) && typeof payload.error === 'string'
        ? payload.error
        : undefined;
    throw new RecapClientRequestError(message);
  }

  if (!isRecapClientResponse(payload) || typeof payload.recap !== 'string') {
    throw new RecapClientRequestError();
  }

  return { recap: payload.recap };
};
