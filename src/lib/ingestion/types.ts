import type { Episode } from '@/lib/catalog';
import type { PlotEvent } from '@/lib/recaps/types';
import type { Database } from '@/lib/supabase/database.types';

import type { ExtractedNarrativeEvent } from './validation';

export interface TranscriptIngestionInput {
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  transcript: string;
}

export interface NarrativeExtractionRequest {
  showId: number;
  showName: string;
  seasonId: string;
  seasonNumber: number;
  episodeId: string;
  episodeNumber: number;
  transcriptChunk: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface NarrativeExtractionProvider {
  extractEvents(request: NarrativeExtractionRequest): Promise<string>;
}

export interface NarrativeIngestionResult {
  showId: number;
  seasonId: string;
  seasonNumber: number;
  episode: Episode;
  chunksProcessed: number;
  events: PlotEvent[];
  databaseRows: Array<Database['public']['Tables']['episode_plot_events']['Insert']>;
}

export type { ExtractedNarrativeEvent };
