'use client';

import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { displayName, handle, type Friend } from '@/lib/social';

interface FriendCardProps {
  friend: Friend;
  busy: boolean;
  onRemove: (friend: Friend) => void;
  onBlock: (friend: Friend) => void;
}

function friendsSinceLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `Friends since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
}

export function FriendCard({ friend, busy, onRemove, onBlock }: FriendCardProps) {
  // Two-step removal rather than a modal: unfriending is reversible (you can
  // send a new request) but silent to the other person, so it deserves a
  // deliberate second click without the weight of a dialog.
  const [confirming, setConfirming] = useState(false);
  const name = displayName(friend);
  const userHandle = handle(friend);

  return (
    <li className="flex items-center gap-4 rounded-lg bg-netflix-darkGray p-4 transition-colors hover:bg-netflix-gray/50">
      <FriendAvatar profile={friend} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-sm text-netflix-lightGray">
          {userHandle ?? friendsSinceLabel(friend.friendsSince)}
        </p>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onRemove(friend)}
            disabled={busy}
            className="rounded bg-netflix-red px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-netflix-red/90 disabled:opacity-50"
          >
            {busy ? 'Removing...' : 'Remove'}
          </button>
          {/*
            Block sits behind the same confirm step as Remove rather than on the
            row itself: it is a heavier, less common action, and surfacing it
            only once someone has already decided to end the friendship keeps it
            out of the way without hiding it.
          */}
          <button
            type="button"
            onClick={() => onBlock(friend)}
            disabled={busy}
            className="rounded bg-red-600/20 px-3 py-1.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
            aria-label={`Block ${name}`}
          >
            Block
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-netflix-gray/80 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex shrink-0 items-center gap-2 rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold text-netflix-lightGray transition-colors hover:bg-netflix-gray/80 hover:text-white"
          aria-label={`Remove ${name} from your friends`}
        >
          <UserMinus className="h-4 w-4" />
          <span className="hidden sm:inline">Remove</span>
        </button>
      )}
    </li>
  );
}
