import {
  isAmbiguousProviderFailure,
  isModelSizeRejection,
  isRateLimitError,
} from '@server/utils/retry';
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
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  NO_OUTPUT = 'NO_OUTPUT',
  GENERIC = 'REPLICATE_ERROR',
}

/**
 * Custom error for Replicate-specific failures
 */
export class ReplicateError extends Error {
  public readonly code: string;
  public readonly providerStatus?: number;

  constructor(message: string, code: string = ReplicateErrorCode.GENERIC, providerStatus?: number) {
    super(message);
    this.name = 'ReplicateError';
    this.code = code;
    this.providerStatus = providerStatus;
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

    // Provider-side billing failures are an infrastructure outage from the
    // customer's perspective. Never preserve the provider's purchase prompt.
    if (
      statusCode === 402 ||
      (lowerMessage.includes('402') &&
        (lowerMessage.includes('payment required') ||
          lowerMessage.includes('insufficient credit') ||
          lowerMessage.includes('billing')))
    ) {
      return new ReplicateError(
        'Image processing is temporarily unavailable due to a provider issue. Your credits have not been charged. Please try again shortly or contact our support team.',
        ReplicateErrorCode.PROVIDER_UNAVAILABLE,
        402
      );
    }

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

    // A model-side size guard is a deterministic input failure. Check it before
    // generic CUDA wording so it cannot be mistaken for shared-GPU contention.
    if (isModelSizeRejection(lowerMessage)) {
      return new ReplicateError(
        'Image is too large for processing. Please try a smaller image or lower resolution.',
        ReplicateErrorCode.IMAGE_TOO_LARGE
      );
    }

    // Check for timeout errors. An OOM plus a timeout is an ambiguous provider
    // state, so it must never authorize a duplicate alternate inference.
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
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

    const isCudaOom = lowerMessage.includes('out of memory') || lowerMessage.includes('oom');

    // Only a terminal CUDA OOM without timeout/network/rate-limit signals is
    // eligible for the caller's bounded alternate-model recovery. The mapper
    // still reports every OOM as a provider problem so users are not told to
    // resize an image unless the model explicitly rejected its size.
    if (isCudaOom && !isAmbiguousProviderFailure(lowerMessage)) {
      return new ReplicateError(
        'The image service was busy. Please try again in a moment.',
        ReplicateErrorCode.PROVIDER_UNAVAILABLE
      );
    }

    // Generic GPU-memory wording without an explicit model size guard is also
    // provider-side evidence only; it is not enough to blame the input.
    if (lowerMessage.includes('gpu memory')) {
      return new ReplicateError(
        'The image service was busy. Please try again in a moment.',
        ReplicateErrorCode.PROVIDER_UNAVAILABLE
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
