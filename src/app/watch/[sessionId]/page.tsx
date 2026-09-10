'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Circle, Film, LogOut, UserPlus, Users2, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FriendAvatar } from '@/components/social/friend-avatar';
import { SyncTransport } from '@/components/social/sync-transport';
import { showToast } from '@/components/toast';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useWatchSession } from '@/hooks/use-watch-session';
import { createSocialClient } from '@/lib/social/client';
import {
  displayName,
  joinWatchSession,
  listWatchSessionTargets,
  socialErrorMessage,
  type WatchSessionTarget,
} from '@/lib/social';
import { getBackdropUrl, getMovieDetails, getTVShowDetails } from '@/lib/tmdb';

/** Fallback runtime when TMDB has none, so the timeline still scales sensibly. */
const DEFAULT_RUNTIME_SECONDS = 45 * 60;

interface TitleInfo {
  title: string;
  backdropPath: string | null;
  durationSeconds: number;
}

export default function WatchSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params?.sessionId ?? null;

  const { userId, loading: authLoading } = useCurrentUser();
  const supabase = useMemo(() => createSocialClient(), []);
  const {
    session,
    participants,
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
  } = useWatchSession(sessionId);

  const [info, setInfo] = useState<TitleInfo | null>(null);
  const [targets, setTargets] = useState<WatchSessionTarget[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (!authLoading && !userId) router.push('/login');
  }, [authLoading, userId, router]);

  // Accept the invitation on arrival: opening the room is the acceptance, so
  // asking someone to click "join" on a page they deliberately navigated to
  // would be a step with no decision in it.
  useEffect(() => {
    if (!sessionId || !session || session.status !== 'active') return;
    const me = participants.find((participant) => participant.userId === userId);
    if (me && !me.hasJoined) {
      void joinWatchSession(supabase, sessionId).catch(() => undefined);
    }
  }, [supabase, sessionId, session, participants, userId]);

  useEffect(() => {
    let isMounted = true;
    if (!session) return;

    const load = async () => {
      try {
        if (session.mediaType === 'movie') {
          const details = await getMovieDetails(session.mediaId);
          if (!isMounted) return;
          setInfo({
            title: details.title,
            backdropPath: details.backdrop_path,
            durationSeconds: (details.runtime || 0) * 60 || DEFAULT_RUNTIME_SECONDS,
          });
          return;
        }

        const details = await getTVShowDetails(session.mediaId);
        if (!isMounted) return;
        setInfo({
          title: details.name,
          backdropPath: details.backdrop_path,
          // TMDB returns episode_run_time, but `TVShowDetails` in lib/tmdb.ts
          // does not declare it, and that file is shared with the other
          // workstream -- reshaping it for a social feature is not this
          // workstream's call. The nominal runtime only scales the timeline,
          // so the fallback costs nothing until episode-level data lands.
          durationSeconds: DEFAULT_RUNTIME_SECONDS,
        });
      } catch {
        if (isMounted) {
          setInfo({
            title: 'Unavailable title',
            backdropPath: null,
            durationSeconds: DEFAULT_RUNTIME_SECONDS,
          });
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [session]);

  const openInvite = useCallback(async () => {
    if (!sessionId) return;
    setShowInvite(true);
    try {
      setTargets(await listWatchSessionTargets(supabase, sessionId));
    } catch (error) {
      showToast(socialErrorMessage(error, 'Could not load your friends.'), 'error');
    }
  }, [supabase, sessionId]);

  const handleLeave = useCallback(async () => {
    await leave();
    router.push('/friends');
  }, [leave, router]);

  if (authLoading || loading) {
    return (
      <main className="min-h-screen px-4 py-20 md:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-64 animate-pulse rounded-lg bg-netflix-gray/30" />
          <div className="h-32 animate-pulse rounded-lg bg-netflix-gray/30" />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-20 md:px-8">
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

  const ended = session.status === 'ended';
  const joined = participants.filter((participant) => participant.hasJoined);
  const invited = participants.filter((participant) => !participant.hasJoined);
  const detailHref = `/${session.mediaType === 'movie' ? 'movie' : 'tv'}/${session.mediaId}`;

  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/friends"
          className="mb-6 inline-flex items-center gap-2 text-sm text-netflix-lightGray transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Friends
        </Link>

        {/*
          The video surface. CatchUp only plays YouTube trailers today, and what
          gets synchronized is a content decision rather than a social one, so
          no player is bound yet -- the transport below is fully wired and the
          adapter slots in here. See use-watch-session.ts.
        */}
        <div className="relative mb-4 aspect-video overflow-hidden rounded-lg bg-netflix-black">
          {info?.backdropPath && (
            <Image
              src={getBackdropUrl(info.backdropPath)}
              alt=""
              fill
              sizes="(max-width: 896px) 100vw, 896px"
              className="object-cover opacity-30"
              priority
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <Film className="mb-3 h-10 w-10 text-netflix-lightGray" />
            <h1 className="text-xl font-bold md:text-2xl">{info?.title ?? 'Loading...'}</h1>
            <p className="mt-2 max-w-md text-sm text-netflix-lightGray">
              Playback is synchronized across everyone here. The video surface is not connected
              yet — the controls below are live and stay in step for all participants.
            </p>
            <Link
              href={detailHref}
              className="mt-4 rounded bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              View details
            </Link>
          </div>
        </div>

        <SyncTransport
          livePosition={livePosition}
          isPlaying={session.isPlaying}
          durationSeconds={info?.durationSeconds ?? DEFAULT_RUNTIME_SECONDS}
          disabled={ended}
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
                title={connected ? 'Connected to the live channel' : 'Reconnecting'}
              >
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? 'Live' : 'Offline'}
              </span>
            </h2>

            {!ended && (
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
            {joined.map((participant) => {
              const present = presentUserIds.has(participant.userId);
              return (
                <li key={participant.userId} className="flex items-center gap-3">
                  <FriendAvatar profile={participant} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {displayName(participant)}
                    {participant.userId === userId && (
                      <span className="ml-1 font-normal text-netflix-lightGray">(you)</span>
                    )}
                  </span>
                  {participant.isHost && (
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

            {invited.map((participant) => (
              <li key={participant.userId} className="flex items-center gap-3 opacity-60">
                <FriendAvatar profile={participant} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {displayName(participant)}
                </span>
                <span className="text-xs text-netflix-lightGray">Invited</span>
              </li>
            ))}
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
            if (sent && sessionId) {
              setTargets(await listWatchSessionTargets(supabase, sessionId));
            }
          }}
          onClose={() => setShowInvite(false)}
        />
      )}
    </main>
  );
}

interface InvitePanelProps {
  targets: WatchSessionTarget[];
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
        <div className="border-b border-netflix-gray p-5">
          <h2 className="text-lg font-semibold">Invite friends</h2>
          <p className="text-sm text-netflix-lightGray">
            Only friends can be invited to watch together.
          </p>
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
                    <span className="text-xs font-semibold text-netflix-lightGray">Invited</span>
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

        <div className="border-t border-netflix-gray p-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded bg-netflix-gray px-4 py-2 text-sm font-semibold transition-colors hover:bg-netflix-gray/80"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
