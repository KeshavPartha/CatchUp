import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';
import { isSupabaseConfigured } from '@/lib/supabase/config';

import { createSupabaseProgressReader } from './retrieval';
import type { PlotEventProgressReader } from './types';

export interface AuthenticatedRecapContext {
  userId: string;
  progressReader: PlotEventProgressReader;
}

const getBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
};

export const authenticateRecapRequest = async (
  request: Request
): Promise<AuthenticatedRecapContext | null> => {
  const token = getBearerToken(request);
  if (!token || !isSupabaseConfigured) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient<Database>(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;

  return {
    userId: user.id,
    progressReader: createSupabaseProgressReader(supabase),
  };
};
