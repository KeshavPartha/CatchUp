'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';

type WatchProgressInsert = Database['public']['Tables']['watch_progress']['Insert'];

interface WatchProgress {
  id: string;
  user_id: string;
  media_id: number;
  media_type: 'movie' | 'tv';
  progress: number; // percentage 0-100
  last_watched: string;
}

export function useContinueWatching() {
  const [watchList, setWatchList] = useState<WatchProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const checkUser = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return;
        
        setUser(user);
        await fetchWatchProgress(user.id);
      } catch (error) {
        console.log('Auth check failed:', error);
      }
    };
    checkUser();
  }, []);

  const fetchWatchProgress = async (userId?: string) => {
    if (!userId && !user) return;

    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('watch_progress')
        .select('*')
        .order('last_watched', { ascending: false })
        .limit(20);

      if (error) {
        console.log('Error fetching watch progress:', error.message);
        return;
      }
      setWatchList(data || []);
    } catch (error) {
      console.log('Error fetching watch progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProgress = async (
    mediaId: number,
    mediaType: 'movie' | 'tv',
    progress: number
  ) => {
    if (!user) return;

    try {
      const supabase = createClient();
      const insertData: WatchProgressInsert = {
        user_id: user.id as string,
        media_id: mediaId,
        media_type: mediaType,
        progress: Math.min(100, Math.max(0, progress)),
        last_watched: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('watch_progress')
        .upsert(insertData, {
          onConflict: 'user_id,media_id,media_type'
        });

      if (error) throw error;
      await fetchWatchProgress(user.id);
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const removeFromWatching = async (mediaId: number, mediaType: 'movie' | 'tv') => {
    if (!user) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('watch_progress')
        .delete()
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .eq('user_id', user.id);

      if (error) throw error;
      await fetchWatchProgress(user.id);
    } catch (error) {
      console.error('Error removing from watching:', error);
    }
  };

  const getProgress = (mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    const item = watchList.find(
      (w) => w.media_id === mediaId && w.media_type === mediaType
    );
    return item?.progress || 0;
  };

  return {
    watchList,
    loading,
    updateProgress,
    removeFromWatching,
    getProgress,
    isAuthenticated: !!user,
  };
}

