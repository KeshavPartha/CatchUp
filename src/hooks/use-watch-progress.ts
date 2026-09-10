'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Episode } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Database } from '@/lib/supabase/database.types';

type WatchProgress = Database['public']['Tables']['watch_progress']['Row'];
type WatchProgressInsert = Database['public']['Tables']['watch_progress']['Insert'];

const toProgressPercent = (positionSeconds: number, durationSeconds: number) => {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
};

export function useWatchProgress(episode: Episode) {
  const durationSeconds = episode.runtime * 60;
  const [progress, setProgress] = useState<WatchProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProgress = useCallback(async (uid: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', uid)
      .eq('episode_id', episode.id)
      .maybeSingle();

    if (!error && data) setProgress(data);
  }, [episode.id]);

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
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserId(user?.id ?? null);
        if (user) await fetchProgress(user.id);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) await fetchProgress(uid);
      else setProgress(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProgress]);

  const persistProgress = useCallback(async (positionSeconds: number, completed: boolean) => {
    if (!userId) return;

    const safePosition = Math.min(durationSeconds, Math.max(0, Math.round(positionSeconds)));
    const payload: WatchProgressInsert = {
      user_id: userId,
      media_type: 'tv',
      media_id: episode.show_id,
      show_id: String(episode.show_id),
      season_id: episode.season_id,
      episode_id: episode.id,
      current_season_number: episode.season_number,
      current_episode_number: episode.episode_number,
      position_seconds: safePosition,
      duration_seconds: durationSeconds,
      progress_percent: toProgressPercent(safePosition, durationSeconds),
      completed: completed || safePosition >= durationSeconds,
      last_watched_at: new Date().toISOString(),
    };

    const supabase = createClient();
    const { data, error } = await supabase
      .from('watch_progress')
      .upsert(payload, { onConflict: 'user_id,episode_id' })
      .select()
      .single();

    if (!error && data) setProgress(data);
  }, [durationSeconds, episode, userId]);

  const updatePosition = useCallback((positionSeconds: number, completed = false) => {
    const safePosition = Math.min(durationSeconds, Math.max(0, Math.round(positionSeconds)));
    setProgress((current) => ({
      id: current?.id ?? `local-${episode.id}`,
      user_id: current?.user_id ?? userId ?? '',
      media_type: 'tv',
      media_id: episode.show_id,
      show_id: String(episode.show_id),
      season_id: episode.season_id,
      episode_id: episode.id,
      current_season_number: episode.season_number,
      current_episode_number: episode.episode_number,
      position_seconds: safePosition,
      duration_seconds: durationSeconds,
      progress_percent: toProgressPercent(safePosition, durationSeconds),
      completed: completed || safePosition >= durationSeconds,
      last_watched_at: new Date().toISOString(),
      created_at: current?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    if (!userId) return;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      void persistProgress(safePosition, completed);
    }, 1200);
  }, [durationSeconds, episode, persistProgress, userId]);

  const flush = useCallback(async (positionSeconds?: number, completed?: boolean) => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    if (!userId) return;
    if (positionSeconds !== undefined) {
      await persistProgress(positionSeconds, completed ?? false);
    } else if (progress) {
      await persistProgress(progress.position_seconds, progress.completed);
    }
  }, [persistProgress, progress, userId]);

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  return {
    progress,
    loading,
    isAuthenticated: Boolean(userId),
    updatePosition,
    flush,
  };
}
