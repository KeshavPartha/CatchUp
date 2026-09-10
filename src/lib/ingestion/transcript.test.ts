import { describe, expect, test } from 'vitest';

import { splitTranscript } from './transcript';

describe('transcript preprocessing', () => {
  test('groups paragraphs into bounded chunks and splits long paragraphs by words', () => {
    const chunks = splitTranscript(
      'First scene contains the inciting event.\n\nSecond scene changes the mission.\n\nThird scene reveals the consequence.',
      65
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 65)).toBe(true);
    expect(chunks.join('\n')).toContain('First scene contains the inciting event.');
    expect(chunks.join('\n')).toContain('Third scene reveals the consequence.');
  });
});
