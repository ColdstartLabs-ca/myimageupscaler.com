import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';

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
  const userId = req.headers.get('X-User-Id');

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
