'use client';

import { useCallback, useEffect, useState } from 'react';
import { Episode } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Database } from '@/lib/supabase/database.types';
import { logSupabaseError } from '@/lib/supabase/logging';

type WatchProgress = Database['public']['Tables']['watch_progress']['Row'];

export function useShowPlaybackTarget(showId: number, episodes: Episode[]) {
  const [progressRows, setProgressRows] = useState<WatchProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async (userId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('show_id', String(showId));

    if (error) {
      logSupabaseError('show-playback-target', 'read', error, { userId, showId });
      return;
    }

    setProgressRows(data ?? []);
  }, [showId]);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    const supabase = createClient();
    const initialize = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (user) await fetchProgress(user.id);
      if (mounted) setLoading(false);
    };

    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) await fetchProgress(session.user.id);
      else setProgressRows([]);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProgress]);

  const currentProgress = [...progressRows]
    .filter((row) => row.episode_id && !row.completed)
    .sort((a, b) => new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime())[0];
  const currentEpisode = currentProgress ? episodes.find((episode) => episode.id === currentProgress.episode_id) : undefined;
  const targetEpisode =
    currentEpisode ||
    episodes.find((episode) => !progressRows.some((row) => row.episode_id === episode.id && row.completed)) ||
    episodes[0];

  return {
    targetEpisode,
    isResume: Boolean(currentEpisode && currentProgress && currentProgress.position_seconds > 0),
    loading,
  };
}
