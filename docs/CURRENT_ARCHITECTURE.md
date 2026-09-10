# CatchUp Current Architecture

## Scope

CatchUp is a Next.js streaming-platform prototype. The current foundation uses a fully controlled local catalog, an interactive demo player, and a deterministic spoiler-safe narrative retrieval foundation. AI generation/UI, follow-up Q&A, friends, recommendations, progress sharing, and Watch Together remain unimplemented.

## Tech stack

- Next.js 15.5.x App Router with React Server Components for catalog pages.
- React 18, TypeScript 5, Tailwind CSS 3, `lucide-react`, `clsx`, and `tailwind-merge`.
- Supabase JavaScript client for browser authentication and user-owned persistence.
- npm for dependency management and Vercel-compatible Next.js deployment.

## Important folders

```text
src/app/                 App Router pages, global layout, and styles
src/components/          Shared shell, rows/cards, actions, and reusable demo player
src/hooks/               My List, likes, Continue Watching, and episode progress hooks
src/lib/catalog.ts       Controlled local catalog and catalog adapter functions
src/lib/supabase/        Supabase browser client, config guard, and database types
src/lib/recaps/          Plot-event data, episode boundary logic, and safe retrieval contracts
public/demo/             Locally controlled poster/backdrop SVG artwork
supabase-schema.sql      Current/future-ready Supabase schema and RLS policies
docs/                    Product, architecture, database, AI, social, and party specs
```

## Routes and pages

| Route                          | Behavior                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `/`                            | Local movie hero, movie rows, and authenticated Continue Watching row.                  |
| `/movies`                      | Local movie rows: trending, popular, top-rated, upcoming, and now playing.              |
| `/tv-shows`                    | Local show rows: trending, popular, top-rated, airing today, and on the air.            |
| `/new`                         | Combined local movie and TV discovery rows.                                             |
| `/search?q=...`                | Client-side search over the local movie/show catalog.                                   |
| `/movie/[id]`                  | Local movie details, metadata, Play/Resume, My List, likes, and related local movies.   |
| `/movie/[id]/play`             | Movie detail, interactive demo playback, and movie progress persistence.                |
| `/tv/[id]`                     | Local show details, seasons, episodes, episode links, My List, and likes.               |
| `/tv/[id]/episode/[episodeId]` | Episode detail, interactive demo playback, progress persistence, and next-episode link. |
| `/my-list`                     | User/local saved movie and show IDs resolved against the local catalog.                 |
| `/login`                       | Supabase email/password login.                                                          |
| `/signup`                      | Supabase signup with `full_name` metadata.                                              |
| `/profile`                     | Client-side session display, metadata edit, and sign-out.                               |

## Local catalog

`src/lib/catalog.ts` is the content source of truth for the foundation. It contains two fictional shows—`Echoes of Orion` and `The Quiet Between`—each with two seasons and three episodes per season. It also contains two fictional movies so the existing movie browsing experience remains useful. Each item has stable numeric or string IDs and local SVG artwork under `public/demo/`.

The module exposes list, search, detail, episode, image, and related-content functions. These retain the shapes the existing cards and rows need without exposing provider-specific TMDB types. There is no TMDB client, API key, remote image CDN, or external movie API dependency.

## Authentication and Supabase

The browser uses a singleton `@supabase/supabase-js` client from `src/lib/supabase/client.ts`. `isSupabaseConfigured` guards hooks so anonymous catalog browsing works without credentials. Authentication is still required for cross-session Supabase persistence.

- Signup writes `full_name` to Supabase Auth metadata.
- `handle_new_user` in the SQL schema creates a `profiles` row.
- Login, profile editing, and sign-out use Supabase Auth.
- My List and likes use Supabase for signed-in users and localStorage for anonymous users.
- Watch progress is private Supabase data; there is no localStorage fallback for it.
- RLS is the database security boundary. There is no middleware or server-side route protection yet.

The deprecated `@supabase/auth-helpers-nextjs` dependency and unused server helper were removed. A server-side auth/session boundary can be added later with `@supabase/ssr` when server-protected features require it.

## Database model

The current schema includes `profiles`, `my_list`, `liked_items`, and the expanded `watch_progress` table. `watch_progress` stores one row per user and episode, or per user and movie, with stable content IDs, current season/episode numbers where applicable, position, duration, percentage, completion, and timestamps.

The schema also creates future-ready, RLS-enabled tables for `episode_plot_events`, `friendships`, `show_recommendations`, `progress_shares`, `watch_parties`, `watch_party_members`, and `watch_party_events`. `episode_plot_events` now has show/season/episode metadata, event text, involved characters, importance, and tags; legacy narrative columns remain nullable for compatibility. Future tables intentionally have no permissive client policies until their features are implemented.

## Watch progress and Continue Watching

The end-to-end flow is:

1. A user opens an episode or movie route from a detail page or Continue Watching.
2. `useWatchProgress` loads the signed-in user’s row by `episode_id` for TV or `media_type` plus `media_id` for movies and initializes the player position.
3. The shared `DemoPlayer` advances a local playback clock while playing, supports seek/back/forward, and allows explicit “Mark watched”.
4. Position updates are reflected immediately in UI and debounced to a Supabase upsert. Pause, completion, and unmount flush the latest position.
5. `useContinueWatching` queries only the current user’s incomplete rows, orders them by `last_watched_at`, resolves each local episode/show or movie, and links directly back to the correct playback route.

This provides the exact episode boundary needed later by Catch Me Up. Completed episodes leave Continue Watching but remain persisted as completed history. Without Supabase configuration, the player remains demonstrable but cannot persist across reloads and clearly tells the user to configure Supabase.

## Playback implementation

The starter does not provide commercial streaming content. `DemoPlayer` is a controlled interactive demo player for fictional episodes and movies; its clock and controls exist to validate resume and persistence behavior. No external video file, TMDB video metadata, YouTube embed, or streaming API is used.

## Reusable components

- `Header`, `Footer`, `Providers`, `ErrorBoundary`, `ToastContainer`, and loading/skeleton components form the application shell.
- `HeroBanner`, `MovieRow`, `TVShowRow`, `MovieCard`, and `TVShowCard` preserve the browsing experience.
- `MovieDetailActions` and `TVShowDetailActions` centralize playback, list, and like actions.
- `DemoPlayer` owns shared interactive demo playback behavior; `EpisodePlayer` and `MoviePlayer` provide media-specific wrappers.
- `useMyList`, `useLikedItems`, `useContinueWatching`, and `useWatchProgress` isolate persistence and auth-aware state.
- `cn` in `src/lib/utils.ts` merges Tailwind classes.

## Removed or intentionally deferred functionality

- TMDB REST/API-key access, remote TMDB images, YouTube trailers, and Netflix-hosted login artwork were removed from the application.
- The unused generic HTML5 `VideoPlayer` and trailer modal were removed; the local demo player is the current playback surface for episodes and movies.
- Upstream Netflix-specific deployment/push instructions and the unsafe origin-changing push script were removed or rewritten.
- Netflix branding, copy, and footer disclaimer text were replaced with CatchUp language. Internal Tailwind color token names still use `netflix-*` for incremental styling compatibility and are not product text.
- Social links, notifications, service-code UI, and the nonexistent forgot-password route remain candidates for a later product-surface cleanup.

## Environment and manual setup

The controlled catalog needs no external content account. For accounts and durable progress, copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Run `supabase-schema.sql` in the Supabase SQL editor for a new project. If the hosted project was initialized from the original starter SQL, run `supabase/migrations/20260910_watch_progress_foundation.sql` to add or upgrade `watch_progress` without rebuilding unrelated tables. Configure the local/deployed auth URLs. No service-role key is needed by the current code.

## Technical risks

- The demo player is not a real media pipeline; a licensed/content-delivery decision is still required for production-like playback.
- Auth is client-side and lacks middleware/session refresh. RLS protects data, but route UX is not yet server-enforced.
- The browser progress hook depends on the schema being applied exactly, including the `(user_id, episode_id)` and `(user_id, media_type, media_id)` unique indexes.
- Progress writes are debounced and flushed on lifecycle events, but offline queueing and conflict resolution are not implemented.
- My List and likes still create hook instances per card, which may multiply auth listeners on large catalogs.
- The current dependency tree reports npm audit findings, stale Browserslist data, and an `@next/swc` mismatch warning.
- Future AI retrieval must enforce episode boundaries in data access, not only in prompts.
- Future social and party tables require narrow RLS policies before any client feature is enabled.

## Recommended next steps

1. Apply the schema with a test Supabase project and verify signup, episode progress, reload/resume, completion, and Continue Watching with two users.
2. Add automated tests for progress clamping, debouncing/flush behavior, episode resolution, completion, and RLS isolation.
3. Decide whether the catalog remains code-controlled for the prototype or moves to managed content tables.
4. Add the server-side Catch Me Up generation boundary that accepts only the output of `src/lib/recaps/retrieval.ts`, then implement recap/Q&A UI.
5. Implement explicit per-show progress sharing and friends only after private progress semantics are stable.
