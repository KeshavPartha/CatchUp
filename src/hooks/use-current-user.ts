'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * The signed-in user's id, kept in sync with auth state.
 *
 * Reads the cached session first so authenticated UI renders without a network
 * round trip, then confirms with `getUser()`, which validates the token against
 * the server rather than trusting whatever is in local storage. `userId` is
 * only published once that confirmation succeeds.
 *
 * `loading` stays true until the first resolution, so callers can distinguish
 * "signed out" from "not known yet" and avoid flashing a signed-out state at a
 * user who is in fact signed in.
 */
export function useCurrentUser(): { userId: string | null; loading: boolean } {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const init = async () => {
      try {
        // Cached session: instant, but unverified.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (!session?.user) {
          setUserId(null);
          return;
        }

        // Server-verified. Only this result is published.
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isMounted) return;
        setUserId(user?.id ?? null);
      } catch {
        // Network failure or an aborted request under React Strict Mode.
        // Treat as "not signed in" rather than blocking the UI forever.
        if (isMounted) setUserId(null);
      } finally {
        if (isMounted && !settled.current) {
          settled.current = true;
          setLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUserId(session?.user?.id ?? null);
      if (!settled.current) {
        settled.current = true;
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { userId, loading };
}
