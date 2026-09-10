# Watch Together Specification

## Status

Design only. No realtime Watch Together implementation is included in the foundation phase.

## Session model

A host creates a session for a specific show and episode, invites or admits participants, and can end the session. Membership is explicit and revocable. The session is separate from personal watch progress and sharing permissions.

## Shared state

The authoritative session state should include episode ID, playback position, play/pause state, a monotonic revision or event sequence, and updated-at time. Clients apply only authorized, newer state and tolerate reconnects.

## Controls and policy

The host is the default authority for play/pause and seeking; the final product decision can add participant controls later. Personal progress is written independently for each participant. A session must not grant access to unrelated viewing history.

## Failure behavior

Reconnects resync from authoritative state. Stale events are ignored. If the session ends or membership is revoked, the client stops receiving shared updates but retains the user’s private progress.

## Future implementation boundary

Use Supabase Realtime or an equivalent authorized channel only after authentication, episode identity, progress persistence, and privacy policies are stable. Do not add a realtime dependency for the foundation checkpoint.
