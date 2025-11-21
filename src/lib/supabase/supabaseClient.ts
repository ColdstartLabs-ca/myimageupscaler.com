import { createBrowserClient } from '@supabase/ssr';
import { loadEnv } from '../../config/env';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = loadEnv();

// Use SSR-compatible browser client that syncs auth state with cookies
// This allows middleware to access auth state server-side
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
