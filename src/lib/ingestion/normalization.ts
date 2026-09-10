import type { Episode } from '@/lib/catalog';
import type { PlotEvent } from '@/lib/recaps/types';
import type { Database } from '@/lib/supabase/database.types';

import type { ExtractedNarrativeEvent } from './validation';

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');

const uniqueNormalizedValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const cleaned = normalizeText(value);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }

  return normalized;
};

export const normalizeNarrativeEvents = ({
  showId,
  episode,
  extractedEvents,
}: {
  showId: number;
  episode: Episode;
  extractedEvents: ExtractedNarrativeEvent[];
}): PlotEvent[] => {
  const seenEventTexts = new Set<string>();
  const events: PlotEvent[] = [];

  for (const extracted of extractedEvents) {
    const eventText = normalizeText(extracted.event_text);
    const eventKey = eventText.toLocaleLowerCase();
    if (!eventText || seenEventTexts.has(eventKey)) continue;

    seenEventTexts.add(eventKey);
    events.push({
      id: `${episode.id}-ingested-${events.length + 1}`,
      show_id: showId,
      season_id: episode.season_id,
      season_number: episode.season_number,
      episode_id: episode.id,
      episode_number: episode.episode_number,
      event_order: events.length + 1,
      event_text: eventText,
      involved_characters: uniqueNormalizedValues(extracted.involved_characters),
      importance_score: Math.round(extracted.importance_score * 100) / 100,
      tags: uniqueNormalizedValues(extracted.tags),
    });
  }

  return events;
};

export const toEpisodePlotEventRows = (
  events: PlotEvent[]
): Array<Database['public']['Tables']['episode_plot_events']['Insert']> =>
  events.map((event) => ({
    show_id: String(event.show_id),
    season_id: event.season_id,
    season_number: event.season_number,
    episode_id: event.episode_id,
    episode_number: event.episode_number,
    event_order: event.event_order,
    event_text: event.event_text,
    involved_characters: event.involved_characters,
    importance_score: event.importance_score,
    tags: event.tags,
  }));
