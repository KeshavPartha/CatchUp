# CatchUp Database Specification

## Current source of truth

The demo catalog is controlled in application code so the foundation runs without a content-provider account. Supabase stores identity and user-owned state. Stable catalog IDs are stored with progress so the app can resolve the current local catalog and later migrate to managed content tables.

## Implemented tables

### `profiles`

One row per Supabase Auth user. Stores email, display name, avatar URL, and timestamps. A signup trigger creates the row.

### `watch_progress`

One row per user and episode, unique on `(user_id, episode_id)`, or per user and movie, unique on `(user_id, media_type, media_id)`. TV rows use `show_id` and `episode_id`; movie rows use `media_type = 'movie'` with a stable `media_id`. Stores current season/episode numbers where applicable, `position_seconds`, `duration_seconds`, `progress_percent`, `completed`, and `last_watched_at`.

### Existing foundation tables

`my_list` and `liked_items` remain user-owned tables for the starter browsing experience. They are not social signals and must not become automatically visible to friends.

## Future-ready tables

- `episode_plot_events`: ordered, structured events keyed by episode, with a spoiler boundary and retrieval-safe text for future recaps/Q&A.
- `friendships`: requester/addressee pairs with a constrained status; no history access is implied.
- `show_recommendations`: sender, recipient, content ID, optional note, and lifecycle status.
- `progress_shares`: owner, friend, show, enabled/revoked timestamps; unique per owner/friend/show.
- `watch_parties`, `watch_party_members`, and `watch_party_events`: session ownership, membership, selected episode, and authorized synchronization events.

## Security rules

- Enable RLS on every user-owned or relationship table.
- A user can read or mutate only their own progress, list, likes, profile, and outgoing/incoming relationship records allowed by policy.
- Progress is never readable by friends unless an enabled `progress_shares` row authorizes that exact friend and show.
- Future AI retrieval must query through an episode boundary, not directly expose unrestricted plot-event rows to a client.
- Service-role credentials, if ever needed, remain server-only.

## Write behavior

The player sends idempotent upserts for an episode or movie. Progress updates are clamped to valid ranges, debounced, and flushed on pause, completion, and page exit where possible. Completion is explicit in storage and should be monotonic unless a future product action deliberately reopens an item.

## Migration posture

The SQL schema is intentionally additive and uses stable text IDs for the controlled demo catalog. Existing hosted projects initialized from the original starter should run `supabase/migrations/20260910_watch_progress_foundation.sql`; new projects can run `supabase-schema.sql`. A later catalog migration can add managed content tables and foreign keys after the product’s provider/licensing choice is known.
