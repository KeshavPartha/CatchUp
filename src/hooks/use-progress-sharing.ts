'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  displayName,
  listFriendProgress,
  listShareTargets,
  revokeAllProgressShares,
  revokeProgressShare,
  shareProgress,
  socialErrorMessage,
  type FriendProgress,
  type MediaType,
  type ShareTarget,
} from '@/lib/social';

// Realtime topics must be unique per subscription; see use-friends.ts.
let channelSeq = 0;

interface UseProgressSharing {
  /** Friends who could be shared this title, flagged with the current state. */
  targets: ShareTarget[];
  /** Friends who have shared THIS title with the current user. */
  friendProgress: FriendProgress[];
  loading: boolean;
  /** How many friends this title is currently shared with. */
  sharedCount: number;
  busyIds: ReadonlySet<string>;
  toggle: (target: ShareTarget) => Promise<void>;
  revokeAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Sharing state for a single title, in both directions: who the current user
 * shares it with, and which friends share it back.
 *
 * Scoped to one title on purpose. The vision's promise is that sharing is
 * "explicit, opt-in, revocable, and scoped to a chosen show", so there is
 * deliberately no API here for sharing everything at once -- the shape of the
 * hook mirrors the shape of the permission.
 */
export function useProgressSharing(
  mediaId: number,
  mediaType: MediaType
): UseProgressSharing {
  const { userId, loading: authLoading } = useCurrentUser();
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [friendProgress, setFriendProgress] = useState<FriendProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const supabase = useMemo(() => createSocialClient(), []);
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
    if (!userId) {
      setTargets([]);
      setFriendProgress([]);
      setLoading(false);
      return;
    }

    try {
      const [targetRows, progressRows] = await Promise.all([
        listShareTargets(supabase, mediaId, mediaType),
        listFriendProgress(supabase, mediaId, mediaType),
      ]);

      if (!mounted.current) return;
      setTargets(targetRows);
      setFriendProgress(progressRows);
    } catch (error) {
      if (!mounted.current) return;
      showToast(socialErrorMessage(error, 'Could not load sharing settings.'), 'error');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [supabase, userId, mediaId, mediaType]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, refresh]);

  // A friend starting or stopping a share should show up without a reload --
  // and so should a share of ours being revoked because a friendship ended.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`progress-shares:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress_shares', filter: `owner_id=eq.${userId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'progress_shares',
          filter: `shared_with_user_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  const toggle = useCallback(
    async (target: ShareTarget) => {
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
          await shareProgress(supabase, mediaId, mediaType, target.userId);
          showToast(`Sharing your progress with ${displayName(target)}`, 'success');
        } else {
          await revokeProgressShare(supabase, mediaId, mediaType, target.userId);
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
    [supabase, mediaId, mediaType, refresh]
  );

  const revokeAll = useCallback(async () => {
    setTargets((prev) => prev.map((item) => ({ ...item, isShared: false })));

    try {
      await revokeAllProgressShares(supabase, mediaId, mediaType);
      showToast('Stopped sharing this title', 'info');
      await refresh();
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not stop sharing.'), 'error');
      await refresh();
    }
  }, [supabase, mediaId, mediaType, refresh]);

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
