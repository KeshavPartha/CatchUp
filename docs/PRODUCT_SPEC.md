# CatchUp Product Specification

## Purpose

CatchUp is a polished streaming-platform prototype that helps people return to shows with context and connect with friends without making viewing history public by default.

## Core experience

The product must support a local/demo catalog of shows, seasons, episodes, and optionally movies. A signed-in user can browse content, open an episode, play demo content, and have progress restored on the next visit. Continue Watching shows the most recently active incomplete episode with its show, season, episode, and progress.

## V1 behavior

- Authentication is required for durable cross-device progress.
- An episode’s progress includes the show, season, episode, playback position, duration, percentage, completion state, and last-watched time.
- Progress is private unless a future explicit share permission grants access to a specific friend for a specific show.
- `Catch Me Up` and follow-up Q&A must use only episodes at or before the user’s selected watched boundary.
- Recommendations and Watch Together are future capabilities, not part of the foundation implementation.

## Product principles

- Spoiler safety is a correctness requirement, not only a UI preference.
- Friendship never implies viewing-history access.
- Prefer clear, reversible user choices over inferred behavior.
- Use controlled demo content until provider and licensing decisions are made.
- Keep the prototype simple enough to validate the return-to-a-show journey.

## Out of scope for this phase

AI recaps/Q&A, friends, recommendations, progress sharing, Watch Together, messaging, public activity feeds, gamification, voice controls, and commercial streaming infrastructure.

## Acceptance criteria for the foundation

1. Browse pages render without any external movie API or API key.
2. At least two fictional shows expose seasons and episodes.
3. A signed-in user can open an episode, advance playback, leave, reopen it, and resume from persisted progress.
4. Continue Watching identifies the correct show, season, episode, and progress.
5. Applying the database schema does not grant one user access to another user’s private progress.
