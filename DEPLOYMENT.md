# CatchUp deployment

## Prerequisites

- A hosting account that supports Next.js, such as Vercel
- A configured Supabase project
- The current `main` or a reviewed feature branch from `KeshavPartha/CatchUp`

## Deploy

1. Import `KeshavPartha/CatchUp` into the hosting provider.
2. Use the repository root as the project root and the default Next.js build settings.
3. Add these environment variables:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_APP_URL=https://your-deployed-domain.example
   ```

4. Deploy the project.
5. In Supabase Authentication → URL Configuration, set the deployed URL as the Site URL and add it to the allowed redirect URLs.

## Verify

- Browse the local demo catalog without external content API credentials.
- Create and sign into a test account.
- Open an episode, advance the demo player, reload, and confirm the position is restored.
- Confirm Continue Watching is visible only to the signed-in user.

Do not commit `.env.local`, service-role keys, generated credentials, or provider-specific secrets.
