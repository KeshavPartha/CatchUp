import { getShowById } from '@/lib/catalog';

import { normalizeNarrativeEvents, toEpisodePlotEventRows } from './normalization';
import { splitTranscript } from './transcript';
import type {
  NarrativeExtractionProvider,
  NarrativeIngestionResult,
  TranscriptIngestionInput,
} from './types';
import type { ExtractedNarrativeEvent } from './validation';
import {
  NarrativeIngestionValidationError,
  parseNarrativeExtractionOutput,
  validateTranscriptInput,
} from './validation';

export const ingestEpisodeTranscript = async (
  input: TranscriptIngestionInput,
  provider: NarrativeExtractionProvider
): Promise<NarrativeIngestionResult> => {
  const validatedInput = validateTranscriptInput(input);
  const show = getShowById(validatedInput.showId);
  if (!show) {
    throw new NarrativeIngestionValidationError(
      `Show ${validatedInput.showId} is not present in the controlled catalog.`
    );
  }

  const season = show.seasons.find((item) => item.season_number === validatedInput.seasonNumber);
  const episode = season?.episodes.find(
    (item) => item.episode_number === validatedInput.episodeNumber
  );
  if (!season || !episode) {
    throw new NarrativeIngestionValidationError(
      `Season ${validatedInput.seasonNumber} Episode ${validatedInput.episodeNumber} was not found for ${show.name}.`
    );
  }

  const transcriptChunks = splitTranscript(validatedInput.transcript);
  if (transcriptChunks.length === 0) {
    throw new NarrativeIngestionValidationError('Transcript did not contain any usable text.');
  }

  const extractedEvents: ExtractedNarrativeEvent[] = [];
  for (const [chunkIndex, transcriptChunk] of transcriptChunks.entries()) {
    const rawOutput = await provider.extractEvents({
      showId: show.id,
      showName: show.name,
      seasonId: season.id,
      seasonNumber: season.season_number,
      episodeId: episode.id,
      episodeNumber: episode.episode_number,
      transcriptChunk,
      chunkIndex,
      totalChunks: transcriptChunks.length,
    });
    extractedEvents.push(...parseNarrativeExtractionOutput(rawOutput));
  }

  const events = normalizeNarrativeEvents({
    showId: show.id,
    episode,
    extractedEvents,
  });

  return {
    showId: show.id,
    seasonId: season.id,
    seasonNumber: season.season_number,
    episode,
    chunksProcessed: transcriptChunks.length,
    events,
    databaseRows: toEpisodePlotEventRows(events),
  };
};
