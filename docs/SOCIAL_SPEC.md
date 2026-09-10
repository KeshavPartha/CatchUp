# Social and Sharing Specification

## Status

**Implemented** on `feature/social`, on top of the foundation schema. The
foundation created every social table with RLS enabled and deliberately no
client policies; this workstream supplies the policies, helper functions, RPCs
and UI in `supabase/migrations/20260911_social_layer.sql`.

| Area | State |
| --- | --- |
| Friendships, requests, blocking | Implemented |
| Discovery (usernames, exact-match search) | Implemented |
| Recommendations | Implemented |
| Per-show progress sharing + privacy centre | Implemented |
| Watch Together (parties, host-authority sync) | Implemented |
| RLS privacy suites | 131 assertions, 4 suites, `npm run test:rls` |

Verified against the real foundation schema on a scratch PostgreSQL database.
**Not yet applied to a hosted Supabase project**, and not yet exercised in a
browser — see "Known gaps" below.

## Friend relationships

Users may request, accept, decline, block, and remove friendships. Relationship state is explicit and private; there is no public activity feed requirement.

## Recommendations

A user may explicitly recommend a show or movie to a specific friend. Recommendations record sender, recipient, content ID, optional message, creation time, and read/status state. A recommendation must not reveal the sender’s watch history.

## Progress sharing

Sharing is a separate permission from friendship. A user chooses the show, the friend or friends, and whether sharing is enabled. Permissions are revocable, scoped per show, and default to off. A recipient sees only the permitted show progress, not a global history or unrelated episodes.

## Spoiler behavior

Any shared progress must expose only a boundary appropriate to the recipient’s own progress and the product’s future spoiler policy. Social UI should avoid showing episode titles or plot context beyond what the viewer has authorized and can safely see.

## Non-goals

Messaging, public feeds, automatic sharing, follower counts, leaderboards, and gamification are not required for V1.


---

## Implementation notes

### Authorisation model

> **RLS is the enforcement boundary. RPCs are the ergonomic surface on top.**

Almost every RPC is `SECURITY INVOKER`, so policies still apply inside it.
`SECURITY DEFINER` is used only where a policy genuinely needs to read rows the
caller cannot see, and every such function pins `search_path` to defeat
search-path hijacking:

| Function | Why it must be DEFINER |
| --- | --- |
| `are_friends(a, b)` | Called from policies on `profiles` and `watch_progress`, where the caller may not be either party. |
| `is_blocked_between(a, b)` | Same, for the block check. |
| `search_users(q)` | Must read a stranger's profile, which no policy permits. Constrained to exact match and a fixed minimal projection. |
| `is_party_member` / `watch_party_host` | Break the recursive policy pair described below. |
| `block_user` | Clears the existing relationship in both directions atomically before recording the block. |

`are_friends()` is the single definition of friendship. Every policy calls it,
so a correction propagates everywhere at once and the rules cannot drift apart.

### Consent is structural

A `friendships` row can only be created `pending` or `blocked` — the INSERT
policy forbids `accepted` outright. A `BEFORE UPDATE` trigger then allows the
transition to `accepted` **only when the actor is the addressee**. The requester
cannot accept their own request under any circumstances, including by writing
the row directly. The same trigger prevents an addressee from resurrecting a
declined row to fabricate a request that was never made.

### The one policy that exposes viewing data

The friend-read policy on `watch_progress` requires four independent conditions:
an enabled, un-revoked grant; naming that exact `show_id`; on show progress
rather than a movie; between users who are friends **right now**. Friendship is
re-checked at read time, so ending one revokes every share instantly with no
cleanup job in the path.

### Defence in depth

Postgres ORs permissive policies, so that friend-read policy can only **widen**
what any `watch_progress` query returns. Every such query in the app must
therefore filter by `user_id` explicitly — without it, Continue Watching would
list a friend's show as the viewer's own. `supabase/tests/rls_progress_sharing.sql`
demonstrates exactly this: with one share live, an unfiltered read returns two
rows while a filtered one returns one.

### Recursion

"You can see a party if you are a member" and "you can see members of your
parties" reference each other — the classic infinitely-recursive policy pair.
Both go through `SECURITY DEFINER` helpers that read the tables directly and so
never re-enter a policy.

### Realtime

Friend requests, recommendations, shares and party membership all arrive over
Supabase Realtime rather than polling. RLS applies to the Realtime stream
exactly as to a query, so a client is only notified about rows its policies
already permit — the live channel widens nothing.

Watch Together additionally uses a **broadcast** channel for playback
transitions: broadcast lands in tens of milliseconds and never touches the
database, while `update_party_playback` commits the transition durably and
returns the monotonic `revision`. Broadcast alone would desync anyone who
reloads; persistence alone would make every pause feel laggy. The revision is
what lets a client discard a stale broadcast, as WATCH_TOGETHER_SPEC requires.

---

## Decisions taken

- **Usernames.** Discovery by raw email confirms whether an address has an
  account. A username is a handle the user chooses to hand out, so it is the
  safer primary key. Auto-generated at signup, editable at `/profile`.
- **Exact-match discovery only.** No prefix, no fuzzy, no `LIKE`. CatchUp has no
  browsable directory, and the UI says so at the point of search.
- **Declines are silent.** `list_outgoing_friend_requests` returns pending rows
  only, so a sender is never told they were refused.
- **Recommendations are idempotent**, one per title per pair, so re-sending
  cannot be used to nag.
- **Movies get recommendations but not sharing or parties.** `progress_shares`
  and `watch_parties` are keyed on a show; movies have no `show_id`.
- **Watch Together is host-authority**, per WATCH_TOGETHER_SPEC. Guests may
  append heartbeats and nothing else. Participant controls remain a documented
  future option.
- **Shared progress never spoils someone who is behind.** See below.

### Spoiler-safe shared progress

This spec's "Spoiler behavior" section requires that shared progress expose only
a boundary appropriate to the recipient's own progress. `list_friend_show_progress`
implements that by clamping:

| Friend's position | What the viewer sees |
| --- | --- |
| Behind, or level with the viewer | Exactly, as `S2 E6` |
| Ahead of the viewer | "Ahead of you", with season, episode and percentage all withheld |

A viewer who has not started the show has a boundary of zero, so every friend
reads as ahead — which is correct, since nothing is safe to reveal yet.

Two details worth stating:

- **The clamp is in the database, not the UI.** `docs/TEAM_SPLIT.md` is explicit
  that frontend-only privacy checks are not acceptable, so a client calling the
  RPC directly gets the same redaction. The UI cannot un-redact what it is
  given.
- **The progress bar is hidden too, not just the numbers.** A bar at 80% would
  imply a position as surely as the text would.

The viewer's own boundary is their furthest episode, not their most recent one:
rewatching an early episode must not retract a boundary they have already
passed.

## Cross-workstream coordination

| Change | Note |
| --- | --- |
| `profiles.username` added; `handle_new_user()` extended to populate it | Additive. Profile creation is otherwise identical. The only shared-table change. |
| `supabase-schema.sql` | **Untouched.** All social DDL lives in the migration. |
| `src/lib/supabase/database.types.ts` | Social tables and 36 RPC signatures added; foundation entries untouched. |
| `src/components/{movie,tv-show}-detail-actions.tsx`, `tv/[id]`, episode page, `header.tsx`, `page.tsx`, `profile/page.tsx` | Additive mounts of social components. |

## Known gaps

- **Never run against a hosted Supabase project or in a browser.** Everything is
  typechecked, linted, built, and verified at the SQL layer; the UI flows and
  Realtime behaviour are unexercised end to end.
- **No middleware.** `/friends` and `/watch/[partyId]` guard client-side, matching
  `/profile`. RLS still protects the data; only the shell can flash.
- **Watch Together has no video element.** CatchUp's playback is the controlled
  `DemoPlayer`, so the party room synchronises the clock and transport rather
  than a media element. Binding a real player is an adapter over the same state.
- **Auth pages assume Supabase.** `/login`, `/signup` and `/profile` build a
  Supabase client without checking `isSupabaseConfigured`, so they throw at
  runtime if a visitor reaches them with no credentials set. Foundation-owned,
  and low impact (there is nothing to sign into in that state), so it is flagged
  here rather than changed.
