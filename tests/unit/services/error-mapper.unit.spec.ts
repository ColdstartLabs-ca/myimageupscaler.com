/**
 * Unit tests for server/services/replicate/utils/error-mapper.ts
 * Tests GPU OOM error detection and other error mappings
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  ReplicateErrorMapper,
  ReplicateErrorCode,
  ReplicateError,
} from '@server/services/replicate/utils/error-mapper';

describe('ReplicateErrorMapper', () => {
  let mapper: ReplicateErrorMapper;

  beforeEach(() => {
    mapper = new ReplicateErrorMapper();
  });

  // A CUDA OOM is contention on Replicate's shared GPU, not an oversized
  // input: the model rejects genuinely large images with its own size guard
  // before allocating. Production data (Aug 8-17) showed 140 such failures,
  // all previously told to "try a smaller image".
  describe('GPU OOM Error Detection', () => {
    it('should map a bare "GPU memory" fault to IMAGE_TOO_LARGE', () => {
      const error = new Error('GPU memory allocation failed');
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.IMAGE_TOO_LARGE);
      expect(result.message).toContain('too large');
    });

    it('should map "greater than the max size" to IMAGE_TOO_LARGE', () => {
      const error = new Error(
        'total number of pixels 12000000 greater than the max size that fits in GPU memory on this hardware'
      );
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.IMAGE_TOO_LARGE);
    });

    it('should map "out of memory" to PROVIDER_UNAVAILABLE (shared GPU was busy)', () => {
      const error = new Error('RuntimeError: out of memory detected');
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.PROVIDER_UNAVAILABLE);
    });

    it('should map "OOM" to PROVIDER_UNAVAILABLE (shared GPU was busy)', () => {
      const error = new Error('Process killed by OOM killer');
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.PROVIDER_UNAVAILABLE);
    });

    it('should map "CUDA out of memory" to PROVIDER_UNAVAILABLE (shared GPU was busy)', () => {
      const error = new Error('CUDA out of memory error');
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.PROVIDER_UNAVAILABLE);
    });

    it('should NOT map generic "CUDA error" to IMAGE_TOO_LARGE (too broad)', () => {
      // Generic CUDA errors (e.g. device-side asserts) are not OOM errors
      // and should fall through to PROCESSING_FAILED
      const error = new Error('CUDA error: device-side assert triggered');
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.PROCESSING_FAILED);
    });

    it('should match OOM patterns case-insensitively', () => {
      // Normalisation to lower-case ensures e.g. "Out Of Memory" is caught
      const error = new Error('Out Of Memory: allocation failed');
      const result = mapper.mapError(error);

      expect(result).toBeInstanceOf(ReplicateError);
      expect(result.code).toBe(ReplicateErrorCode.PROVIDER_UNAVAILABLE);
    });
  });

  describe('Existing Error Mappings', () => {
    it('should map provider 402 errors to a vendor-neutral unavailable error', () => {
      const error = Object.assign(
        new Error(
          'Request to https://api.replicate.com failed: buy credit at https://replicate.com/account/billing'
        ),
        { status: 402 }
      );
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.PROVIDER_UNAVAILABLE);
      expect(result.message).toBe(
        'Image processing is temporarily unavailable due to a provider issue. Your credits have not been charged. Please try again shortly or contact our support team.'
      );
      expect(result.message).not.toMatch(/replicate|https?:\/\/|buy|purchase|billing/i);
    });

    it('should map rate limit errors', () => {
      const error = new Error('Rate limit exceeded. Please try again later.');
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.RATE_LIMITED);
    });

    it('should map 403 provider access errors', () => {
      const error = new Error('403 Forbidden: access denied');
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.AUTHENTICATION_FAILED);
    });

    it('should map NoneType image input errors to INVALID_INPUT', () => {
      const error = new Error("'NoneType' object has no attribute 'shape'");
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.INVALID_INPUT);
    });

    it('should map safety filter errors', () => {
      const error = new Error('Image flagged by NSFW safety filter');
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.SAFETY);
    });

    it('should map timeout errors', () => {
      const error = new Error('Request timed out after 60 seconds');
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.TIMEOUT);
    });

    it('should map no output errors', () => {
      const error = new Error('No output returned from model');
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.NO_OUTPUT);
    });

    it('should map unknown errors to PROCESSING_FAILED', () => {
      const error = new Error('Some unknown error occurred');
      const result = mapper.mapError(error);

      expect(result.code).toBe(ReplicateErrorCode.PROCESSING_FAILED);
    });
  });

  describe('ReplicateError Passthrough', () => {
    it('should return existing ReplicateError as-is', () => {
      const originalError = new ReplicateError('Custom error message', ReplicateErrorCode.SAFETY);
      const result = mapper.mapError(originalError);

      expect(result).toBe(originalError);
      expect(result.code).toBe(ReplicateErrorCode.SAFETY);
    });
  });

  describe('throwError', () => {
    it('should throw mapped error', () => {
      const error = new Error(
        'total number of pixels 12000000 greater than the max size that fits in GPU memory on this hardware'
      );

      expect(() => mapper.throwError(error)).toThrow(ReplicateError);
      expect(() => mapper.throwError(error)).toThrow('too large');
    });
  });
});
