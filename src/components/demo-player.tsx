'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { Episode, Movie } from '@/lib/catalog';
import { useWatchProgress } from '@/hooks/use-watch-progress';

interface DemoPlayerProps {
  media: Episode | Movie;
  title: string;
  subtitle: string;
  artwork: string;
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export function DemoPlayer({ media, title, subtitle, artwork }: DemoPlayerProps) {
  const durationSeconds = media.runtime * 60;
  const { progress, loading, isAuthenticated, saveError, updatePosition, flush } = useWatchProgress(media);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const initialized = useRef(false);
  const positionRef = useRef(0);
  const flushRef = useRef(flush);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!loading && !initialized.current) {
      const initialPosition = progress?.position_seconds ?? 0;
      setPosition(initialPosition);
      positionRef.current = initialPosition;
      initialized.current = true;
    }
  }, [loading, progress]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setPosition((current) => {
        const next = Math.min(durationSeconds, current + 1);
        const completed = next >= durationSeconds;
        updatePosition(next, completed);
        if (completed) setIsPlaying(false);
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [durationSeconds, isPlaying, updatePosition]);

  useEffect(() => () => {
    const latestPosition = positionRef.current;
    void flushRef.current(latestPosition, latestPosition >= durationSeconds);
  }, [durationSeconds]);

  const setPlaybackPosition = (nextPosition: number) => {
    const next = Math.min(durationSeconds, Math.max(0, nextPosition));
    setPosition(next);
    updatePosition(next, next >= durationSeconds);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      void flush(positionRef.current, positionRef.current >= durationSeconds);
    } else {
      if (position >= durationSeconds) setPosition(0);
      setIsPlaying(true);
    }
  };

  const markComplete = () => {
    setIsPlaying(false);
    setPosition(durationSeconds);
    updatePosition(durationSeconds, true);
    void flush(durationSeconds, true);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-netflix-gray bg-black shadow-2xl">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-netflix-darkGray via-black to-netflix-red/30">
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: `url(${artwork})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        <div className="relative z-10 text-center">
          <p className="mb-2 text-sm uppercase tracking-[0.3em] text-netflix-lightGray">CatchUp demo playback</p>
          <h2 className="text-2xl font-bold md:text-4xl">{title}</h2>
          <p className="mt-2 text-netflix-lightGray">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4 p-4 md:p-6">
        <input
          aria-label="Playback position"
          type="range"
          min={0}
          max={durationSeconds}
          value={position}
          disabled={loading}
          onChange={(event) => setPlaybackPosition(Number(event.target.value))}
          className="w-full accent-netflix-red"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button disabled={loading} onClick={() => setPlaybackPosition(position - 10)} aria-label="Back 10 seconds" className="rounded p-2 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
              <RotateCcw className="h-5 w-5" />
            </button>
            <button disabled={loading} onClick={togglePlayback} aria-label={isPlaying ? 'Pause playback' : 'Play playback'} className="rounded-full bg-white p-3 text-black hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50">
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
            </button>
            <button disabled={loading} onClick={() => setPlaybackPosition(position + 10)} aria-label="Forward 10 seconds" className="rounded p-2 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
              <RotateCw className="h-5 w-5" />
            </button>
            <span className="ml-2 text-sm text-netflix-lightGray">
              {formatTime(position)} / {formatTime(durationSeconds)}
            </span>
          </div>
          <button disabled={loading} onClick={markComplete} className="flex items-center gap-2 rounded bg-netflix-red px-4 py-2 text-sm font-semibold hover:bg-netflix-red/80 disabled:cursor-not-allowed disabled:opacity-50">
            <Check className="h-4 w-4" />
            Mark watched
          </button>
        </div>
        <p className="text-sm text-netflix-lightGray">
          {loading
            ? 'Loading your saved progress...'
            : saveError
            ? `${saveError} Check the browser console for details.`
            : isAuthenticated
            ? 'Your progress saves automatically to Supabase while you watch.'
            : 'Sign in and configure Supabase to save progress across sessions.'}
        </p>
      </div>
    </section>
  );
}
