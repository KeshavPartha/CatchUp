'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users2 } from 'lucide-react';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { createWatchSession, socialErrorMessage, type MediaType } from '@/lib/social';

interface WatchTogetherButtonProps {
  mediaId: number;
  mediaType: MediaType;
  title: string;
}

/**
 * Starts a Watch Together session for this title and opens the room.
 *
 * Friends are invited from inside the room rather than here: a session exists
 * before anyone is invited to it, so the invite picker needs a session id, and
 * splitting it across two dialogs would be worse than one.
 */
export function WatchTogetherButton({ mediaId, mediaType, title }: WatchTogetherButtonProps) {
  const router = useRouter();
  const { userId } = useCurrentUser();
  const supabase = useMemo(() => createSocialClient(), []);
  const [starting, setStarting] = useState(false);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const sessionId = await createWatchSession(supabase, mediaId, mediaType);
      router.push(`/watch/${sessionId}`);
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not start a session.'), 'error');
      setStarting(false);
    }
  }, [supabase, mediaId, mediaType, router]);

  if (!userId) return null;

  return (
    <button
      onClick={() => void start()}
      disabled={starting}
      className="flex items-center gap-2 rounded bg-white/20 px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors hover:bg-white/30 disabled:opacity-50"
      aria-label={`Watch ${title} together with a friend`}
    >
      <Users2 className="h-5 w-5" />
      <span className="hidden sm:inline">{starting ? 'Starting...' : 'Watch Together'}</span>
    </button>
  );
}
