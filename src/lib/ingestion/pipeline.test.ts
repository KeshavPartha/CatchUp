import { describe, expect, test, vi } from 'vitest';

import { ECHOES_OF_ORION_S1E1_TRANSCRIPT } from './demo-transcript';
import { ingestEpisodeTranscript } from './pipeline';
import type { NarrativeExtractionProvider, NarrativeExtractionRequest } from './types';
import { NarrativeIngestionValidationError } from './validation';

const extractionOutput = JSON.stringify({
  events: [
    {
      event_text: '  The Wayfinder detects a repeating distress signal.  ',
      involved_characters: ['Mara Venn', 'mara venn', 'Ilya Cross'],
      importance_score: 0.956,
      tags: ['signal', ' SIGNAL '],
    },
    {
      event_text: 'The Wayfinder detects a repeating distress signal.',
      involved_characters: ['Mara Venn'],
      importance_score: 0.7,
      tags: ['duplicate'],
    },
    {
      event_text: 'Mara orders the crew beyond the planned salvage route.',
      involved_characters: ['Mara Venn'],
      importance_score: 0.8,
      tags: ['decision'],
    },
  ],
});

const providerFor = (
  output: string = extractionOutput,
  requests: NarrativeExtractionRequest[] = []
): NarrativeExtractionProvider => ({
  extractEvents: async (request) => {
    requests.push(request);
    return output;
  },
});

describe('episode transcript ingestion pipeline', () => {
  test('converts the demo transcript into normalized PlotEvents and database-ready rows', async () => {
    const requests: NarrativeExtractionRequest[] = [];
    const result = await ingestEpisodeTranscript(
      {
        showId: 1001,
        seasonNumber: 1,
        episodeNumber: 1,
        transcript: ECHOES_OF_ORION_S1E1_TRANSCRIPT,
      },
      providerFor(extractionOutput, requests)
    );

    expect(result.episode.id).toBe('show-1001-s1-e1');
    expect(result.chunksProcessed).toBe(1);
    expect(requests[0]).toMatchObject({
      showId: 1001,
      showName: 'Echoes of Orion',
      seasonId: 'show-1001-s1',
      episodeId: 'show-1001-s1-e1',
      chunkIndex: 0,
      totalChunks: 1,
    });
    expect(requests[0].transcriptChunk).toContain('Mara Venn');
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      id: 'show-1001-s1-e1-ingested-1',
      event_order: 1,
      event_text: 'The Wayfinder detects a repeating distress signal.',
      involved_characters: ['Mara Venn', 'Ilya Cross'],
      importance_score: 0.96,
      tags: ['signal'],
    });
    expect(result.events[1].event_order).toBe(2);
    expect(result.databaseRows).toEqual([
      {
        show_id: '1001',
        season_id: 'show-1001-s1',
        season_number: 1,
        episode_id: 'show-1001-s1-e1',
        episode_number: 1,
        event_order: 1,
        event_text: 'The Wayfinder detects a repeating distress signal.',
        involved_characters: ['Mara Venn', 'Ilya Cross'],
        importance_score: 0.96,
        tags: ['signal'],
      },
      {
        show_id: '1001',
        season_id: 'show-1001-s1',
        season_number: 1,
        episode_id: 'show-1001-s1-e1',
        episode_number: 1,
        event_order: 2,
        event_text: 'Mara orders the crew beyond the planned salvage route.',
        involved_characters: ['Mara Venn'],
        importance_score: 0.8,
        tags: ['decision'],
      },
    ]);
  });

  test('rejects an invalid catalog episode before calling the provider', async () => {
    const extractEvents = vi.fn();

    await expect(
      ingestEpisodeTranscript(
        {
          showId: 1001,
          seasonNumber: 9,
          episodeNumber: 1,
          transcript: ECHOES_OF_ORION_S1E1_TRANSCRIPT,
        },
        { extractEvents }
      )
    ).rejects.toBeInstanceOf(NarrativeIngestionValidationError);

    expect(extractEvents).not.toHaveBeenCalled();
  });

  test('fails closed when a provider returns malformed structured data', async () => {
    await expect(
      ingestEpisodeTranscript(
        {
          showId: 1001,
          seasonNumber: 1,
          episodeNumber: 1,
          transcript: ECHOES_OF_ORION_S1E1_TRANSCRIPT,
        },
        providerFor('{"events":[{"event_text":"future spoiler"}]}')
      )
    ).rejects.toThrow('failed validation');
  });

  test('does not read or require user watch progress during ingestion', async () => {
    const provider = providerFor();

    const result = await ingestEpisodeTranscript(
      {
        showId: 1001,
        seasonNumber: 1,
        episodeNumber: 1,
        transcript: ECHOES_OF_ORION_S1E1_TRANSCRIPT,
      },
      provider
    );

    expect(result.events.every((event) => event.episode_id === result.episode.id)).toBe(true);
  });
});
