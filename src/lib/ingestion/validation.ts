import { z } from 'zod';

import type { TranscriptIngestionInput } from './types';

export const transcriptIngestionInputSchema = z.object({
  showId: z.number().int().positive(),
  seasonNumber: z.number().int().positive(),
  episodeNumber: z.number().int().positive(),
  transcript: z.string().trim().min(20).max(250_000),
});

const extractedNarrativeEventSchema = z
  .object({
    event_text: z.string().trim().min(10).max(1_000),
    involved_characters: z.array(z.string().trim().min(1).max(100)).max(20),
    importance_score: z.number().finite().min(0).max(1),
    tags: z.array(z.string().trim().min(1).max(60)).max(20),
  })
  .strict();

const narrativeExtractionResponseSchema = z
  .object({ events: z.array(extractedNarrativeEventSchema).max(50) })
  .strict();

export type ExtractedNarrativeEvent = z.infer<typeof extractedNarrativeEventSchema>;

export class NarrativeIngestionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeIngestionValidationError';
  }
}

export const validateTranscriptInput = (
  input: TranscriptIngestionInput
): TranscriptIngestionInput => {
  const result = transcriptIngestionInputSchema.safeParse(input);
  if (!result.success) {
    throw new NarrativeIngestionValidationError(
      `Transcript input is invalid: ${result.error.issues.map((issue) => issue.message).join('; ')}`
    );
  }

  return result.data;
};

export const parseNarrativeExtractionOutput = (rawOutput: string): ExtractedNarrativeEvent[] => {
  const trimmedOutput = rawOutput.trim();
  const withoutCodeFence = trimmedOutput
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutCodeFence);
  } catch {
    throw new NarrativeIngestionValidationError(
      'The narrative extraction provider returned invalid JSON.'
    );
  }

  const result = narrativeExtractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new NarrativeIngestionValidationError(
      `The narrative extraction output failed validation: ${result.error.issues
        .map((issue) => issue.message)
        .join('; ')}`
    );
  }

  return result.data.events;
};
