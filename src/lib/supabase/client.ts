// Supabase browser client for Client Components.
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database.types';

let browserClient: SupabaseClient<Database> | undefined;

export const createClient = (): SupabaseClient<Database> => {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  browserClient = createSupabaseClient<Database>(url, anonKey);
  return browserClient;
};
