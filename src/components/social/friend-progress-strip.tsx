'use client';

import { FriendAvatar } from '@/components/social/friend-avatar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProgressSharing } from '@/hooks/use-progress-sharing';
import { displayName, type FriendShowProgress } from '@/lib/social';

interface FriendProgressStripProps {
  /** Stable catalog show id, as stored on watch_progress.show_id. */
  showId: string;
}

/**
 * How far friends are through this title -- shown only for friends who have
 * explicitly shared it with the current user.
 *
 * Renders nothing when nobody has shared, which is the normal case. That
 * silence is the point: the absence of this strip is what "no automatic
 * sharing" looks like from the outside.
 *
 * Reports the episode boundary rather than a raw percentage: "S2 E6" is what a
 * viewer actually wants to know about a friend, and it is the same boundary
 * Catch Me Up uses, so the two features describe progress the same way.
 */
export function FriendProgressStrip({ showId }: FriendProgressStripProps) {
  const { userId } = useCurrentUser();
  const { friendProgress, loading } = useProgressSharing(showId);

  if (!userId || loading || friendProgress.length === 0) return null;

  return (
    <section className="mt-6" aria-label="Friends watching this">
      <h2 className="mb-3 text-sm font-semibold text-netflix-lightGray">Friends watching this</h2>
      <ul className="flex flex-wrap gap-3">
        {friendProgress.map((friend) => (
          <li
            key={friend.userId}
            className="flex min-w-[180px] items-center gap-3 rounded-lg bg-black/40 p-3 backdrop-blur-sm"
          >
            <FriendAvatar profile={friend} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName(friend)}</p>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="h-1 flex-1 overflow-hidden rounded-full bg-netflix-gray"
                  role="progressbar"
                  aria-valuenow={friend.progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${displayName(friend)} is ${progressLabel(friend)}`}
                >
                  <div
                    className="h-full rounded-full bg-netflix-red"
                    style={{ width: `${clamp(friend.progressPercent)}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs text-netflix-lightGray">
                  {progressLabel(friend)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function clamp(progress: number): number {
  return Math.min(100, Math.max(0, progress));
}

/** The episode boundary, falling back to a percentage when it is unknown. */
function progressLabel(friend: FriendShowProgress): string {
  if (friend.seasonNumber !== null && friend.episodeNumber !== null) {
    return `S${friend.seasonNumber} E${friend.episodeNumber}`;
  }
  return `${clamp(friend.progressPercent)}%`;
}
