'use client';

import { useFriendRequests } from '@/hooks/use-friend-requests';

/**
 * Live count of friend requests awaiting a response.
 *
 * Deliberately a separate component rather than logic inside `Header`: the
 * header is shared across workstreams, so keeping the data dependency here
 * means the social layer can change (or be removed) without touching the app
 * shell. It renders nothing at all when there is no one to respond to, so it
 * costs no layout space and shows nothing to signed-out visitors.
 */
export function FriendRequestsBadge() {
  const { pendingCount } = useFriendRequests();

  if (pendingCount <= 0) return null;

  return (
    <span
      className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-netflix-red px-1.5 text-[11px] font-bold leading-none text-white"
      aria-label={`${pendingCount} pending friend ${pendingCount === 1 ? 'request' : 'requests'}`}
    >
      {pendingCount > 9 ? '9+' : pendingCount}
    </span>
  );
}
