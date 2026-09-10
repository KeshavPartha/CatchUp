'use client';

import Link from 'next/link';
import { Users2 } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useWatchSessions } from '@/hooks/use-watch-sessions';
import { displayName } from '@/lib/social';

/**
 * Active Watch Together sessions and pending invitations.
 *
 * Sits above the tabs on /friends rather than inside one: an invitation is
 * time-sensitive in a way a friend request is not -- someone is waiting to
 * start watching -- so it should not require finding the right tab first.
 *
 * Renders nothing when there is nothing live.
 */
export function WatchSessionBanner() {
  const { sessions, loading } = useWatchSessions();

  if (loading || sessions.length === 0) return null;

  return (
    <ul className="mb-8 space-y-2">
      {sessions.map((session) => (
        <li key={session.sessionId}>
          <Link
            href={`/watch/${session.sessionId}`}
            className="flex items-center gap-3 rounded-lg border border-netflix-red/40 bg-netflix-red/10 p-4 transition-colors hover:bg-netflix-red/20"
          >
            <Users2 className="h-5 w-5 shrink-0 text-netflix-red" />
            <FriendAvatar profile={session.host} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {session.isHost
                  ? 'Your Watch Together session'
                  : session.hasJoined
                    ? `Watching with ${displayName(session.host)}`
                    : `${displayName(session.host)} invited you to watch together`}
              </p>
              <p className="text-xs text-netflix-lightGray">
                {session.participantCount}{' '}
                {session.participantCount === 1 ? 'person' : 'people'} in the session
              </p>
            </div>
            <span className="shrink-0 rounded bg-netflix-red px-3 py-1.5 text-xs font-semibold">
              {session.hasJoined ? 'Rejoin' : 'Join'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
