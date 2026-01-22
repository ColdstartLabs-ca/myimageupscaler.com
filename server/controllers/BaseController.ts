import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withErrorHandler } from '../middleware/errorHandler';
import { container } from '../di/container';

/**
 * Base Controller class for all API controllers
 *
 * Provides common functionality:
 * - Error handling wrapper
 * - Service resolution via DI container
 * - Abstract handle method for subclasses to implement
 *
 * @example
 * ```ts
 * export class MyController extends BaseController {
 *   protected async handle(req: NextRequest): Promise<NextResponse> {
 *     // Your controller logic here
 *     return NextResponse.json({ success: true });
 *   }
 * }
 *
 * // In route.ts:
 * const controller = new MyController();
 * export async function POST(req: NextRequest) {
 *   return controller.execute(req);
 * }
 * ```
 */
export abstract class BaseController {
  /**
   * Handle the incoming request
   * Subclasses must implement this method with their logic
   */
  protected abstract handle(req: NextRequest): Promise<NextResponse>;

  /**
   * Execute the controller with error handling
   * This is the method that should be called from route handlers
   */
  public async execute(req: NextRequest): Promise<NextResponse> {
    const wrappedHandler = withErrorHandler(this.handle.bind(this));
    return wrappedHandler(req);
  }

  /**
   * Resolve a service from the DI container
   *
   * @example
   * ```ts
   * const creditsService = this.resolve<ISubscriptionCredits>('ISubscriptionCredits');
   * ```
   */
  protected resolve<T>(token: string): T {
    return container.resolve<T>(token);
  }

  /**
   * Get the authenticated user ID from the X-User-Id header
   * This header is set by the middleware for authenticated requests
   *
   * @throws AuthError if X-User-Id header is missing
   */
  protected getUserId(req: NextRequest): string {
    const userId = req.headers.get('X-User-Id');
    if (!userId) {
      throw new Error('X-User-Id header is missing - this endpoint requires authentication');
    }
    return userId;
  }

  /**
   * Get query parameter by name
   *
   * @param req - The Next.js request object
   * @param name - The query parameter name
   * @returns The query parameter value or null if not found
   */
  protected getQueryParam(req: NextRequest, name: string): string | null {
    return req.nextUrl.searchParams.get(name);
  }

  /**
   * Get required query parameter
   *
   * @param req - The Next.js request object
   * @param name - The query parameter name
   * @returns The query parameter value
   * @throws Error if the query parameter is missing
   */
  protected getRequiredQueryParam(req: NextRequest, name: string): string {
    const value = this.getQueryParam(req, name);
    if (!value) {
      throw new Error(`Missing required query parameter: ${name}`);
    }
    return value;
  }

  /**
   * Get the request body as JSON
   *
   * @param req - The Next.js request object
   * @returns The parsed JSON body
   */
  protected async getBody<T = unknown>(req: NextRequest): Promise<T> {
    const text = await req.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Check if the request is a GET request
   */
  protected isGet(req: NextRequest): boolean {
    return req.method === 'GET';
  }

  /**
   * Check if the request is a POST request
   */
  protected isPost(req: NextRequest): boolean {
    return req.method === 'POST';
  }

  /**
   * Check if the request is a PUT request
   */
  protected isPut(req: NextRequest): boolean {
    return req.method === 'PUT';
  }

  /**
   * Check if the request is a DELETE request
   */
  protected isDelete(req: NextRequest): boolean {
    return req.method === 'DELETE';
  }

  /**
   * Check if the request is a PATCH request
   */
  protected isPatch(req: NextRequest): boolean {
    return req.method === 'PATCH';
  }

  /**
   * Create a JSON response
   *
   * @param data - The data to return
   * @param status - Optional status code (default: 200)
   */
  protected json<T>(data: T, status = 200): NextResponse {
    return NextResponse.json({ success: true, data }, { status });
  }

  /**
   * Create an error response
   *
   * @param code - Error code
   * @param message - Error message
   * @param status - HTTP status code
   * @param details - Optional error details
   */
  protected error(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>
  ): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: {
          code,
          message,
          ...(details && { details }),
        },
      },
      { status }
    );
  }
}
