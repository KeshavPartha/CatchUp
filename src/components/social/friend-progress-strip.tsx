'use client';

import { FriendAvatar } from '@/components/social/friend-avatar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProgressSharing } from '@/hooks/use-progress-sharing';
import { displayName, type FriendProgress, type MediaType } from '@/lib/social';

interface FriendProgressStripProps {
  mediaId: number;
  mediaType: MediaType;
}

/**
 * How far friends are through this title -- shown only for friends who have
 * explicitly shared it with the current user.
 *
 * Renders nothing when nobody has shared, which is the normal case. That
 * silence is the point: the absence of this strip is what "no automatic
 * sharing" looks like from the outside.
 *
 * Progress is currently a whole-title percentage, because `watch_progress` has
 * no season or episode columns yet. Once episode-level progress lands (a shared
 * prerequisite with the AI workstream -- see docs/SOCIAL_SPEC.md), this is the
 * component that should say "on S2E6" instead of a percentage.
 */
export function FriendProgressStrip({ mediaId, mediaType }: FriendProgressStripProps) {
  const { userId } = useCurrentUser();
  const { friendProgress, loading } = useProgressSharing(mediaId, mediaType);

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
                  aria-valuenow={friend.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${displayName(friend)} is ${friend.progress}% through`}
                >
                  <div
                    className="h-full rounded-full bg-netflix-red"
                    style={{ width: `${clamp(friend.progress)}%` }}
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

function progressLabel(friend: FriendProgress): string {
  if (friend.progress >= 100) return 'Finished';
  return `${clamp(friend.progress)}%`;
}
