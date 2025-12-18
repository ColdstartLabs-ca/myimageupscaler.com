/**
 * Retry utility with exponential backoff for rate-limited APIs
 */

export interface IRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<IRetryOptions, 'shouldRetry' | 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 5000,
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
 * Execute a function with exponential backoff retry on rate limit errors
 */
export async function withRetry<T>(fn: () => Promise<T>, options: IRetryOptions = {}): Promise<T> {
  const { maxRetries, baseDelayMs } = { ...DEFAULT_OPTIONS, ...options };
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
