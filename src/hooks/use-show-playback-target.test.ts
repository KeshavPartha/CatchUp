import { describe, expect, test } from 'vitest';

import { getShowById } from '@/lib/catalog';

import { isEpisodeEligibleForRecap } from './use-show-playback-target';

const show = getShowById(1001);

if (!show) {
  throw new Error('Echoes of Orion demo show is missing.');
}

const episodes = show.seasons.flatMap((season) => season.episodes);
const [episodeOne, episodeTwo, episodeThree] = episodes;

const progressFor = (episodeId: string, completed: boolean) => ({
  episode_id: episodeId,
  completed,
});

describe('Catch Me Up UI eligibility', () => {
  test('excludes completed targets while allowing an unstarted target after completed episodes', () => {
    const progress = [progressFor(episodeOne.id, true), progressFor(episodeTwo.id, true)];

    expect(isEpisodeEligibleForRecap(episodeOne, episodes, progress)).toBe(false);
    expect(isEpisodeEligibleForRecap(episodeTwo, episodes, progress)).toBe(false);
    expect(isEpisodeEligibleForRecap(episodeThree, episodes, progress)).toBe(true);
  });

  test('allows a partially watched target but does not treat it as completed', () => {
    const progress = [progressFor(episodeOne.id, true), progressFor(episodeTwo.id, false)];

    expect(isEpisodeEligibleForRecap(episodeTwo, episodes, progress)).toBe(true);
    expect(isEpisodeEligibleForRecap(episodeThree, episodes, progress)).toBe(true);
  });

  test('does not show eligibility without a completed prior episode', () => {
    expect(isEpisodeEligibleForRecap(episodeOne, episodes, [])).toBe(false);
    expect(
      isEpisodeEligibleForRecap(episodeTwo, episodes, [progressFor(episodeOne.id, false)])
    ).toBe(false);
  });
});
