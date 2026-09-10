// Supabase Client for Client Components
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from './database.types';

export const createClient = () => createClientComponentClient<Database>();

