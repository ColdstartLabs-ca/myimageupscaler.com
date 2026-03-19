import { isRateLimitError } from '@server/utils/retry';
import { serializeError } from '@shared/utils/errors';

/**
 * Replicate Error Codes
 */
export enum ReplicateErrorCode {
  RATE_LIMITED = 'RATE_LIMITED',
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

    // Check for rate limit errors
    if (isRateLimitError(message)) {
      return new ReplicateError(
        'Replicate rate limit exceeded. Please try again.',
        ReplicateErrorCode.RATE_LIMITED
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
    if (
      message.includes('GPU memory') ||
      message.includes('greater than the max size') ||
      message.includes('out of memory') ||
      message.includes('OOM') ||
      message.includes('CUDA out of memory') ||
      message.includes('CUDA error')
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
