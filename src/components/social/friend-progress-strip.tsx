'use client';

import { EyeOff } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProgressSharing } from '@/hooks/use-progress-sharing';
import { displayName, type FriendShowProgress } from '@/lib/social';

interface FriendProgressStripProps {
  /** Stable catalog show id, as stored on watch_progress.show_id. */
  showId: string;
}

/**
 * How far friends are through this show -- shown only for friends who have
 * explicitly shared it with the current user.
 *
 * Renders nothing when nobody has shared, which is the normal case. That
 * silence is the point: the absence of this strip is what "no automatic
 * sharing" looks like from the outside.
 *
 * Spoiler-safe. A friend who is behind or level with you is shown exactly, as
 * "S2 E6" -- the same episode boundary Catch Me Up uses, so the two features
 * describe progress the same way. A friend who is AHEAD is shown only as ahead,
 * with no season, episode or progress bar, because a bar would itself imply a
 * position. The database does the redaction; this component renders what it is
 * given and cannot un-redact it.
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
            className="flex min-w-[200px] items-center gap-3 rounded-lg bg-black/40 p-3 backdrop-blur-sm"
          >
            <FriendAvatar profile={friend} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName(friend)}</p>

              {friend.isAhead ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-netflix-lightGray">
                  <EyeOff className="h-3 w-3 shrink-0" />
                  Ahead of you — hidden to avoid spoilers
                </p>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <div
                    className="h-1 flex-1 overflow-hidden rounded-full bg-netflix-gray"
                    role="progressbar"
                    aria-valuenow={friend.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${displayName(friend)} is on ${progressLabel(friend)}`}
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
              )}
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
