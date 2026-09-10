# Supabase setup for CatchUp

## Configure the app

Create `.env.local` from `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The project URL and anon key are in Supabase Project Settings → API. Never put a service-role key in a `NEXT_PUBLIC_` variable or client code; the current CatchUp foundation does not require one.

## Apply the schema

Open the SQL editor in your Supabase project and run [supabase-schema.sql](./supabase-schema.sql). It creates or upgrades:

- `profiles` for user metadata
- `my_list` and `liked_items` for the existing browsing experience
- `watch_progress` for per-episode private progress
- future-ready tables for plot events, friendships, recommendations, progress shares, and watch parties

Row Level Security is enabled. The current foundation includes policies for private profiles, lists, likes, and watch progress. Future tables intentionally have no permissive client policies until their features are implemented.

## Auth configuration

Under Authentication → URL Configuration:

- Site URL: `http://localhost:3000`
- Add the deployed `NEXT_PUBLIC_APP_URL` when deploying

Create a test account at `/signup`, open a show episode, use the demo player, and reopen the episode. With the schema and Supabase variables configured, the position and completion state should be restored and appear in Continue Watching while incomplete.
