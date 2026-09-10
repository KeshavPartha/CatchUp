'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  listIncomingRequests,
  listOutgoingRequests,
  sendFriendRequest,
  socialErrorMessage,
  type FriendRequest,
} from '@/lib/social';

// Realtime topics must be unique per subscription: the same hook can be mounted
// more than once at a time (the header badge alongside the /friends page, say),
// and two channels sharing a topic on one connection interfere. A per-instance
// counter keeps them distinct.
let channelSeq = 0;

interface UseFriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  loading: boolean;
  /** Number of requests awaiting the user's response -- drives the nav badge. */
  pendingCount: number;
  /** Request ids currently mid-flight, so individual rows can show a busy state. */
  busyIds: ReadonlySet<string>;
  send: (recipientId: string) => Promise<boolean>;
  accept: (requestId: string) => Promise<boolean>;
  decline: (requestId: string) => Promise<boolean>;
  cancel: (requestId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Incoming and outgoing friend requests, kept live.
 *
 * Requests arrive over Supabase Realtime rather than polling. RLS applies to
 * the Realtime stream exactly as it does to a query, so a client is only ever
 * notified about rows its policies already permit it to read -- the live
 * channel widens nothing.
 *
 * This is intentionally the first Realtime surface in CatchUp: it proves the
 * Realtime + RLS plumbing on a low-stakes feature before Watch Together depends
 * on the same mechanism for playback synchronization.
 */
export function useFriendRequests(): UseFriendRequests {
  const { userId, loading: authLoading } = useCurrentUser();
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  // One client for the lifetime of the hook: Realtime channels are bound to a
  // connection, so a fresh client per render would leak sockets. null when
  // Supabase is unconfigured -- every caller below must treat that as an
  // empty, signed-out state rather than calling createClient() and throwing.
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const channelId = useMemo(() => {
    channelSeq += 1;
    return channelSeq;
  }, []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !supabase) {
      setIncoming([]);
      setOutgoing([]);
      setLoading(false);
      return;
    }

    try {
      const [incomingRows, outgoingRows] = await Promise.all([
        listIncomingRequests(supabase),
        listOutgoingRequests(supabase),
      ]);

      if (!mounted.current) return;
      setIncoming(incomingRows);
      setOutgoing(outgoingRows);
    } catch (error) {
      if (!mounted.current) return;
      showToast(socialErrorMessage(error, 'Could not load your friend requests.'), 'error');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [supabase, userId]);

  // Initial load, and reload whenever the signed-in user changes.
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, refresh]);

  // Live updates.
  useEffect(() => {
    if (!userId || !supabase) return;

    // Requests share the `friendships` table with the accepted-friend graph
    // (see use-friends.ts), so any change to a row the viewer is party to --
    // pending or otherwise -- re-triggers a refresh here too.
    const channel = supabase
      .channel(`friend-requests:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          // A separate listener because PostgREST filters cannot express OR
          // across two columns.
          filter: `requester_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  const withBusy = useCallback(
    async (id: string, action: () => Promise<void>, failure: string): Promise<boolean> => {
      if (!supabase) return false;

      setBusyIds((prev) => new Set(prev).add(id));

      try {
        await action();
        await refresh();
        return true;
      } catch (error) {
        showToast(socialErrorMessage(error, failure), 'error');
        // Re-sync: the optimistic removal below may have been wrong.
        await refresh();
        return false;
      } finally {
        if (mounted.current) {
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    },
    [supabase, refresh]
  );

  const send = useCallback(
    async (recipientId: string): Promise<boolean> =>
      withBusy(
        recipientId,
        async () => {
          if (!supabase) return;
          await sendFriendRequest(supabase, recipientId);
          showToast('Friend request sent', 'success');
        },
        'Could not send that friend request.'
      ),
    [supabase, withBusy]
  );

  const accept = useCallback(
    async (requestId: string): Promise<boolean> => {
      // Optimistic: the row leaves the inbox immediately.
      setIncoming((prev) => prev.filter((request) => request.requestId !== requestId));

      return withBusy(
        requestId,
        async () => {
          if (!supabase) return;
          await acceptFriendRequest(supabase, requestId);
          showToast("You're now friends", 'success');
        },
        'Could not accept that friend request.'
      );
    },
    [supabase, withBusy]
  );

  const decline = useCallback(
    async (requestId: string): Promise<boolean> => {
      setIncoming((prev) => prev.filter((request) => request.requestId !== requestId));

      return withBusy(
        requestId,
        async () => {
          if (!supabase) return;
          await declineFriendRequest(supabase, requestId);
          showToast('Request declined', 'info');
        },
        'Could not decline that friend request.'
      );
    },
    [supabase, withBusy]
  );

  const cancel = useCallback(
    async (requestId: string): Promise<boolean> => {
      setOutgoing((prev) => prev.filter((request) => request.requestId !== requestId));

      return withBusy(
        requestId,
        async () => {
          if (!supabase) return;
          await cancelFriendRequest(supabase, requestId);
          showToast('Request withdrawn', 'info');
        },
        'Could not cancel that friend request.'
      );
    },
    [supabase, withBusy]
  );

  return {
    incoming,
    outgoing,
    loading: loading || authLoading,
    pendingCount: incoming.length,
    busyIds,
    send,
    accept,
    decline,
    cancel,
    refresh,
  };
}
