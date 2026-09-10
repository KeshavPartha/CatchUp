'use client';

import Link from 'next/link';
import { Users2 } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useWatchParties } from '@/hooks/use-watch-parties';
import { displayName } from '@/lib/social';

/**
 * Active Watch Together sessions and invitations.
 *
 * Sits above the tabs on /friends rather than inside one: someone is waiting to
 * start watching, so it should not require finding the right tab first.
 * Renders nothing when there is nothing live.
 */
export function WatchPartyBanner() {
  const { parties, loading } = useWatchParties();

  if (loading || parties.length === 0) return null;

  return (
    <ul className="mb-8 space-y-2">
      {parties.map((party) => (
        <li key={party.partyId}>
          <Link
            href={`/watch/${party.partyId}`}
            className="flex items-center gap-3 rounded-lg border border-netflix-red/40 bg-netflix-red/10 p-4 transition-colors hover:bg-netflix-red/20"
          >
            <Users2 className="h-5 w-5 shrink-0 text-netflix-red" />
            <FriendAvatar profile={party.host} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {party.isHost
                  ? 'Your Watch Together session'
                  : `Watching with ${displayName(party.host)}`}
              </p>
              <p className="text-xs text-netflix-lightGray">
                {party.memberCount} {party.memberCount === 1 ? 'person' : 'people'} in the session
              </p>
            </div>
            <span className="shrink-0 rounded bg-netflix-red px-3 py-1.5 text-xs font-semibold">
              Join
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
