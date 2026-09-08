/**
 * Retry utility with exponential backoff for rate-limited APIs
 */

export interface IRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  /** Do not schedule another attempt after this absolute timestamp. */
  deadlineAt?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

type IRetryDefaults = Required<Pick<IRetryOptions, 'maxRetries' | 'baseDelayMs'>> &
  Pick<IRetryOptions, 'deadlineAt'>;

const DEFAULT_OPTIONS: IRetryDefaults = {
  maxRetries: 3,
  baseDelayMs: 5000,
  deadlineAt: undefined,
};

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error message indicates a rate limit
 */
export function isRateLimitError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('throttled')
  );
}

/**
 * Check if an upstream/provider error is likely transient and safe to retry.
 */
export function isTransientUpstreamError(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes('502') ||
    lowerMessage.includes('503') ||
    lowerMessage.includes('504') ||
    lowerMessage.includes('bad gateway') ||
    lowerMessage.includes('gateway timeout') ||
    lowerMessage.includes('service unavailable') ||
    lowerMessage.includes('temporarily unavailable') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('network error') ||
    lowerMessage.includes('socket hang up') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('failed to upload output') ||
    lowerMessage.includes('output upload') ||
    lowerMessage.includes('no output returned from replicate') ||
    lowerMessage.includes('unexpected array output format')
  );
}

/**
 * Failures whose provider state is ambiguous. An OOM-looking message that
 * also contains one of these signals must not trigger a second inference.
 */
export function isAmbiguousProviderFailure(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  return [
    'timeout',
    'timed out',
    'network error',
    'fetch failed',
    'socket hang up',
    'econnreset',
    'rate limit',
    'throttled',
    'active prediction',
    'prediction is still running',
    'prediction is in progress',
  ].some(signal => lowerMessage.includes(signal));
}

/**
 * Detect an explicit model-side input-size rejection. These messages are
 * deterministic and must never authorize another provider inference.
 */
export function isModelSizeRejection(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes('greater than the max size') ||
    lowerMessage.includes('max size that fits in gpu memory') ||
    lowerMessage.includes('image exceeds the maximum size')
  );
}

/**
 * Retryable provider failures that are safe for the generic retry wrapper.
 * CUDA OOM is deliberately excluded so callers can choose a model-specific
 * recovery policy instead of replaying the same inference.
 */
export function isGenericReplicateRetryableError(message: string): boolean {
  return isRateLimitError(message) || isTransientUpstreamError(message);
}

/**
 * Contention on a shared provider GPU: the card was busy, not the image too
 * big. The same request succeeds on a quieter GPU, so it is worth retrying.
 *
 * The model's own size guard ("greater than the max size that fits in GPU
 * memory on this hardware") is excluded: that input is genuinely too large and
 * no amount of retrying changes it.
 */
export function isGpuContentionError(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  return (
    (lowerMessage.includes('out of memory') || lowerMessage.includes('oom')) &&
    !isModelSizeRejection(lowerMessage) &&
    !isAmbiguousProviderFailure(lowerMessage)
  );
}

/**
 * Execute a function with exponential backoff retry on rate limit errors
 */
export async function withRetry<T>(fn: () => Promise<T>, options: IRetryOptions = {}): Promise<T> {
  const { maxRetries, baseDelayMs, deadlineAt } = { ...DEFAULT_OPTIONS, ...options };
  const { shouldRetry, onRetry } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Check if we should retry this error
      const canRetry = shouldRetry ? shouldRetry(err) : isRateLimitError(err.message);

      if (canRetry && attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);

        if (deadlineAt !== undefined && Date.now() + delayMs >= deadlineAt) {
          throw err;
        }

        onRetry?.(attempt + 1, delayMs, err);
        await sleep(delayMs);
        continue;
      }

      // No more retries or non-retryable error
      throw err;
    }
  }

  // Should not reach here
  throw lastError || new Error('Max retries exceeded');
}
