'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldBan } from 'lucide-react';
import { showToast } from '@/components/toast';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  displayName,
  handle,
  listBlockedUsers,
  socialErrorMessage,
  unblockUser,
  type SocialProfile,
} from '@/lib/social';

/**
 * People the current user has blocked, and the way back.
 *
 * Blocking is only a fair tool if it is reversible and auditable: a user who
 * cannot see who they have blocked cannot undo a mistake, and cannot tell why
 * someone has stopped appearing in search.
 */
export function BlockedUsers() {
  const { userId, loading: authLoading } = useCurrentUser();
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const [blocked, setBlocked] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setBlocked([]);
      setLoading(false);
      return;
    }

    try {
      setBlocked(await listBlockedUsers(supabase));
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not load your blocked list.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const unblock = useCallback(
    async (person: SocialProfile) => {
      if (!supabase) return;

      setBusyIds((prev) => new Set(prev).add(person.userId));
      try {
        await unblockUser(supabase, person.userId);
        showToast(`Unblocked ${displayName(person)}`, 'info');
      } catch (error) {
        showToast(socialErrorMessage(error, 'Could not unblock this user.'), 'error');
      } finally {
        await refresh();
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(person.userId);
          return next;
        });
      }
    },
    [supabase, refresh]
  );

  if (loading || blocked.length === 0) {
    // Nothing to say when nobody is blocked; an empty "Blocked" heading would
    // only add noise to the privacy screen.
    return null;
  }

  return (
    <section className="mt-10">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <ShieldBan className="h-5 w-5" />
        Blocked
      </h2>
      <p className="mb-4 text-sm text-netflix-lightGray">
        Blocked people cannot find you, send you requests, recommend you titles, or see anything
        you share. Neither of you appears in the other&rsquo;s search.
      </p>

      <ul className="space-y-3">
        {blocked.map((person) => {
          const userHandle = handle(person);
          return (
            <li
              key={person.userId}
              className="flex items-center gap-4 rounded-lg bg-netflix-darkGray p-4"
            >
              <FriendAvatar profile={person} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{displayName(person)}</p>
                {userHandle && (
                  <p className="truncate text-sm text-netflix-lightGray">{userHandle}</p>
                )}
              </div>
              <button
                type="button"
                disabled={busyIds.has(person.userId)}
                onClick={() => void unblock(person)}
                className="shrink-0 rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-netflix-gray/80 disabled:opacity-50"
              >
                Unblock
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
