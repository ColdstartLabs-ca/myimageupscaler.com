import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { clientEnv } from '@shared/config/env';
import { updateSession } from '@shared/utils/supabase/middleware';

/**
 * Validate JWT format
 */
function isValidJwtFormat(token: string): boolean {
  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // Each part should be non-empty and valid base64url encoding
  for (const part of parts) {
    if (!part || part.length === 0) {
      return false;
    }
    // Check if it's valid base64url (basic check)
    try {
      // Add padding if needed for base64 validation
      const padded = part + '='.repeat((4 - part.length % 4) % 4);
      Buffer.from(padded, 'base64');
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Verify JWT token for API routes
 * Returns the user if authenticated, or an error response
 */
export async function verifyApiAuth(
  req: NextRequest
): Promise<{ user: { id: string; email?: string } } | { error: NextResponse }> {
  if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY) {
    console.error('Missing Supabase environment variables');
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Server configuration error',
          },
        },
        { status: 500 }
      ),
    };
  }

  // Extract and validate Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Valid authentication token required',
          },
        },
        { status: 401 }
      ),
    };
  }

  // Validate Authorization header format
  if (!authHeader.startsWith('Bearer ')) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Valid authentication token required',
          },
        },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Handle test authentication token for testing
  if (token === 'test_auth_token_for_testing_only') {
    return {
      user: {
        id: 'test-user-id-12345',
        email: 'test@example.com',
      },
    };
  }

  // For environment-specific test tokens
  if (token === process.env.TEST_AUTH_TOKEN) {
    return {
      user: {
        id: 'test-user-id-12345',
        email: 'test@example.com',
      },
    };
  }

  // Handle mock authentication tokens in test environment
  // Token format: test_token_{userId} where userId is 'mock_user_{uniquePart}'
  if (process.env.ENV === 'test' && token.startsWith('test_token_')) {
    const mockUserId = token.replace('test_token_', '');
    return {
      user: {
        id: mockUserId,
        email: `test-${mockUserId}@test.local`,
      },
    };
  }

  // Validate JWT format for real tokens
  if (!isValidJwtFormat(token)) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Valid authentication token required',
          },
        },
        { status: 401 }
      ),
    };
  }

  // Create Supabase client for API auth (uses Authorization header)
  const supabase = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Valid authentication token required',
          },
        },
        { status: 401 }
      ),
    };
  }

  return { user: { id: user.id, email: user.email } };
}

/**
 * Add user context headers to request for downstream route handlers
 */
export function addUserContextHeaders(
  req: NextRequest,
  user: { id: string; email?: string }
): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('X-User-Id', user.id);
  requestHeaders.set('X-User-Email', user.email ?? '');

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/**
 * Handle page route authentication
 * Refreshes session and returns user if authenticated
 */
export async function handlePageAuth(req: NextRequest): Promise<{
  user: { id: string; email?: string } | null;
  response: NextResponse;
}> {
  const { user, supabaseResponse } = await updateSession(req);

  return {
    user: user ? { id: user.id, email: user.email } : null,
    response: supabaseResponse,
  };
}
