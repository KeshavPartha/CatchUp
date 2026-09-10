'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { DRIFT_TOLERANCE_SECONDS } from '@/hooks/use-watch-session';
import { livePositionOf, type WatchSessionState } from '@/lib/social';
import { YT_STATE, loadYouTubeApi, type YouTubePlayer } from '@/lib/youtube-player';

/** How often to check the player against the session's intended position. */
const DRIFT_CHECK_MS = 1000;

/**
 * How long a programmatic command is allowed to settle before player events are
 * trusted again. The IFrame API reports our own `seekTo`/`playVideo` calls as
 * ordinary state changes, indistinguishable from a click, so commands are
 * fenced rather than filtered.
 */
const SUPPRESS_MS = 600;

interface YouTubeSyncPlayerProps {
  videoKey: string;
  session: WatchSessionState;
  /** True once the session has ended; the player stops taking commands. */
  disabled: boolean;
  onPlay: (positionSeconds: number) => void;
  onPause: (positionSeconds: number) => void;
  onDuration?: (seconds: number) => void;
}

/**
 * Binds a YouTube trailer to a Watch Together session.
 *
 * ---------------------------------------------------------------------------
 * The hard part: whose action was that?
 * ---------------------------------------------------------------------------
 * The IFrame API fires `onStateChange` identically whether a human clicked or
 * we called `playVideo()` ourselves. Reporting our own sync back out as user
 * intent would echo forever: A pauses -> B's player pauses -> B reports a pause
 * -> A's player pauses -> ...
 *
 * So every programmatic command is fenced by a counter for SUPPRESS_MS, and
 * state changes arriving inside the fence are ignored. A counter rather than a
 * boolean because a seek and a play routinely overlap, and a boolean would be
 * cleared by the first to finish while the second was still settling.
 *
 * ---------------------------------------------------------------------------
 * Correction, not streaming
 * ---------------------------------------------------------------------------
 * Position is never streamed. The session carries the last agreed transition,
 * every client derives where the video should be, and this compares that
 * against the player once a second -- seeking only when the gap exceeds
 * DRIFT_TOLERANCE_SECONDS, because a hard seek is far more disruptive than half
 * a second of skew.
 *
 * Autoplay policy: browsers refuse unmuted autoplay without a gesture, so the
 * player starts muted and offers an explicit unmute. Muting is local -- it
 * changes nothing for anyone else in the session.
 */
export function YouTubeSyncPlayer({
  videoKey,
  session,
  disabled,
  onPlay,
  onPause,
  onDuration,
}: YouTubeSyncPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const suppressRef = useRef(0);
  const sessionRef = useRef(session);
  const disabledRef = useRef(disabled);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);

  // Event handlers below are installed once, so they read live values through
  // refs rather than closing over a render's props.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  /** Runs a player command without it being mistaken for user intent. */
  const fenced = useCallback((run: () => void) => {
    suppressRef.current += 1;
    try {
      run();
    } finally {
      window.setTimeout(() => {
        suppressRef.current = Math.max(0, suppressRef.current - 1);
      }, SUPPRESS_MS);
    }
  }, []);

  // --- Create the player once ----------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const create = async () => {
      try {
        const YT = await loadYouTubeApi();
        if (cancelled || !containerRef.current) return;

        const player = new YT.Player(containerRef.current, {
          videoId: videoKey,
          playerVars: {
            // Our transport is the control surface; YouTube's would let someone
            // scrub only their own playback and silently desync the session.
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              event.target.mute();
              setReady(true);
              onDuration?.(event.target.getDuration());
            },
            onStateChange: (event) => {
              if (suppressRef.current > 0 || disabledRef.current) return;

              const current = sessionRef.current;
              const at = event.target.getCurrentTime();

              // Only report transitions that actually disagree with the
              // session, so a redundant event never becomes a write.
              if (event.data === YT_STATE.PLAYING && !current.isPlaying) {
                onPlay(at);
              } else if (event.data === YT_STATE.PAUSED && current.isPlaying) {
                onPause(at);
              }
            },
            onError: () => {
              if (!cancelled) setFailed(true);
            },
          },
        });

        playerRef.current = player;
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void create();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Recreating on a videoKey change is correct; the callbacks are stable
    // enough that including them would tear the player down needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey]);

  // --- Apply session state to the player ------------------------------------
  const applySessionState = useCallback(() => {
    const player = playerRef.current;
    if (!player || !ready) return;

    const current = sessionRef.current;
    const target = livePositionOf(current);
    const actual = player.getCurrentTime();

    if (Math.abs(actual - target) > DRIFT_TOLERANCE_SECONDS) {
      fenced(() => player.seekTo(target, true));
    }

    const state = player.getPlayerState();
    const playing = state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING;

    if (current.isPlaying && !playing) {
      fenced(() => player.playVideo());
    } else if (!current.isPlaying && state === YT_STATE.PLAYING) {
      fenced(() => player.pauseVideo());
    }
  }, [ready, fenced]);

  // React immediately to a transition from anyone in the session...
  useEffect(() => {
    applySessionState();
  }, [applySessionState, session.isPlaying, session.positionSeconds, session.positionUpdatedAt]);

  // ...and correct slow drift between transitions.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(applySessionState, DRIFT_CHECK_MS);
    return () => clearInterval(timer);
  }, [ready, applySessionState]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (player.isMuted()) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, []);

  if (failed) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-netflix-black p-6 text-center">
        <p className="text-sm text-netflix-lightGray">
          This trailer could not be loaded. Playback stays in sync for everyone else — the
          controls below still work.
        </p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <div ref={containerRef} className="h-full w-full" />

      {/* YouTube's own controls are disabled, so clicks must not reach the
          iframe and start playback for this viewer alone. */}
      <div className="absolute inset-0" aria-hidden="true" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-netflix-black">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-netflix-red border-t-transparent" />
        </div>
      )}

      {ready && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded bg-black/70 px-3 py-2 text-xs font-semibold backdrop-blur-sm transition-colors hover:bg-black/90"
          aria-label={muted ? 'Unmute (only for you)' : 'Mute (only for you)'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? 'Unmute' : 'Mute'}
        </button>
      )}
    </div>
  );
}
