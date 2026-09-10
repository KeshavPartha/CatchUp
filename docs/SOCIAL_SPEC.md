# CatchUp Social Specification

Owner: Social / Realtime workstream.

Covers friendships, friend requests, friend-to-friend recommendations, explicit
per-show progress sharing, the privacy and authorization model behind all of
them, and the path to Watch Together.

Out of scope for this document and this workstream: AI recap generation,
spoiler-safe retrieval, follow-up Q&A, and AI-specific UI or infrastructure.
Those belong to the AI / Catch Me Up workstream.

---

## 1. Product principles

These come from `docs/PRODUCT_VISION.md` and are binding on every design
decision below.

1. **Friendship grants nothing by itself.** Being friends must never imply
   access to viewing history. It grants exactly one thing: the ability to send
   each other recommendations.
2. **Progress sharing is explicit, scoped, and revocable.** A user shares one
   chosen title with chosen people, and can stop at any time.
3. **No public surface.** No activity feeds, no browsable directory, no
   discoverable social graph.
4. **The database is the enforcement boundary.** Every privacy rule is a Row
   Level Security policy. UI-level filtering is a convenience, never a control.

---

## 2. Status

| Area | State |
| --- | --- |
| Friend graph schema (migration 001) | **Written, not yet applied or verified.** Blocked on the baseline `supabase-schema.sql` work in progress. |
| RLS privacy test suite | Partially written; deliberately not run until the baseline settles. |
| Social repository layer (`src/lib/social/`) | Implemented, typechecks clean. |
| Friend hooks + `/friends` UI | Implemented, builds clean. |
| Recommendations | Not started. |
| Per-show progress sharing | Not started. |
| Watch Together | Not started. |

Milestone 1 is "friend graph, end to end". Its application code is complete;
its database half is staged pending coordination.

---

## 3. Data model

### 3.1 `friendships` — canonical and symmetric

One row per friendship, never two mirrored rows, with
`CHECK (user_a_id < user_b_id)` enforcing a canonical ordering.

Rationale: a pair can only be stored one way, so "are these two friends" is a
single unambiguous lookup, and unfriending is one atomic `DELETE` with no
possibility of half-removed state. The cost is that reads must resolve "the
other user" — hidden inside `list_friends()` so no caller ever sees it.

Foreign keys point at `public.profiles`, not `auth.users`, so a friendship
always has a readable profile on both ends.

**There is deliberately no INSERT policy and no UPDATE policy on this table.**
The only writer is `accept_friend_request()`. A client cannot forge a friendship
under any circumstances, even with a valid JWT and direct table access. Consent
is structurally required rather than merely checked — this is the single most
important property of the schema.

### 3.2 `friend_requests` — directional, with lifecycle

`(id, sender_id, recipient_id, status, created_at, responded_at)` where status
is `pending | accepted | declined | cancelled`.

A partial unique index on `(sender_id, recipient_id) WHERE status = 'pending'`
allows at most one *open* request per ordered pair while retaining terminal rows
as history — so a declined request can be re-sent later without conflict.

**Declines are silent.** `list_outgoing_friend_requests()` returns pending rows
only, so a sender is never told they were refused. This is a product decision:
the alternative discloses a judgement the recipient did not choose to share.

### 3.3 `profiles.username` — discovery without enumeration

Discovery by raw email confirms whether an address has a CatchUp account, which
is a disclosure we should not offer to unauthenticated guessing. A username is a
handle the user chooses to hand out, so it is the safer primary key for
discovery.

Auto-generated at signup from the email local part, backfilled for existing
rows, editable at `/profile`. Format `^[a-z0-9_]{3,20}$`, unique
case-insensitively via a `lower(username)` index.

---

## 4. Authorization model

> **RLS is the enforcement floor. RPCs are the ergonomic surface on top of it.**

Most RPCs are `SECURITY INVOKER`, so policies still apply inside them — they
provide clear errors and hide schema details, never elevated access.

`SECURITY DEFINER` is used in exactly three places, each with a stated
justification, and **every one pins `search_path`** to defeat search-path
hijacking (the standard escalation path against definer functions):

| Function | Why it must be DEFINER |
| --- | --- |
| `are_friends(a, b)` | Called from RLS policies on *other* tables where the caller may not be either of the two users being compared. |
| `accept_friend_request(id)` | The only writer of `friendships`, which has no INSERT policy. Re-derives the actor from `auth.uid()` and refuses unless that user is the recipient of a pending request. |
| `search_users(q)` | Must read a stranger's profile, which no policy permits. Constrained to exact match and a fixed minimal projection. |

`are_friends()` being the single definition of friendship matters beyond
tidiness: every future policy — progress sharing, recommendations, Watch
Together participation — calls it, so a correction to the friendship rule
propagates everywhere at once and the rules cannot drift apart.

### 4.1 `profiles` disclosure

The baseline policy is `auth.uid() = id`: you can read nobody's profile but your
own, which makes every social surface unrenderable. Migration 001 adds a second
policy granting the minimum needed — **friends**, and **the counterparty of an
open request** (without which a request inbox cannot show who is asking).

Postgres ORs permissive policies, so this widens rather than replaces the
baseline. No recursion: the new policy reads `friend_requests`, whose policies
compare only against `auth.uid()` and never reference `profiles`.

### 4.2 `search_users` — the one stranger-facing read

Three properties make it acceptable:

- **Exact match only.** No prefix, no fuzzy, no `LIKE`. A searcher must already
  know the handle or address, so the directory cannot be enumerated or
  harvested.
- **Fixed minimal projection**: id, username, full name, avatar. Email is never
  returned, so an email lookup confirms nothing the searcher did not supply.
- **Self excluded.**

It also returns the viewer's current relationship to each result, so the UI can
render the right action without a second query that would itself leak state.

### 4.3 Abuse controls

- Reciprocal requests auto-accept: if A asks B while B has already asked A, both
  have expressed the same intent, so a second confirmation is friction with no
  privacy benefit.
- A ceiling of 50 pending outbound requests per user.
- `send_friend_request` is idempotent — sending twice returns the existing row.

---

## 5. Defence in depth: the Continue Watching fix

`useContinueWatching` selected from `watch_progress` **with no `user_id`
filter**, relying entirely on RLS to scope rows. That was safe only for as long
as `watch_progress` had exactly one SELECT policy.

Because Postgres ORs permissive policies, the friend-read policy that per-show
progress sharing will add **can only widen what that query returns** — and an
unfiltered `SELECT` would then silently list a friend's shows inside the user's
own Continue Watching row. A privacy leak introduced by a change in a different
file, with nothing in the query itself to review.

Fixed ahead of the sharing work, with the reasoning recorded at the call site.

**Standing rules this establishes:**

1. Every social query filters explicitly by user **and** is protected by RLS.
   Neither alone is sufficient.
2. Review every new policy against the *whole existing policy set*, never in
   isolation. A new permissive policy is always a widening.

---

## 6. Testing privacy

RLS is the control, so the tests target RLS directly rather than the UI.

`supabase/tests/bootstrap.sql` shims the Supabase surface — `auth` schema,
`auth.users`, `auth.uid()`, the PostgREST roles — onto stock PostgreSQL, so the
suite runs locally and in CI with only `psql`. No Supabase project, no network,
no secrets. `grants.sql` then replicates Supabase's permissive default grants,
so the suite exercises RLS under production-like conditions rather than passing
because a missing `GRANT` happened to block the statement.

Tests impersonate users via `SET LOCAL ROLE authenticated` plus
`request.jwt.claims`, and **assert the negatives**. A suite that only proves
sharing works has tested nothing. Required cases:

- A stranger reads another user's progress → 0 rows
- A friend with no share reads progress → 0 rows
- A friend with a share on show X reads show Y → 0 rows *(per-show scoping)*
- Revoked, then read → 0 rows
- Unfriended while a share is live, then read → 0 rows *(friendship re-checked at read time)*
- A user's own Continue Watching returns only their rows while shares to them exist *(§5 regression)*
- Forged `sender_id` on a request → rejected
- Direct `INSERT INTO friendships` → rejected *(the §3.1 guarantee)*
- Recommendation to a non-friend → rejected
- `search_users('parti')` → 0 rows *(no enumeration)*

---

## 7. Cross-workstream coordination

Changes made outside this workstream's own files, and why:

| File | Change | Note for the other workstream |
| --- | --- | --- |
| `supabase-schema.sql` | **Untouched.** | Treated as the frozen baseline; all social DDL lives in `supabase/migrations/`. |
| `profiles` (via migration 001) | Adds nullable `username`; replaces `handle_new_user()` to populate it | Additive. Profile creation behaviour is otherwise identical. **This is the likeliest conflict point with in-progress baseline work.** |
| `src/lib/supabase/database.types.ts` | Adds social tables, RPC signatures, enums; adds `Relationships: []` to the four existing tables | See below — the `Relationships` addition is a bug fix, not a social change. |
| `src/hooks/use-continue-watching.ts` | Explicit `user_id` filter | §5. Behaviour-preserving today; prevents a leak later. |
| `src/components/header.tsx` | Adds a `Friends` nav entry and a self-contained badge component | Additive; the badge's data dependency lives in `src/components/social/`. |
| `src/app/profile/page.tsx` | Renders `UsernameCard` | Additive. |

### 7.1 A pre-existing type defect worth knowing about

supabase-js's `GenericTable` requires a `Relationships` field. The handwritten
`database.types.ts` never had one, so the whole `Database` type failed
`GenericSchema` conformance and *every* typed Supabase call silently degraded to
`never`. **That is the real reason the existing hooks reach for `as any` on
Supabase mutations** — a type-layer defect, not a real one. Adding
`Relationships: []` fixes it; the existing `as any` casts can now be removed
whenever that workstream chooses.

### 7.2 Deprecated auth helpers

`@supabase/auth-helpers-nextjs` is typed against an older supabase-js generic
signature — it passes the schema *object* where supabase-js 2.93 expects a
schema *name*. The resulting client cannot resolve `Functions`, so `.rpc()` is
untyped.

Contained to one documented cast in `src/lib/social/client.ts`, with the removal
condition stated: migrating to `@supabase/ssr` makes it unnecessary. **That
migration is a shared decision and is not made here.** It matters most for Watch
Together, where long-lived sessions make the missing session-refresh strategy a
real failure mode.

### 7.3 Shared gaps, flagged not fixed

- **No middleware / route protection.** `/friends` guards client-side, matching
  `/profile`. RLS still protects the data; only the shell can flash.
- **Episode-level progress does not exist.** `watch_progress` is show-level and
  percentage-only. The vision requires "watched through S2E6", and both
  workstreams need the same boundary — social to show how far a friend is, AI
  for its spoiler cutoff. **This must be designed jointly.**

---

## 8. Implemented in Milestone 1

```
supabase/migrations/001_social_friend_graph.sql   friend graph, RLS, RPCs, Realtime
supabase/tests/bootstrap.sql, grants.sql          Supabase-on-plain-Postgres shim
src/lib/social/                                   typed repository + errors
src/hooks/use-current-user.ts                     verified auth identity
src/hooks/use-friends.ts                          live friend list
src/hooks/use-friend-requests.ts                  live request inbox
src/app/friends/page.tsx                          friends / requests / add
src/components/social/                            avatar, cards, search, badge, username
```

### 8.1 Realtime, deliberately early

Friend requests arrive over Supabase Realtime rather than polling. RLS applies
to the Realtime stream exactly as to a query, so a client is only notified about
rows its policies already permit — the live channel widens nothing.

This is the first Realtime surface in CatchUp on purpose: it proves the
Realtime + RLS plumbing on a low-stakes feature *before* Watch Together depends
on the same mechanism for playback synchronization. `friendships` carries
`REPLICA IDENTITY FULL` so DELETE events include the removed row.

---

## 9. Planned work

### 9.1 Recommendations (next)

`recommendations(id, sender_id, recipient_id, media_id, media_type, note,
status, created_at)`, status `pending | seen | dismissed | added`.

The INSERT policy requires `auth.uid() = sender_id` **and**
`are_friends(sender_id, recipient_id)` — friendship enforced in the database,
not assumed by the UI.

### 9.2 Per-show progress sharing

`progress_shares(owner_id, shared_with_user_id, media_id, media_type,
created_at)` — **one row per (title, recipient)**, rather than an
`audience: 'all_friends' | 'selected'` enum. "Share with all friends" becomes a
UI fan-out. This gives per-person scoping from day one, matching the vision's
"eventually chosen people" with no later migration, and keeps the RLS predicate
a trivial equality check.

The policy everything hinges on — an additional SELECT on `watch_progress`
requiring three independent conditions: an explicit grant, for that specific
title, between users who are *currently* friends. Re-checking friendship at read
time means unfriending instantly revokes every share without a cleanup job.

Revocation ships in the same milestone as granting. Never after.

### 9.3 Watch Together

`watch_sessions` (host, media, episode, playback state, position, `updated_at`)
and `watch_session_participants`, participant-only RLS, invites gated by the
same `are_friends()`.

Playback sync should ride Realtime **broadcast + presence** for high-frequency
events (play/pause/seek/heartbeat), with the Postgres row as durable state for
late joiners and reconnects — persisting every tick would hammer the database
for no benefit.

Blocked on: real playback (`video-player.tsx` is currently unused and
trailer-only) and the `@supabase/ssr` session-refresh migration.
