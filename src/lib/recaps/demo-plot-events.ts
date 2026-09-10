import type { PlotEvent } from './types';

type EpisodeSeed = {
  episodeId: string;
  seasonId: string;
  seasonNumber: number;
  episodeNumber: number;
  events: Array<{
    text: string;
    characters: string[];
    importance: number;
    tags: string[];
  }>;
};

const makeEpisodeEvents = (seed: EpisodeSeed): PlotEvent[] =>
  seed.events.map((event, index) => ({
    id: `${seed.episodeId}-event-${index + 1}`,
    show_id: 1001,
    season_id: seed.seasonId,
    season_number: seed.seasonNumber,
    episode_id: seed.episodeId,
    episode_number: seed.episodeNumber,
    event_order: index + 1,
    event_text: event.text,
    involved_characters: event.characters,
    importance_score: event.importance,
    tags: event.tags,
  }));

const echoesOfOrionSeeds: EpisodeSeed[] = [
  {
    episodeId: 'show-1001-s1-e1',
    seasonId: 'show-1001-s1',
    seasonNumber: 1,
    episodeNumber: 1,
    events: [
      {
        text: 'The Wayfinder detects a repeating distress signal that does not match any known transmitter.',
        characters: ['Mara Venn', 'Ilya Cross', 'Jun Park'],
        importance: 0.95,
        tags: ['signal', 'inciting incident'],
      },
      {
        text: 'Mara convinces the crew to follow the signal beyond their scheduled salvage route.',
        characters: ['Mara Venn', 'Ilya Cross'],
        importance: 0.8,
        tags: ['wayfinder', 'mission'],
      },
    ],
  },
  {
    episodeId: 'show-1001-s1-e2',
    seasonId: 'show-1001-s1',
    seasonNumber: 1,
    episodeNumber: 2,
    events: [
      {
        text: 'On the silent moon, the crew finds fresh tool marks around a sealed landing site.',
        characters: ['Mara Venn', 'Jun Park'],
        importance: 0.9,
        tags: ['moon', 'colony'],
      },
      {
        text: 'Ilya discovers that the landing site contains a beacon programmed to recognize the Wayfinder.',
        characters: ['Ilya Cross'],
        importance: 0.85,
        tags: ['beacon', 'signal'],
      },
    ],
  },
  {
    episodeId: 'show-1001-s1-e3',
    seasonId: 'show-1001-s1',
    seasonNumber: 1,
    episodeNumber: 3,
    events: [
      {
        text: 'Mara opens a hidden archive after it responds to the Venn family name.',
        characters: ['Mara Venn'],
        importance: 0.95,
        tags: ['archive', 'Mara'],
      },
      {
        text: 'The archive identifies the repeating signal as a request from the missing colony ships.',
        characters: ['Mara Venn', 'Jun Park'],
        importance: 0.95,
        tags: ['colony', 'signal', 'revelation'],
      },
    ],
  },
  {
    episodeId: 'show-1001-s2-e1',
    seasonId: 'show-1001-s2',
    seasonNumber: 2,
    episodeNumber: 1,
    events: [
      {
        text: 'The crew returns to the signal’s origin and finds a colony beacon that is still powered.',
        characters: ['Mara Venn', 'Ilya Cross', 'Jun Park'],
        importance: 0.9,
        tags: ['beacon', 'return'],
      },
      {
        text: 'Jun proves that the beacon is transmitting a navigational vector rather than a distress call.',
        characters: ['Jun Park'],
        importance: 0.85,
        tags: ['navigation', 'revelation'],
      },
    ],
  },
  {
    episodeId: 'show-1001-s2-e2',
    seasonId: 'show-1001-s2',
    seasonNumber: 2,
    episodeNumber: 2,
    events: [
      {
        text: 'Ilya risks the mission to rescue a survivor who knows the Wayfinder’s route.',
        characters: ['Ilya Cross', 'Mara Venn'],
        importance: 0.9,
        tags: ['survivor', 'trust'],
      },
      {
        text: 'The survivor warns Mara that the colony ships chose to hide from something following the signal.',
        characters: ['Mara Venn', 'Ilya Cross'],
        importance: 0.95,
        tags: ['colony', 'threat', 'warning'],
      },
    ],
  },
  {
    episodeId: 'show-1001-s2-e3',
    seasonId: 'show-1001-s2',
    seasonNumber: 2,
    episodeNumber: 3,
    events: [
      {
        text: 'The crew must decide whether to answer the signal or shut it down forever.',
        characters: ['Mara Venn', 'Ilya Cross', 'Jun Park'],
        importance: 0.95,
        tags: ['choice', 'signal'],
      },
      {
        text: 'Mara chooses to preserve the archive while the Wayfinder carries the signal’s map onward.',
        characters: ['Mara Venn'],
        importance: 0.9,
        tags: ['archive', 'mission'],
      },
    ],
  },
];

export const ECHOES_OF_ORION_PLOT_EVENTS: PlotEvent[] =
  echoesOfOrionSeeds.flatMap(makeEpisodeEvents);

export const DEMO_PLOT_EVENTS: PlotEvent[] = ECHOES_OF_ORION_PLOT_EVENTS;
