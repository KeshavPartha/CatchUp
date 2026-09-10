# CatchUp Roadmap

## Phase 1 — Foundation

**Status:** Mostly complete

Includes:

- Netflix-style starter integrated
- CatchUp branding
- Local demo catalog
- Supabase authentication/backend foundation
- Show/season/episode data model
- Watch progress
- Continue Watching
- Database schema for future features

Remaining foundation work:

- Apply the Supabase schema to the hosted CatchUp Supabase project
- Verify signup/login
- Verify watch-progress persistence across sessions
- Verify Continue Watching end-to-end
- Verify RLS isolation between users
- Add basic automated tests where valuable

## Phase 2 — Catch Me Up AI

**Owner:** Keshav

**Status:** Narrative retrieval, server-side recap generation, recap UI, follow-up Q&A, and a prototype narrative ingestion pipeline complete; provider configuration and broader evaluation remain.

Completed in this phase so far:

- Structured episode plot-event data
- Episode-based spoiler-boundary logic
- Retrieval pipeline that only returns completed prior-episode information
- Server-side recap endpoint and provider abstraction
- Catch Me Up UI with loading, error, empty, authentication, retry, and playback states
- Spoiler-safe follow-up Q&A endpoint and lightweight modal history
- Prototype transcript-to-plot-event ingestion pipeline

Build:

- Structured episode plot-event data
- Importance/relevance metadata for plot events
- Spoiler-boundary logic based on a user’s watch progress
- Retrieval pipeline that only returns information the user has already watched
- Concise `Catch Me Up` summaries
- Spoiler-safe follow-up Q&A
- Catch Me Up UI integrated into the show/episode experience
- Loading, error, and empty states
- Tests specifically covering spoiler leakage

**Important principle:** The model should never receive future plot information when generating a recap or answering a question.

Voice interaction is a possible future extension, not V1.

## Phase 3 — Social

**Owner:** Friend / social-workstream developer

Build:

- Friend requests and friendships
- Friend management UI
- Sending a show/movie recommendation to a friend
- Recommendations from friends surfaced in CatchUp
- Explicit per-show progress-sharing permissions
- Ability to choose which friends can see progress where practical
- Friend progress UI, such as:
  - “Alex is on S1 E5”
  - “You are 2 episodes behind”

Privacy requirements:

- Viewing history is private by default
- Becoming friends does not expose watch history
- Sharing must be explicit and scoped to a show
- Authorization must be enforced server-side/RLS, not just hidden in the UI

## Phase 4 — Watch Together

**Primary owner:** Friend / realtime-workstream developer

Build:

- Create/join watch rooms
- Invite/select friends
- Shared playback state
- Play
- Pause
- Seek
- Current episode
- Participant presence
- Reconnect handling
- Drift detection/resynchronization
- Access control for watch rooms

Use Supabase Realtime or another existing project-compatible realtime mechanism if appropriate.

The prototype uses demo/local playback and does not need commercial streaming infrastructure.

## Phase 5 — Product Integration and UI Polish

**Shared ownership**

Includes:

- Make AI and social functionality feel like one coherent product
- Refine the home page
- Refine the show-detail page
- Polish the Catch Me Up experience
- Polish friend recommendation/progress UI
- Polish Watch Together experience
- Responsive behavior
- Loading/error states
- Accessibility basics
- Consistent CatchUp design system

Target connected journey:

Friend recommends show → user starts watching → user optionally shares progress → user leaves for some time → Catch Me Up restores context → user catches up to friend → they optionally Watch Together

## Phase 6 — User Testing and Iteration

**Shared ownership, product lead: Keshav**

Test with real users where possible.

Evaluate:

- Whether users understand Catch Me Up
- Whether summaries contain the right amount of information
- Whether spoilers ever leak
- Whether users understand social privacy controls
- Whether sending/receiving recommendations feels useful
- Whether progress sharing feels comfortable
- Whether Watch Together is understandable and reliable

Possible product metrics:

- Catch Me Up → Play conversion
- Recap usefulness rating
- Friend recommendation → Play conversion
- Recommendation acceptance rate
- Progress-sharing opt-in rate
- Watch Together sessions
- Series-resume/completion behavior

## Phase 7 — Portfolio / Demo

**Shared ownership**

Produce:

- Polished GitHub README
- Architecture diagram
- Screenshots
- Short demo video
- Clear product problem statement
- Explanation of product decisions
- Privacy decisions
- AI architecture
- Realtime architecture
- User-testing findings
- Future roadmap
- Resume-ready project bullets
- PM-oriented case study for Keshav
- SWE-oriented technical write-up for the friend

## Not V1

- Messaging platform
- Public activity feed
- Automatic watch-history sharing
- Leaderboards/racing
- Heavy gamification
- Voice controls
- Production-scale media catalog
- Real Netflix/commercial streaming infrastructure
