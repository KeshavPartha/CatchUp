'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Send, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/toast';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  MAX_NOTE_LENGTH,
  displayName,
  handle,
  listRecommendationTargets,
  recommendTitle,
  socialErrorMessage,
  type MediaType,
  type RecommendationTarget,
} from '@/lib/social';

interface RecommendButtonProps {
  mediaId: number;
  mediaType: MediaType;
  title: string;
}

/**
 * "Recommend to a friend" on a title's detail page.
 *
 * Renders nothing for signed-out visitors rather than prompting them to sign
 * in: the button is only meaningful once you have friends, and an inert control
 * on a public page is worse than no control.
 */
export function RecommendButton({ mediaId, mediaType, title }: RecommendButtonProps) {
  const { userId } = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (!userId) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded bg-white/20 px-6 py-2 text-lg font-semibold backdrop-blur-sm transition-colors hover:bg-white/30"
        aria-label={`Recommend ${title} to a friend`}
      >
        <Send className="h-5 w-5" />
        <span className="hidden sm:inline">Recommend</span>
      </button>

      {open && (
        <RecommendModal
          mediaId={mediaId}
          mediaType={mediaType}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface RecommendModalProps extends RecommendButtonProps {
  onClose: () => void;
}

function RecommendModal({ mediaId, mediaType, title, onClose }: RecommendModalProps) {
  // null when Supabase is unconfigured -- the effect and send() below must
  // settle into a safe empty state rather than calling createClient() and
  // throwing.
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const [targets, setTargets] = useState<RecommendationTarget[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

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

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!supabase) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const rows = await listRecommendationTargets(supabase, mediaId, mediaType);
        if (isMounted) setTargets(rows);
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not load your friends.'), 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [supabase, mediaId, mediaType]);

  const toggle = useCallback((targetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  }, []);

  const send = useCallback(async () => {
    if (selected.size === 0 || !supabase) return;
    setSending(true);

    // Settled rather than all-or-nothing: one failed recipient should not
    // discard the others, and `recommend_title` is idempotent, so a retry is
    // safe if the user sends again.
    const results = await Promise.allSettled(
      [...selected].map((recipientId) =>
        recommendTitle(supabase, { recipientId, mediaId, mediaType, note })
      )
    );

    const sent = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - sent;

    if (sent > 0) {
      showToast(`Recommended to ${sent} ${sent === 1 ? 'friend' : 'friends'}`, 'success');
    }
    if (failed > 0) {
      const firstFailure = results.find((result) => result.status === 'rejected');
      showToast(
        firstFailure && firstFailure.status === 'rejected'
          ? socialErrorMessage(firstFailure.reason, 'Some recommendations could not be sent.')
          : 'Some recommendations could not be sent.',
        'error'
      );
    }

    setSending(false);
    if (failed === 0) onClose();
  }, [selected, supabase, mediaId, mediaType, note, onClose]);

  const available = targets.filter((target) => !target.alreadySent);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Recommend ${title}`}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-lg bg-netflix-darkGray shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-netflix-gray p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Recommend to a friend</h2>
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

        <div className="max-h-[45vh] overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded bg-netflix-gray/40" />
              ))}
            </div>
          )}

          {!loading && targets.length === 0 && (
            <div className="py-6 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-netflix-lightGray" />
              <p className="mb-1 font-semibold">No friends yet</p>
              <p className="mb-4 text-sm text-netflix-lightGray">
                Add a friend to start recommending titles to each other.
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
            <ul className="space-y-2">
              {targets.map((target) => {
                const isSelected = selected.has(target.userId);
                const name = displayName(target);
                const userHandle = handle(target);

                return (
                  <li key={target.userId}>
                    <button
                      type="button"
                      onClick={() => !target.alreadySent && toggle(target.userId)}
                      disabled={target.alreadySent}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex w-full items-center gap-3 rounded p-2 text-left transition-colors',
                        target.alreadySent
                          ? 'cursor-default opacity-50'
                          : 'hover:bg-netflix-gray/60',
                        isSelected && 'bg-netflix-gray'
                      )}
                    >
                      <FriendAvatar profile={target} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        {userHandle && (
                          <p className="truncate text-xs text-netflix-lightGray">{userHandle}</p>
                        )}
                      </div>
                      {target.alreadySent ? (
                        <span className="shrink-0 text-xs font-semibold text-netflix-lightGray">
                          Sent
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                            isSelected
                              ? 'border-netflix-red bg-netflix-red'
                              : 'border-netflix-lightGray'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!loading && available.length > 0 && (
          <div className="border-t border-netflix-gray p-5">
            <label htmlFor="recommend-note" className="sr-only">
              Add a note
            </label>
            <textarea
              id="recommend-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder="Add a note (optional)"
              rows={2}
              className="w-full resize-none rounded bg-netflix-black px-3 py-2 text-sm placeholder-netflix-lightGray focus:outline-none focus:ring-2 focus:ring-netflix-red"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-netflix-lightGray">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
              <button
                type="button"
                onClick={() => void send()}
                disabled={selected.size === 0 || sending}
                className="flex items-center gap-2 rounded bg-netflix-red px-5 py-2 text-sm font-semibold transition-colors hover:bg-netflix-red/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sending
                  ? 'Sending...'
                  : selected.size > 0
                    ? `Send to ${selected.size}`
                    : 'Select friends'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
