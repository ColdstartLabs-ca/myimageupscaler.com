import { isRateLimitError } from '@server/utils/retry';
import { serializeError } from '@shared/utils/errors';

/**
 * Replicate Error Codes
 */
export enum ReplicateErrorCode {
  RATE_LIMITED = 'RATE_LIMITED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  SAFETY = 'SAFETY',
  TIMEOUT = 'TIMEOUT',
  IMAGE_TOO_LARGE = 'IMAGE_TOO_LARGE', // GPU OOM - image exceeds hardware limits
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  NO_OUTPUT = 'NO_OUTPUT',
  GENERIC = 'REPLICATE_ERROR',
}

/**
 * Custom error for Replicate-specific failures
 */
export class ReplicateError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = ReplicateErrorCode.GENERIC) {
    super(message);
    this.name = 'ReplicateError';
    this.code = code;
  }
}

/**
 * Replicate Error Mapper
 *
 * Maps raw errors from Replicate API to typed ReplicateError instances
 */
export class ReplicateErrorMapper {
  private extractStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
      return (error as { status: number }).status;
    }

    if (
      'response' in error &&
      (error as { response?: { status?: unknown } }).response &&
      typeof (error as { response: { status?: unknown } }).response.status === 'number'
    ) {
      return (error as { response: { status: number } }).response.status;
    }

    return undefined;
  }

  /**
   * Map a raw error to appropriate ReplicateError
   *
   * @param error - The raw error from Replicate
   * @returns A typed ReplicateError
   */
  mapError(error: unknown): ReplicateError {
    // If already a ReplicateError, re-throw as-is
    if (error instanceof ReplicateError) {
      return error;
    }

    const message = serializeError(error);
    const lowerMessage = message.toLowerCase();
    const statusCode = this.extractStatusCode(error);

    // Check for rate limit errors
    if (isRateLimitError(message)) {
      return new ReplicateError(
        'Replicate rate limit exceeded. Please try again.',
        ReplicateErrorCode.RATE_LIMITED
      );
    }

    // Replicate auth / account access problems (invalid API key, IP allowlist, account restriction)
    if (
      statusCode === 403 ||
      (lowerMessage.includes('403') &&
        (lowerMessage.includes('forbidden') ||
          lowerMessage.includes('unauthorized') ||
          lowerMessage.includes('access denied') ||
          lowerMessage.includes('authentication')))
    ) {
      return new ReplicateError(
        'Replicate access was denied. Verify REPLICATE_API_TOKEN and any Cloudflare/Workers egress allowlist.',
        ReplicateErrorCode.AUTHENTICATION_FAILED
      );
    }

    // Null/empty image input reaching the model often surfaces as Python NoneType errors.
    if (
      lowerMessage.includes('nonetype') ||
      lowerMessage.includes('none type') ||
      lowerMessage.includes('image input is missing') ||
      lowerMessage.includes('image input was missing') ||
      lowerMessage.includes('invalid image input')
    ) {
      return new ReplicateError(
        'Image input was empty or invalid before processing.',
        ReplicateErrorCode.INVALID_INPUT
      );
    }

    // Check for NSFW/safety filter errors
    if (message.includes('NSFW') || message.includes('safety')) {
      return new ReplicateError('Image flagged by safety filter.', ReplicateErrorCode.SAFETY);
    }

    // Check for timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return new ReplicateError(
        'Processing timed out. Please try a smaller image.',
        ReplicateErrorCode.TIMEOUT
      );
    }

    // Check for no output errors
    if (
      message.includes('No output') ||
      message.includes('NO_OUTPUT') ||
      message.includes('Unexpected array output')
    ) {
      return new ReplicateError('No output returned from Replicate.', ReplicateErrorCode.NO_OUTPUT);
    }

    // Check for GPU memory errors (image too large for model's hardware)
    // Safety net if client-side resize fails or server dimension check is bypassed
    // Note: normalise to lower-case for case-insensitive matching; avoid overly-broad
    // patterns (e.g. "CUDA error") that match non-OOM hardware faults.
    if (
      lowerMessage.includes('gpu memory') ||
      lowerMessage.includes('greater than the max size') ||
      lowerMessage.includes('out of memory') ||
      lowerMessage.includes('oom') ||
      lowerMessage.includes('cuda out of memory')
    ) {
      return new ReplicateError(
        'Image is too large for processing. Please try a smaller image or lower resolution.',
        ReplicateErrorCode.IMAGE_TOO_LARGE
      );
    }

    // Generic processing failure
    return new ReplicateError(`Upscale failed: ${message}`, ReplicateErrorCode.PROCESSING_FAILED);
  }

  /**
   * Map error and throw it
   *
   * @param error - The raw error from Replicate
   * @throws A typed ReplicateError
   */
  throwError(error: unknown): never {
    throw this.mapError(error);
  }
}

/**
 * Singleton instance for convenience
 */
export const replicateErrorMapper = new ReplicateErrorMapper();

/**
 * Convenience function to map an error
 */
export function mapReplicateError(error: unknown): ReplicateError {
  return replicateErrorMapper.mapError(error);
}
