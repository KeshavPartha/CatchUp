# CatchUp Current Architecture

## Scope

This document describes the repository immediately after importing `RutwikPatel13/netflix-clone` as the CatchUp starter. CatchUp-specific AI, social, progress-sharing, and synchronized-watch features are not implemented yet.

## Tech stack

- Next.js 15.5.x with the App Router and React Server Components where pages are server-rendered.
- React 18 and TypeScript 5.
- Tailwind CSS 3, `tailwindcss-animate`, `clsx`, and `tailwind-merge` for styling and class composition.
- `lucide-react` for icons.
- TanStack React Query is installed and the root `Providers` component creates a client, but the current feature code does not use React Query for data fetching.
- Supabase JavaScript client plus the deprecated `@supabase/auth-helpers-nextjs` package for authentication and database access.
- npm for dependency management; Vercel is described as the intended deployment platform.

## Important folders and files

```text
src/app/                 App Router pages and global layout/styles
src/components/          Shared UI, cards, rows, header/footer, player, and feedback UI
src/hooks/               Client hooks for Continue Watching, My List, and likes
src/lib/tmdb.ts          TMDB API types, fetch wrapper, and image helpers
src/lib/supabase/        Supabase client factories and handwritten database types
public/                  Static fallback image
supabase-schema.sql      Tables, RLS policies, triggers, and indexes
.env.example             Required runtime configuration template
SETUP_INSTRUCTIONS.md    Upstream setup guide
SUPABASE_SETUP.md        Upstream Supabase instructions
DEPLOYMENT.md            Upstream deployment notes
```

`src/lib/supabase/server.ts` provides a server-component client but is not currently imported by any page. There are no route handlers, API routes, middleware, or server actions in the current tree.

## Routes and pages

| Route | Behavior |
| --- | --- |
| `/` | Server page fetching five movie lists from TMDB, rendering a hero, Continue Watching row, and movie rows. |
| `/movies` | Server page with trending, popular, top-rated, upcoming, and now-playing movie rows. |
| `/tv-shows` | Server page with trending, popular, top-rated, airing-today, and on-the-air TV rows. |
| `/new` | Server page combining daily trending, upcoming, now-playing, and TV lists. |
| `/search?q=...` | Client page; searches TMDB movies in the browser when a query is submitted. |
| `/movie/[id]` | Server movie detail page; fetches details, videos, and a “similar” list currently populated from popular movies. |
| `/tv/[id]` | Server TV detail page; fetches details, videos, and a “similar” list currently populated from popular TV shows. |
| `/my-list` | Client page reading the current user’s saved IDs and fetching their TMDB details. |
| `/login` | Client Supabase email/password sign-in form. |
| `/signup` | Client Supabase sign-up form with `full_name` user metadata. |
| `/profile` | Client profile view/edit/sign-out page. |

The header links to all primary browse pages, profile, search, and My List. The login page also links to `/forgot-password`, but that route does not exist.

## Authentication

Authentication is handled in the browser with `createClientComponentClient` from `@supabase/auth-helpers-nextjs`.

- Sign-up calls `supabase.auth.signUp` and stores the submitted name in `user_metadata.full_name`.
- Login calls `signInWithPassword` and redirects to `/`.
- Profile checks `getSession`, reads identity and metadata, updates `user_metadata`, and calls `signOut`.
- My List, likes, and Continue Watching call `getUser` and subscribe to Supabase auth-state changes where applicable.
- There is no middleware or server-side route protection. Browse pages and the header are publicly reachable; `/profile` redirects in the client when no session exists.
- The database trigger in `supabase-schema.sql` copies sign-up metadata into `public.profiles`.

## Supabase and database usage

The schema defines four tables:

- `profiles`: one row per auth user, with email, name, avatar, and timestamps.
- `my_list`: unique `(user_id, media_id, media_type)` watchlist rows.
- `liked_items`: unique `(user_id, media_id, media_type)` likes.
- `watch_progress`: unique `(user_id, media_id, media_type)` rows with an integer percentage and `last_watched` timestamp.

Row Level Security policies are included so users can read and mutate only their own rows. Signup and profile timestamp triggers are also included. The generated-style `database.types.ts` is handwritten and mirrors these tables, but the hooks use a few `as any` casts for Supabase mutations.

The client hooks use Supabase for authenticated users and localStorage fallbacks for My List and likes when unauthenticated. The localStorage keys are `netflix_my_list` and `netflix_liked_items`. Watch progress has no localStorage fallback.

`SUPABASE_SERVICE_ROLE_KEY` appears in the environment template and setup docs, but the current application does not use it. If it is configured later, it must remain server-only and must never be exposed through a `NEXT_PUBLIC_` variable or client bundle.

## Continue Watching and watch progress

The current implementation is only partially wired:

1. `useContinueWatching` checks for an authenticated user.
2. It reads up to 20 `watch_progress` rows ordered by `last_watched` descending.
3. `updateProgress(mediaId, mediaType, progress)` clamps the percentage to 0–100 and upserts on the unique media key.
4. `removeFromWatching` deletes a row for the current user.
5. `ContinueWatchingRow` is rendered on the home page, filters the fetched records to movies, fetches movie details from TMDB, and renders a resume-style card.

No current page or component calls `updateProgress`. The generic `VideoPlayer` is not imported anywhere, and the detail pages only render trailers. Consequently, the current app does not create new watch-progress records through playback, does not resume a timestamp, and does not display TV progress in the Continue Watching row. The schema and hook are a starting point rather than a complete watch-history feature.

## External APIs and services

- TMDB REST API: movie/TV lists, search, details, credits, genres, and videos. The API key is placed in a query parameter by `src/lib/tmdb.ts`; responses are cached for one hour with Next fetch caching.
- TMDB image CDN: `https://image.tmdb.org/t/p/...`, with `/public/placeholder-movie.jpg` as a fallback.
- YouTube embeds: trailer keys returned by TMDB are embedded with `youtube.com/embed/...` in detail pages and `TrailerModal`.
- Netflix-hosted background artwork is referenced by the login and signup pages.
- Supabase provides authentication, PostgreSQL, and RLS.

There is no AI provider, social graph, recommendation service, realtime service, or content-streaming backend in this starter.

## Playback implementation

The application does not stream films or episodes. It plays official trailers:

- Movie and TV detail pages select the first TMDB video whose type is `Trailer` and site is `YouTube`, then render an inline iframe.
- The detail action components can open the same trailer in `TrailerModal`; `?autoplay=true` opens that modal on page load.
- `VideoPlayer` is a reusable HTML5 `<video>` control with play/pause, seek, volume, skip, fullscreen, and close controls, but it has no current caller and accepts no media ID or progress callback.

## Reusable components

- `Header`, `Footer`, `Providers`, `ErrorBoundary`, `ToastContainer`, `LoadingSpinner`, and skeleton components provide application shell and feedback.
- `HeroBanner` renders the featured movie.
- `MovieRow` and `TVShowRow` provide horizontal scrolling sections with navigation arrows.
- `MovieCard` and `TVShowCard` provide poster hover actions for play, My List, like, and more info.
- `MovieDetailActions` and `TVShowDetailActions` centralize list, like, and trailer actions on detail pages.
- `TrailerModal` is the shared YouTube modal.
- `useMyList`, `useLikedItems`, and `useContinueWatching` encapsulate client persistence and Supabase synchronization.
- `cn` in `src/lib/utils.ts` merges Tailwind classes.

## Functionality that may be unnecessary for CatchUp

These are candidates for removal or replacement after the starter is understood:

- Netflix branding, copy, login background, and the Netflix-specific footer links; CatchUp will need its own identity and product language.
- Placeholder social links, notification button, service-code button, reCAPTCHA text, and the nonexistent forgot-password route.
- The unused generic `VideoPlayer` unless CatchUp chooses to support owned or licensed playback.
- The upstream deployment/push instructions that describe creating a separate `netflix-clone` repository and replacing `origin`.
- My List and likes may be retained as primitives, but their naming and data model should be reviewed against CatchUp’s show-centric sharing and recommendation model.
- “Similar” sections currently use popular content rather than a true similarity endpoint and may not justify their cost in a first CatchUp release.

## Environment requirements and accounts

Copy `.env.example` to `.env.local` and configure these values without committing the file:

| Variable | Required for | Value needed |
| --- | --- | --- |
| `NEXT_PUBLIC_TMDB_API_KEY` | Home, browse, detail, and search data | A TMDB developer API key. No key is included. |
| `NEXT_PUBLIC_TMDB_BASE_URL` | TMDB requests | Normally `https://api.themoviedb.org/3`; the code defaults to this if omitted. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser Supabase client/auth/database | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client/auth/database | Your Supabase project anon/public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | No current code path | Listed by upstream, but not used by this starter; do not configure unless a future server-only feature needs it. |
| `NEXT_PUBLIC_APP_URL` | Documented app/deployment setting | Local URL is normally `http://localhost:3000`; current source does not read it. |

Accounts required: a TMDB account/API application for the TMDB key and a Supabase account/project for auth/database. In Supabase, run `supabase-schema.sql` in the SQL editor before testing signup, My List, likes, or watch progress. For production auth, configure the deployed URL and redirect URLs in Supabase. No AI, friends, recommendation, or realtime-watch accounts are required yet because those features are not implemented.

## Technical risks

- With no TMDB key, server-rendered browse pages fail with HTTP 401 during local requests and production builds. There is no graceful missing-configuration state.
- `NEXT_PUBLIC_TMDB_API_KEY` is named public and the TMDB client is imported by client components such as search and Continue Watching, so the key may be exposed to the browser. A server-side proxy should be considered before production.
- `@supabase/auth-helpers-nextjs` is deprecated in favor of `@supabase/ssr`; there is no middleware/session-refresh strategy yet.
- Supabase setup is external and manual. RLS is protective only if the supplied schema is actually applied. Re-running the schema can also require policy cleanup because policies are created without `IF NOT EXISTS`.
- Each card creates its own My List and likes hook, which can multiply auth/database listeners and requests across a row.
- Several pages make five TMDB requests in parallel, and My List/Continue Watching make one detail request per saved item. Rate limits, latency, and partial failures need explicit handling.
- Watch-progress reads rely on RLS for isolation and do not explicitly filter by `user_id` in the query. The current schema supplies the intended protection, but this should be made explicit in a future repository layer.
- The current TypeScript build emits lint warnings for `any`, unused imports, and a missing hook dependency. The dependency tree also reports 17 npm audit findings, and Next reports an `@next/swc` version mismatch plus stale Browserslist data.
- Auth/profile state is primarily client-side and not enforced at the route boundary. The UI can briefly render unauthenticated shells before redirects.
- The source contains old upstream docs with a hardcoded Supabase project identifier and statements about an already-configured `.env.local`; treat those as historical documentation, not as this CatchUp environment.
- Trailer metadata, poster assets, and any future recap source must respect TMDB, YouTube, and other provider terms. The app currently has no spoiler-boundary model.

## Recommended next steps

1. Configure a personal TMDB key and Supabase project locally, apply the schema, and verify signup, browse, My List, likes, and sign-out end to end.
2. Replace the deprecated Supabase auth helpers with `@supabase/ssr`, add middleware/session handling, and move sensitive server work behind server-side boundaries.
3. Define CatchUp’s canonical show/season/episode/progress model, then finish playback progress with timestamp, episode identity, debouncing, resume behavior, completion rules, and tests before sharing progress.
4. Establish per-show sharing controls and privacy semantics so progress is opt-in, revocable, and never leaks spoilers by default.
5. Design the spoiler-safe recap/Q&A pipeline around explicit watched boundaries and server-only AI credentials; add provenance and evaluation before exposing it to users.
6. Add friend relationships, consent-aware recommendations, and a realtime Watch Together session model only after the identity and progress foundations are stable.
7. Remove or rewrite Netflix-specific branding and dead UI, add integration tests for auth/data isolation, and resolve dependency/lint warnings in a deliberate maintenance pass.
