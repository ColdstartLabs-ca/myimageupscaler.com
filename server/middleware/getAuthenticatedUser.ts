import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { NextRequest } from 'next/server';

/**
 * Extract authenticated user from middleware-set headers
 *
 * The middleware.ts file verifies the JWT and sets X-User-Id header.
 * This helper retrieves the user ID from that header and fetches
 * the full user profile from Supabase.
 *
 * @param req - Next.js request object with X-User-Id header
 * @returns User profile object or null if not authenticated
 *
 * @example
 * ```ts
 * export async function GET(req: NextRequest) {
 *   const user = await getAuthenticatedUser(req);
 *   if (!user) {
 *     return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   return Response.json({ data: user });
 * }
 * ```
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<IUserProfile | null> {
  const userId = req.headers.get('X-User-Id');

  if (!userId) {
    return null;
  }

  // Query Supabase for full user profile
  // Note: This uses service role key (supabaseAdmin) which bypasses RLS
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return profile;
}

/**
 * Type definition for user profile
 * Update this based on your actual profiles table schema
 */
export interface IUserProfile {
  id: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}
