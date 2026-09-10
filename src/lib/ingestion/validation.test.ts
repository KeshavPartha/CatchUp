import { describe, expect, test } from 'vitest';

import {
  NarrativeIngestionValidationError,
  parseNarrativeExtractionOutput,
  validateTranscriptInput,
} from './validation';

describe('narrative ingestion validation', () => {
  test('parses the strict extraction envelope and tolerates a JSON code fence', () => {
    const events = parseNarrativeExtractionOutput(
      [
        '```json',
        '{"events":[{"event_text":"Mara changes the salvage route.","involved_characters":["Mara Venn"],"importance_score":0.8,"tags":["decision"]}]}',
        '```',
      ].join('\n')
    );

    expect(events).toEqual([
      {
        event_text: 'Mara changes the salvage route.',
        involved_characters: ['Mara Venn'],
        importance_score: 0.8,
        tags: ['decision'],
      },
    ]);
  });

  test('rejects malformed provider output instead of returning insertable data', () => {
    expect(() =>
      parseNarrativeExtractionOutput('{"events":[{"event_text":"incomplete"}]}')
    ).toThrow(NarrativeIngestionValidationError);
    expect(() => parseNarrativeExtractionOutput('not JSON')).toThrow('returned invalid JSON');
  });

  test('validates transcript input bounds', () => {
    expect(() =>
      validateTranscriptInput({
        showId: 1001,
        seasonNumber: 1,
        episodeNumber: 1,
        transcript: 'too short',
      })
    ).toThrow('Transcript input is invalid');
  });
});
