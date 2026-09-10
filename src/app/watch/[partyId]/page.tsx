'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Circle,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  UserPlus,
  Users2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/toast';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useWatchParty } from '@/hooks/use-watch-party';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  displayName,
  listPartyInviteTargets,
  socialErrorMessage,
  type PartyInviteTarget,
} from '@/lib/social';
import { getEpisodeById, getImageUrl, type Episode } from '@/lib/catalog';

/** How often the transport re-reads the party's live position. */
const TICK_MS = 250;
const SKIP_SECONDS = 10;

export default function WatchPartyPage() {
  const params = useParams<{ partyId: string }>();
  const router = useRouter();
  const partyId = params?.partyId ?? null;

  const { userId, loading: authLoading } = useCurrentUser();
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);
  const {
    party,
    members,
    presentUserIds,
    loading,
    connected,
    isHost,
    livePosition,
    play,
    pause,
    seek,
    invite,
    leave,
    end,
  } = useWatchParty(partyId);

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [targets, setTargets] = useState<PartyInviteTarget[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (!authLoading && !userId) router.push('/login');
  }, [authLoading, userId, router]);

  useEffect(() => {
    let isMounted = true;
    if (!party) return;

    void getEpisodeById(party.episodeId)
      .then((found) => {
        if (isMounted) setEpisode(found);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [party]);

  const openInvite = useCallback(async () => {
    if (!supabase || !partyId) return;
    setShowInvite(true);
    try {
      setTargets(await listPartyInviteTargets(supabase, partyId));
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not load your friends.'), 'error');
    }
  }, [supabase, partyId]);

  const handleLeave = useCallback(async () => {
    await leave();
    router.push('/friends');
  }, [leave, router]);

  if (authLoading || loading) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-24 md:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-64 animate-pulse rounded-lg bg-netflix-gray/30" />
          <div className="h-32 animate-pulse rounded-lg bg-netflix-gray/30" />
        </div>
      </main>
    );
  }

  if (!party) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-24 md:px-8">
        <div className="mx-auto max-w-md text-center">
          <Users2 className="mx-auto mb-4 h-12 w-12 text-netflix-lightGray" />
          <h1 className="mb-2 text-2xl font-bold">Session not available</h1>
          <p className="mb-6 text-netflix-lightGray">
            This session has ended, or you are not part of it.
          </p>
          <Link
            href="/friends"
            className="inline-block rounded bg-netflix-red px-6 py-2.5 font-semibold transition-colors hover:bg-netflix-red/90"
          >
            Back to Friends
          </Link>
        </div>
      </main>
    );
  }

  const ended = party.status === 'ended';
  const duration = episode ? episode.runtime * 60 : 0;

  return (
    <main className="min-h-screen px-4 pb-16 pt-24 md:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/tv/${party.showId}/episode/${party.episodeId}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-netflix-lightGray transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Watch on your own instead
        </Link>

        <SyncSurface
          episode={episode}
          isPlaying={party.isPlaying}
          livePosition={livePosition}
        />

        <SyncTransport
          livePosition={livePosition}
          isPlaying={party.isPlaying}
          durationSeconds={duration}
          canControl={isHost && !ended}
          ended={ended}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
        />

        <section className="mt-6 rounded-lg bg-netflix-darkGray p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users2 className="h-5 w-5" />
              In this session
              <span
                className={cn(
                  'ml-1 inline-flex items-center gap-1 text-xs font-normal',
                  connected ? 'text-green-400' : 'text-netflix-lightGray'
                )}
              >
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? 'Live' : 'Offline'}
              </span>
            </h2>

            {isHost && !ended && (
              <button
                type="button"
                onClick={() => void openInvite()}
                className="flex items-center gap-1.5 rounded bg-netflix-gray px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-netflix-gray/80"
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            )}
          </div>

          <ul className="space-y-2">
            {members.map((member) => {
              const present = presentUserIds.has(member.userId);
              return (
                <li key={member.userId} className="flex items-center gap-3">
                  <FriendAvatar profile={member} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {displayName(member)}
                    {member.userId === userId && (
                      <span className="ml-1 font-normal text-netflix-lightGray">(you)</span>
                    )}
                  </span>
                  {member.isHost && (
                    <span className="rounded bg-netflix-gray px-2 py-0.5 text-xs font-semibold text-netflix-lightGray">
                      Host
                    </span>
                  )}
                  <span
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      present ? 'text-green-400' : 'text-netflix-lightGray'
                    )}
                  >
                    <Circle
                      className={cn('h-2 w-2', present ? 'fill-green-400' : 'fill-netflix-gray')}
                    />
                    {present ? 'Watching' : 'Away'}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex gap-2 border-t border-netflix-gray pt-5">
            <button
              type="button"
              onClick={() => void handleLeave()}
              className="flex items-center gap-1.5 rounded bg-netflix-gray px-4 py-2 text-sm font-semibold transition-colors hover:bg-netflix-gray/80"
            >
              <LogOut className="h-4 w-4" />
              Leave
            </button>
            {isHost && !ended && (
              <button
                type="button"
                onClick={() => void end()}
                className="rounded bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-600/30"
              >
                End session for everyone
              </button>
            )}
          </div>
        </section>
      </div>

      {showInvite && (
        <InvitePanel
          targets={targets}
          onInvite={async (friendId) => {
            const sent = await invite(friendId);
            if (sent && supabase && partyId) {
              setTargets(await listPartyInviteTargets(supabase, partyId));
            }
          }}
          onClose={() => setShowInvite(false)}
        />
      )}
    </main>
  );
}

/**
 * The shared viewing surface.
 *
 * CatchUp's playback is a controlled demo rather than a real video file, so
 * there is no media element to attach to. The surface therefore renders the
 * episode still and the synchronised clock: what everyone in the session sees
 * advances in lockstep, driven by exactly the state a real player would consume.
 */
function SyncSurface({
  episode,
  isPlaying,
  livePosition,
}: {
  episode: Episode | null;
  isPlaying: boolean;
  livePosition: () => number;
}) {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const tick = () => setPosition(livePosition());
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [livePosition]);

  return (
    <div
      className="relative mb-4 aspect-video overflow-hidden rounded-lg bg-netflix-black bg-cover bg-center"
      style={episode ? { backgroundImage: `url(${getImageUrl(episode.still_path)})` } : undefined}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-netflix-lightGray">
          {episode ? `Season ${episode.season_number} · Episode ${episode.episode_number}` : ' '}
        </p>
        <h1 className="mt-1 text-xl font-bold md:text-2xl">{episode?.name ?? 'Loading...'}</h1>
        <p className="mt-4 font-mono text-4xl font-bold tabular-nums md:text-5xl">
          {formatTime(position)}
        </p>
        <p className="mt-2 text-xs uppercase tracking-widest text-netflix-lightGray">
          {isPlaying ? 'Playing together' : 'Paused'}
        </p>
      </div>
    </div>
  );
}

/**
 * Play, pause, seek and a shared timeline.
 *
 * Ticks four times a second while playing, so it owns that state rather than
 * lifting it into the page -- the surrounding room re-renders only when
 * something actually changes.
 *
 * Controls are disabled for guests: docs/WATCH_TOGETHER_SPEC.md makes the host
 * the authority, and showing dead buttons would be a poor way to communicate
 * that, so the reason is stated instead.
 */
function SyncTransport({
  livePosition,
  isPlaying,
  durationSeconds,
  canControl,
  ended,
  onPlay,
  onPause,
  onSeek,
}: {
  livePosition: () => number;
  isPlaying: boolean;
  durationSeconds: number;
  canControl: boolean;
  ended: boolean;
  onPlay: (position: number) => void;
  onPause: (position: number) => void;
  onSeek: (position: number) => void;
}) {
  const [displayPosition, setDisplayPosition] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      if (!scrubbingRef.current) setDisplayPosition(livePosition());
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [livePosition]);

  const position = scrubbing ?? displayPosition;
  const bounded = durationSeconds > 0 ? Math.min(position, durationSeconds) : position;
  const percent = durationSeconds > 0 ? (bounded / durationSeconds) * 100 : 0;

  return (
    <div className="rounded-lg bg-netflix-darkGray p-5">
      <div className="mb-4 flex items-center justify-center gap-4">
        <button
          type="button"
          disabled={!canControl}
          onClick={() => onSeek(Math.max(0, livePosition() - SKIP_SECONDS))}
          className="rounded-full p-2 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white disabled:opacity-40"
          aria-label={`Back ${SKIP_SECONDS} seconds`}
        >
          <RotateCcw className="h-5 w-5" />
        </button>

        <button
          type="button"
          disabled={!canControl}
          onClick={() => (isPlaying ? onPause(livePosition()) : onPlay(livePosition()))}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/85 disabled:opacity-40"
          aria-label={isPlaying ? 'Pause for everyone' : 'Play for everyone'}
        >
          {isPlaying ? (
            <Pause className="h-6 w-6 fill-current" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          )}
        </button>

        <button
          type="button"
          disabled={!canControl}
          onClick={() => onSeek(livePosition() + SKIP_SECONDS)}
          className="rounded-full p-2 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white disabled:opacity-40"
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
        >
          <RotateCw className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-right font-mono text-xs text-netflix-lightGray">
          {formatTime(bounded)}
        </span>

        <div className="relative flex-1">
          <div className="h-1 overflow-hidden rounded-full bg-netflix-gray">
            <div className="h-full rounded-full bg-netflix-red" style={{ width: `${percent}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(durationSeconds))}
            value={Math.round(bounded)}
            disabled={!canControl}
            onChange={(event) => setScrubbing(Number(event.target.value))}
            onPointerDown={() => {
              scrubbingRef.current = true;
            }}
            onPointerUp={(event) => {
              scrubbingRef.current = false;
              const next = Number((event.target as HTMLInputElement).value);
              setScrubbing(null);
              onSeek(next);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            aria-label="Seek for everyone"
          />
        </div>

        <span className="w-12 shrink-0 font-mono text-xs text-netflix-lightGray">
          {formatTime(durationSeconds)}
        </span>
      </div>

      <p className="mt-3 text-center text-xs text-netflix-lightGray">
        {ended
          ? 'This session has ended'
          : canControl
            ? 'You are the host — your play, pause and seek move everyone'
            : 'The host controls playback for everyone in this session'}
      </p>
    </div>
  );
}

interface InvitePanelProps {
  targets: PartyInviteTarget[];
  onInvite: (friendId: string) => Promise<void>;
  onClose: () => void;
}

function InvitePanel({ targets, onInvite, onClose }: InvitePanelProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Invite friends to this session"
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-lg bg-netflix-darkGray"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-netflix-gray p-5">
          <div>
            <h2 className="text-lg font-semibold">Invite friends</h2>
            <p className="text-sm text-netflix-lightGray">
              Only friends can be invited to watch together.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-5">
          {targets.length === 0 ? (
            <p className="py-6 text-center text-sm text-netflix-lightGray">
              You have no friends to invite yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {targets.map((target) => (
                <li key={target.userId} className="flex items-center gap-3">
                  <FriendAvatar profile={target} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {displayName(target)}
                  </span>
                  {target.isInvited ? (
                    <span className="text-xs font-semibold text-netflix-lightGray">In session</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onInvite(target.userId)}
                      className="rounded bg-netflix-red px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-netflix-red/90"
                    >
                      Invite
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
