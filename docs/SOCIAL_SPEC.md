# Social and Sharing Specification

## Status

Design only. Friends, recommendations, and progress sharing are not implemented in the foundation phase.

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
