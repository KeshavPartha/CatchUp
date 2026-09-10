'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Episode, Movie } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Database } from '@/lib/supabase/database.types';
import { logSupabaseError } from '@/lib/supabase/logging';

type WatchProgress = Database['public']['Tables']['watch_progress']['Row'];
type WatchProgressInsert = Database['public']['Tables']['watch_progress']['Insert'];
type Watchable = Episode | Movie;

const PROGRESS_INIT_TIMEOUT_MS = 10000;

const toProgressPercent = (positionSeconds: number, durationSeconds: number) => {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
};

const isEpisode = (media: Watchable): media is Episode => 'episode_number' in media;

const withTimeout = async <T,>(promise: PromiseLike<T>, message: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), PROGRESS_INIT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export function useWatchProgress(media: Watchable) {
  const episodeMedia = isEpisode(media) ? media : null;
  const mediaType = episodeMedia ? 'tv' : 'movie';
  const contentId = media.id;
  const durationSeconds = media.runtime * 60;
  const movieId: number | null = isEpisode(media) ? null : media.id;
  const showId = episodeMedia ? String(episodeMedia.show_id) : null;
  const seasonId = episodeMedia ? episodeMedia.season_id : null;
  const episodeId = episodeMedia ? episodeMedia.id : null;
  const seasonNumber = episodeMedia ? episodeMedia.season_number : null;
  const episodeNumber = episodeMedia ? episodeMedia.episode_number : null;

  const [progress, setProgress] = useState<WatchProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logContext = useMemo(() => ({ mediaType, mediaId: String(contentId) }), [contentId, mediaType]);

  const fetchProgress = useCallback(async (uid: string) => {
    try {
      const supabase = createClient();
      let query = supabase
        .from('watch_progress')
        .select('*')
        .eq('user_id', uid)
        .eq('media_type', mediaType)
        .limit(1);
      query = movieId === null ? query.eq('episode_id', String(contentId)) : query.eq('media_id', movieId);
      const { data, error } = await withTimeout(query.maybeSingle(), 'Timed out while loading saved progress.');

      if (error) {
        logSupabaseError('watch-progress', 'read', error, { ...logContext, userId: uid });
        setProgress(null);
        setSaveError('Progress could not be loaded from Supabase.');
        return;
      }

      setSaveError(null);
      setProgress(data ?? null);
    } catch (error) {
      logSupabaseError('watch-progress', 'read', error, { ...logContext, userId: uid });
      setProgress(null);
      setSaveError('Progress could not be loaded from Supabase.');
    }
  }, [contentId, logContext, mediaType, movieId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setProgress(null);
    setSaveError(null);

    if (!isSupabaseConfigured) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    const supabase = createClient();
    const initialize = async () => {
      try {
        const { data: { user }, error } = await withTimeout(
          supabase.auth.getUser(),
          'Timed out while checking the authenticated session.'
        );
        if (error) {
          logSupabaseError('watch-progress', 'get authenticated user', error, logContext);
          if (mounted) setSaveError('Authentication could not be verified.');
          return;
        }
        if (!mounted) return;
        setUserId(user?.id ?? null);
        if (user) {
          await fetchProgress(user.id);
        }
      } catch (error) {
        logSupabaseError('watch-progress', 'initialize', error, logContext);
        if (mounted) setSaveError('Progress initialization timed out. You can retry by refreshing the page.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initialize();
    // Do not await Supabase queries inside this callback. Auth listeners can
    // hold Supabase's auth lock while they run, which can deadlock a nested
    // watch_progress request and leave initialization loading forever.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setProgress(null);
        setSaveError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setTimeout(() => {
        if (!mounted) return;
        void fetchProgress(uid).finally(() => {
          if (mounted) setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProgress, logContext]);

  const persistProgress = useCallback(async (positionSeconds: number, completed: boolean) => {
    if (!userId) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[watch-progress] write skipped because no authenticated user is available', logContext);
      }
      return;
    }

    const safePosition = Math.min(durationSeconds, Math.max(0, Math.round(positionSeconds)));
    const payload: WatchProgressInsert = {
      user_id: userId,
      media_type: mediaType,
      media_id: movieId,
      show_id: showId,
      season_id: seasonId,
      episode_id: episodeId,
      current_season_number: seasonNumber,
      current_episode_number: episodeNumber,
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
        .upsert(payload, { onConflict: mediaType === 'tv' ? 'user_id,episode_id' : 'user_id,media_type,media_id' })
        .select()
        .single();

      if (error) {
        logSupabaseError('watch-progress', 'write', error, {
          ...logContext,
          userId,
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
        ...logContext,
        userId,
        positionSeconds: safePosition,
        completed: payload.completed,
      });
      setSaveError('Progress could not be saved to Supabase.');
    }
  }, [durationSeconds, episodeId, episodeNumber, logContext, mediaType, movieId, seasonId, seasonNumber, showId, userId]);

  const updatePosition = useCallback((positionSeconds: number, completed = false) => {
    const safePosition = Math.min(durationSeconds, Math.max(0, Math.round(positionSeconds)));
    setProgress((current) => ({
      id: current?.id ?? `local-${contentId}`,
      user_id: current?.user_id ?? userId ?? '',
      media_type: mediaType,
      media_id: movieId,
      show_id: showId,
      season_id: seasonId,
      episode_id: episodeId,
      current_season_number: seasonNumber,
      current_episode_number: episodeNumber,
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
  }, [contentId, durationSeconds, episodeId, episodeNumber, mediaType, movieId, persistProgress, seasonId, seasonNumber, showId, userId]);

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
