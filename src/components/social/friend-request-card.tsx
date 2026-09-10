'use client';

import { Check, X } from 'lucide-react';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { displayName, handle, type FriendRequest } from '@/lib/social';

/** Relative age of a request, kept coarse -- exact timing is not useful here. */
function sentLabel(iso: string): string {
  const sent = new Date(iso).getTime();
  if (Number.isNaN(sent)) return '';

  const days = Math.floor((Date.now() - sent) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  return months === 1 ? 'A month ago' : `${months} months ago`;
}

interface IncomingProps {
  direction: 'incoming';
  request: FriendRequest;
  busy: boolean;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

interface OutgoingProps {
  direction: 'outgoing';
  request: FriendRequest;
  busy: boolean;
  onCancel: (requestId: string) => void;
}

type FriendRequestCardProps = IncomingProps | OutgoingProps;

export function FriendRequestCard(props: FriendRequestCardProps) {
  const { request, busy } = props;
  const name = displayName(request);
  const userHandle = handle(request);

  return (
    <li className="flex items-center gap-4 rounded-lg bg-netflix-darkGray p-4">
      <FriendAvatar profile={request} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-sm text-netflix-lightGray">
          {userHandle ? `${userHandle} · ${sentLabel(request.createdAt)}` : sentLabel(request.createdAt)}
        </p>
      </div>

      {props.direction === 'incoming' ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => props.onAccept(request.requestId)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-white/85 disabled:opacity-50"
            aria-label={`Accept friend request from ${name}`}
          >
            <Check className="h-4 w-4" />
            Accept
          </button>
          <button
            type="button"
            onClick={() => props.onDecline(request.requestId)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-netflix-gray/80 disabled:opacity-50"
            aria-label={`Decline friend request from ${name}`}
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Decline</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => props.onCancel(request.requestId)}
          disabled={busy}
          className="shrink-0 rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold text-netflix-lightGray transition-colors hover:bg-netflix-gray/80 hover:text-white disabled:opacity-50"
          aria-label={`Withdraw your friend request to ${name}`}
        >
          {busy ? 'Withdrawing...' : 'Withdraw'}
        </button>
      )}
    </li>
  );
}
