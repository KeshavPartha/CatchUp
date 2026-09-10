'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { showToast } from '@/components/toast';

const STORAGE_KEY = 'netflix_my_list';

interface MyListItem {
  id: string;
  media_id: number;
  media_type: 'movie' | 'tv';
  created_at: string;
}

// localStorage helpers
const getLocalList = (): MyListItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setLocalList = (list: MyListItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable
  }
};

export function useMyList() {
  const [myList, setMyList] = useState<MyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize from localStorage immediately, then sync with Supabase
  useEffect(() => {
    let isMounted = true;

    // Load from localStorage first for instant UI
    const localList = getLocalList();
    if (localList.length > 0) {
      setMyList(localList);
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
        // User logged out - keep localStorage data
        setMyList(getLocalList());
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
        .from('my_list')
        .select('id, media_id, media_type, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        // Ignore abort errors (caused by React Strict Mode)
        if (error.message?.includes('abort')) return;
        console.error('Error fetching list:', error.message);
        return;
      }

      const list = data || [];
      setMyList(list);
      setLocalList(list); // Sync to localStorage
    } catch {
      // Ignore abort errors from React Strict Mode
    }
  };

  const isInList = useCallback((mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    return myList.some(item => item.media_id === mediaId && item.media_type === mediaType);
  }, [myList]);

  const addToList = useCallback(async (mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    // Optimistic update for instant UI feedback
    const tempItem: MyListItem = {
      id: `temp_${Date.now()}`,
      media_id: mediaId,
      media_type: mediaType,
      created_at: new Date().toISOString(),
    };

    setMyList(prev => {
      const updated = [tempItem, ...prev];
      setLocalList(updated);
      return updated;
    });

    // If not logged in, just keep in localStorage
    if (!userId) {
      showToast('Added to My List (sign in to sync)', 'success');
      return true;
    }

    // Sync to Supabase
    const supabase = createClient();
    const { error } = await supabase
      .from('my_list')
      .insert({ media_id: mediaId, media_type: mediaType, user_id: userId } as any);

    if (error) {
      // Rollback optimistic update
      setMyList(prev => {
        const updated = prev.filter(item => item.id !== tempItem.id);
        setLocalList(updated);
        return updated;
      });
      showToast('Failed to add to list', 'error');
      return false;
    }

    // Refresh from server to get real ID
    await fetchFromSupabase(userId);
    showToast('Added to My List', 'success');
    return true;
  }, [userId]);

  const removeFromList = useCallback(async (mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    // Find item to remove
    const itemToRemove = myList.find(
      item => item.media_id === mediaId && item.media_type === mediaType
    );
    if (!itemToRemove) return false;

    // Optimistic update
    setMyList(prev => {
      const updated = prev.filter(
        item => !(item.media_id === mediaId && item.media_type === mediaType)
      );
      setLocalList(updated);
      return updated;
    });

    // If not logged in, just update localStorage
    if (!userId) {
      showToast('Removed from My List', 'success');
      return true;
    }

    // Sync to Supabase
    const supabase = createClient();
    const { error } = await supabase
      .from('my_list')
      .delete()
      .eq('user_id', userId)
      .eq('media_id', mediaId)
      .eq('media_type', mediaType);

    if (error) {
      // Rollback
      setMyList(prev => {
        const updated = [itemToRemove, ...prev];
        setLocalList(updated);
        return updated;
      });
      showToast('Failed to remove from list', 'error');
      return false;
    }

    showToast('Removed from My List', 'success');
    return true;
  }, [userId, myList]);

  const toggleList = useCallback(async (mediaId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    if (isInList(mediaId, mediaType)) {
      return removeFromList(mediaId, mediaType);
    }
    return addToList(mediaId, mediaType);
  }, [isInList, addToList, removeFromList]);

  return {
    myList,
    loading,
    isInList,
    addToList,
    removeFromList,
    toggleList,
    isAuthenticated: !!userId,
  };
}

