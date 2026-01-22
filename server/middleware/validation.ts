import { NextRequest } from 'next/server';
import type { z } from 'zod';
import { ValidationError } from '../errors';

/**
 * Validates a request body against a Zod schema
 *
 * @param request - The Next.js request object
 * @param schema - The Zod schema to validate against
 * @returns The validated and typed data
 * @throws ValidationError if JSON is invalid or schema validation fails
 *
 * @example
 * ```ts
 * const body = await validateRequest(req, subscriptionChangeSchema);
 * // body is now typed according to the schema
 * ```
 */
export async function validateRequest<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const text = await request.text();
    const body = text ? JSON.parse(text) : {};

    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError('Invalid request body', {
        errors: result.error.errors,
      });
    }

    return result.data;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    // JSON parse error or other issues
    throw new ValidationError('Invalid JSON in request body');
  }
}

/**
 * Validates query parameters against a Zod schema
 *
 * @param request - The Next.js request object
 * @param schema - The Zod schema to validate against
 * @returns The validated and typed query parameters
 * @throws ValidationError if query validation fails
 *
 * @example
 * ```ts
 * const query = await validateQuery(req, paginationSchema);
 * ```
 */
export function validateQuery<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): T {
  const result = schema.safeParse(request.nextUrl.searchParams);
  if (!result.success) {
    throw new ValidationError('Invalid query parameters', {
      errors: result.error.errors,
    });
  }
  return result.data;
}
