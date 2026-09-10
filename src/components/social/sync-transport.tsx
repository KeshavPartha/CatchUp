'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const TICK_MS = 250;
const SKIP_SECONDS = 10;

interface SyncTransportProps {
  /** Reads the position the video should be at right now. */
  livePosition: () => number;
  isPlaying: boolean;
  /** Nominal runtime in seconds, used to scale the timeline. */
  durationSeconds: number;
  disabled: boolean;
  onPlay: (position: number) => void;
  onPause: (position: number) => void;
  onSeek: (position: number) => void;
}

/**
 * The synchronized transport: play, pause, seek, and a shared timeline.
 *
 * Isolated into its own component because it ticks four times a second while
 * playing. Keeping that here means the surrounding room -- participants,
 * invites, artwork -- re-renders only when something actually changes.
 *
 * This is the seam a real video player plugs into. It reads intended state
 * through `livePosition()` and reports user intent back out; it holds no
 * media of its own. A player adapter would poll the same function and correct
 * itself when the gap exceeds DRIFT_TOLERANCE_SECONDS.
 */
export function SyncTransport({
  livePosition,
  isPlaying,
  durationSeconds,
  disabled,
  onPlay,
  onPause,
  onSeek,
}: SyncTransportProps) {
  const [displayPosition, setDisplayPosition] = useState(0);
  // While the user drags, the thumb follows the pointer rather than the
  // session, or it would fight them mid-gesture.
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
  const bounded = Math.min(position, durationSeconds);
  const percent = durationSeconds > 0 ? (bounded / durationSeconds) * 100 : 0;

  return (
    <div className="rounded-lg bg-netflix-darkGray p-5">
      <div className="mb-4 flex items-center justify-center gap-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSeek(Math.max(0, livePosition() - SKIP_SECONDS))}
          className="rounded-full p-2 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white disabled:opacity-40"
          aria-label={`Back ${SKIP_SECONDS} seconds`}
        >
          <RotateCcw className="h-5 w-5" />
        </button>

        <button
          type="button"
          disabled={disabled}
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
          disabled={disabled}
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
            disabled={disabled}
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

      <p
        className={cn(
          'mt-3 text-center text-xs',
          isPlaying ? 'text-netflix-lightGray' : 'text-netflix-lightGray/70'
        )}
      >
        {disabled
          ? 'This session has ended'
          : isPlaying
            ? 'Playing for everyone in this session'
            : 'Paused for everyone in this session'}
      </p>
    </div>
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
