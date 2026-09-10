-- Add narrative metadata needed by the deterministic, episode-bounded recap foundation.
-- Legacy title/summary/spoiler_boundary columns remain nullable for existing rows.
BEGIN;

ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS show_id TEXT;
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS season_id TEXT;
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS season_number INTEGER;
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS episode_number INTEGER;
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS event_text TEXT;
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS involved_characters TEXT[];
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS importance_score NUMERIC(3,2);
ALTER TABLE public.episode_plot_events ADD COLUMN IF NOT EXISTS tags TEXT[];

ALTER TABLE public.episode_plot_events ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.episode_plot_events ALTER COLUMN summary DROP NOT NULL;
ALTER TABLE public.episode_plot_events ALTER COLUMN spoiler_boundary DROP NOT NULL;
UPDATE public.episode_plot_events SET involved_characters = '{}' WHERE involved_characters IS NULL;
UPDATE public.episode_plot_events SET tags = '{}' WHERE tags IS NULL;
ALTER TABLE public.episode_plot_events ALTER COLUMN involved_characters SET DEFAULT '{}';
ALTER TABLE public.episode_plot_events ALTER COLUMN tags SET DEFAULT '{}';
ALTER TABLE public.episode_plot_events ALTER COLUMN involved_characters SET NOT NULL;
ALTER TABLE public.episode_plot_events ALTER COLUMN tags SET NOT NULL;

ALTER TABLE public.episode_plot_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_episode_plot_events_show_episode
  ON public.episode_plot_events(show_id, season_id, episode_id, event_order);

COMMIT;
