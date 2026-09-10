'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  endWatchParty,
  inviteToWatchParty,
  leaveWatchParty,
  listPartyMembers,
  livePositionOf,
  socialErrorMessage,
  updatePartyPlayback,
  type PartyMember,
  type WatchPartyState,
} from '@/lib/social';

/**
 * How far a player may drift before it should correct itself.
 *
 * Below this, seeking is more disruptive than the drift -- a hard seek is
 * visible and audible, while half a second of skew between two people is not.
 */
export const DRIFT_TOLERANCE_SECONDS = 1.5;

interface PlaybackBroadcast {
  userId: string;
  positionSeconds: number;
  isPlaying: boolean;
  /** Monotonic party revision, used to discard events that arrive late. */
  revision: number;
}

interface UseWatchParty {
  party: WatchPartyState | null;
  members: PartyMember[];
  /** User ids currently connected, from Realtime presence. */
  presentUserIds: ReadonlySet<string>;
  loading: boolean;
  connected: boolean;
  isHost: boolean;
  /**
   * Where playback should be right now, in seconds.
   *
   * A function rather than state: while playing this changes every frame, and
   * holding it in state would re-render the tree at 60fps. Consumers poll it
   * from their own timer and correct only past DRIFT_TOLERANCE_SECONDS.
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
 * Drives one Watch Together party.
 *
 * ---------------------------------------------------------------------------
 * Two transports, on purpose
 * ---------------------------------------------------------------------------
 * Every playback transition goes out twice: over Realtime BROADCAST, which
 * reaches other clients in tens of milliseconds and never touches the database,
 * and through `update_party_playback`, which commits it durably and returns a
 * monotonic revision.
 *
 * Broadcast alone would desync anyone who reloads. Persistence alone would make
 * every pause feel laggy. Each is used for what it is good at, and the revision
 * is what lets a client tell a stale broadcast from a current one -- exactly
 * what docs/WATCH_TOGETHER_SPEC.md asks for.
 *
 * ---------------------------------------------------------------------------
 * Host authority
 * ---------------------------------------------------------------------------
 * Per the spec, the host is the authority for play/pause and seeking. Guests
 * receive state and render it; their `play`/`pause`/`seek` are no-ops rather
 * than errors, because the UI already hides the controls and a rejected write
 * would be a confusing way to learn that.
 */
export function useWatchParty(partyId: string | null): UseWatchParty {
  const { userId } = useCurrentUser();
  const [party, setParty] = useState<WatchPartyState | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [presentUserIds, setPresentUserIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isHost = Boolean(party && userId && party.hostId === userId);

  const refresh = useCallback(async () => {
    if (!supabase || !partyId || !userId) {
      setParty(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      // Read the row directly: RLS already restricts watch_parties to members,
      // so a dedicated RPC would add nothing.
      const [{ data: row }, memberRows] = await Promise.all([
        supabase.from('watch_parties').select('*').eq('id', partyId).maybeSingle(),
        listPartyMembers(supabase, partyId),
      ]);

      if (!mounted.current) return;

      setParty(
        row
          ? {
              partyId: row.id,
              hostId: row.host_id,
              showId: row.show_id,
              episodeId: row.episode_id,
              status: row.status,
              isPlaying: row.is_playing,
              positionSeconds: row.position_seconds,
              revision: Number(row.revision),
              updatedAt: row.updated_at,
            }
          : null
      );
      setMembers(memberRows);
    } catch (error) {
      if (mounted.current) {
        showToast(socialErrorMessage(error, 'Could not load this session.'), 'error');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [supabase, partyId, userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !partyId || !userId) return;

    // NOTE: unlike the other social hooks, this topic is deliberately NOT made
    // unique per instance. Every member must join the SAME channel for
    // broadcast and presence to reach each other -- the shared name is the
    // rendezvous point.
    const channel = supabase.channel(`watch-party:${partyId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'playback' }, ({ payload }) => {
        const event = payload as PlaybackBroadcast;
        if (event.userId === userId) return;

        setParty((prev) => {
          if (!prev) return prev;
          // Discard anything not newer than what we already have. Broadcast is
          // unordered, so without this a late-arriving pause could undo a
          // seek that happened after it.
          if (event.revision <= prev.revision) return prev;

          return {
            ...prev,
            isPlaying: event.isPlaying,
            positionSeconds: event.positionSeconds,
            revision: event.revision,
            updatedAt: new Date().toISOString(),
          };
        });
      })
      .on('presence', { event: 'sync' }, () => {
        setPresentUserIds(new Set(Object.keys(channel.presenceState())));
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watch_parties', filter: `id=eq.${partyId}` },
        // The durable record, and the only signal for things broadcast does not
        // cover -- the host ending the session, say.
        () => void refresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watch_party_members',
          filter: `party_id=eq.${partyId}`,
        },
        () => void refresh()
      )
      .subscribe((status) => {
        if (!mounted.current) return;
        const joined = status === 'SUBSCRIBED';
        setConnected(joined);
        if (joined) void channel.track({ userId });
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, partyId, userId, refresh]);

  const livePosition = useCallback(
    (): number => (party ? livePositionOf(party) : 0),
    [party]
  );

  const commit = useCallback(
    async (positionSeconds: number, isPlaying: boolean, eventType: 'play' | 'pause' | 'seek') => {
      // Guests never drive playback; the UI hides the controls, and silently
      // ignoring is kinder than surfacing a permission error they cannot act on.
      if (!supabase || !partyId || !userId || !isHost) return;

      const position = Math.max(0, positionSeconds);

      // Local state first, so the host sees no lag on their own action.
      setParty((prev) =>
        prev
          ? { ...prev, isPlaying, positionSeconds: position, updatedAt: new Date().toISOString() }
          : prev
      );

      try {
        // Persist first here, unlike a pure-broadcast design: the revision it
        // returns is what makes the broadcast safely orderable for receivers.
        const revision = await updatePartyPlayback(
          supabase,
          partyId,
          position,
          isPlaying,
          eventType
        );

        setParty((prev) => (prev ? { ...prev, revision } : prev));

        const payload: PlaybackBroadcast = {
          userId,
          positionSeconds: position,
          isPlaying,
          revision,
        };
        await channelRef.current?.send({ type: 'broadcast', event: 'playback', payload });
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not sync playback.'), 'error');
        await refresh();
      }
    },
    [supabase, partyId, userId, isHost, refresh]
  );

  const play = useCallback((position: number) => commit(position, true, 'play'), [commit]);
  const pause = useCallback((position: number) => commit(position, false, 'pause'), [commit]);
  const seek = useCallback(
    (position: number) => commit(position, party?.isPlaying ?? false, 'seek'),
    [commit, party?.isPlaying]
  );

  const invite = useCallback(
    async (friendId: string): Promise<boolean> => {
      if (!supabase || !partyId) return false;
      try {
        await inviteToWatchParty(supabase, partyId, friendId);
        showToast('Invitation sent', 'success');
        await refresh();
        return true;
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not send that invitation.'), 'error');
        return false;
      }
    },
    [supabase, partyId, refresh]
  );

  const leave = useCallback(async () => {
    if (!supabase || !partyId) return;
    try {
      await leaveWatchParty(supabase, partyId);
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not leave that session.'), 'error');
    }
  }, [supabase, partyId]);

  const end = useCallback(async () => {
    if (!supabase || !partyId) return;
    try {
      await endWatchParty(supabase, partyId);
      showToast('Session ended', 'info');
      await refresh();
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not end that session.'), 'error');
    }
  }, [supabase, partyId, refresh]);

  return {
    party,
    members,
    presentUserIds,
    loading,
    connected,
    isHost,
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
