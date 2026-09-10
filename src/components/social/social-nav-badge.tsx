'use client';

import { useFriendRequests } from '@/hooks/use-friend-requests';
import { useRecommendations } from '@/hooks/use-recommendations';
import { useWatchParties } from '@/hooks/use-watch-parties';

/**
 * Live count of everything on the Friends page waiting for the user: pending
 * friend requests, recommendations they have not opened, and live Watch
 * Together sessions.
 *
 * Deliberately a separate component rather than logic inside `Header`: the
 * header is shared across workstreams, so keeping the data dependency here
 * means the social layer can change (or be removed) without touching the app
 * shell. It renders nothing when there is nothing waiting, so it costs no
 * layout space and shows nothing to signed-out visitors.
 */
export function SocialNavBadge() {
  const { pendingCount } = useFriendRequests();
  const { unseenCount } = useRecommendations();
  const { parties } = useWatchParties();

  const total = pendingCount + unseenCount + parties.length;
  if (total <= 0) return null;

  return (
    <span
      className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-netflix-red px-1.5 text-[11px] font-bold leading-none text-white"
      aria-label={`${total} ${total === 1 ? 'item' : 'items'} waiting on your Friends page`}
    >
      {total > 9 ? '9+' : total}
    </span>
  );
}
