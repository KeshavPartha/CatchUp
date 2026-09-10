'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  blockUser,
  displayName,
  listFriends,
  socialErrorMessage,
  unfriend,
  type Friend,
} from '@/lib/social';

// Realtime topics must be unique per subscription: the same hook can be mounted
// more than once at a time (the header badge alongside the /friends page, say),
// and two channels sharing a topic on one connection interfere. A per-instance
// counter keeps them distinct.
let channelSeq = 0;

interface UseFriends {
  friends: Friend[];
  loading: boolean;
  /** User ids currently mid-flight, so a single row can show a busy state. */
  busyIds: ReadonlySet<string>;
  isFriend: (userId: string) => boolean;
  remove: (friend: Friend) => Promise<boolean>;
  /** Blocks a friend. Mutual and total, and ends the friendship. */
  block: (friend: Friend) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * The current user's friend list, kept live.
 *
 * Subscribes to `friendships` so a list updates the moment a request is
 * accepted elsewhere -- including in the other person's browser. RLS applies to
 * the Realtime stream, so only friendships the viewer is part of are delivered.
 *
 * DELETE events carry the removed row because migration 001 sets
 * REPLICA IDENTITY FULL on the table; without it Postgres would publish only
 * the primary key and an unfriend elsewhere would not be actionable here.
 */
export function useFriends(): UseFriends {
  const { userId, loading: authLoading } = useCurrentUser();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  // null when Supabase is unconfigured -- every caller below must treat that as
  // an empty, signed-out state rather than calling createClient() and throwing.
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
      setFriends([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await listFriends(supabase);
      if (!mounted.current) return;
      setFriends(rows);
    } catch (error) {
      if (!mounted.current) return;
      showToast(socialErrorMessage(error, 'Could not load your friends.'), 'error');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (!userId || !supabase) return;

    // Two listeners because the viewer may be either the requester or the
    // addressee of a given row, and a filter cannot express OR.
    const channel = supabase
      .channel(`friendships:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `requester_id=eq.${userId}`,
        },
        () => void refresh()
      )
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  const isFriend = useCallback(
    (candidateId: string) => friends.some((friend) => friend.userId === candidateId),
    [friends]
  );

  const remove = useCallback(
    async (friend: Friend): Promise<boolean> => {
      if (!supabase) return false;

      setBusyIds((prev) => new Set(prev).add(friend.userId));
      // Optimistic: the row leaves the list immediately.
      setFriends((prev) => prev.filter((item) => item.userId !== friend.userId));

      try {
        await unfriend(supabase, friend.userId);
        showToast(`Removed ${displayName(friend)}`, 'info');
        await refresh();
        return true;
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not remove this friend.'), 'error');
        await refresh();
        return false;
      } finally {
        if (mounted.current) {
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(friend.userId);
            return next;
          });
        }
      }
    },
    [supabase, refresh]
  );

  const block = useCallback(
    async (friend: Friend): Promise<boolean> => {
      if (!supabase) return false;

      setBusyIds((prev) => new Set(prev).add(friend.userId));
      setFriends((prev) => prev.filter((item) => item.userId !== friend.userId));

      try {
        await blockUser(supabase, friend.userId);
        showToast(`Blocked ${displayName(friend)}`, 'info');
        return true;
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not block this user.'), 'error');
        return false;
      } finally {
        await refresh();
        if (mounted.current) {
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(friend.userId);
            return next;
          });
        }
      }
    },
    [supabase, refresh]
  );

  return {
    friends,
    loading: loading || authLoading,
    busyIds,
    isFriend,
    remove,
    block,
    refresh,
  };
}
