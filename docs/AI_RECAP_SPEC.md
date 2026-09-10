# Catch Me Up and Follow-up Q&A Specification

## Status

The narrative event model, deterministic spoiler-boundary retrieval foundation, and server-side recap endpoint are implemented. The endpoint supports the `Echoes of Orion` demo show. A provider abstraction and optional OpenAI adapter are present; no user-facing recap UI or follow-up Q&A is implemented.

## V1 episode boundary

Catch Me Up is episode-based, not minute-based. For a target episode, only prior episodes with a persisted `watch_progress.completed = true` row for the requesting user are eligible. Partial playback position is used for resume playback, but does not make an episode eligible for recap content.

- The target episode is always excluded.
- Every episode after the target is always excluded.
- A completed episode in an earlier season is eligible when it comes before the target in the show’s ordered catalog.
- The boundary is the latest eligible completed prior episode, or no boundary when none qualify.

Example: if a user completed S1E1–S1E18 and partially watched S1E19, a recap before S1E20 has S1E18 as its boundary. S1E19 is not included until it is completed.

## Retrieval contract

The deterministic retrieval service accepts the authenticated user ID, show, target episode, a watch-progress reader, and structured plot events. It reads only the requesting user’s TV progress, computes the ordered completed-episode boundary, and returns events whose episode IDs are in the allowed set. It must never return target or future events to a recap or Q&A generation layer.

The generation layer receives only the retrieval result, never an unrestricted plot-event query. The `POST /api/recap` endpoint accepts only `showId` and `targetEpisodeId`; client-supplied plot events are ignored. It authenticates the bearer token with Supabase, invokes the existing retrieval service, and passes only its safe events into the provider. If the boundary or source data is ambiguous, it fails closed. Supabase RLS remains the database authorization boundary, and the service also filters returned progress by the requested user and show.

## Server-side generation

`src/lib/recaps/generator.ts` defines the provider-independent `RecapGenerator` contract. The current optional provider is OpenAI through a server-side `fetch` adapter. The API key is read only from `OPENAI_API_KEY`; it is never prefixed with `NEXT_PUBLIC_` or sent to the browser. A missing provider returns a clear `503` configuration response. Users with no eligible events receive a deterministic empty-state response without calling the provider.

The provider prompt receives the show name, the computed boundary, and a serialized list of already-filtered events. It must produce concise plain text using only those events. The endpoint response includes the boundary and source episode IDs for traceability, but no unrestricted plot-event data is exposed to the client.

## Temporary invocation

The endpoint can be exercised before the polished UI exists:

```bash
curl -X POST http://localhost:3000/api/recap \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"showId":1001,"targetEpisodeId":"show-1001-s1-e2"}'
```

The access token must belong to a signed-in Supabase user. The request must not include plot events; the server ignores client-supplied event data.

## Narrative event model

Each event is keyed to a stable show, season, and episode ID and contains:

- ordered event text
- involved characters
- an importance score
- optional tags/topics

The repository currently includes a complete local event dataset for all six episodes of `Echoes of Orion`. It is controlled demo data for deterministic tests and can later be ingested into the server-managed `episode_plot_events` table.

## Future recap behavior

Return a concise, plot-relevant recap of the eligible watched material. Prioritize unresolved context, important characters, relationships, and events needed to resume. Omit trivia and future material. Identify the episode boundary used.

## Future Q&A behavior

Every question is answered against the same episode-bounded retrieval scope. If the answer requires future information, say that it cannot be answered yet rather than hinting at it. Test questions that tempt the system to reveal later plot points.

## Future acceptance criteria

For a user stopped at S2E6, neither recap nor Q&A may use S2E7+ facts, names, relationships, or outcomes. A change from partial to completed watch progress must deterministically add that episode—and no later episode—to the retrieval scope.
