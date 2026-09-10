'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  listIncomingRecommendations,
  setRecommendationStatus,
  socialErrorMessage,
  type Recommendation,
} from '@/lib/social';

// Realtime topics must be unique per subscription: the same hook can be mounted
// more than once at a time (the header badge alongside the /friends page, say),
// and two channels sharing a topic on one connection interfere. A per-instance
// counter keeps them distinct.
let channelSeq = 0;

interface UseRecommendations {
  /** Open recommendations: pending and seen, newest first. */
  incoming: Recommendation[];
  loading: boolean;
  /** Unopened recommendations -- drives the inbox badge. */
  unseenCount: number;
  busyIds: ReadonlySet<string>;
  /** Marks everything currently pending as seen. */
  markAllSeen: () => Promise<void>;
  dismiss: (recommendationId: string) => Promise<boolean>;
  markAdded: (recommendationId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Recommendations sent to the current user, kept live.
 *
 * Like the friend hooks, updates arrive over Supabase Realtime, and RLS applies
 * to that stream exactly as it does to a query -- a client is only notified
 * about rows its policies already permit it to read.
 */
export function useRecommendations(): UseRecommendations {
  const { userId, loading: authLoading } = useCurrentUser();
  const [incoming, setIncoming] = useState<Recommendation[]>([]);
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
      setIncoming([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await listIncomingRecommendations(supabase);
      if (!mounted.current) return;
      setIncoming(rows);
    } catch (error) {
      if (!mounted.current) return;
      showToast(socialErrorMessage(error, 'Could not load your recommendations.'), 'error');
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

    const channel = supabase
      .channel(`recommendations:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recommendations',
          filter: `recipient_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  const respond = useCallback(
    async (
      recommendationId: string,
      status: 'dismissed' | 'added',
      success: string
    ): Promise<boolean> => {
      setBusyIds((prev) => new Set(prev).add(recommendationId));
      // Optimistic: acting on a recommendation removes it from the inbox.
      setIncoming((prev) => prev.filter((item) => item.recommendationId !== recommendationId));

      try {
        await setRecommendationStatus(supabase, recommendationId, status);
        showToast(success, status === 'added' ? 'success' : 'info');
        await refresh();
        return true;
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not update that recommendation.'), 'error');
        await refresh();
        return false;
      } finally {
        if (mounted.current) {
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(recommendationId);
            return next;
          });
        }
      }
    },
    [supabase, refresh]
  );

  const dismiss = useCallback(
    (recommendationId: string) => respond(recommendationId, 'dismissed', 'Recommendation dismissed'),
    [respond]
  );

  const markAdded = useCallback(
    (recommendationId: string) => respond(recommendationId, 'added', 'Added to My List'),
    [respond]
  );

  /**
   * Clears the unseen badge without resolving anything: the recommendations
   * stay in the inbox, they just stop counting as new. Failures are silent --
   * an unread badge that lingers is not worth interrupting anyone over.
   */
  const markAllSeen = useCallback(async () => {
    const pending = incoming.filter((item) => item.status === 'pending');
    if (pending.length === 0) return;

    setIncoming((prev) =>
      prev.map((item) => (item.status === 'pending' ? { ...item, status: 'seen' } : item))
    );

    await Promise.all(
      pending.map((item) =>
        setRecommendationStatus(supabase, item.recommendationId, 'seen').catch(() => undefined)
      )
    );
  }, [incoming, supabase]);

  return {
    incoming,
    loading: loading || authLoading,
    unseenCount: incoming.filter((item) => item.status === 'pending').length,
    busyIds,
    markAllSeen,
    dismiss,
    markAdded,
    refresh,
  };
}
