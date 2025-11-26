import { BaselimeLogger } from '@baselime/edge-logger';
import { serverEnv, isDevelopment } from '@shared/config/env';

interface ILogContext {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Creates a Baselime logger instance for edge/serverless functions.
 * Use this in API routes to capture logs and errors.
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const logger = createLogger(request, 'upscale-api');
 *
 *   try {
 *     logger.info('Processing upscale request', { imageSize: 1024 });
 *     // ... your logic
 *     return Response.json({ success: true });
 *   } catch (error) {
 *     logger.error('Upscale failed', { error });
 *     return Response.json({ error: 'Failed' }, { status: 500 });
 *   } finally {
 *     // Important: flush logs before response completes
 *     await logger.flush();
 *   }
 * }
 * ```
 */
export function createLogger(
  request: Request,
  namespace: string,
  context?: ILogContext
): BaselimeLogger {
  const apiKey = serverEnv.BASELIME_API_KEY;

  const logger = new BaselimeLogger({
    service: 'pixelperfect-api',
    namespace,
    apiKey: apiKey || '',
    ctx: {
      url: request.url,
      method: request.method,
      ...context,
    },
    isLocalDev: !apiKey || isDevelopment(),
  });

  return logger;
}

/**
 * Wraps an API handler with automatic logging and error capture.
 * Handles logger.flush() automatically.
 *
 * @example
 * ```ts
 * export const POST = withLogging('upscale-api', async (request, logger) => {
 *   logger.info('Processing request');
 *   // ... your logic
 *   return Response.json({ success: true });
 * });
 * ```
 */
export function withLogging(
  namespace: string,
  handler: (request: Request, logger: BaselimeLogger) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const logger = createLogger(request, namespace);

    try {
      const response = await handler(request, logger);
      logger.info('Request completed', {
        status: response.status,
      });
      return response;
    } catch (error) {
      logger.error('Unhandled error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return Response.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await logger.flush();
    }
  };
}
