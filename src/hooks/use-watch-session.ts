'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  endWatchSession,
  heartbeatWatchSession,
  inviteToWatchSession,
  leaveWatchSession,
  listSessionParticipants,
  livePositionOf,
  socialErrorMessage,
  updatePlaybackState,
  type SessionParticipant,
  type WatchSessionState,
} from '@/lib/social';

/** How often to refresh the durable presence timestamp. */
const HEARTBEAT_MS = 45_000;

/**
 * How far out of step a player may drift before the adapter should correct it.
 *
 * Below this, seeking is more disruptive than the drift itself -- a hard seek
 * is visible and audible, while half a second of skew between two people is
 * not. Exported so a player adapter uses the same threshold this hook assumes.
 */
export const DRIFT_TOLERANCE_SECONDS = 1.5;

interface PlaybackBroadcast {
  userId: string;
  positionSeconds: number;
  isPlaying: boolean;
  /** Client clock, used only to age the event, never to set position. */
  sentAt: number;
}

interface UseWatchSession {
  session: WatchSessionState | null;
  participants: SessionParticipant[];
  /** User ids currently connected to the channel, from Realtime presence. */
  presentUserIds: ReadonlySet<string>;
  loading: boolean;
  /** Whether the Realtime channel is subscribed. */
  connected: boolean;
  isHost: boolean;
  /**
   * The position the video should be at *right now*, in seconds.
   *
   * A function rather than state on purpose: while playing, this changes every
   * frame, and storing it in state would re-render the whole tree at 60fps. A
   * player adapter polls this from its own timer or rAF loop and seeks only
   * when the gap exceeds DRIFT_TOLERANCE_SECONDS.
   */
  livePosition: () => number;
  play: (positionSeconds: number) => Promise<void>;
  pause: (positionSeconds: number) => Promise<void>;
  seek: (positionSeconds: number) => Promise<void>;
  invite: (friendId: string) => Promise<boolean>;
  leave: () => Promise<void>;
  end: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Drives one Watch Together session.
 *
 * ---------------------------------------------------------------------------
 * Two transports, on purpose
 * ---------------------------------------------------------------------------
 * Every playback transition goes out twice:
 *
 *   * over Realtime BROADCAST, which reaches the other clients in tens of
 *     milliseconds and never touches the database; and
 *   * through `update_playback_state`, which commits it durably.
 *
 * Broadcast is what makes the experience feel synchronized. The database row is
 * what makes it survivable -- it is the state a late joiner or a reconnecting
 * client reads, and it is subject to RLS, so a client that has no business in
 * the session cannot write it regardless of what it broadcasts.
 *
 * Broadcast alone would desync anyone who reloads. Persistence alone would make
 * every pause feel laggy. Neither is sufficient, so both are used, each for
 * what it is good at.
 *
 * ---------------------------------------------------------------------------
 * Player-agnostic
 * ---------------------------------------------------------------------------
 * This hook holds no reference to a video element. It exposes the intended
 * state (`livePosition()`, `session.isPlaying`) and accepts commands
 * (`play`/`pause`/`seek`). Binding it to a real player is an adapter that polls
 * `livePosition()` and corrects when drift exceeds the tolerance.
 *
 * CatchUp currently only plays YouTube trailers, so no adapter ships yet --
 * what to synchronize is a content decision, not a social one.
 */
export function useWatchSession(sessionId: string | null): UseWatchSession {
  const { userId } = useCurrentUser();
  const [session, setSession] = useState<WatchSessionState | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [presentUserIds, setPresentUserIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const supabase = useMemo(() => createSocialClient(), []);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId || !userId) {
      setSession(null);
      setParticipants([]);
      setLoading(false);
      return;
    }

    try {
      // Reads the row directly: RLS already restricts watch_sessions to
      // participants, so no dedicated RPC would add anything.
      const [{ data: row, error }, participantRows] = await Promise.all([
        supabase.from('watch_sessions').select('*').eq('id', sessionId).maybeSingle(),
        listSessionParticipants(supabase, sessionId),
      ]);

      if (!mounted.current) return;

      if (error || !row) {
        setSession(null);
      } else {
        setSession({
          sessionId: row.id,
          hostId: row.host_id,
          mediaId: row.media_id,
          mediaType: row.media_type,
          status: row.status,
          isPlaying: row.is_playing,
          positionSeconds: row.position_seconds,
          positionUpdatedAt: row.position_updated_at,
        });
      }

      setParticipants(participantRows);
    } catch (error) {
      if (!mounted.current) return;
      showToast(socialErrorMessage(error, 'Could not load this session.'), 'error');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [supabase, sessionId, userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // --- Realtime -------------------------------------------------------------
  useEffect(() => {
    if (!sessionId || !userId) return;

    // NOTE: unlike the other social hooks, this topic is deliberately NOT made
    // unique per instance. Every participant must join the SAME channel for
    // broadcast and presence to reach each other -- the shared name is the
    // rendezvous point.
    const channel = supabase.channel(`watch-session:${sessionId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'playback' }, ({ payload }) => {
        const event = payload as PlaybackBroadcast;
        // `broadcast: { self: false }` should stop our own events coming back,
        // but echo suppression is cheap and a duplicate seek is very visible.
        if (event.userId === userId) return;

        // Trust the position, not the sender's clock: their `sentAt` comes from
        // a machine whose time we cannot verify, so it is only used to age the
        // event, never to compute where the video should be.
        setSession((prev) =>
          prev
            ? {
                ...prev,
                isPlaying: event.isPlaying,
                positionSeconds: event.positionSeconds,
                positionUpdatedAt: new Date().toISOString(),
              }
            : prev
        );
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setPresentUserIds(new Set(Object.keys(state)));
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watch_sessions', filter: `id=eq.${sessionId}` },
        // The durable record of a transition, and the only signal for things
        // broadcast does not cover -- the host ending the session, say.
        () => void refresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watch_session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => void refresh()
      )
      .subscribe((status) => {
        if (!mounted.current) return;
        const isJoined = status === 'SUBSCRIBED';
        setConnected(isJoined);
        if (isJoined) {
          void channel.track({ userId, at: Date.now() });
        }
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, sessionId, userId, refresh]);

  // --- Durable presence -----------------------------------------------------
  useEffect(() => {
    if (!sessionId || !userId) return;

    void heartbeatWatchSession(supabase, sessionId);
    const timer = setInterval(() => {
      void heartbeatWatchSession(supabase, sessionId);
    }, HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [supabase, sessionId, userId]);

  // --- Derived position -----------------------------------------------------
  const livePosition = useCallback(
    (): number => (session ? livePositionOf(session) : 0),
    [session]
  );

  // --- Transitions ----------------------------------------------------------
  const commit = useCallback(
    async (positionSeconds: number, isPlaying: boolean) => {
      if (!sessionId || !userId) return;

      const position = Math.max(0, positionSeconds);

      // Local state first, so the person who pressed the button sees no lag.
      setSession((prev) =>
        prev
          ? {
              ...prev,
              isPlaying,
              positionSeconds: position,
              positionUpdatedAt: new Date().toISOString(),
            }
          : prev
      );

      // Broadcast next: this is the path that makes it feel instant.
      const payload: PlaybackBroadcast = {
        userId,
        positionSeconds: position,
        isPlaying,
        sentAt: Date.now(),
      };
      await channelRef.current?.send({ type: 'broadcast', event: 'playback', payload });

      // Persist last. If this fails the session is momentarily in sync but not
      // durable, so re-read rather than leaving clients disagreeing with the
      // record they will reload from.
      try {
        await updatePlaybackState(supabase, sessionId, position, isPlaying);
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not sync playback.'), 'error');
        await refresh();
      }
    },
    [supabase, sessionId, userId, refresh]
  );

  const play = useCallback((position: number) => commit(position, true), [commit]);
  const pause = useCallback((position: number) => commit(position, false), [commit]);
  const seek = useCallback(
    (position: number) => commit(position, session?.isPlaying ?? false),
    [commit, session?.isPlaying]
  );

  const invite = useCallback(
    async (friendId: string): Promise<boolean> => {
      if (!sessionId) return false;
      try {
        await inviteToWatchSession(supabase, sessionId, friendId);
        showToast('Invitation sent', 'success');
        await refresh();
        return true;
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not send that invitation.'), 'error');
        return false;
      }
    },
    [supabase, sessionId, refresh]
  );

  const leave = useCallback(async () => {
    if (!sessionId) return;
    try {
      await leaveWatchSession(supabase, sessionId);
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not leave that session.'), 'error');
    }
  }, [supabase, sessionId]);

  const end = useCallback(async () => {
    if (!sessionId) return;
    try {
      await endWatchSession(supabase, sessionId);
      showToast('Session ended', 'info');
      await refresh();
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not end that session.'), 'error');
    }
  }, [supabase, sessionId, refresh]);

  return {
    session,
    participants,
    presentUserIds,
    loading,
    connected,
    isHost: Boolean(session && userId && session.hostId === userId),
    livePosition,
    play,
    pause,
    seek,
    invite,
    leave,
    end,
    refresh,
  };
}
