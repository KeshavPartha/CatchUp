'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  listMyWatchSessions,
  socialErrorMessage,
  type WatchSessionSummary,
} from '@/lib/social';

// Realtime topics must be unique per subscription; see use-friends.ts.
let channelSeq = 0;

interface UseWatchSessions {
  sessions: WatchSessionSummary[];
  /** Sessions the user was invited to but has not joined. */
  invitations: WatchSessionSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Active Watch Together sessions the current user hosts, has joined, or has
 * been invited to.
 *
 * Kept live so an invitation appears without a reload -- the same reason friend
 * requests do.
 */
export function useWatchSessions(): UseWatchSessions {
  const { userId, loading: authLoading } = useCurrentUser();
  const [sessions, setSessions] = useState<WatchSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

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
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await listMyWatchSessions(supabase);
      if (!mounted.current) return;
      setSessions(rows);
    } catch (error) {
      if (!mounted.current) return;
      showToast(socialErrorMessage(error, 'Could not load your sessions.'), 'error');
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
      .channel(`watch-sessions:${userId}:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watch_session_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, channelId]);

  return {
    sessions,
    invitations: sessions.filter((session) => !session.hasJoined),
    loading: loading || authLoading,
    refresh,
  };
}
