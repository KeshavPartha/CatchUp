# Catch Me Up and Follow-up Q&A Specification

## Status

The narrative event model, deterministic spoiler-boundary retrieval foundation, server-side recap and follow-up question endpoints, and user-facing Catch Me Up UI are implemented. The endpoints and UI support the `Echoes of Orion` demo show. A provider abstraction with an Anthropic default and optional OpenAI adapter is present.

## V1 episode boundary

Catch Me Up is episode-based, not minute-based. For a target episode, only prior episodes with a persisted `watch_progress.completed = true` row for the requesting user are eligible. Partial playback position is used for resume playback, but does not make an episode eligible for recap content.

- The target episode is always excluded.
- Every episode after the target is always excluded.
- A completed episode in an earlier season is eligible when it comes before the target in the show’s ordered catalog.
- The boundary is the latest eligible completed prior episode, or no boundary when none qualify.

Example: if a user completed S1E1–S1E18 and partially watched S1E19, a recap before S1E20 has S1E18 as its boundary. S1E19 is not included until it is completed.

## Retrieval contract

The deterministic retrieval service accepts the authenticated user ID, show, target episode, a watch-progress reader, and structured plot events. It reads only the requesting user’s TV progress, computes the ordered completed-episode boundary, and returns events whose episode IDs are in the allowed set. It must never return target or future events to a recap or Q&A generation layer.

The generation layer receives only the retrieval result, never an unrestricted plot-event query. The `POST /api/recap` endpoint accepts only `showId` and `targetEpisodeId`; `POST /api/recap/question` accepts only those identifiers and a question up to 1000 characters. Client-supplied plot events are ignored. Both endpoints authenticate the bearer token with Supabase, invoke the existing retrieval service, and pass only its safe events into the provider. If the boundary or source data is ambiguous, they fail closed. Supabase RLS remains the database authorization boundary, and the service also filters returned progress by the requested user and show.

## Server-side generation

`src/lib/recaps/generator.ts` defines the provider-independent `RecapGenerator` contract. Anthropic Claude is the default provider through a server-side Messages API `fetch` adapter; OpenAI remains available only when explicitly selected. The Anthropic API key is read only from `ANTHROPIC_API_KEY`; it is never prefixed with `NEXT_PUBLIC_` or sent to the browser. A missing provider returns a clear `503` configuration response. Users with no eligible events receive a deterministic empty-state response without calling the provider.

The provider prompt receives the show name, the computed boundary, and a serialized list of already-filtered events. Recap and question prompts also explicitly refuse future-plot requests and require an “not knowable from what you have watched yet” response when the safe events do not answer the question. The public endpoint responses contain only recap text or an answer; boundaries, source episode IDs, provider metadata, prompts, and credentials remain server-side.

## Catch Me Up UI

On a TV show detail page, Catch Me Up appears beside the main Play/Resume action when authenticated progress has loaded and at least one completed prior episode is eligible. Eligible episode rows expose the same action for that target episode. The focused dialog shows the target context, loading state, recap text, retry/error state, and a Start/Resume episode action. After a recap is shown, a lightweight question form supports multiple question/answer pairs in the same modal session. Each question uses the same target episode and spoiler boundary. The client sends only identifiers, the question, and the current Supabase access token; it does not retrieve or display plot events, source episode IDs, provider metadata, prompts, or API tokens.

## Temporary invocation

The endpoint can be exercised before the polished UI exists:

```bash
curl -X POST http://localhost:3000/api/recap \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"showId":1001,"targetEpisodeId":"show-1001-s1-e2"}'
```

The access token must belong to a signed-in Supabase user. The request must not include plot events; the server ignores client-supplied event data.

Follow-up questions use the same token and boundary:

```bash
curl -X POST http://localhost:3000/api/recap/question \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"showId":1001,"targetEpisodeId":"show-1001-s1-e2","question":"Who is Ilya?"}'
```

## Narrative event model

Each event is keyed to a stable show, season, and episode ID and contains:

- ordered event text
- involved characters
- an importance score
- optional tags/topics

The repository currently includes a complete local event dataset for all six episodes of `Echoes of Orion`. It is controlled demo data for deterministic tests and can later be ingested into the server-managed `episode_plot_events` table.

## Narrative ingestion prototype

The separate server-side ingestion pipeline in `src/lib/ingestion/` converts a transcript into the existing `PlotEvent` shape before any user recap request:

```text
transcript → bounded chunks → Anthropic narrative extraction → schema validation
→ normalization/deduplication → PlotEvent/database-ready rows → spoiler-safe retrieval
→ recap or Q&A
```

Its input is `showId`, `seasonNumber`, `episodeNumber`, and raw transcript text. The pipeline resolves and validates the canonical catalog episode, sends only transcript context to the extraction provider, and never reads user watch progress. Model output must be strict JSON with event text, characters, importance, and tags; invalid output fails closed and cannot produce database rows. The current prototype prepares rows for `episode_plot_events` but does not automatically write them or replace the manually authored demo events. `ECHOES_OF_ORION_S1E1_TRANSCRIPT` demonstrates the input fixture.

## Future recap behavior

Return a concise, plot-relevant recap of the eligible watched material. Prioritize unresolved context, important characters, relationships, and events needed to resume. Omit trivia and future material. Identify the episode boundary used.

## Follow-up Q&A behavior

Every question is answered against the same episode-bounded retrieval scope as the recap. If the answer requires future information, say that it cannot be answered yet rather than hinting at it. Adversarial questions that request future deaths, next-episode events, betrayals, or later-season outcomes must not receive future information.

## Future acceptance criteria

For a user stopped at S2E6, neither recap nor Q&A may use S2E7+ facts, names, relationships, or outcomes. A change from partial to completed watch progress must deterministically add that episode—and no later episode—to the retrieval scope.
