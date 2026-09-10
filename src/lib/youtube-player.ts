// A minimal, typed surface for the YouTube IFrame Player API.
//
// The API ships no types and is injected onto `window` by a remote script, so
// the alternative is `any` at every call site. Declaring only the handful of
// members CatchUp actually uses keeps the player fully type-checked and makes
// the dependency surface explicit -- if this list grows, that is a visible
// change rather than a silent one.
//
// Reference: https://developers.google.com/youtube/iframe_api_reference

/** Player states as returned by `getPlayerState()`. */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
  data: number;
}

interface YouTubePlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: YouTubePlayerEvent) => void;
    onStateChange?: (event: YouTubePlayerEvent) => void;
    onError?: (event: YouTubePlayerEvent) => void;
  };
}

interface YouTubeNamespace {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

/**
 * Loads the IFrame API exactly once per page.
 *
 * The API calls a single global callback when it is ready, so concurrent
 * callers must share one promise -- two components each installing their own
 * `onYouTubeIframeAPIReady` would leave one of them waiting forever.
 */
let apiPromise: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The YouTube player is browser-only'));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      // Chain rather than replace: another consumer may already be waiting.
      previous?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('The YouTube player failed to initialise'));
      }
    };

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        // Reset so a later attempt can retry rather than reusing a dead promise.
        apiPromise = null;
        reject(new Error('Could not load the YouTube player'));
      };
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
