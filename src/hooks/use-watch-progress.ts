'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Episode, Movie } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Database } from '@/lib/supabase/database.types';
import { logSupabaseError } from '@/lib/supabase/logging';

type WatchProgress = Database['public']['Tables']['watch_progress']['Row'];
type WatchProgressInsert = Database['public']['Tables']['watch_progress']['Insert'];

const toProgressPercent = (positionSeconds: number, durationSeconds: number) => {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
};

type Watchable = Episode | Movie;

const isEpisode = (media: Watchable): media is Episode => 'episode_number' in media;

export function useWatchProgress(media: Watchable) {
  const durationSeconds = media.runtime * 60;
  const [progress, setProgress] = useState<WatchProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProgress = useCallback(async (uid: string) => {
    try {
      const supabase = createClient();
      let query = supabase
        .from('watch_progress')
        .select('*')
        .eq('user_id', uid)
        .eq('media_type', isEpisode(media) ? 'tv' : 'movie')
        .limit(1);
      query = isEpisode(media) ? query.eq('episode_id', media.id) : query.eq('media_id', media.id);
      const { data, error } = await query.maybeSingle();

      if (error) {
        logSupabaseError('watch-progress', 'read', error, {
          userId: uid,
          mediaType: isEpisode(media) ? 'tv' : 'movie',
          mediaId: String(media.id),
        });
        setSaveError('Progress could not be loaded from Supabase.');
        return;
      }

      setSaveError(null);
      setProgress(data ?? null);
    } catch (error) {
      logSupabaseError('watch-progress', 'read', error, {
        userId: uid,
        mediaType: isEpisode(media) ? 'tv' : 'movie',
        mediaId: String(media.id),
      });
      setSaveError('Progress could not be loaded from Supabase.');
    }
  }, [media]);

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
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          logSupabaseError('watch-progress', 'get authenticated user', error, {});
          return;
        }
        if (!mounted) return;
        setUserId(user?.id ?? null);
        if (user) await fetchProgress(user.id);
      } catch (error) {
        logSupabaseError('watch-progress', 'initialize', error, {});
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      try {
        if (uid) await fetchProgress(uid);
        else {
          setProgress(null);
          setSaveError(null);
        }
      } catch (error) {
        logSupabaseError('watch-progress', 'auth state change', error, { userId: uid });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProgress]);

  const persistProgress = useCallback(async (positionSeconds: number, completed: boolean) => {
    if (!userId) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[watch-progress] write skipped because no authenticated user is available');
      }
      return;
    }

    const safePosition = Math.min(durationSeconds, Math.max(0, Math.round(positionSeconds)));
    const payload: WatchProgressInsert = {
      user_id: userId,
      media_type: isEpisode(media) ? 'tv' : 'movie',
      media_id: isEpisode(media) ? null : media.id,
      show_id: isEpisode(media) ? String(media.show_id) : null,
      season_id: isEpisode(media) ? media.season_id : null,
      episode_id: isEpisode(media) ? media.id : null,
      current_season_number: isEpisode(media) ? media.season_number : null,
      current_episode_number: isEpisode(media) ? media.episode_number : null,
      position_seconds: safePosition,
      duration_seconds: durationSeconds,
      progress_percent: toProgressPercent(safePosition, durationSeconds),
      completed: completed || safePosition >= durationSeconds,
      last_watched_at: new Date().toISOString(),
    };

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('watch_progress')
        .upsert(payload, { onConflict: isEpisode(media) ? 'user_id,episode_id' : 'user_id,media_type,media_id' })
        .select()
        .single();

      if (error) {
        logSupabaseError('watch-progress', 'write', error, {
          userId,
          mediaType: payload.media_type,
          mediaId: String(media.id),
          positionSeconds: safePosition,
          completed: payload.completed,
        });
        setSaveError('Progress could not be saved to Supabase.');
        return;
      }

      setSaveError(null);
      if (data) setProgress(data);
    } catch (error) {
      logSupabaseError('watch-progress', 'write', error, {
        userId,
        mediaType: payload.media_type,
        mediaId: String(media.id),
        positionSeconds: safePosition,
        completed: payload.completed,
      });
      setSaveError('Progress could not be saved to Supabase.');
    }
  }, [durationSeconds, media, userId]);

  const updatePosition = useCallback((positionSeconds: number, completed = false) => {
    const safePosition = Math.min(durationSeconds, Math.max(0, Math.round(positionSeconds)));
    setProgress((current) => ({
      id: current?.id ?? `local-${media.id}`,
      user_id: current?.user_id ?? userId ?? '',
      media_type: isEpisode(media) ? 'tv' : 'movie',
      media_id: isEpisode(media) ? null : media.id,
      show_id: isEpisode(media) ? String(media.show_id) : null,
      season_id: isEpisode(media) ? media.season_id : null,
      episode_id: isEpisode(media) ? media.id : null,
      current_season_number: isEpisode(media) ? media.season_number : null,
      current_episode_number: isEpisode(media) ? media.episode_number : null,
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
  }, [durationSeconds, media, persistProgress, userId]);

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
    saveError,
    updatePosition,
    flush,
  };
}
