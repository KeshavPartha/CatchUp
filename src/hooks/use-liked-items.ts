'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'netflix_liked_items';

interface LikedItem {
  id: string;
  media_id: number;
  media_type: 'movie' | 'tv';
  created_at: string;
}

// localStorage helpers
const getLocalLikes = (): LikedItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setLocalLikes = (list: LikedItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable
  }
};

export function useLikedItems() {
  const [likedItems, setLikedItems] = useState<LikedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Load from localStorage first for instant UI
    const localLikes = getLocalLikes();
    if (localLikes.length > 0) {
      setLikedItems(localLikes);
    }

    const supabase = createClient();

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isMounted) return;

        setUserId(user?.id ?? null);

        if (user) {
          await fetchFromSupabase(user.id, isMounted);
        }
      } catch {
        // Ignore abort errors from React Strict Mode
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;

      const newUserId = session?.user?.id ?? null;
      setUserId(newUserId);

      if (newUserId) {
        await fetchFromSupabase(newUserId, isMounted);
      } else {
        setLikedItems(getLocalLikes());
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchFromSupabase = async (uid: string, isMounted = true) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('liked_items')
        .select('id, media_id, media_type, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        // Ignore abort errors (caused by React Strict Mode)
        if (error.message?.includes('abort')) return;
        console.error('Error fetching likes:', error.message);
        return;
      }

      const list = data || [];
      setLikedItems(list);
      setLocalLikes(list);
    } catch {
      // Ignore abort errors from React Strict Mode
    }
  };

  const isLiked = useCallback((mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    return likedItems.some(item => item.media_id === mediaId && item.media_type === mediaType);
  }, [likedItems]);

  const toggleLike = useCallback(async (mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    const alreadyLiked = isLiked(mediaId, mediaType);

    if (alreadyLiked) {
      // Remove like - optimistic update
      setLikedItems(prev => {
        const updated = prev.filter(
          item => !(item.media_id === mediaId && item.media_type === mediaType)
        );
        setLocalLikes(updated);
        return updated;
      });

      // If not logged in, just update localStorage
      if (!userId) return true;

      // Sync to Supabase
      const supabase = createClient();
      const { error } = await supabase
        .from('liked_items')
        .delete()
        .eq('user_id', userId)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType);

      if (error) {
        // Rollback on error
        await fetchFromSupabase(userId);
        return false;
      }
      return true;
    }

    // Add like - optimistic update
    const tempItem: LikedItem = {
      id: `temp_${Date.now()}`,
      media_id: mediaId,
      media_type: mediaType,
      created_at: new Date().toISOString(),
    };

    setLikedItems(prev => {
      const updated = [tempItem, ...prev];
      setLocalLikes(updated);
      return updated;
    });

    // If not logged in, just keep in localStorage
    if (!userId) return true;

    // Sync to Supabase
    const supabase = createClient();
    const { error } = await supabase
      .from('liked_items')
      .insert({ media_id: mediaId, media_type: mediaType, user_id: userId } as any);

    if (error) {
      // Rollback on error
      setLikedItems(prev => {
        const updated = prev.filter(item => item.id !== tempItem.id);
        setLocalLikes(updated);
        return updated;
      });
      return false;
    }

    // Refresh to get real ID
    await fetchFromSupabase(userId);
    return true;
  }, [userId, isLiked]);

  return {
    likedItems,
    loading,
    isLiked,
    toggleLike,
    isAuthenticated: !!userId,
  };
}

