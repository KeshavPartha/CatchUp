'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Database } from '@/lib/supabase/database.types';

export type ContinueWatchingItem = Database['public']['Tables']['watch_progress']['Row'];

export function useContinueWatching() {
  const [watchList, setWatchList] = useState<ContinueWatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchWatchProgress = useCallback(async (uid: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', uid)
      .eq('completed', false)
      .order('last_watched_at', { ascending: false })
      .limit(20);

    if (!error) setWatchList(data ?? []);
  }, []);

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
      setUserId(user?.id ?? null);
      if (user) await fetchWatchProgress(user.id);
      if (mounted) setLoading(false);
    };

    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) await fetchWatchProgress(uid);
      else setWatchList([]);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchWatchProgress]);

  const removeFromWatching = useCallback(async (item: ContinueWatchingItem) => {
    if (!userId) return;
    const supabase = createClient();
    let query = supabase
      .from('watch_progress')
      .delete()
      .eq('user_id', userId)
      .eq('media_type', item.media_type);

    if (item.media_type === 'movie' && item.media_id !== null) {
      query = query.eq('media_id', item.media_id);
    } else if (item.episode_id) {
      query = query.eq('episode_id', item.episode_id);
    } else {
      return;
    }

    const { error } = await query;
    if (!error) setWatchList((current) => current.filter((currentItem) => currentItem.id !== item.id));
  }, [userId]);

  return {
    watchList,
    loading,
    removeFromWatching,
    isAuthenticated: Boolean(userId),
  };
}
