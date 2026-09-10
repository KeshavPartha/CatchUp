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
  const [userId, setUserId] = useState<string | null>(null);

  const fetchProgress = useCallback(
    async (userId: string) => {
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
    },
    [showId]
  );

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setUserId(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    const supabase = createClient();
    const initialize = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (!mounted) return;
        if (error) {
          logSupabaseError('show-playback-target', 'get authenticated user', error, { showId });
          setUserId(null);
          setProgressRows([]);
          return;
        }
        setUserId(user?.id ?? null);
        if (user) await fetchProgress(user.id);
      } catch (error) {
        logSupabaseError('show-playback-target', 'initialize', error, { showId });
        if (mounted) {
          setUserId(null);
          setProgressRows([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initialize();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUserId = session?.user?.id ?? null;
      setUserId(nextUserId);
      setProgressRows([]);

      if (!nextUserId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setTimeout(() => {
        if (!mounted) return;
        void fetchProgress(nextUserId).finally(() => {
          if (mounted) setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProgress, showId]);

  const currentProgress = [...progressRows]
    .filter((row) => row.episode_id && !row.completed)
    .sort(
      (a, b) => new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()
    )[0];
  const currentEpisode = currentProgress
    ? episodes.find((episode) => episode.id === currentProgress.episode_id)
    : undefined;
  const targetEpisode =
    currentEpisode ||
    episodes.find(
      (episode) => !progressRows.some((row) => row.episode_id === episode.id && row.completed)
    ) ||
    episodes[0];

  const isEligibleForRecap = (episode: Episode): boolean => {
    if (loading || !userId) return false;
    const targetIndex = episodes.findIndex((item) => item.id === episode.id);
    if (targetIndex <= 0) return false;

    return episodes
      .slice(0, targetIndex)
      .some((priorEpisode) =>
        progressRows.some((row) => row.episode_id === priorEpisode.id && row.completed)
      );
  };

  const isResumeForEpisode = (episode: Episode): boolean =>
    progressRows.some(
      (row) => row.episode_id === episode.id && !row.completed && row.position_seconds > 0
    );

  return {
    targetEpisode,
    isResume: Boolean(currentEpisode && currentProgress && currentProgress.position_seconds > 0),
    loading,
    isAuthenticated: Boolean(userId),
    isEligibleForRecap,
    isResumeForEpisode,
  };
}
