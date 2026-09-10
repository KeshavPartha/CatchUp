-- CatchUp additive watch-progress migration.
-- Run this once in the hosted Supabase SQL editor.
-- It is safe to run after the original starter schema and is intentionally
-- limited to the watch-progress table, indexes, trigger, and RLS policies.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.watch_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  media_id INTEGER,
  show_id TEXT,
  season_id TEXT,
  episode_id TEXT,
  current_season_number INTEGER,
  current_episode_number INTEGER,
  position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add the current columns when the table already exists or came from an older
-- local schema. Existing rows are given safe foundation defaults below.
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS media_id INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS show_id TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS season_id TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS episode_id TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS current_season_number INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS current_episode_number INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS position_seconds INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS progress_percent INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS completed BOOLEAN;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS last_watched_at TIMESTAMPTZ;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.watch_progress
SET
  media_type = COALESCE(media_type, 'tv'),
  position_seconds = COALESCE(position_seconds, 0),
  duration_seconds = COALESCE(duration_seconds, 0),
  progress_percent = COALESCE(progress_percent, 0),
  completed = COALESCE(completed, FALSE),
  last_watched_at = COALESCE(last_watched_at, NOW()),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

-- TV progress is identified by episode_id. Keep media_id reserved for movies
-- so multiple episodes from one show can coexist under the movie uniqueness key.
UPDATE public.watch_progress
SET media_id = NULL
WHERE media_type = 'tv';

ALTER TABLE public.watch_progress ALTER COLUMN media_type SET DEFAULT 'tv';
ALTER TABLE public.watch_progress ALTER COLUMN media_type SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN media_id DROP NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN position_seconds SET DEFAULT 0;
ALTER TABLE public.watch_progress ALTER COLUMN position_seconds SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN duration_seconds SET DEFAULT 0;
ALTER TABLE public.watch_progress ALTER COLUMN duration_seconds SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN progress_percent SET DEFAULT 0;
ALTER TABLE public.watch_progress ALTER COLUMN progress_percent SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN completed SET DEFAULT FALSE;
ALTER TABLE public.watch_progress ALTER COLUMN completed SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN last_watched_at SET DEFAULT NOW();
ALTER TABLE public.watch_progress ALTER COLUMN last_watched_at SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.watch_progress ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.watch_progress ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.watch_progress ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.watch_progress DROP CONSTRAINT IF EXISTS watch_progress_user_id_media_id_media_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS watch_progress_user_episode_key
  ON public.watch_progress(user_id, episode_id);

CREATE UNIQUE INDEX IF NOT EXISTS watch_progress_user_movie_key
  ON public.watch_progress(user_id, media_type, media_id);

ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can add watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can update their own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can delete their own watch progress" ON public.watch_progress;

CREATE POLICY "Users can view their own watch progress"
  ON public.watch_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add watch progress"
  ON public.watch_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watch progress"
  ON public.watch_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watch progress"
  ON public.watch_progress FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_watch_progress_updated ON public.watch_progress;
CREATE TRIGGER on_watch_progress_updated
  BEFORE UPDATE ON public.watch_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_watch_progress_user_last_watched
  ON public.watch_progress(user_id, last_watched_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_progress_show
  ON public.watch_progress(user_id, show_id);

COMMIT;
