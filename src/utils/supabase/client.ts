import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/config/env';

export function createClient(): SupabaseClient {
  return createBrowserClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY);
}
