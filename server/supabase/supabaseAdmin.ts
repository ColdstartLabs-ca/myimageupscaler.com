import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { clientEnv, serverEnv } from '@shared/config/env';

if (!clientEnv.SUPABASE_URL) {
  console.warn('Warning: SUPABASE_URL is not set.');
}

if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is not set. Admin operations will fail.');
}

// Service role key for admin operations (bypasses RLS)
// This should ONLY be used in secure server-side contexts (API routes, webhooks)
// Use a placeholder key during build if not set to avoid build failures
const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key-for-build';

export const supabaseAdmin: SupabaseClient = createClient(clientEnv.SUPABASE_URL, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
