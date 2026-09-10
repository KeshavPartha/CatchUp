'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { displayName, listFriends, socialErrorMessage, unfriend, type Friend } from '@/lib/social';

interface UseFriends {
  friends: Friend[];
  loading: boolean;
  /** User ids currently mid-flight, so a single row can show a busy state. */
  busyIds: ReadonlySet<string>;
  isFriend: (userId: string) => boolean;
  remove: (friend: Friend) => Promise<boolean>;
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

  const supabase = useMemo(() => createSocialClient(), []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
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
    if (!userId) return;

    // Two listeners because the viewer may be on either side of the canonical
    // (user_a_id < user_b_id) ordering, and a filter cannot express OR.
    const channel = supabase
      .channel(`friendships:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_a_id=eq.${userId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_b_id=eq.${userId}` },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh]);

  const isFriend = useCallback(
    (candidateId: string) => friends.some((friend) => friend.userId === candidateId),
    [friends]
  );

  const remove = useCallback(
    async (friend: Friend): Promise<boolean> => {
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

  return {
    friends,
    loading: loading || authLoading,
    busyIds,
    isFriend,
    remove,
    refresh,
  };
}
