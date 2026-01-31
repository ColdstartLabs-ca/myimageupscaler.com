import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';

/**
 * Blog API authentication result interface
 */
export interface IBlogApiAuthResult {
  authenticated: boolean;
  error?: NextResponse;
  apiKeyId?: string;
}

/**
 * Verify Blog API authentication using API key
 *
 * Supports two authentication methods:
 * 1. x-api-key header: BLOG_API_KEY
 * 2. Authorization header: ApiKey BLOG_API_KEY
 *
 * @param req - NextRequest object
 * @returns Authentication result with error response if failed
 */
export async function verifyBlogApiAuth(req: NextRequest): Promise<IBlogApiAuthResult> {
  const apiKey =
    req.headers.get('x-api-key') || extractApiKeyFromAuth(req.headers.get('Authorization'));

  if (!apiKey) {
    return {
      authenticated: false,
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'API key required',
          },
        },
        { status: 401 }
      ),
    };
  }

  if (!serverEnv.BLOG_API_KEY) {
    console.error('Blog API key not configured in environment');
    return {
      authenticated: false,
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

  if (apiKey !== serverEnv.BLOG_API_KEY) {
    return {
      authenticated: false,
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid API key',
          },
        },
        { status: 401 }
      ),
    };
  }

  return { authenticated: true, apiKeyId: 'blog-ai-agent' };
}

/**
 * Extract API key from Authorization header
 * Supports format: "ApiKey <key>"
 *
 * @param authHeader - Authorization header value
 * @returns API key or null if format is invalid
 */
function extractApiKeyFromAuth(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('ApiKey ')) return null;
  return authHeader.substring(7);
}

/**
 * Standard error response helper for Blog API
 */
export function blogApiErrorResponse(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown
): NextResponse {
  const errorResponse: {
    success: false;
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  } = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  return NextResponse.json(errorResponse, { status });
}
