# CatchUp Team Split

## Keshav — AI / Product Workstream

Primary ownership:

- Catch Me Up
- Episode plot-event model
- Spoiler-safe retrieval
- AI recap generation
- Follow-up Q&A
- Recap UI/UX
- AI evaluation/testing
- Product flows
- User testing
- Product metrics
- Product/case-study documentation

Relevant docs:

- `PRODUCT_VISION.md`
- `PRODUCT_SPEC.md`
- `AI_RECAP_SPEC.md`
- `DATABASE.md`
- `ARCHITECTURE.md`

Recommended branch: `feature/ai-recap`

## Friend — Social / Realtime Workstream

Primary ownership:

- Friendships
- Friend requests
- Friend recommendations
- Progress-sharing permissions
- Social UI
- Authorization/RLS for social features
- Watch Together
- Realtime playback synchronization
- Reconnect/resync logic
- Realtime technical testing

Relevant docs:

- `PRODUCT_VISION.md`
- `PRODUCT_SPEC.md`
- `SOCIAL_SPEC.md`
- `WATCH_TOGETHER_SPEC.md`
- `DATABASE.md`
- `ARCHITECTURE.md`

Recommended branches:

- `feature/social`
- then `feature/watch-together`

## Shared ownership

Both developers should coordinate on:

- Supabase schema/migrations
- Authentication
- Shared TypeScript types
- Navigation/global layout
- Reusable components
- Architecture changes
- Environment/config changes
- Changes to core watch-progress behavior
- Integration between AI/social systems

## Git workflow

Use `main` as the stable integration branch.

Before beginning parallel work:

1. Finish and test the foundation branch.
2. Merge `foundation/core-platform` into `main`.
3. Pull the updated `main`.
4. Create feature branches from the same current `main`.

Rules:

- Use small logical commits.
- Do not make giant unrelated commits.
- Pull/rebase or merge current `main` before final integration.
- Do not force-push shared branches.
- Do not push secrets or `.env.local`.
- Avoid editing the same files simultaneously when possible.
- Open pull requests for meaningful feature phases.
- Run lint, typecheck, build, and tests before merging.

## Database coordination

Database changes are a shared dependency.

Rules:

- Do not independently rewrite `supabase-schema.sql` in conflicting ways.
- Prefer additive migration files for future schema changes.
- Each migration should have a clear purpose.
- Schema changes needed by both workstreams should be merged into `main` early.
- Update `DATABASE.md` whenever the schema materially changes.
- Use RLS for authorization-sensitive user data.
- Do not rely on frontend-only privacy checks.

## Ownership boundaries

Keshav should not substantially modify social/realtime internals without coordination.

The social developer should not substantially modify the AI recap/retrieval pipeline without coordination.

Either developer may fix small shared bugs, but should avoid broad refactors in the other person’s feature area.

## Integration contracts

Both workstreams should use stable shared identifiers:

- User ID
- Show ID
- Season ID
- Episode ID
- Watch-progress record

The AI system should read watch progress but should not need to know social implementation details.

The social system may read explicitly permitted watch progress but should not depend on AI internals.

Watch Together should operate on playback/episode state and should not modify Catch Me Up behavior.

Keep feature boundaries modular enough that one system can change without rewriting the others.

## Source of truth

Repository documentation is the canonical project context.

Future AI/Codex sessions should read:

- `AGENTS.md`
- `docs/PRODUCT_VISION.md`
- The relevant feature spec
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/ROADMAP.md`
- `docs/TEAM_SPLIT.md`

Important product or architecture decisions made later should be reflected in these docs rather than existing only in chat history.
