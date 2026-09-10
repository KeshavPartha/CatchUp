# CatchUp Product Vision

CatchUp is a streaming-platform product prototype exploring how streaming can become easier to return to and more social without compromising privacy.

## Problem 1: Returning to a show

People often stop watching a series for days, weeks, or months and return without remembering important characters, relationships, or plot events. Their alternatives are restarting, continuing while confused, or searching online and risking spoilers.

CatchUp should provide a native `Catch Me Up` feature. If a user has watched through a specific episode, it should summarize only the important information from content already watched. Recaps should prioritize plot-relevant information, remember important characters and relationships, omit unnecessary details, never reveal information beyond the user’s progress, and support follow-up questions without future spoilers.

For example, a user stopped at Season 2 Episode 6. `Catch Me Up` summarizes important events through S2E6. Asked, “Why is Character A angry at Character B?”, the AI may use information through S2E6 but nothing from S2E7 onward. Voice interaction may be explored for television use later; it is not required for V1.

## Problem 2: Streaming is not very social

People discover shows through friends, discuss them with friends, and want to watch together. CatchUp should add a privacy-first social layer that eventually lets users:

- add friends;
- explicitly recommend a show or movie to a friend;
- see friend recommendations in the product;
- optionally share progress for a specific show with specific friends;
- see how far participating friends are in a show; and
- start synchronized Watch Together sessions.

Viewing history must not automatically be visible to friends. Progress sharing is explicit, opt-in, revocable, and scoped to a chosen show and eventually chosen people. Being friends must never imply access to viewing history.

## Connected user journey

Friend recommends a show → user starts watching → user optionally shares progress → user takes a break → Catch Me Up restores context → user catches up with their friend → they optionally Watch Together.

AI and social systems should feel like one product, not disconnected features.

## V1 priorities

1. Reliable accounts and authentication
2. Show, season, and episode data model
3. Reliable watch progress
4. Continue Watching
5. Spoiler-safe Catch Me Up
6. Spoiler-safe follow-up Q&A
7. Friends
8. Friend-to-friend show recommendations
9. Opt-in show progress sharing
10. Watch Together

## Not V1

- Social messaging platform
- Public activity feeds
- Automatic viewing-history sharing
- Racing, leaderboards, or extensive gamification
- Voice controls
- Production-scale content catalog
- Real commercial streaming infrastructure

## Project goals

CatchUp is both a product-management and software-engineering portfolio project. It should demonstrate thoughtful product decisions, privacy-conscious design, polished UX, real backend architecture, structured data modeling, AI/RAG-style retrieval with spoiler boundaries, authentication and authorization, realtime state synchronization for Watch Together, and maintainable production-style engineering practices.

The target is a polished prototype, not a production replacement for Netflix.
