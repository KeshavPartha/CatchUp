-- Netflix Clone Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- My List table (user's watchlist/favorites)
CREATE TABLE IF NOT EXISTS public.my_list (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, media_id, media_type)
);

-- Enable Row Level Security
ALTER TABLE public.my_list ENABLE ROW LEVEL SECURITY;

-- My List policies
CREATE POLICY "Users can view their own list"
    ON public.my_list FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their own list"
    ON public.my_list FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from their own list"
    ON public.my_list FOR DELETE
    USING (auth.uid() = user_id);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on profile changes
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Watch Progress table (continue watching feature)
CREATE TABLE IF NOT EXISTS public.watch_progress (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    last_watched TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, media_id, media_type)
);

-- Enable Row Level Security
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;

-- Watch Progress policies
CREATE POLICY "Users can view their own watch progress"
    ON public.watch_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can add watch progress"
    ON public.watch_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watch progress"
    ON public.watch_progress FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watch progress"
    ON public.watch_progress FOR DELETE
    USING (auth.uid() = user_id);

-- Liked Items table (user's liked movies/shows)
CREATE TABLE IF NOT EXISTS public.liked_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, media_id, media_type)
);

-- Enable Row Level Security
ALTER TABLE public.liked_items ENABLE ROW LEVEL SECURITY;

-- Liked Items policies
CREATE POLICY "Users can view their own liked items"
    ON public.liked_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can add liked items"
    ON public.liked_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove liked items"
    ON public.liked_items FOR DELETE
    USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_my_list_user_id ON public.my_list(user_id);
CREATE INDEX IF NOT EXISTS idx_my_list_media ON public.my_list(media_id, media_type);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_watch_progress_user_id ON public.watch_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_last_watched ON public.watch_progress(last_watched DESC);
CREATE INDEX IF NOT EXISTS idx_liked_items_user_id ON public.liked_items(user_id);
CREATE INDEX IF NOT EXISTS idx_liked_items_media ON public.liked_items(media_id, media_type);

