-- CatchUp foundation schema
-- The controlled demo catalog lives in src/lib/catalog.ts. Supabase stores auth and user state.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.my_list (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, media_id, media_type)
);

CREATE TABLE IF NOT EXISTS public.liked_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, media_id, media_type)
);

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

-- Upgrade the original starter table in place when this script is applied to an existing project.
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS show_id TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS season_id TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS episode_id TEXT;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS current_season_number INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS current_episode_number INTEGER;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS position_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS last_watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.watch_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.watch_progress ALTER COLUMN media_id DROP NOT NULL;
ALTER TABLE public.watch_progress DROP CONSTRAINT IF EXISTS watch_progress_user_id_media_id_media_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS watch_progress_user_episode_key
  ON public.watch_progress(user_id, episode_id);

-- Future AI source data. Rows are server-managed; no client policy is granted here.
CREATE TABLE IF NOT EXISTS public.episode_plot_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  episode_id TEXT NOT NULL,
  event_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  spoiler_boundary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(episode_id, event_order)
);

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> addressee_id),
  UNIQUE(requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS public.show_recommendations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);

CREATE TABLE IF NOT EXISTS public.progress_shares (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  show_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CHECK (owner_id <> friend_id),
  UNIQUE(owner_id, friend_id, show_id)
);

CREATE TABLE IF NOT EXISTS public.watch_parties (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  show_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  is_playing BOOLEAN NOT NULL DEFAULT FALSE,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.watch_party_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  party_id UUID REFERENCES public.watch_parties(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'participant')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(party_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.watch_party_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  party_id UUID REFERENCES public.watch_parties(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('play', 'pause', 'seek', 'heartbeat', 'end')),
  position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  revision BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_plot_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_party_events ENABLE ROW LEVEL SECURITY;

-- Recreate the current foundation policies idempotently.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view their own list" ON public.my_list;
DROP POLICY IF EXISTS "Users can add to their own list" ON public.my_list;
DROP POLICY IF EXISTS "Users can remove from their own list" ON public.my_list;
CREATE POLICY "Users can view their own list" ON public.my_list FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to their own list" ON public.my_list FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove from their own list" ON public.my_list FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own liked items" ON public.liked_items;
DROP POLICY IF EXISTS "Users can add liked items" ON public.liked_items;
DROP POLICY IF EXISTS "Users can remove liked items" ON public.liked_items;
CREATE POLICY "Users can view their own liked items" ON public.liked_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add liked items" ON public.liked_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove liked items" ON public.liked_items FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can add watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can update their own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can delete their own watch progress" ON public.watch_progress;
CREATE POLICY "Users can view their own watch progress" ON public.watch_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add watch progress" ON public.watch_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own watch progress" ON public.watch_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own watch progress" ON public.watch_progress FOR DELETE USING (auth.uid() = user_id);

-- Future tables intentionally have no permissive client policies yet. Add narrow policies with their features.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_watch_progress_updated ON public.watch_progress;
CREATE TRIGGER on_watch_progress_updated BEFORE UPDATE ON public.watch_progress FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_watch_progress_user_last_watched ON public.watch_progress(user_id, last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_progress_show ON public.watch_progress(user_id, show_id);
CREATE INDEX IF NOT EXISTS idx_episode_plot_events_episode ON public.episode_plot_events(episode_id, event_order);
CREATE INDEX IF NOT EXISTS idx_friendships_participants ON public.friendships(requester_id, addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_recommendations_recipient ON public.show_recommendations(recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_shares_recipient ON public.progress_shares(friend_id, show_id, enabled);
CREATE INDEX IF NOT EXISTS idx_watch_party_members_user ON public.watch_party_members(user_id, party_id);
