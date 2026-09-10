/**
 * Whether Supabase is usable in this environment.
 *
 * Validates the URL rather than only checking that the variables are present:
 * a half-filled `.env.local` (the template's placeholder text left in place) is
 * a very common state, and a truthy-but-invalid URL would pass a presence check
 * and then throw inside `createSupabaseClient`. That defeats the whole point of
 * this flag, which is to let the catalog be browsed anonymously without
 * credentials.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isUsableUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = isUsableUrl(url) && Boolean(anonKey);
