# CatchUp setup

## Prerequisites

- Node.js 18+
- npm
- A Supabase account and project for authentication and durable user progress

The catalog is local and fictional. No TMDB account or external movie API key is required.

## Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Set these in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The first two values are available in Supabase Project Settings → API. `NEXT_PUBLIC_APP_URL` documents the local/deployed application URL and is used when configuring auth redirects.

Do not commit `.env.local` or any service-role key. The current application does not need a service-role key.

## Supabase

1. Open the Supabase SQL editor for your project.
2. Run [supabase-schema.sql](./supabase-schema.sql).
3. Configure the local site URL as `http://localhost:3000` under Authentication → URL Configuration.
4. Create an account at `/signup` and verify that an episode’s demo playback persists after reopening it.

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the database details.

## Useful commands

```bash
npm run dev
npm run lint
npm run build
```

## Deployment

Deploy the `KeshavPartha/CatchUp` repository to your hosting provider and configure the two Supabase variables plus the deployed `NEXT_PUBLIC_APP_URL`. Add the deployed URL to Supabase’s allowed redirect URLs.
