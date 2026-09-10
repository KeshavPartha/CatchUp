import { createElement } from 'react';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getShowById } from '@/lib/catalog';

import { CatchMeUpButton } from './catch-me-up-button';

const getSession = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession },
  }),
}));

const show = getShowById(1001);

if (!show) {
  throw new Error('Echoes of Orion demo show is missing.');
}

const targetEpisode = show.seasons[0].episodes[1];

const responseFor = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'supabase-access-token' } } });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CatchMeUpButton', () => {
  test('shows loading, then success and a start action', async () => {
    let resolveFetch!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.mocked(fetch).mockReturnValueOnce(pendingResponse);

    render(createElement(CatchMeUpButton, { showId: show.id, targetEpisode }));
    fireEvent.click(screen.getByRole('button', { name: /catch me up before/i }));

    expect(screen.getByText(/gathering the important moments/i)).toBeInTheDocument();

    resolveFetch(responseFor({ recap: 'The crew follows an impossible signal.' }));

    expect(await screen.findByText('The crew follows an impossible signal.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start episode' })).toHaveAttribute(
      'href',
      `/tv/${show.id}/episode/${targetEpisode.id}`
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('shows a retry action after a server failure', async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(responseFor({ error: 'Temporary failure' }, 503))
      .mockResolvedValueOnce(responseFor({ recap: 'The crew follows an impossible signal.' }));

    render(createElement(CatchMeUpButton, { showId: show.id, targetEpisode }));
    fireEvent.click(screen.getByRole('button', { name: /catch me up before/i }));

    const retryButton = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    expect(await screen.findByText('The crew follows an impossible signal.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('shows an unauthenticated state when the session is unavailable', async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    render(createElement(CatchMeUpButton, { showId: show.id, targetEpisode }));
    fireEvent.click(screen.getByRole('button', { name: /catch me up before/i }));

    expect(await screen.findByText(/sign in to catchup/i)).toBeInTheDocument();
  });

  test('displays the server no-progress response without exposing metadata', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      responseFor({
        recap: 'You have not completed an episode yet.',
        sourceEpisodeIds: ['internal-id'],
        provider: 'anthropic',
      })
    );

    render(createElement(CatchMeUpButton, { showId: show.id, targetEpisode }));
    fireEvent.click(screen.getByRole('button', { name: /catch me up before/i }));

    expect(await screen.findByText('You have not completed an episode yet.')).toBeInTheDocument();
    expect(screen.queryByText('internal-id')).not.toBeInTheDocument();
    expect(screen.queryByText('anthropic')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  test('asks multiple questions and keeps the question history in the modal', async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(responseFor({ recap: 'The crew follows an impossible signal.' }))
      .mockResolvedValueOnce(responseFor({ answer: 'Ilya navigates the Wayfinder.' }))
      .mockResolvedValueOnce(
        responseFor({ answer: 'Mara follows the signal to find its source.' })
      );

    render(createElement(CatchMeUpButton, { showId: show.id, targetEpisode }));
    fireEvent.click(screen.getByRole('button', { name: /catch me up before/i }));
    expect(await screen.findByText('The crew follows an impossible signal.')).toBeInTheDocument();

    const input = screen.getByLabelText('Ask about what you’ve watched');
    fireEvent.change(input, { target: { value: 'Who is Ilya?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Ilya navigates the Wayfinder.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Why did Mara follow the signal?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(
      await screen.findByText('Mara follows the signal to find its source.')
    ).toBeInTheDocument();
    expect(screen.getByText('Who is Ilya?')).toBeInTheDocument();
    expect(screen.getByText('Why did Mara follow the signal?')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('shows a Q&A error and retries the last question', async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(responseFor({ recap: 'The crew follows an impossible signal.' }))
      .mockResolvedValueOnce(responseFor({ error: 'Question service unavailable.' }, 502))
      .mockResolvedValueOnce(responseFor({ answer: 'Ilya navigates the Wayfinder.' }));

    render(createElement(CatchMeUpButton, { showId: show.id, targetEpisode }));
    fireEvent.click(screen.getByRole('button', { name: /catch me up before/i }));
    expect(await screen.findByText('The crew follows an impossible signal.')).toBeInTheDocument();

    const input = screen.getByLabelText('Ask about what you’ve watched');
    fireEvent.change(input, { target: { value: 'Who is Ilya?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(
      await screen.findByText('Catch Me Up could not answer that right now.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ilya navigates the Wayfinder.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
