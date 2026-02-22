import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { UserRepository } from '@shared/repositories';
import { NextRequest } from 'next/server';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import { serverEnv } from '@shared/config/env';

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

  // Handle test user - ONLY in test environment
  if (
    userId === 'test-user-id-12345' &&
    serverEnv.ENV === 'test' &&
    serverEnv.NODE_ENV !== 'production'
  ) {
    return {
      id: 'test-user-id-12345',
      email: 'test@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      subscription_credits_balance: CREDIT_COSTS.DEFAULT_FREE_CREDITS,
      purchased_credits_balance: CREDIT_COSTS.DEFAULT_TRIAL_CREDITS,
      stripe_customer_id: null,
      subscription_status: null,
      subscription_tier: null,
      role: 'user',
    };
  }

  // Use repository for database operations
  const userRepository = new UserRepository(supabaseAdmin);

  try {
    // Get or create user profile (creates with defaults if not found)
    const profile = await userRepository.getOrCreate(userId);
    return profile;
  } catch (error) {
    console.error('Error in getAuthenticatedUser:', error);
    return null;
  }
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
  stripe_customer_id?: string | null;
  credits_balance?: number;
  subscription_credits_balance?: number;
  purchased_credits_balance?: number;
  subscription_status?: string | null;
  subscription_tier?: string | null;
  role?: 'user' | 'admin';
  [key: string]: unknown;
}
