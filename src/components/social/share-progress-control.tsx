'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, ShieldCheck, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProgressSharing } from '@/hooks/use-progress-sharing';
import { displayName, handle } from '@/lib/social';

interface ShareProgressControlProps {
  /** Stable catalog show id, as stored on watch_progress.show_id. */
  showId: string;
  title: string;
}

/**
 * "Share my progress on this title" -- the opt-in, per-title, revocable
 * control the product vision requires.
 *
 * Scoped to one title by construction. There is no "share everything" affordance
 * anywhere in the UI, because there is no such permission in the database.
 */
export function ShareProgressControl({ showId, title }: ShareProgressControlProps) {
  const { userId } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const { targets, sharedCount, busyIds, loading, toggle, revokeAll } =
    useProgressSharing(showId);

  if (!userId) return null;

  const sharing = sharedCount > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 rounded px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors',
          sharing ? 'bg-white/30 hover:bg-white/40' : 'bg-white/20 hover:bg-white/30'
        )}
        aria-label={
          sharing
            ? `Sharing your progress on ${title} with ${sharedCount} ${sharedCount === 1 ? 'friend' : 'friends'}`
            : `Share your progress on ${title}`
        }
      >
        {sharing ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        <span className="hidden sm:inline">
          {sharing ? `Sharing · ${sharedCount}` : 'Share progress'}
        </span>
      </button>

      {open && (
        <SharePanel
          title={title}
          targets={targets}
          sharedCount={sharedCount}
          busyIds={busyIds}
          loading={loading}
          onToggle={toggle}
          onRevokeAll={revokeAll}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface SharePanelProps {
  title: string;
  targets: ReturnType<typeof useProgressSharing>['targets'];
  sharedCount: number;
  busyIds: ReadonlySet<string>;
  loading: boolean;
  onToggle: (target: SharePanelProps['targets'][number]) => void;
  onRevokeAll: () => void;
  onClose: () => void;
}

function SharePanel({
  title,
  targets,
  sharedCount,
  busyIds,
  loading,
  onToggle,
  onRevokeAll,
  onClose,
}: SharePanelProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Share your progress on ${title}`}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-lg bg-netflix-darkGray shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-netflix-gray p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Share your progress</h2>
            <p className="truncate text-sm text-netflix-lightGray">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          State the scope precisely, at the moment of the decision. This is the
          promise the database actually enforces -- one title, chosen people,
          revocable -- so the copy can be specific rather than reassuring.
        */}
        <p className="flex items-start gap-2 border-b border-netflix-gray bg-netflix-black/40 p-5 text-sm text-netflix-lightGray">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Only this show, only the people you pick here, and only which episode you have
            reached — never anything else you watch. You can stop at any time.
          </span>
        </p>

        <div className="max-h-[40vh] overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded bg-netflix-gray/40" />
              ))}
            </div>
          )}

          {!loading && targets.length === 0 && (
            <div className="py-6 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-netflix-lightGray" />
              <p className="mb-1 font-semibold">No friends yet</p>
              <p className="mb-4 text-sm text-netflix-lightGray">
                Progress can only be shared with friends.
              </p>
              <Link
                href="/friends"
                className="inline-block rounded bg-netflix-red px-4 py-2 text-sm font-semibold transition-colors hover:bg-netflix-red/90"
              >
                Add a friend
              </Link>
            </div>
          )}

          {!loading && targets.length > 0 && (
            <ul className="space-y-1">
              {targets.map((target) => {
                const name = displayName(target);
                const userHandle = handle(target);
                const busy = busyIds.has(target.userId);

                return (
                  <li key={target.userId}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={target.isShared}
                      disabled={busy}
                      onClick={() => onToggle(target)}
                      className="flex w-full items-center gap-3 rounded p-2 text-left transition-colors hover:bg-netflix-gray/60 disabled:opacity-50"
                    >
                      <FriendAvatar profile={target} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        {userHandle && (
                          <p className="truncate text-xs text-netflix-lightGray">{userHandle}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                          target.isShared ? 'bg-netflix-red' : 'bg-netflix-gray'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-1 h-4 w-4 rounded-full bg-white transition-all',
                            target.isShared ? 'left-6' : 'left-1'
                          )}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {sharedCount > 0 && (
          <div className="border-t border-netflix-gray p-5">
            <button
              type="button"
              onClick={onRevokeAll}
              className="w-full rounded bg-red-600/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-600/30"
            >
              Stop sharing with everyone
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
