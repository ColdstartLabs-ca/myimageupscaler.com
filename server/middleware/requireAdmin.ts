import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';
import { verifyApiAuth } from '@/lib/middleware/auth';

export interface IAdminCheckResult {
  isAdmin: boolean;
  userId: string | null;
  error?: NextResponse;
}

/**
 * Middleware to verify the requesting user has admin role
 * @param req - Next.js request object
 * @returns Admin check result with error response if not authorized
 */
export async function requireAdmin(req: NextRequest): Promise<IAdminCheckResult> {
  // Try to get user ID from middleware header first (if middleware is enabled)
  let userId = req.headers.get('X-User-Id');

  // If no header, extract user from JWT token directly
  if (!userId) {
    const authResult = await verifyApiAuth(req);
    if ('error' in authResult) {
      return {
        isAdmin: false,
        userId: null,
        error: authResult.error,
      };
    }
    userId = authResult.user.id;
  }

  if (!userId) {
    return {
      isAdmin: false,
      userId: null,
      error: NextResponse.json(
        { error: 'Unauthorized', code: 'NO_USER' },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return {
      isAdmin: false,
      userId,
      error: NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      ),
    };
  }

  if (profile.role !== 'admin') {
    return {
      isAdmin: false,
      userId,
      error: NextResponse.json(
        { error: 'Forbidden: Admin access required', code: 'NOT_ADMIN' },
        { status: 403 }
      ),
    };
  }

  return { isAdmin: true, userId };
}
