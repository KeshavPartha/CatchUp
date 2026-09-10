'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  displayName,
  listFriendShowProgress,
  listShareTargets,
  revokeAllShowProgress,
  revokeShowProgress,
  shareShowProgress,
  socialErrorMessage,
  type FriendShowProgress,
  type ShareTarget,
} from '@/lib/social';

// Realtime topics must be unique per subscription; see use-friends.ts.
let channelSeq = 0;

interface UseProgressSharing {
  /** Friends who could be shared this show, flagged with the current state. */
  targets: ShareTarget[];
  /** Friends who have shared THIS show with the current user. */
  friendProgress: FriendShowProgress[];
  loading: boolean;
  sharedCount: number;
  busyIds: ReadonlySet<string>;
  toggle: (target: ShareTarget) => Promise<void>;
  revokeAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Sharing state for a single show, in both directions: who the current user
 * shares it with, and which friends share it back.
 *
 * Scoped to one show on purpose. The vision's promise is that sharing is
 * "explicit, opt-in, revocable, and scoped to a chosen show", so there is
 * deliberately no API here for sharing everything at once -- the shape of the
 * hook mirrors the shape of the permission.
 *
 * Show-level rather than episode-level because that is the grain the
 * permission is stored at: one grant covers a show, and the friend view then
 * reports how far through that show each friend is.
 */
export function useProgressSharing(showId: string | null): UseProgressSharing {
  const { userId, loading: authLoading } = useCurrentUser();
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [friendProgress, setFriendProgress] = useState<FriendShowProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

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
    if (!supabase || !userId || !showId) {
      setTargets([]);
      setFriendProgress([]);
      setLoading(false);
      return;
    }

    try {
      const [targetRows, progressRows] = await Promise.all([
        listShareTargets(supabase, showId),
        listFriendShowProgress(supabase, showId),
      ]);

      if (!mounted.current) return;
      setTargets(targetRows);
      setFriendProgress(progressRows);
    } catch (error) {
      if (mounted.current) {
        showToast(socialErrorMessage(error, 'Could not load sharing settings.'), 'error');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [supabase, userId, showId]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, refresh]);

  // A friend starting or stopping a share should show up without a reload --
  // and so should one of ours being revoked because a friendship ended.
  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`progress-shares:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress_shares', filter: `owner_id=eq.${userId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress_shares', filter: `friend_id=eq.${userId}` },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  const toggle = useCallback(
    async (target: ShareTarget) => {
      if (!supabase || !showId) return;

      setBusyIds((prev) => new Set(prev).add(target.userId));
      const nextShared = !target.isShared;

      // Optimistic: the switch moves immediately.
      setTargets((prev) =>
        prev.map((item) =>
          item.userId === target.userId ? { ...item, isShared: nextShared } : item
        )
      );

      try {
        if (nextShared) {
          await shareShowProgress(supabase, showId, target.userId);
          showToast(`Sharing this show with ${displayName(target)}`, 'success');
        } else {
          await revokeShowProgress(supabase, showId, target.userId);
          showToast(`Stopped sharing with ${displayName(target)}`, 'info');
        }
        await refresh();
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not update sharing.'), 'error');
        await refresh();
      } finally {
        if (mounted.current) {
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(target.userId);
            return next;
          });
        }
      }
    },
    [supabase, showId, refresh]
  );

  const revokeAll = useCallback(async () => {
    if (!supabase || !showId) return;

    setTargets((prev) => prev.map((item) => ({ ...item, isShared: false })));

    try {
      await revokeAllShowProgress(supabase, showId);
      showToast('Stopped sharing this show', 'info');
      await refresh();
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not stop sharing.'), 'error');
      await refresh();
    }
  }, [supabase, showId, refresh]);

  return {
    targets,
    friendProgress,
    loading: loading || authLoading,
    sharedCount: targets.filter((target) => target.isShared).length,
    busyIds,
    toggle,
    revokeAll,
    refresh,
  };
}
