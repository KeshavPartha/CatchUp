'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users2 } from 'lucide-react';
import { showToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import { createWatchParty, socialErrorMessage } from '@/lib/social';

interface WatchTogetherButtonProps {
  showId: number;
  episodeId: string;
  episodeName: string;
}

/**
 * Starts a Watch Together session for this episode and opens the room.
 *
 * Episode-scoped, not show-scoped: docs/WATCH_TOGETHER_SPEC.md defines a
 * session as "for a specific show and episode", and two people watching
 * together are watching one episode at a time.
 *
 * Friends are invited from inside the room rather than here, because a session
 * has to exist before anyone can be invited to it.
 */
export function WatchTogetherButton({ showId, episodeId, episodeName }: WatchTogetherButtonProps) {
  const router = useRouter();
  const { userId } = useCurrentUser();
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const [starting, setStarting] = useState(false);

  const start = useCallback(async () => {
    if (!supabase) return;
    setStarting(true);
    try {
      const partyId = await createWatchParty(supabase, String(showId), episodeId);
      router.push(`/watch/${partyId}`);
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not start a session.'), 'error');
      setStarting(false);
    }
  }, [supabase, showId, episodeId, router]);

  // Nothing to offer a signed-out visitor: the button only means anything once
  // you have friends, and an inert control is worse than no control.
  if (!userId || !supabase) return null;

  return (
    <button
      onClick={() => void start()}
      disabled={starting}
      className="flex items-center gap-2 rounded bg-netflix-gray px-4 py-2 text-sm font-semibold transition-colors hover:bg-netflix-gray/80 disabled:opacity-50"
      aria-label={`Watch ${episodeName} together with a friend`}
    >
      <Users2 className="h-4 w-4" />
      {starting ? 'Starting...' : 'Watch Together'}
    </button>
  );
}
