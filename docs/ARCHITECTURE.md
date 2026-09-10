# CatchUp Architecture Specification

## Boundaries

- Next.js App Router owns routing, server-rendered catalog pages, and the application shell.
- A local TypeScript catalog is the current content source of truth. It is deliberately small and replaceable; it is not a second external movie API.
- Supabase owns authentication and private user data.
- Client components own interactive playback controls and call a focused progress hook.
- Future AI and social workflows must use server-side boundaries for secrets, authorization, and spoiler filtering. The recap foundation exposes a deterministic episode boundary and retrieval contract without adding an LLM or UI.

## Content model

Stable application IDs identify shows, seasons, episodes, and movies. A show contains ordered seasons; a season contains ordered episodes. Episode progress is keyed by user plus episode, while movie progress is keyed by user, media type, and movie ID. TV progress uses `show_id` and `episode_id`; movie progress uses `media_id`. The current episode for a show is derived from the most recently watched incomplete record.

The catalog adapter should expose list, search, detail, and image-path functions so UI components do not depend on a provider-specific schema.

## Request and state flow

1. A route reads catalog data through the local catalog module.
2. A page renders reusable rows/cards or an episode detail/player screen.
3. The player initializes from the user’s progress record.
4. Playback updates local UI immediately and persists debounced episode or movie progress to Supabase.
5. Continue Watching reads private progress, resolves the catalog item locally, and links directly to the episode player.

## Authentication and authorization

Supabase Auth is the identity boundary. Durable user data is accessed with the authenticated user context and protected by RLS. Route-level UX may redirect unauthenticated users, but database policies remain the security boundary.

## Recap foundation

`src/lib/recaps/types.ts` defines the stable plot-event, progress-reader, boundary, and retrieval result contracts. `demo-plot-events.ts` contains controlled narrative data for the full `Echoes of Orion` show. `spoiler-boundary.ts` computes the completed-prior-episode scope, and `retrieval.ts` filters events to that scope and provides an injected Supabase progress reader. Any future generation endpoint must pass only this filtered result to a model.

## Future extension points

Episode plot events attach to stable show, season, and episode IDs and carry ordered narrative metadata. Social permissions attach a viewer to a specific show and friend, never to a global history feed. Watch Together sessions own a shared episode and playback state, with membership and event authorization enforced separately from personal progress.

## Non-goals

No provider migration, recommendation engine, AI orchestration, social feed, realtime session implementation, or commercial media delivery is part of the foundation checkpoint.
