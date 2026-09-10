'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import { listMyWatchParties, socialErrorMessage, type WatchPartySummary } from '@/lib/social';

// Realtime topics must be unique per subscription; see use-friends.ts.
let channelSeq = 0;

interface UseWatchParties {
  parties: WatchPartySummary[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Active Watch Together sessions the current user hosts or belongs to.
 *
 * Kept live so an invitation appears without a reload -- an invitation is
 * time-sensitive in a way a friend request is not, because someone is waiting
 * to start watching.
 */
export function useWatchParties(): UseWatchParties {
  const { userId, loading: authLoading } = useCurrentUser();
  const [parties, setParties] = useState<WatchPartySummary[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!supabase || !userId) {
      setParties([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await listMyWatchParties(supabase);
      if (mounted.current) setParties(rows);
    } catch (error) {
      if (mounted.current) {
        showToast(socialErrorMessage(error, 'Could not load your sessions.'), 'error');
      }
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
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`watch-parties:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watch_party_members',
          filter: `user_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  return { parties, loading: loading || authLoading, refresh };
}
