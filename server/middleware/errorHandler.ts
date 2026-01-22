import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createErrorResponse, serializeError } from '@shared/utils/errors';
import { AppError } from '@shared/utils/errors';

/**
 * Type for API route handler functions
 */
export type ApiHandler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Higher-order function that wraps API handlers with consistent error handling
 *
 * Catches all errors and returns properly formatted error responses.
 * Preserves HTTP status codes from AppError instances.
 *
 * @example
 * ```ts
 * export const GET = withErrorHandler(async (req) => {
 *   // Your handler logic
 *   return NextResponse.json({ success: true, data: result });
 * });
 * ```
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error('API Error:', error);

      // Handle known AppError instances
      if (error instanceof AppError) {
        const { body, status } = createErrorResponse(
          error.code,
          error.message,
          error.statusCode,
          error.details
        );
        return NextResponse.json(body, { status });
      }

      // Handle unknown errors
      const message = serializeError(error);
      const { body, status } = createErrorResponse('INTERNAL_ERROR', message, 500);
      return NextResponse.json(body, { status });
    }
  };
}
